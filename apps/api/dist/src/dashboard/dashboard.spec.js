"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dashboard_service_1 = require("./dashboard.service");
const scheduler_service_1 = require("../scheduler/scheduler.service");
const prisma_service_1 = require("../prisma/prisma.service");
const team_resolver_service_1 = require("../feed/team-resolver.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const vitest_1 = require("vitest");
const fs = require("fs");
const path = require("path");
(0, vitest_1.describe)('Dashboard & Report Integration', () => {
    let dashboardService;
    let schedulerService;
    let prisma;
    let tenantId;
    let userId;
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        const teamResolver = new team_resolver_service_1.TeamResolverService(prisma);
        dashboardService = new dashboard_service_1.DashboardService(prisma, teamResolver);
        const mockPushService = {
            sendPushNotification: async () => { }
        };
        const mockStorageService = {
            deleteFile: async () => { },
            uploadFile: async () => 'ok',
        };
        schedulerService = new scheduler_service_1.SchedulerService(prisma, mockPushService, mockStorageService);
        await schedulerService.onModuleInit();
        const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
        tenantId = tenant.id;
        const superAdmin = await prisma.user.findFirst({
            where: { email: 'superadmin@indotek.com' }
        });
        userId = superAdmin.id;
    });
    (0, vitest_1.afterAll)(async () => {
        await schedulerService.onModuleDestroy();
    });
    (0, vitest_1.it)('should retrieve team dashboard successfully', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const data = await dashboardService.getTeamDashboard(userId, '', '', '');
            (0, vitest_1.expect)(data).toBeDefined();
            (0, vitest_1.expect)(data.teamName).toBeDefined();
            (0, vitest_1.expect)(data.attendanceList).toBeInstanceOf(Array);
            (0, vitest_1.expect)(data.blockerAging).toBeInstanceOf(Array);
            (0, vitest_1.expect)(typeof data.anomaliesCount).toBe('number');
        });
    });
    (0, vitest_1.it)('should retrieve program dashboard successfully and contain sprint completion metrics', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const data = await dashboardService.getProgramDashboard();
            (0, vitest_1.expect)(data).toBeDefined();
            (0, vitest_1.expect)(data.metrics).toBeDefined();
            (0, vitest_1.expect)(data.metrics.totalHadir).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(data.sprintMetrics).toBeInstanceOf(Array);
            (0, vitest_1.expect)(data.roleMetrics).toBeInstanceOf(Array);
            (0, vitest_1.expect)(data.statusDistribution).toBeInstanceOf(Array);
            if (data.sprintMetrics.length > 0) {
                const first = data.sprintMetrics[0];
                (0, vitest_1.expect)(first.progress).toBeGreaterThanOrEqual(0);
                (0, vitest_1.expect)(['GREEN', 'YELLOW', 'RED', 'BLACK']).toContain(first.rag);
            }
        });
    });
    (0, vitest_1.it)('should trigger and run async attendance export job successfully, saving file', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const jobId = await schedulerService.triggerExportJob({
                dateFrom: '2026-07-01',
                dateTo: '2026-07-04',
                userId,
                tenantId
            });
            (0, vitest_1.expect)(jobId).toBeDefined();
            await new Promise(resolve => setTimeout(resolve, 2000));
            const filePath = path.join(__dirname, '../../../../uploads/reports', `report_attendance_${jobId}.xlsx`);
            const exists = fs.existsSync(filePath);
            if (exists) {
                fs.unlinkSync(filePath);
            }
            (0, vitest_1.expect)(exists).toBe(true);
        });
    });
});
//# sourceMappingURL=dashboard.spec.js.map