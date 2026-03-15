import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppConfigModule } from "../config/app-config.module";
import { OrderEntity } from "../database/entities/order.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { OrderModule } from "../order/order.module";
import { PaywallModule } from "../paywall/paywall.module";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity, OrderEntity]),
    OrderModule,
    AppConfigModule,
    PaywallModule,
  ],
  providers: [PaymentService],
  controllers: [PaymentController],
  exports: [PaymentService],
})
export class PaymentModule {}
