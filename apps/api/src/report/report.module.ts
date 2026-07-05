import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [SchedulerModule, StorageModule],
  controllers: [ReportController],
})
export class ReportModule {}
