import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { ObjectAccessService } from './object-access.service';

@Module({
  providers: [StorageService, ObjectAccessService],
  exports: [StorageService, ObjectAccessService],
})
export class StorageModule {}
