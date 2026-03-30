import { ApiResponse } from '@/common/dto/response.dto';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { RedisService } from '../common/redis.service';
import servicesConfig from '../config/services.config';
import { TransactionEntity, TransactionStatus } from '../database/entities';
import { VerificationService } from '../mpp/verification.service';
import { VerifyTransactionDto, VerifyTransactionRequestDto } from './dto';

@Injectable()
export class TransactionService {
	private readonly logger = new Logger(TransactionService.name);

	constructor(
		@InjectRepository(TransactionEntity)
		private readonly transactionRepo: Repository<TransactionEntity>,
		private readonly verificationService: VerificationService,
		private readonly redisService: RedisService,
		private readonly httpService: HttpService,
		@Inject(servicesConfig.KEY)
		private readonly services: ConfigType<typeof servicesConfig>,
	) {}

	async verifyTransaction(
		request: VerifyTransactionRequestDto,
	): Promise<ApiResponse<VerifyTransactionDto>> {
		const { txHash, userId, network } = request;
		const lockKey = `lock:tx_verify:${txHash}`;
		let lockValue: string | null = null;

		try {
			// Acquire distributed lock to prevent race conditions
			lockValue = await this.redisService.acquireLock(lockKey, 60); // 60 seconds lock
			if (!lockValue) {
				return ApiResponse.error(
					429,
					'Transaction verification is already in progress, please retry later',
				);
			}

			const transaction = await this.transactionRepo.findOne({
				where: { txHash },
			});

			if (transaction) {
				return ApiResponse.error(
					400,
					`Transaction already processed with status: ${transaction.status}`,
				);
			}

			// Transaction doesn't exist, create and process it
			const resolvedNetwork = network || 'polkadot';
			const newTransaction = this.transactionRepo.create({
				txHash,
				userId,
				status: 'PENDING',
				network: resolvedNetwork,
			});

			return await this.processTransaction(
				txHash,
				userId,
				newTransaction,
				resolvedNetwork,
			);
		} catch (error) {
			this.logger.error(
				`Transaction verification failed: ${error.message}`,
				error.stack,
			);
			return ApiResponse.error(500, error.message || 'Internal server error');
		} finally {
			if (lockValue) {
				await this.redisService.releaseLock(lockKey, lockValue);
			}
		}
	}

	private async processTransaction(
		txHash: string,
		userId: string,
		transaction: TransactionEntity,
		network: string,
	): Promise<ApiResponse<VerifyTransactionDto>> {
		try {
			// Get transaction details from blockchain
			const txDetails = await this.verificationService.getTransactionDetail(
				network,
				txHash,
			);

			if (!txDetails) {
				await this.updateTransactionStatus(
					transaction,
					'FAILED',
					'Transaction not found',
				);
				return ApiResponse.error(404, 'Transaction not found on blockchain');
			}

			transaction.receiver = txDetails.to;
			transaction.originAmount = txDetails.value;
			transaction.amount = parseFloat(txDetails.amount);
			transaction.status = 'SUCCESS';
			await this.transactionRepo.save(transaction);
			this.logger.log(`Transaction verified and saved: ${txHash}`);

			// Call downstream service (idempotent)
			const networkConfig = this.verificationService.getNetworkConfig(network);
			await this.callDownstreamService({
				userId,
				address: txDetails.to,
				amount: txDetails.value,
				network,
				currency: networkConfig.token,
				txHash,
			});

			return ApiResponse.success(
				{
					receiver: txDetails.to,
					amount: parseFloat(txDetails.value),
					userId,
				},
				200,
				'Transaction verified successfully',
			);
		} catch (error) {
			await this.updateTransactionStatus(transaction, 'FAILED', error.message);
			return ApiResponse.error(
				500,
				error.message || 'Transaction processing failed',
			);
		}
	}

	private async updateTransactionStatus(
		transaction: TransactionEntity,
		status: TransactionStatus,
		errorMsg?: string,
	): Promise<void> {
		transaction.status = status;
		if (errorMsg) {
			transaction.errorMsg = errorMsg;
		}
		await this.transactionRepo.save(transaction);
	}

	private async callDownstreamService(data: {
		userId: string;
		address: string;
		amount: string;
		network: string;
		currency: string;
		txHash: string;
	}): Promise<void> {
		try {
			// Use txHash as idempotency key for downstream service
			const idempotencyKey = `downstream:${data.txHash}`;

			// Check if already processed
			const alreadyProcessed = await this.redisService.exists(idempotencyKey);
			if (alreadyProcessed) {
				this.logger.log(
					`Downstream service already called for txHash: ${data.txHash}`,
				);
				return;
			}

			const baseUrl = this.services.comagentBaseUrl;
			const webhookSecret = this.services.depositWebhookSecret;
			const url = `${baseUrl}/api/deposit/${data.userId}/${data.address}/confirm`;

			const payload = {
				amount: parseInt(data.amount),
				transactionHash: data.txHash,
				network: data.network,
				currency: data.currency,
			};

			const response = await firstValueFrom(
				this.httpService.post(url, payload, {
					headers: {
						'Content-Type': 'application/json',
						'X-Webhook-Secret': webhookSecret,
					},
				}),
			);

			// Mark as processed
			await this.redisService.set(idempotencyKey, 'processed', 86400); // 24 hours

			this.logger.log(
				`Deposit webhook called successfully for txHash: ${data.txHash}, response: ${JSON.stringify(response.data)}`,
			);
		} catch (error) {
			this.logger.error(
				`Deposit webhook call failed: ${error.message}`,
				error.stack,
			);
		}
	}
}
