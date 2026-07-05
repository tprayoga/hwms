import { PrismaClient, NotificationKind } from '@prisma/client';
import type { SeedContext } from '../lib/context';
import { createLogger } from '../lib/upsert';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AttendanceService } from '../../../src/attendance/attendance.service';
import { tenantLocalStorage } from '../../../src/prisma/tenant-storage';

/**
 * Audit trail + in-app notifications module (profile: full).
 *
 *  - VIEW_SELFIE audits: written through the PRODUCTION path
 *    (AttendanceService.authorizeSelfieView), i.e. the exact Fase 8.1 endpoint
 *    logic — HR actor, real target checkin, reason ≥10 chars. Not a raw insert.
 *  - Create-trail audits: one sample per seeded domain, matching the Prisma audit
 *    extension's CREATE shape (there is no callable service to retro-audit an
 *    already-created row, so these mirror that shape directly).
 *  - Notifications: 5 per user, mixed kinds and read/unread.
 *  - push_subscriptions: intentionally left EMPTY (fake endpoints would make the
 *    real Web Push worker error on send).
 *
 * Idempotent: self-cleans the tenant's audit_logs + notifications first, then
 * recreates a deterministic set.
 */

const SELFIE_VIEW_REASON = 'Verifikasi kehadiran untuk proses payroll bulan berjalan';

export async function seedAuditNotifications(prisma: PrismaClient, ctx: SeedContext): Promise<void> {
  const log = createLogger('41-audit-notifications');
  const rng = ctx.rng;

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
  if (!tenant) {
    log.step('tenant indotek not found — run core first; skipping.');
    log.finish();
    return;
  }
  const tenantId = tenant.id;

  const superAdmin = await prisma.user.findFirst({ where: { tenant_id: tenantId, email: 'superadmin@indotek.com' } });
  const hr = await prisma.user.findFirst({
    where: { tenant_id: tenantId, system_roles: { has: 'HR' } },
    select: { id: true, system_roles: true },
  });

  // Idempotency: clear this tenant's seed-generated audit + notification rows.
  await prisma.auditLog.deleteMany({ where: { tenant_id: tenantId } });
  await prisma.notification.deleteMany({ where: { tenant_id: tenantId } });

  // ---- Create-trail audits: one sample per seeded domain ----
  const samples: { entity: string; row: any }[] = [];
  const push = (entity: string, row: any) => row && samples.push({ entity, row });
  push('Project', await prisma.project.findFirst({ where: { tenant_id: tenantId, name: 'HWMS Internal Rollout' } }));
  push('Holiday', await prisma.holiday.findFirst({ where: { tenant_id: tenantId } }));
  push('Checkin', await prisma.checkin.findFirst({ where: { tenant_id: tenantId, type: 'IN' } }));
  push('LeaveRequest', await prisma.leaveRequest.findFirst({ where: { tenant_id: tenantId } }));
  push('Task', await prisma.task.findFirst({ where: { tenant_id: tenantId, code: { startsWith: 'HIR-' } } }));
  push('Policy', await prisma.policy.findFirst({ where: { tenant_id: tenantId, scope_type: 'TENANT' } }));
  push('Scorecard', await prisma.scorecard.findFirst({ where: { tenant_id: tenantId } }));
  push('ReviewNote', await prisma.reviewNote.findFirst({ where: { tenant_id: tenantId } }));
  push('OKR', await prisma.oKR.findFirst({ where: { tenant_id: tenantId } }));
  push('Risk', await prisma.risk.findFirst({ where: { tenant_id: tenantId } }));

  let createTrail = 0;
  for (const s of samples) {
    await prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        actor_id: superAdmin?.id ?? null,
        entity: s.entity,
        entity_id: s.row.id,
        action: 'CREATE',
        after_json: { id: s.row.id, seeded: true },
      },
    });
    createTrail++;
  }

  // ---- VIEW_SELFIE via the production endpoint logic ----
  let selfieViews = 0;
  if (hr) {
    // 3 distinct target users (not HR) with a selfie key.
    const targets = await prisma.checkin.findMany({
      where: { tenant_id: tenantId, selfie_key: { not: null }, user_id: { not: hr.id } },
      distinct: ['user_id'],
      select: { selfie_key: true },
      take: 3,
    });
    const ps = new PrismaService();
    await (ps as any).onModuleInit();
    try {
      const svc = new AttendanceService(ps as any, {} as any);
      await tenantLocalStorage.run({ tenantId }, async () => {
        for (const t of targets) {
          if (!t.selfie_key) continue;
          await svc.authorizeSelfieView({ id: hr.id, system_roles: hr.system_roles as string[] }, t.selfie_key, SELFIE_VIEW_REASON);
          selfieViews++;
        }
      });
    } finally {
      await (ps as any).onModuleDestroy();
    }
  }

  // ---- In-app notifications: 5 per user, mixed kinds + read/unread ----
  const kinds: { kind: NotificationKind; message: string }[] = [
    { kind: NotificationKind.REMINDER_CHECKIN, message: 'Jangan lupa check-in pagi ini.' },
    { kind: NotificationKind.APPROVAL_IN, message: 'Ada pengajuan menunggu persetujuan Anda.' },
    { kind: NotificationKind.MENTION, message: 'Anda disebut pada sebuah blocker.' },
    { kind: NotificationKind.TASK_ASSIGNED, message: 'Task baru ditugaskan kepada Anda.' },
    { kind: NotificationKind.REMINDER_CHECKOUT, message: 'Waktunya check-out, jangan lupa update task.' },
  ];
  const users = await prisma.user.findMany({
    where: { tenant_id: tenantId },
    orderBy: { nik: 'asc' },
    select: { id: true },
  });
  let notifCount = 0;
  for (const u of users) {
    for (const k of kinds) {
      const read = rng.chance(0.5);
      const readAt = read ? new Date(ctx.anchor.getTime() - rng.int(1, 72) * 3600 * 1000) : null;
      await prisma.notification.create({
        data: {
          tenant_id: tenantId,
          user_id: u.id,
          kind: k.kind,
          payload_json: { message: k.message },
          read_at: readAt,
        },
      });
      notifCount++;
    }
  }

  log.step(
    `create_trail=${createTrail} view_selfie=${selfieViews} notifications=${notifCount} push_subscriptions=0`,
  );
  log.count('audit_logs', createTrail + selfieViews);
  log.count('notifications', notifCount);
  log.finish();
}
