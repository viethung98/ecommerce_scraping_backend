import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
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
  generateRequest(@Body() dto: GeneratePaymentRequestDto) {
    return this.paymentService.generatePaymentRequest(dto);
  }

  /**
   * POST /api/payment/webhook
   * Called by frontend after Polkadot payment extrinsic is submitted
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
