import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiResponse } from "../common/dto/response.dto";
import {
  GeneratePaymentRequestDto,
  PaymentWebhookDto,
} from "./dto/payment.dto";
import { PaymentService } from "./payment.service";

@Controller("payment")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /api/payment/request
   * Generate a Polkadot payment request for a given order
   */
  @Post("request")
  async generateRequest(
    @Body() dto: GeneratePaymentRequestDto,
  ): Promise<ApiResponse<any>> {
    const result = await this.paymentService.generatePaymentRequest(dto);
    return ApiResponse.success(
      result,
      200,
      "Payment request generated successfully",
    );
  }

  /**
   * POST /api/payment/webhook
   * Called by frontend after Polkadot payment extrinsic is submitted
   */
  @Post("webhook")
  async handleWebhook(
    @Body() dto: PaymentWebhookDto,
  ): Promise<ApiResponse<any>> {
    const result = await this.paymentService.handleWebhook(dto);
    if (result.success) {
      return ApiResponse.success(result, 200, result.message);
    } else {
      return ApiResponse.error(400, result.message);
    }
  }

  /**
   * GET /api/payment/verify/:paymentId
   * Check payment status
   */
  @Get("verify/:paymentId")
  async verifyPayment(
    @Param("paymentId", ParseUUIDPipe) paymentId: string,
  ): Promise<ApiResponse<any>> {
    const result = await this.paymentService.getPaymentStatus(paymentId);
    return ApiResponse.success(
      result,
      200,
      "Payment status retrieved successfully",
    );
  }

  /**
   * GET /api/payment/transaction/:blockHash
   * Get transaction details from block hash
   */
  @Get("transaction/:blockHash")
  async getTransactionDetails(
    @Param("blockHash") blockHash: string,
  ): Promise<ApiResponse<any>> {
    const result = await this.paymentService.getTransactionDetails(blockHash);
    if (result.success) {
      return ApiResponse.success(result.data, result.code || 200, result.msg);
    } else {
      return ApiResponse.error(
        result.code || 500,
        result.msg || "Failed to get transaction details",
      );
    }
  }
}
