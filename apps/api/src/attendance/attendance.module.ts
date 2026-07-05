import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AutoCheckoutService } from './auto-checkout.service';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [RedisModule, StorageModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AutoCheckoutService],
  exports: [AttendanceService, AutoCheckoutService],
})
export class AttendanceModule {}
