import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
	databaseConfig,
	mppConfig,
	polkadotConfig,
	redisConfig,
	serverConfig,
	servicesConfig,
	tempoConfig,
} from './config';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { MppModule } from './mpp/mpp.module';
import { NormalizationModule } from './normalization/normalization.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { RealtimeSearchModule } from './realtime-search/realtime-search.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '.env',
			cache: true,
			load: [
				serverConfig,
				databaseConfig,
				redisConfig,
				tempoConfig,
				polkadotConfig,
				mppConfig,
				servicesConfig,
			],
			validate,
		}),
		DatabaseModule,
		NormalizationModule,
		RealtimeSearchModule,
		OrderModule,
		PaymentModule,
		MppModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
