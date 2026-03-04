import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppConfigService } from "../config/app-config.service";
import { AsinTrackingEntity } from "./entities/asin-tracking.entity";
import { PriceHistoryEntity } from "./entities/price-history.entity";
import { ProductEntity } from "./entities/product.entity";
import { SyncJobEntity } from "./entities/sync-job.entity";
import { PriceHistoryRepository } from "./repositories/price-history.repository";
import { ProductRepository } from "./repositories/product.repository";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        type: "postgres",
        host: config.dbHost,
        port: config.dbPort,
        username: config.dbUsername,
        password: config.dbPassword,
        database: config.dbDatabase,
        entities: [
          ProductEntity,
          PriceHistoryEntity,
          AsinTrackingEntity,
          SyncJobEntity,
        ],
        synchronize: config.nodeEnv === "development", // Don't use in production
        logging: config.nodeEnv === "development",
      }),
    }),
    TypeOrmModule.forFeature([
      ProductEntity,
      PriceHistoryEntity,
      AsinTrackingEntity,
      SyncJobEntity,
    ]),
  ],
  providers: [ProductRepository, PriceHistoryRepository],
  exports: [TypeOrmModule, ProductRepository, PriceHistoryRepository],
})
export class DatabaseModule {}
