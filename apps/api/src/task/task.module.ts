import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { TaskAggregationService } from './task-aggregation.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [TaskController],
  providers: [TaskService, TaskAggregationService],
  exports: [TaskService, TaskAggregationService],
})
export class TaskModule {}
