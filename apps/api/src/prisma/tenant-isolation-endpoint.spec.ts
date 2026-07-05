import { PrismaService } from './prisma.service';
import { TenantMiddleware } from './tenant.middleware';
import { tenantLocalStorage } from './tenant-storage';
import { AttendanceService } from '../attendance/attendance.service';
import { RedisService } from '../redis/redis.service';
import { ForbiddenException } from '@nestjs/common';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

/**
 * Endpoint-level multi-tenant isolation gate (§3.4, §6).
 *
 * Every HTTP request passes through TenantMiddleware before hitting a handler.
 * This suite drives that exact code path with real request objects and asserts:
 *   - the tenant is resolved from the JWT payload (not a client header);
 *   - a forged `x-tenant-id` header is ignored (anti-spoofing);
 *   - under each resolved context, queries across many domain models leak zero
 *     rows from the other tenant.
 *
 * Because the middleware only base64-decodes the JWT payload (signature is
 * verified later by AuthGuard), we can craft deterministic test tokens here.
 */
function makeToken(tenantId: string, userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, tenantId })).toString('base64url');
  return `${header}.${payload}.sig`;
}

function runMiddleware(mw: TenantMiddleware, req: any): Promise<string | null> {
  return new Promise((resolve, reject) => {
    mw.use(req, {} as any, () => {
      // `next()` runs *inside* tenantLocalStorage.run — capture the active tenant.
      const store = tenantLocalStorage.getStore();
      resolve(store?.tenantId ?? null);
    }).catch(reject);
  });
}

