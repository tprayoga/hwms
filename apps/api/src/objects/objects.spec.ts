import { ObjectsService } from './objects.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ObjectAccessService } from '../storage/object-access.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

/**
 * Object access via presigned URLs (§7, §9). Exercises the real ObjectsService
 * → AttendanceService authorization + ObjectAccessService presigner (MinIO). The
 * selfie rules (owner vs HR/manager, mandatory reason, audit) and evidence
 * access are verified end-to-end, plus the TTL baked into the signed URL.
 */
describe('Objects: presigned selfie/evidence access', () => {
  let prisma: PrismaService;
  let objects: ObjectsService;

  const slugs = ['objtest-a'];
  const selfieKey = 'obj_selfie_test.jpg';

  let tenantAId: string;
  let managerId: string;
  let subordinateId: string;
  let hrId: string;
  let unrelatedId: string;
  let attendanceId: string;
  let evidenceTaskId: string;
  const evidenceKey = 'obj_evidence_test.pdf';

  const mkUser = (email: string, nik: string, roles: string[], managerId?: string | null) =>
    prisma.user.create({
      data: {
        tenant_id: tenantAId,
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
      await prisma.taskEvidence.deleteMany({ where: scope });
      await prisma.checkin.deleteMany({ where: scope });
      await prisma.task.deleteMany({ where: scope });
      await prisma.sprint.deleteMany({ where: scope });
      await prisma.project.deleteMany({ where: scope });
      await prisma.user.updateMany({ where: scope, data: { manager_id: null } });
      await prisma.user.deleteMany({ where: scope });
    }
    await prisma.tenant.deleteMany({ where: { slug: { in: slugs } } });
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    const storage = new StorageService();
    const objectAccess = new ObjectAccessService(storage);
    const attendance = new AttendanceService(prisma, new RedisService());
    objects = new ObjectsService(prisma, attendance, objectAccess);

    await cleanup();
    const tenantA = await prisma.tenant.create({ data: { name: 'Obj A', slug: slugs[0], is_active: true } });
    tenantAId = tenantA.id;

    await tenantLocalStorage.run({ tenantId: tenantAId }, async () => {
      const manager = await mkUser('mgr@obj.test', 'O-M1', ['MANAGER']);
      managerId = manager.id;
      const sub = await mkUser('sub@obj.test', 'O-S1', ['EMPLOYEE'], manager.id);
      subordinateId = sub.id;
      const hr = await mkUser('hr@obj.test', 'O-H1', ['HR']);
      hrId = hr.id;
      const unrelated = await mkUser('x@obj.test', 'O-X1', ['EMPLOYEE']);
      unrelatedId = unrelated.id;

      const checkin = await prisma.checkin.create({
        data: {
          tenant_id: tenantAId,
          user_id: sub.id,
          date: new Date('2026-07-02'),
          type: 'IN',
          work_status: 'WFH',
          selfie_key: selfieKey,
          submitted_at: new Date(),
          device_timestamp: new Date(),
        },
      });
      attendanceId = checkin.id;

      const project = await prisma.project.create({
        data: { tenant_id: tenantAId, name: 'Obj Project', code_prefix: 'OBJ' },
      });
      const sprint = await prisma.sprint.create({
        data: { tenant_id: tenantAId, project_id: project.id, number: 1, start_date: new Date(), end_date: new Date(), goal: 'g' },
      });
      const task = await prisma.task.create({
        data: {
          tenant_id: tenantAId,
          project_id: project.id,
          sprint_id: sprint.id,
          code: 'OBJ-01-0001',
          workstream: 'Scope',
          title: 'Obj task',
          deliverable: 'x',
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          percent_complete: 0,
          weight: 1,
          planned_start: new Date(),
          planned_end: new Date(),
        },
      });
      evidenceTaskId = task.id;
      await prisma.taskEvidence.create({
        data: { tenant_id: tenantAId, task_id: task.id, kind: 'FILE', url_or_key: evidenceKey, uploaded_by: sub.id },
      });
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.onModuleDestroy?.();
  });

  const run = <T>(actorId: string, fn: () => Promise<T>) =>
    tenantLocalStorage.run({ tenantId: tenantAId, actorId }, fn);

  const countViewAudits = () =>
    prisma.auditLog.count({ where: { tenant_id: tenantAId, action: 'VIEW_SELFIE' } });

  const parseAmzExpires = (url: string): number => {
    const m = url.match(/[?&]X-Amz-Expires=(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
  };

  it('owner gets a presigned selfie URL without a reason and no audit', async () => {
    const before = await countViewAudits();
    await run(subordinateId, async () => {
      const res = await objects.getSelfieUrl({ id: subordinateId, system_roles: ['EMPLOYEE'], tenant_id: tenantAId }, attendanceId);
      expect(res.url).toContain(selfieKey);
      expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());
      // TTL for selfies is 300s (§ ObjectAccessService.TTL_PRIVATE).
      expect(parseAmzExpires(res.url)).toBe(ObjectAccessService.TTL_PRIVATE);
    });
    expect(await countViewAudits()).toBe(before);
  });

  it('MANAGER without a reason → 400 (BadRequest)', async () => {
    await run(managerId, async () => {
      await expect(
        objects.getSelfieUrl({ id: managerId, system_roles: ['MANAGER'], tenant_id: tenantAId }, attendanceId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('MANAGER with a reason → URL + a new audit row containing that reason', async () => {
    const reason = 'Verifikasi kehadiran tim harian';
    const before = await countViewAudits();
    await run(managerId, async () => {
      const res = await objects.getSelfieUrl({ id: managerId, system_roles: ['MANAGER'], tenant_id: tenantAId }, attendanceId, reason);
      expect(res.url).toContain(selfieKey);
    });
    expect(await countViewAudits()).toBe(before + 1);

    const audit = await prisma.auditLog.findFirst({
      where: { tenant_id: tenantAId, action: 'VIEW_SELFIE' },
      orderBy: { at: 'desc' },
    });
    expect(audit?.actor_id).toBe(managerId);
    expect((audit?.after_json as any)?.reason).toBe(reason);
    expect((audit?.after_json as any)?.target_user_id).toBe(subordinateId);
    expect((audit?.after_json as any)?.attendance_id).toBe(attendanceId);
    expect((audit?.after_json as any)?.via_role).toBe('MANAGER');
  });

  it('MANAGER viewing a user OUTSIDE their hierarchy → 403', async () => {
    // `unrelated` has no manager, so `managerId` is not in its chain.
    // Build a checkin owned by `unrelated` and try to view it as the manager.
    let unrelatedAttendanceId = '';
    await run(unrelatedId, async () => {
      const c = await prisma.checkin.create({
        data: {
          tenant_id: tenantAId,
          user_id: unrelatedId,
          date: new Date('2026-07-03'),
          type: 'IN',
          work_status: 'WFH',
          selfie_key: 'obj_selfie_unrelated.jpg',
          submitted_at: new Date(),
          device_timestamp: new Date(),
        },
      });
      unrelatedAttendanceId = c.id;
    });
    await run(managerId, async () => {
      await expect(
        objects.getSelfieUrl({ id: managerId, system_roles: ['MANAGER'], tenant_id: tenantAId }, unrelatedAttendanceId, 'Alasan yang cukup panjang'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('HR gets a presigned evidence URL (role-scoped, logged, no reason)', async () => {
    await run(hrId, async () => {
      const res = await objects.getEvidenceUrl({ id: hrId, tenant_id: tenantAId }, evidenceTaskId, evidenceKey);
      expect(res.url).toContain(evidenceKey);
      expect(parseAmzExpires(res.url)).toBe(ObjectAccessService.TTL_PRIVATE);
    });
    const audit = await prisma.auditLog.findFirst({
      where: { tenant_id: tenantAId, action: 'VIEW_EVIDENCE' },
      orderBy: { at: 'desc' },
    });
    expect(audit?.entity_id).toBe(evidenceTaskId);
    expect((audit?.after_json as any)?.evidence_key).toBe(evidenceKey);
  });
});
