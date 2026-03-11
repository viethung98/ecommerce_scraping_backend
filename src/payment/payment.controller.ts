import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { PaymentService } from "./payment.service";
import {
  GeneratePaymentRequestDto,
  PaymentWebhookDto,
} from "./dto/payment.dto";

@Controller("payment")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /api/payment/request
   * Generate a Sui USDC payment request for a given order
   */
  @Post("request")
  generateRequest(@Body() dto: GeneratePaymentRequestDto) {
    return this.paymentService.generatePaymentRequest(dto);
  }

  /**
   * POST /api/payment/webhook
   * Called by frontend after Sui transaction is signed
   */
  @Post("webhook")
  handleWebhook(@Body() dto: PaymentWebhookDto) {
    return this.paymentService.handleWebhook(dto);
  }

  /**
   * GET /api/payment/verify/:paymentId
   * Check payment status
   */
  @Get("verify/:paymentId")
  verifyPayment(@Param("paymentId", ParseUUIDPipe) paymentId: string) {
    return this.paymentService.getPaymentStatus(paymentId);
  }
}
