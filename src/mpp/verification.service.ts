import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ethers, formatUnits } from 'ethers';
import { firstValueFrom } from 'rxjs';
import {
	convertHexToDecimal,
	convertHexToString,
	normalizeAccountHex,
	safeBigInt,
} from '../common/utils/blockchain.utils';
import mppConfig from '../config/mpp.config';
import polkadotConfig from '../config/polkadot.config';
import tempoConfig from '../config/tempo.config';

export interface NetworkConfig {
	network: string;
	recipient: string;
	minAmount: string;
	token: string;
	verifier: string;
	instructions: string;
}

export interface PaymentVerificationResult {
	ok: boolean;
	reason?: string;
	payment?: {
		from?: string;
		to: string;
		amount: string;
		txHash: string;
	};
}

export interface TransactionDetail {
	hash: string;
	from: string;
	to: string;
	value: string;
	amount: string;
	blockNumber: number;
	input?: string;
}

const TIP20_ABI = [
	'event Transfer(address indexed from, address indexed to, uint256 value)',
	'event TransferWithMemo(address indexed from, address indexed to, uint256 value, bytes32 memo)',
];

const TIP20_DECIMALS = 6;
const RPC_TIMEOUT_MS = 10_000;

/**
 * Transaction verification service for the payment module.
 *
 * Provides on-chain transaction verification for both Tempo and Polkadot
 * networks. This is separate from the MPP guard flow — it handles manual
 * verification for order payments and webhooks.
 */
@Injectable()
export class VerificationService implements OnModuleInit {
	private readonly logger = new Logger(VerificationService.name);
	private provider: ethers.JsonRpcProvider;
	private iface: ethers.Interface;
	private tempoEnabled = false;
	private scanEnabled = false;

	constructor(
		@Inject(tempoConfig.KEY)
		private readonly tempo: ConfigType<typeof tempoConfig>,
		@Inject(polkadotConfig.KEY)
		private readonly polkadot: ConfigType<typeof polkadotConfig>,
		@Inject(mppConfig.KEY)
		private readonly mpp: ConfigType<typeof mppConfig>,
		private readonly httpService: HttpService,
	) {}

	async onModuleInit(): Promise<void> {
		if (this.tempo.merchantAddress) {
			this.provider = new ethers.JsonRpcProvider(this.tempo.rpcUrl);
			this.provider._getConnection().timeout = RPC_TIMEOUT_MS;
			this.iface = new ethers.Interface(TIP20_ABI);
			this.tempoEnabled = true;
			this.logger.log(
				`Tempo verifier initialized (${this.tempo.network}, chain ${this.tempo.chainId})`,
			);
		}

		if (this.mpp.scanApiKey) {
			this.scanEnabled = true;
			this.logger.log('Routescan payment verifier initialized');
		}
	}

	isTempoNetwork(network: string): boolean {
		return network === 'tempo' || network === 'tempo-testnet';
	}

	isEnabled(network: string): boolean {
		if (this.isTempoNetwork(network)) {
			return this.tempoEnabled;
		}
		return this.scanEnabled;
	}

	getNetworkConfig(network: string): NetworkConfig {
		if (this.isTempoNetwork(network)) {
			return {
				network: this.tempo.network,
				recipient: this.tempo.merchantAddress,
				minAmount: this.tempo.paymentAmountMicro,
				token: this.tempo.paymentCurrency,
				verifier: 'tempo-rpc',
				instructions:
					'Submit a pathUSD transfer to the merchant on Tempo via MPP (Authorization: Payment header)',
			};
		}
		return {
			network: this.polkadot.network,
			recipient: this.polkadot.merchantAddress,
			minAmount: this.polkadot.paymentAmountPlanck,
			token: this.polkadot.currencySymbol,
			verifier: 'routescan',
			instructions:
				'Submit a Balances.transfer to the merchant, then verify with tx hash',
		};
	}

