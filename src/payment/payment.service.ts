import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";
import { AppConfigService } from "../config/app-config.service";
import { OrderEntity } from "../database/entities/order.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import {
  GeneratePaymentRequestDto,
  PaymentWebhookDto,
} from "./dto/payment.dto";
import { OrderService } from "../order/order.service";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  /** Payment expires after 15 minutes */
  private readonly PAYMENT_TTL_MS = 15 * 60 * 1000;

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    private readonly orderService: OrderService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Generate a Sui USDC payment request for an order.
   */
  async generatePaymentRequest(dto: GeneratePaymentRequestDto): Promise<{
    payment_id: string;
    recipient: string;
    amount: string;
    token: string;
    network: string;
    expires_at: string;
  }> {
    const order = await this.orderService.getOrderById(dto.order_id);

    if (order.userId !== dto.user_id) {
      throw new BadRequestException("Order does not belong to this user");
    }

    if (order.status === "paid") {
      throw new BadRequestException("Order is already paid");
    }

    if (order.status === "failed" || order.status === "refunded") {
      throw new BadRequestException(`Order status is ${order.status}`);
    }

    // Check if there is already a pending/processing payment for this order
    const existingPayment = await this.paymentRepo.findOne({
      where: { orderId: dto.order_id, status: "pending" },
    });
    if (existingPayment && existingPayment.expiresAt > new Date()) {
      return {
        payment_id: existingPayment.id,
        recipient: existingPayment.recipientAddress,
        amount: String(existingPayment.amount),
        token: existingPayment.token,
        network: existingPayment.network,
        expires_at: existingPayment.expiresAt.toISOString(),
      };
    }

    const expiresAt = new Date(Date.now() + this.PAYMENT_TTL_MS);

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        orderId: dto.order_id,
        userId: dto.user_id,
        amount: order.amount,
        token: "USDC",
        network: "sui",
        recipientAddress: this.config.suiMerchantWallet,
        status: "pending",
        expiresAt,
      }),
    );

    await this.orderService.updateOrderStatus(dto.order_id, "payment_processing");

    return {
      payment_id: payment.id,
      recipient: payment.recipientAddress,
      amount: String(payment.amount),
      token: payment.token,
      network: payment.network,
      expires_at: expiresAt.toISOString(),
    };
  }

  /**
   * Handle payment webhook from frontend after Sui transaction.
   * Verifies the on-chain transaction before confirming the order.
   */
  async handleWebhook(dto: PaymentWebhookDto): Promise<{
    success: boolean;
    message: string;
    order_id?: string;
  }> {
    const payment = await this.paymentRepo.findOne({
      where: { id: dto.payment_id },
    });
    if (!payment) {
      throw new NotFoundException(`Payment ${dto.payment_id} not found`);
    }

    if (payment.status === "confirmed") {
      return { success: true, message: "Payment already confirmed", order_id: payment.orderId };
    }

    if (payment.status === "failed" || payment.status === "expired") {
      throw new BadRequestException(`Payment is ${payment.status}`);
    }

    // Replay attack: reject if txHash was already used
    const duplicate = await this.paymentRepo.findOne({
      where: { txHash: dto.tx_hash },
    });
    if (duplicate && duplicate.id !== payment.id) {
      throw new BadRequestException("Transaction hash already used");
    }

    // Save tx_hash and sender early to prevent race conditions
    payment.txHash = dto.tx_hash;
    payment.senderAddress = dto.sender_address;
    payment.status = "processing";
    await this.paymentRepo.save(payment);

    // Verify on-chain
    if (dto.status === "confirmed") {
      try {
        await this.verifyOnChain(payment);
        payment.status = "confirmed";
        await this.paymentRepo.save(payment);
        await this.orderService.updateOrderStatus(payment.orderId, "paid");
        this.logger.log(`Payment confirmed: ${payment.id}, order: ${payment.orderId}`);
        return { success: true, message: "Payment confirmed", order_id: payment.orderId };
      } catch (err) {
        this.logger.error(`On-chain verification failed: ${err.message}`);
        payment.status = "failed";
        await this.paymentRepo.save(payment);
        await this.orderService.updateOrderStatus(payment.orderId, "failed");
        throw new BadRequestException(`Payment verification failed: ${err.message}`);
      }
    } else {
      payment.status = "failed";
      await this.paymentRepo.save(payment);
      await this.orderService.updateOrderStatus(payment.orderId, "failed");
      return { success: false, message: "Payment reported as failed" };
    }
  }

  /**
   * Get payment status by payment ID.
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentEntity> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }
    return payment;
  }

  /**
   * Verify Sui transaction via JSON-RPC.
   *
   * Checks:
   * 1. Transaction exists and succeeded
   * 2. Amount matches (USDC transferred)
   * 3. Recipient is merchant wallet
   */
  private async verifyOnChain(payment: PaymentEntity): Promise<void> {
    const rpcUrl = this.config.suiRpcUrl;

    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "sui_getTransactionBlock",
        params: [
          payment.txHash,
          {
            showInput: true,
            showEffects: true,
            showBalanceChanges: true,
          },
        ],
      },
      { timeout: 15000 },
    );

    const data = response.data;

    if (data.error) {
      throw new Error(
        `Sui RPC error: ${data.error.message ?? JSON.stringify(data.error)}`,
      );
    }

    const tx = data.result;
    if (!tx) {
      throw new Error("Transaction not found on chain");
    }

    // 1. Check transaction succeeded
    const status = tx.effects?.status?.status;
    if (status !== "success") {
      throw new Error(`Transaction status: ${status}`);
    }

    // 2. Check USDC balance change to merchant wallet
    const balanceChanges: Array<{
      owner: { AddressOwner?: string };
      coinType: string;
      amount: string;
    }> = tx.balanceChanges ?? [];

    const usdcCoinType = this.config.suiUsdcCoinType;
    const merchantWallet = this.config.suiMerchantWallet.toLowerCase();

    const merchantChange = balanceChanges.find((bc) => {
      const ownerAddr = (
        bc.owner?.AddressOwner ?? ""
      ).toLowerCase();
      return (
        ownerAddr === merchantWallet &&
        bc.coinType === usdcCoinType &&
        Number(bc.amount) > 0
      );
    });

    if (!merchantChange) {
      throw new Error(
        "No USDC transfer to merchant wallet found in transaction",
      );
    }

    // 3. Verify amount (USDC on Sui has 6 decimals)
    const transferredBaseUnits = Number(merchantChange.amount);
    const expectedBaseUnits = Math.round(payment.amount * 1_000_000);

    // Allow 1 unit tolerance for rounding
    if (Math.abs(transferredBaseUnits - expectedBaseUnits) > 1) {
      throw new Error(
        `Amount mismatch: expected ${expectedBaseUnits} got ${transferredBaseUnits}`,
      );
    }
  }
}
