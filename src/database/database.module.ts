import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '../config/database.config';
import serverConfig from '../config/server.config';
import {
	CartEntity,
	OrderEntity,
	PaymentEntity,
	TransactionEntity,
} from './entities';

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			inject: [databaseConfig.KEY, serverConfig.KEY],
			useFactory: (
				db: ConfigType<typeof databaseConfig>,
				server: ConfigType<typeof serverConfig>,
			) => ({
				type: 'postgres',
				url: db.url,
				database: db.database,
				entities: [CartEntity, OrderEntity, PaymentEntity, TransactionEntity],
				synchronize: db.synchronize,
				migrationsRun: db.migrationsRun,
				logging: server.nodeEnv === 'development',
			}),
		}),
		TypeOrmModule.forFeature([
			CartEntity,
			OrderEntity,
			PaymentEntity,
			TransactionEntity,
		]),
	],
	exports: [TypeOrmModule],
})
export class DatabaseModule {}
