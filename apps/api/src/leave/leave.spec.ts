import { LeaveService } from './leave.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { LeaveType, LeaveStatus, NotificationKind } from '@prisma/client';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';

describe('Leave Requests & Approvals Integration', () => {
  let service: LeaveService;
  let prisma: PrismaService;
  
  let tenantId: string;
  let employeeId: string;
  let managerId: string;
  let testLeaveRequestId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const storageService = new StorageService();
    service = new LeaveService(prisma, storageService);

    // Retrieve Indotek tenant
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
    tenantId = tenant!.id;

    // Fetch superadmin to serve as manager
    const superAdmin = await prisma.user.findFirst({
      where: { email: 'superadmin@indotek.com' }
    });
    managerId = superAdmin!.id;

    // Create temporary employee user with balance = 10
    const employee = await tenantLocalStorage.run({ tenantId }, () => {
      return prisma.user.create({
        data: {
          tenant_id: tenantId,
          email: 'employee-leave-test@indotek.com',
          full_name: 'Employee Leave Test',
          nik: 'NIK-LEAVE-01',
          password_hash: 'hash',
          system_roles: ['EMPLOYEE'],
          manager_id: managerId,
          leave_balance: 10,
          joined_at: new Date()
        }
      });
    });
    employeeId = employee.id;
  });

  afterAll(async () => {
    // Teardown temporary data
    await tenantLocalStorage.run({ tenantId }, async () => {
      if (employeeId) {
        await prisma.notification.deleteMany({ where: { user_id: employeeId } });
        await prisma.notification.deleteMany({ where: { user_id: managerId } });
        await prisma.leaveRequest.deleteMany({ where: { user_id: employeeId } });
        await prisma.user.delete({ where: { id: employeeId } });
      }
    });
  });

  it('should block CUTI submission if requested days exceed balance', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      // 12 days exceeds employee balance of 10
      const body = {
        type: LeaveType.CUTI,
        dateFromStr: '2026-07-01',
        dateToStr: '2026-07-12',
        reason: 'Long summer holiday'
      };

      await expect(
        service.applyLeave(employeeId, body)
      ).rejects.toThrow('INSUFFICIENT_LEAVE_BALANCE');
    });
  });

  it('should block SAKIT submission if doctor attachment is missing', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const body = {
        type: LeaveType.SAKIT,
        dateFromStr: '2026-07-01',
        dateToStr: '2026-07-02',
        reason: 'Fever'
      };

      await expect(
        service.applyLeave(employeeId, body)
      ).rejects.toThrow('ATTACHMENT_REQUIRED_FOR_SICK_LEAVE');
    });
  });

  it('should submit PENDING CUTI request without immediately deducting balance, and log APPROVAL_IN notification', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      // 3 days (July 1 to July 3)
      const body = {
        type: LeaveType.CUTI,
        dateFromStr: '2026-07-01',
        dateToStr: '2026-07-03',
        reason: 'Family visit'
      };

      const request = await service.applyLeave(employeeId, body);
      testLeaveRequestId = request.id;

      expect(request.status).toBe(LeaveStatus.PENDING);

      // Verify balance remains 10
      const user = await prisma.user.findUnique({ where: { id: employeeId } });
      expect(user?.leave_balance).toBe(10);

      // Verify manager received an inbox notification
      const notifications = await prisma.notification.findMany({
        where: { user_id: managerId, kind: NotificationKind.APPROVAL_IN }
      });
      expect(notifications.length).toBeGreaterThan(0);
      expect((notifications[0].payload_json as any).requestId).toBe(request.id);
    });
  });

  it('should allow manager to approve CUTI request, deduct balance, and log APPROVAL_DECIDED notification', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const request = await service.decideLeaveRequest(managerId, testLeaveRequestId, {
        status: 'APPROVED',
        decisionNote: 'Enjoy your break!'
      });

      expect(request.status).toBe(LeaveStatus.APPROVED);

      // Verify balance was deducted by 3 days (10 - 3 = 7)
      const user = await prisma.user.findUnique({ where: { id: employeeId } });
      expect(user?.leave_balance).toBe(7);

      // Verify employee received decision notification
      const notifications = await prisma.notification.findMany({
        where: { user_id: employeeId, kind: NotificationKind.APPROVAL_DECIDED }
      });
      expect(notifications.length).toBeGreaterThan(0);
      expect((notifications[0].payload_json as any).status).toBe('APPROVED');
    });
  });

  it('should allow cancellation of approved CUTI request and refund balance', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const request = await service.cancelLeaveRequest(employeeId, testLeaveRequestId);
      expect(request.status).toBe(LeaveStatus.CANCELLED);

      // Verify balance was refunded back to 10
      const user = await prisma.user.findUnique({ where: { id: employeeId } });
      expect(user?.leave_balance).toBe(10);
    });
  });
});