	async verifyPaymentProof(
		network: string,
		txHash: string,
	): Promise<PaymentVerificationResult> {
		const { recipient, minAmount } = this.getNetworkConfig(network);
		const input = { txHash, recipient, minAmount };

		if (this.isTempoNetwork(network)) {
			return this.verifyTempoPayment(input);
		}
		return this.verifyScanPayment(input);
	}

	async getTransactionDetail(
		network: string,
		txHash: string,
	): Promise<TransactionDetail | null> {
		if (this.isTempoNetwork(network)) {
			return this.getTempoTransactionDetail(txHash);
		}
		return this.getScanTransactionDetail(txHash);
	}

	// ── Tempo verification ──

	private async verifyTempoPayment(input: {
		txHash: string;
		recipient: string;
		minAmount: string;
	}): Promise<PaymentVerificationResult> {
		const { txHash, recipient, minAmount } = input;

		if (!txHash || !recipient) {
			return { ok: false, reason: 'Invalid payment proof format' };
		}

		try {
			const receipt = await this.provider.getTransactionReceipt(txHash);
			if (!receipt) {
				return { ok: false, reason: 'Transaction not found on Tempo' };
			}

			if (receipt.status !== 1) {
				return { ok: false, reason: 'Transaction failed on-chain' };
			}

			const pathUsdAddress = this.tempo.pathUsdAddress.toLowerCase();
			const minAmountBig = BigInt(minAmount);

			for (const log of receipt.logs) {
				if (log.address.toLowerCase() !== pathUsdAddress) {
					continue;
				}

				try {
					const parsed = this.iface.parseLog({
						topics: log.topics as string[],
						data: log.data,
					});

					if (
						parsed &&
						(parsed.name === 'Transfer' || parsed.name === 'TransferWithMemo')
					) {
						const to = (parsed.args.to as string).toLowerCase();
						const amount = parsed.args.value as bigint;

						if (to === recipient.toLowerCase() && amount >= minAmountBig) {
							return {
								ok: true,
								payment: {
									from: (parsed.args.from as string).toLowerCase(),
									to,
									amount: amount.toString(),
									txHash,
								},
							};
						}
					}
				} catch {
					// Not a Transfer event from pathUSD — skip
				}
			}

			return {
				ok: false,
				reason: 'No matching pathUSD transfer found in transaction',
			};
		} catch (error) {
			this.logger.warn(
				`Tempo verifyPaymentProof failed: ${error?.message ?? error}`,
			);
			return { ok: false, reason: 'Unable to verify Tempo payment proof' };
		}
	}

	private async getTempoTransactionDetail(
		txHash: string,
	): Promise<TransactionDetail | null> {
		try {
			const tx = await this.provider.getTransaction(txHash);
			if (!tx) {
				return null;
			}

			const receipt = await this.provider.getTransactionReceipt(txHash);
			const pathUsdAddress = this.tempo.pathUsdAddress.toLowerCase();

			let transferValue = tx.value.toString();
			let transferTo = tx.to || '';

			if (receipt) {
				for (const log of receipt.logs) {
					if (log.address.toLowerCase() !== pathUsdAddress) {
						continue;
					}
					try {
						const parsed = this.iface.parseLog({
							topics: log.topics as string[],
							data: log.data,
						});
						if (
							parsed &&
							(parsed.name === 'Transfer' || parsed.name === 'TransferWithMemo')
						) {
							transferValue = (parsed.args.value as bigint).toString();
							transferTo = parsed.args.to as string;
							break;
						}
					} catch {
						// skip
					}
				}
			}

			return {
				hash: tx.hash,
				from: tx.from,
				to: transferTo,
				value: transferValue,
				amount: formatUnits(transferValue, TIP20_DECIMALS),
				blockNumber: tx.blockNumber ?? 0,
				input: tx.data !== '0x' ? tx.data : undefined,
			};
		} catch (error) {
			this.logger.warn(
				`Failed to get Tempo transaction detail: ${error?.message ?? error}`,
			);
			return null;
		}
	}

