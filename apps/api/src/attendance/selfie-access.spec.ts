import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

/**
 * Selfie access control + audit (§6, §9 — UU PDP). Phase 8 replaced the public,
 * un-audited selfie endpoint with an authenticated, scoped, audited one.
 *
 * Verifies AttendanceService.authorizeSelfieView (the security boundary):
 *   - owner sees own selfie without an audit entry;
 *   - HR and a manager in the owner's chain may view, but only with a reason,
 *     and every such access lands in audit_logs (action VIEW_SELFIE);
 *   - an unrelated employee is refused (FORBIDDEN_SCOPE);
 *   - a selfie key from another tenant is invisible (404).
 */
describe('Selfie Access Control & Audit (UU PDP)', () => {
  let prisma: PrismaService;
  let service: AttendanceService;

  const slugs = ['selfie-test-a', 'selfie-test-b'];
  const selfieKey = 'sel_access_test_key.jpg';
  const otherTenantKey = 'sel_access_test_key_B.jpg';

  let tenantAId: string;
  let tenantBId: string;
  let managerId: string; // manages `subordinateId` directly
  let grandManagerId: string; // manages `managerId` (chain test)
  let subordinateId: string;
  let hrId: string;
  let unrelatedId: string;
  let tenantBHrId: string;

  const mkUser = (
    tenantId: string,
    email: string,
    nik: string,
    roles: string[],
    managerId?: string | null,
  ) =>
    prisma.user.create({
      data: {
        tenant_id: tenantId,
        email,
        password_hash: 'x',
        full_name: email,
        nik,
        system_roles: roles as any,
        timezone: 'Asia/Jakarta',
        manager_id: managerId ?? null,
        joined_at: new Date(),
      },
    });

  const cleanup = async () => {
    const tenants = await prisma.tenant.findMany({ where: { slug: { in: slugs } } });
    const ids = tenants.map((t) => t.id);
    if (ids.length) {
      const scope = { tenant_id: { in: ids } };
      await prisma.auditLog.deleteMany({ where: scope });
      await prisma.checkin.deleteMany({ where: scope });
      // Null out manager links before deleting users to avoid FK ordering issues.
      await prisma.user.updateMany({ where: scope, data: { manager_id: null } });
      await prisma.user.deleteMany({ where: scope });
    }
    await prisma.tenant.deleteMany({ where: { slug: { in: slugs } } });
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new AttendanceService(prisma, new RedisService());

    await cleanup();

    const tenantA = await prisma.tenant.create({ data: { name: 'Selfie A', slug: slugs[0], is_active: true } });
    const tenantB = await prisma.tenant.create({ data: { name: 'Selfie B', slug: slugs[1], is_active: true } });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await tenantLocalStorage.run({ tenantId: tenantAId }, async () => {
      const grand = await mkUser(tenantAId, 'grand@a.test', 'A-G1', ['MANAGER']);
      grandManagerId = grand.id;
      const manager = await mkUser(tenantAId, 'manager@a.test', 'A-M1', ['MANAGER'], grand.id);
      managerId = manager.id;
      const sub = await mkUser(tenantAId, 'sub@a.test', 'A-S1', ['EMPLOYEE'], manager.id);
      subordinateId = sub.id;
      const hr = await mkUser(tenantAId, 'hr@a.test', 'A-H1', ['HR']);
      hrId = hr.id;
      const unrelated = await mkUser(tenantAId, 'unrelated@a.test', 'A-X1', ['EMPLOYEE']);
      unrelatedId = unrelated.id;

      await prisma.checkin.create({
        data: {
          tenant_id: tenantAId,
          user_id: sub.id,
          date: new Date('2026-07-01'),
          type: 'IN',
          work_status: 'WFH',
          selfie_key: selfieKey,
          submitted_at: new Date(),
          device_timestamp: new Date(),
        },
      });
    });

    await tenantLocalStorage.run({ tenantId: tenantBId }, async () => {
      const hrB = await mkUser(tenantBId, 'hr@b.test', 'B-H1', ['HR']);
      tenantBHrId = hrB.id;
      const subB = await mkUser(tenantBId, 'sub@b.test', 'B-S1', ['EMPLOYEE']);
      await prisma.checkin.create({
        data: {
          tenant_id: tenantBId,
          user_id: subB.id,
          date: new Date('2026-07-01'),
          type: 'IN',
          work_status: 'WFH',
          selfie_key: otherTenantKey,
          submitted_at: new Date(),
          device_timestamp: new Date(),
        },
      });
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.onModuleDestroy?.();
  });

  const run = <T>(tenantId: string, actorId: string, fn: () => Promise<T>) =>
    tenantLocalStorage.run({ tenantId, actorId }, fn);

  const countViewAudits = () =>
    prisma.auditLog.count({
      where: { tenant_id: tenantAId, action: 'VIEW_SELFIE', entity: 'Checkin' },
    });

  it('lets the owner view their own selfie without an audit entry', async () => {
    const before = await countViewAudits();
    await run(tenantAId, subordinateId, async () => {
      const res = await service.authorizeSelfieView({ id: subordinateId, system_roles: ['EMPLOYEE'] }, selfieKey);
      expect(res.ownerId).toBe(subordinateId);
    });
    expect(await countViewAudits()).toBe(before);
  });

  it('lets HR view a subordinate selfie WITH a reason and records an audit', async () => {
    const before = await countViewAudits();
    await run(tenantAId, hrId, async () => {
      await service.authorizeSelfieView({ id: hrId, system_roles: ['HR'] }, selfieKey, 'Verifikasi kehadiran payroll');
    });
    expect(await countViewAudits()).toBe(before + 1);
    const latest = await prisma.auditLog.findFirst({
      where: { tenant_id: tenantAId, action: 'VIEW_SELFIE' },
      orderBy: { at: 'desc' },
    });
    expect((latest?.after_json as any)?.via_role).toBe('HR');
    expect((latest?.after_json as any)?.reason).toContain('payroll');
    expect((latest?.after_json as any)?.target_user_id).toBe(subordinateId);
  });

  it('lets a manager in the owner chain view (direct and transitive) with reason + audit', async () => {
    const before = await countViewAudits();
    // Direct manager
    await run(tenantAId, managerId, async () => {
      await service.authorizeSelfieView({ id: managerId, system_roles: ['MANAGER'] }, selfieKey, 'Review harian tim');
    });
    // Grand-manager (transitive, up the chain)
    await run(tenantAId, grandManagerId, async () => {
      await service.authorizeSelfieView({ id: grandManagerId, system_roles: ['MANAGER'] }, selfieKey, 'Audit lintas tim');
    });
    expect(await countViewAudits()).toBe(before + 2);
  });

  it('refuses an unrelated employee (FORBIDDEN_SCOPE) and writes no audit', async () => {
    const before = await countViewAudits();
    await run(tenantAId, unrelatedId, async () => {
      await expect(
        service.authorizeSelfieView({ id: unrelatedId, system_roles: ['EMPLOYEE'] }, selfieKey, 'iseng'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    expect(await countViewAudits()).toBe(before);
  });

  it('requires a reason when viewing another user selfie', async () => {
    await run(tenantAId, hrId, async () => {
      await expect(
        service.authorizeSelfieView({ id: hrId, system_roles: ['HR'] }, selfieKey, '  '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('returns NotFound for an unknown selfie key', async () => {
    await run(tenantAId, hrId, async () => {
      await expect(
        service.authorizeSelfieView({ id: hrId, system_roles: ['HR'] }, 'does-not-exist.jpg', 'x reason'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('isolates tenants: tenant B HR cannot resolve a tenant A selfie key (404)', async () => {
    await run(tenantBId, tenantBHrId, async () => {
      await expect(
        service.authorizeSelfieView({ id: tenantBHrId, system_roles: ['HR'] }, selfieKey, 'cross tenant'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
