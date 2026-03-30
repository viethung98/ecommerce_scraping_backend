import { TransactionEntity } from '@/database/entities';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../common/redis.module';
import { OrderEntity } from '../database/entities/order.entity';
import { PaymentEntity } from '../database/entities/payment.entity';
import { OrderModule } from '../order/order.module';
import { MppModule } from '../mpp/mpp.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { TransactionService } from './transaction.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([OrderEntity, PaymentEntity, TransactionEntity]),
		OrderModule,
		HttpModule,
		MppModule,
		RedisModule,
	],
	providers: [PaymentService, TransactionService],
	controllers: [PaymentController],
	exports: [PaymentService, TransactionService],
})
export class PaymentModule {}