	// ── Polkadot / Routescan verification ──

	private async verifyScanPayment(input: {
		txHash: string;
		recipient: string;
		minAmount: string;
	}): Promise<PaymentVerificationResult> {
		const txHash = input.txHash.trim();
		const recipientHex = normalizeAccountHex(input.recipient);
		const minAmountPlanck = safeBigInt(input.minAmount);

		if (!txHash || !recipientHex || minAmountPlanck === null) {
			return { ok: false, reason: 'Invalid payment proof format' };
		}

		try {
			const transaction = await this.getScanTransactionDetail(txHash);
			if (!transaction) {
				return { ok: false, reason: 'Unable to fetch transaction details' };
			}

			const blockNum = transaction.blockNumber;
			const transfers = await this.getTransfersForBlock(recipientHex, blockNum);

			for (const transfer of transfers) {
				const toHex = normalizeAccountHex(transfer.to || '');
				const fromHex = normalizeAccountHex(transfer.from || '');
				const amountPlanck = safeBigInt(transfer.amount || '0');

				const match =
					toHex &&
					recipientHex &&
					toHex.toLowerCase() === recipientHex.toLowerCase();
				const amountOk = amountPlanck !== null && amountPlanck >= minAmountPlanck;

				if (match && amountOk) {
					return {
						ok: true,
						payment: {
							from: fromHex || undefined,
							to: toHex!,
							amount: amountPlanck!.toString(),
							txHash,
						},
					};
				}
			}

			return { ok: false, reason: 'No matching transfer found in block' };
		} catch (error) {
			this.logger.warn(`verifyPaymentProof failed: ${error?.message ?? error}`);
			return { ok: false, reason: 'Unable to verify payment proof' };
		}
	}

	private async getScanTransactionDetail(
		txHash: string,
	): Promise<TransactionDetail | null> {
		try {
			const response = await firstValueFrom(
				this.httpService.get(`${this.mpp.scanBaseUrl}`, {
					params: {
						module: 'proxy',
						action: 'eth_getTransactionByHash',
						txhash: txHash,
						apikey: this.mpp.scanApiKey,
					},
				}),
			);

			if (!response.data?.result || !response.data?.jsonrpc) {
				return null;
			}

			const result = response.data.result;
			const value = convertHexToDecimal(result.value).toString();

			return {
				hash: result.hash,
				from: result.from,
				to: result.to,
				value,
				amount: formatUnits(value, 18).toString(),
				blockNumber: convertHexToDecimal(result.blockNumber),
				input: result.input ? convertHexToString(result.input) : undefined,
			};
		} catch (error) {
			this.logger.warn(
				`Failed to get transaction detail: ${error?.message ?? error}`,
			);
			return null;
		}
	}

	private async getTransfersForBlock(
		recipientHex: string,
		blockNum: number,
	): Promise<
		Array<{
			from: string;
			to: string;
			amount: string;
			block_num: number;
		}>
	> {
		try {
			const response = await firstValueFrom(
				this.httpService.get(`${this.mpp.scanBaseUrl}`, {
					params: {
						module: 'account',
						action: 'txlist',
						address: recipientHex,
						startblock: blockNum,
						endblock: blockNum,
						page: 1,
						offset: 100,
						sort: 'asc',
						apikey: this.mpp.scanApiKey,
					},
				}),
			);

			if (response.data?.result && Array.isArray(response.data.result)) {
				return response.data.result.map((tx: any) => ({
					from: tx.from || '',
					to: tx.to || '',
					amount: tx.value || '0',
					block_num: parseInt(tx.blockNumber, 10) || 0,
				}));
			}
			return [];
		} catch (error) {
			this.logger.warn(`Failed to get transfers: ${error?.message ?? error}`);
			return [];
		}
	}
}