describe('Multi-Tenant Isolation — Endpoint / Middleware Gate', () => {
  let prisma: PrismaService;
  let mw: TenantMiddleware;
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;

  const slugs = ['tenant-ep-a', 'tenant-ep-b'];

  const cleanup = async () => {
    // Runs outside any tenant context, so delete by tenant_id directly (no
    // relation filters — the Prisma extension does not inject a tenant here).
    const tenants = await prisma.tenant.findMany({ where: { slug: { in: slugs } } });
    const ids = tenants.map((t) => t.id);
    if (ids.length) {
      const scope = { tenant_id: { in: ids } };
      await prisma.checkin.deleteMany({ where: scope });
      await prisma.leaveRequest.deleteMany({ where: scope });
      await prisma.task.deleteMany({ where: scope });
      await prisma.sprint.deleteMany({ where: scope });
      await prisma.project.deleteMany({ where: scope });
      await prisma.user.deleteMany({ where: scope });
      // Audited creates (User) wrote audit_logs that FK the tenant; clear them.
      await prisma.auditLog.deleteMany({ where: scope });
    }
    await prisma.tenant.deleteMany({ where: { slug: { in: slugs } } });
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    mw = new TenantMiddleware(prisma);

    await cleanup();

    const seedTenant = async (slug: string, name: string, prefix: string, email: string, goal: string, code: string) => {
      const tenant = await prisma.tenant.create({ data: { name, slug, is_active: true } });
      return tenantLocalStorage.run({ tenantId: tenant.id }, async () => {
        const user = await prisma.user.create({
          data: {
            tenant_id: tenant.id,
            email,
            password_hash: 'x',
            full_name: name + ' User',
            nik: prefix + '-U1',
            system_roles: ['EMPLOYEE'],
            timezone: 'Asia/Jakarta',
            leave_balance: 12,
            joined_at: new Date(),
          },
        });
        const project = await prisma.project.create({
          data: { tenant_id: tenant.id, name: `${prefix === 'EPA' ? 'EP Project A' : 'EP Project B'}`, code_prefix: prefix.slice(0, 3) },
        });
        const sprint = await prisma.sprint.create({
          data: { tenant_id: tenant.id, project_id: project.id, number: 1, start_date: new Date(), end_date: new Date(), goal },
        });
        await prisma.task.create({
          data: {
            tenant_id: tenant.id,
            project_id: project.id,
            sprint_id: sprint.id,
            code,
            workstream: 'Scope',
            title: `Task ${prefix}`,
            deliverable: 'x',
            priority: 'MEDIUM',
            status: 'NOT_STARTED',
            percent_complete: 0,
            weight: 1,
            planned_start: new Date(),
            planned_end: new Date(),
          },
        });
        await prisma.checkin.create({
          data: {
            tenant_id: tenant.id,
            user_id: user.id,
            date: new Date('2026-07-01'),
            type: 'IN',
            work_status: 'WFH',
            submitted_at: new Date(),
            device_timestamp: new Date(),
          },
        });
        return { tenantId: tenant.id, userId: user.id };
      });
    };

    const a = await seedTenant('tenant-ep-a', 'EP A', 'EPA', 'ep-a@test.local', 'EP Goal A', 'EPA-00-0001');
    const b = await seedTenant('tenant-ep-b', 'EP B', 'EPB', 'ep-b@test.local', 'EP Goal B', 'EPB-00-0001');
    tenantAId = a.tenantId;
    userAId = a.userId;
    tenantBId = b.tenantId;
    userBId = b.userId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('resolves tenant from the JWT payload, not from any header', async () => {
    const resolvedA = await runMiddleware(mw, {
      headers: { authorization: `Bearer ${makeToken(tenantAId, userAId)}` },
    });
    const resolvedB = await runMiddleware(mw, {
      headers: { authorization: `Bearer ${makeToken(tenantBId, userBId)}` },
    });
    expect(resolvedA).toBe(tenantAId);
    expect(resolvedB).toBe(tenantBId);
  });

  it('IGNORES a forged x-tenant-id header (anti-spoofing, §3.4)', async () => {
    const resolved = await runMiddleware(mw, {
      headers: {
        authorization: `Bearer ${makeToken(tenantAId, userAId)}`,
        'x-tenant-id': tenantBId, // attacker tries to cross tenants
        'x-tenant': tenantBId,
      },
    });
    // Must stay on tenant A — the header must have no effect.
    expect(resolved).toBe(tenantAId);
  });

  it('leaks zero cross-tenant rows across projects, sprints, tasks, users, checkins', async () => {
    const assertScoped = async (req: any, ownTenantId: string, otherTenantId: string) => {
      await new Promise<void>((resolve, reject) => {
        mw.use(req, {} as any, async () => {
          try {
            for (const model of ['project', 'sprint', 'task', 'user', 'checkin', 'leaveRequest'] as const) {
              const rows: any[] = await (prisma as any)[model].findMany({});
              const leaked = rows.filter((r) => r.tenant_id === otherTenantId);
              expect(leaked.length, `${model} leaked ${otherTenantId} rows`).toBe(0);
              expect(rows.every((r) => r.tenant_id === ownTenantId), `${model} all rows own tenant`).toBe(true);
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        }).catch(reject);
      });
    };

    await assertScoped(
      { headers: { authorization: `Bearer ${makeToken(tenantAId, userAId)}` } },
      tenantAId,
      tenantBId,
    );
    await assertScoped(
      { headers: { authorization: `Bearer ${makeToken(tenantBId, userBId)}` } },
      tenantBId,
      tenantAId,
    );
  });

  // §6/§9 + §3.4: a user in tenant A requesting a selfie whose checkin lives in
  // tenant B must be refused with 403 (not 404) — the object-access path
  // distinguishes cross-tenant from not-found via the un-tenant-scoped lookup.
  it('rejects cross-tenant selfie access with 403 (FORBIDDEN_SCOPE)', async () => {
    const attendance = new AttendanceService(prisma, new RedisService());

    // Grab tenant B's checkin id (created by the seed for userB).
    const checkinB = await prisma.raw.checkin.findFirst({ where: { user_id: userBId }, select: { id: true } });
    expect(checkinB).toBeTruthy();

    // Viewer authenticated under tenant A tries to read a tenant B attendance.
    await tenantLocalStorage.run({ tenantId: tenantAId, actorId: userAId }, async () => {
      await expect(
        attendance.authorizeSelfieViewById(
          { id: userAId, system_roles: ['HR'] },
          checkinB!.id,
          'Alasan lintas tenant yang cukup panjang',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
