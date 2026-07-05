import { DashboardService } from './dashboard.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamResolverService } from '../feed/team-resolver.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { SystemRole } from '@hwms/shared';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard & Report Integration', () => {
  let dashboardService: DashboardService;
  let schedulerService: SchedulerService;
  let prisma: PrismaService;

  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const teamResolver = new TeamResolverService(prisma);
    dashboardService = new DashboardService(prisma, teamResolver);

    // Dynamic mock for PushService to prevent push server trigger errors during test
    const mockPushService = {
      sendPushNotification: async () => {}
    } as any;

    const mockStorageService = {
      deleteFile: async () => {},
      uploadFile: async () => 'ok',
    } as any;

    schedulerService = new SchedulerService(prisma, mockPushService, mockStorageService);
    await schedulerService.onModuleInit();

    const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
    tenantId = tenant!.id;

    const superAdmin = await prisma.user.findFirst({
      where: { email: 'superadmin@indotek.com' }
    });
    userId = superAdmin!.id;
  });

  afterAll(async () => {
    await schedulerService.onModuleDestroy();
  });

  it('should retrieve team dashboard successfully', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const data = await dashboardService.getTeamDashboard(userId, '', '', '');
      expect(data).toBeDefined();
      expect(data.teamName).toBeDefined();
      expect(data.attendanceList).toBeInstanceOf(Array);
      expect(data.blockerAging).toBeInstanceOf(Array);
      expect(typeof data.anomaliesCount).toBe('number');
    });
  });

  it('should retrieve program dashboard successfully and contain sprint completion metrics', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const data = await dashboardService.getProgramDashboard();
      expect(data).toBeDefined();
      expect(data.metrics).toBeDefined();
      expect(data.metrics.totalHadir).toBeGreaterThanOrEqual(0);
      expect(data.sprintMetrics).toBeInstanceOf(Array);
      expect(data.roleMetrics).toBeInstanceOf(Array);
      expect(data.statusDistribution).toBeInstanceOf(Array);

      // Verify that sprintMetrics elements contain RAG property
      if (data.sprintMetrics.length > 0) {
        const first = data.sprintMetrics[0];
        expect(first.progress).toBeGreaterThanOrEqual(0);
        expect(['GREEN', 'YELLOW', 'RED', 'BLACK']).toContain(first.rag);
      }
    });
  });

  it('should trigger and run async attendance export job successfully, saving file', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const jobId = await schedulerService.triggerExportJob({
        dateFrom: '2026-07-01',
        dateTo: '2026-07-04',
        userId,
        tenantId
      });

      expect(jobId).toBeDefined();

      // Wait a short duration for the background exceljs processing to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const filePath = path.join(__dirname, '../../../../uploads/reports', `report_attendance_${jobId}.xlsx`);
      const exists = fs.existsSync(filePath);
      
      // Clean up file if it generated successfully
      if (exists) {
        fs.unlinkSync(filePath);
      }

      expect(exists).toBe(true);
    });
  });
});
