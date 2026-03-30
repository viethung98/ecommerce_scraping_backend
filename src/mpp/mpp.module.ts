import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MppGuard } from './mpp.guard';
import { MppService } from './mpp.service';
import { VerificationService } from './verification.service';

@Module({
  imports: [HttpModule],
  providers: [
    MppService,
    VerificationService,
    MppGuard,
    {
      provide: APP_GUARD,
      useClass: MppGuard,
    },
  ],
  exports: [MppService, VerificationService, MppGuard],
})
export class MppModule {}
