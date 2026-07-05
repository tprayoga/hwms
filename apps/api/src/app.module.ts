import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { RedisModule } from './redis/redis.module';
import { TaskModule } from './task/task.module';
import { AttendanceModule } from './attendance/attendance.module';
import { FeedModule } from './feed/feed.module';
import { LeaveModule } from './leave/leave.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PushModule } from './push/push.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ReportModule } from './report/report.module';
import { ObjectsModule } from './objects/objects.module';
import { TenantMiddleware } from './prisma/tenant.middleware';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './auth/rate-limit.guard';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthModule,
    AdminModule,
    RedisModule,
    TaskModule,
    AttendanceModule,
    FeedModule,
    LeaveModule,
    DashboardModule,
    PushModule,
    SchedulerModule,
    ReportModule,
    ObjectsModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');
  }
}
