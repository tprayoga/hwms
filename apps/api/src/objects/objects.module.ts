import { Module } from '@nestjs/common';
import { ObjectsController } from './objects.controller';
import { ObjectsService } from './objects.service';
import { StorageModule } from '../storage/storage.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [StorageModule, AttendanceModule],
  controllers: [ObjectsController],
  providers: [ObjectsService],
})
export class ObjectsModule {}
