import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PushModule } from '../push/push.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PushModule, StorageModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
