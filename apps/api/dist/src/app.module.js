"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const health_module_1 = require("./health/health.module");
const admin_module_1 = require("./admin/admin.module");
const redis_module_1 = require("./redis/redis.module");
const task_module_1 = require("./task/task.module");
const attendance_module_1 = require("./attendance/attendance.module");
const feed_module_1 = require("./feed/feed.module");
const leave_module_1 = require("./leave/leave.module");
const dashboard_module_1 = require("./dashboard/dashboard.module");
const push_module_1 = require("./push/push.module");
const scheduler_module_1 = require("./scheduler/scheduler.module");
const report_module_1 = require("./report/report.module");
const objects_module_1 = require("./objects/objects.module");
const tenant_middleware_1 = require("./prisma/tenant.middleware");
const core_1 = require("@nestjs/core");
const rate_limit_guard_1 = require("./auth/rate-limit.guard");
let AppModule = class AppModule {
    configure(consumer) {
        consumer
            .apply(tenant_middleware_1.TenantMiddleware)
            .forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            health_module_1.HealthModule,
            admin_module_1.AdminModule,
            redis_module_1.RedisModule,
            task_module_1.TaskModule,
            attendance_module_1.AttendanceModule,
            feed_module_1.FeedModule,
            leave_module_1.LeaveModule,
            dashboard_module_1.DashboardModule,
            push_module_1.PushModule,
            scheduler_module_1.SchedulerModule,
            report_module_1.ReportModule,
            objects_module_1.ObjectsModule
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: rate_limit_guard_1.RateLimitGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map