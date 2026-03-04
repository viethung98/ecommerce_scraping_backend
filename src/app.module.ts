import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AppConfigModule } from "./config/app-config.module";
import { DatabaseModule } from "./database/database.module";
import { NormalizationModule } from "./normalization/normalization.module";
import { HybridOrchestratorModule } from "./orchestrator/hybrid-orchestrator.module";
import { RealtimeSearchModule } from "./realtime-search/realtime-search.module";
import { SearchModule } from "./search/search.module";
import { AmazonSyncModule } from "./sync/amazon-sync.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    AppConfigModule,
    DatabaseModule,
    NormalizationModule,
    SearchModule,
    RealtimeSearchModule,
    HybridOrchestratorModule,
    AmazonSyncModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
