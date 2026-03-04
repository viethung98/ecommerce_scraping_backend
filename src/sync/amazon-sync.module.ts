import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DatabaseModule } from "../database/database.module";
import { SyncJobEntity } from "../database/entities/sync-job.entity";
import { NormalizationModule } from "../normalization/normalization.module";
import { RealtimeSearchModule } from "../realtime-search/realtime-search.module";
import { SearchModule } from "../search/search.module";
import { AmazonSyncController } from "./amazon-sync.controller";
import { AmazonSyncService } from "./amazon-sync.service";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([SyncJobEntity]),
    RealtimeSearchModule,
    NormalizationModule,
    DatabaseModule,
    SearchModule,
  ],
  providers: [AmazonSyncService],
  controllers: [AmazonSyncController],
  exports: [AmazonSyncService],
})
export class AmazonSyncModule {}
