import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppConfigModule } from "../config/app-config.module";
import { X402PaymentGuard } from "./x402-payment.guard";
import { X402SmoldotService } from "./x402-smoldot.service";

@Module({
  imports: [AppConfigModule],
  providers: [
    X402SmoldotService,
    X402PaymentGuard,
    {
      provide: APP_GUARD,
      useClass: X402PaymentGuard,
    },
  ],
  exports: [X402SmoldotService, X402PaymentGuard],
})
export class PaywallModule {}
