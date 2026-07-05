"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAuditNotifications = seedAuditNotifications;
const client_1 = require("@prisma/client");
const upsert_1 = require("../lib/upsert");
const prisma_service_1 = require("../../../src/prisma/prisma.service");
const attendance_service_1 = require("../../../src/attendance/attendance.service");
const tenant_storage_1 = require("../../../src/prisma/tenant-storage");
const SELFIE_VIEW_REASON = 'Verifikasi kehadiran untuk proses payroll bulan berjalan';
async function seedAuditNotifications(prisma, ctx) {
    const log = (0, upsert_1.createLogger)('41-audit-notifications');
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
    await prisma.auditLog.deleteMany({ where: { tenant_id: tenantId } });
    await prisma.notification.deleteMany({ where: { tenant_id: tenantId } });
    const samples = [];
    const push = (entity, row) => row && samples.push({ entity, row });
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
    let selfieViews = 0;
    if (hr) {
        const targets = await prisma.checkin.findMany({
            where: { tenant_id: tenantId, selfie_key: { not: null }, user_id: { not: hr.id } },
            distinct: ['user_id'],
            select: { selfie_key: true },
            take: 3,
        });
        const ps = new prisma_service_1.PrismaService();
        await ps.onModuleInit();
        try {
            const svc = new attendance_service_1.AttendanceService(ps, {});
            await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
                for (const t of targets) {
                    if (!t.selfie_key)
                        continue;
                    await svc.authorizeSelfieView({ id: hr.id, system_roles: hr.system_roles }, t.selfie_key, SELFIE_VIEW_REASON);
                    selfieViews++;
                }
            });
        }
        finally {
            await ps.onModuleDestroy();
        }
    }
    const kinds = [
        { kind: client_1.NotificationKind.REMINDER_CHECKIN, message: 'Jangan lupa check-in pagi ini.' },
        { kind: client_1.NotificationKind.APPROVAL_IN, message: 'Ada pengajuan menunggu persetujuan Anda.' },
        { kind: client_1.NotificationKind.MENTION, message: 'Anda disebut pada sebuah blocker.' },
        { kind: client_1.NotificationKind.TASK_ASSIGNED, message: 'Task baru ditugaskan kepada Anda.' },
        { kind: client_1.NotificationKind.REMINDER_CHECKOUT, message: 'Waktunya check-out, jangan lupa update task.' },
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
    log.step(`create_trail=${createTrail} view_selfie=${selfieViews} notifications=${notifCount} push_subscriptions=0`);
    log.count('audit_logs', createTrail + selfieViews);
    log.count('notifications', notifCount);
    log.finish();
}
//# sourceMappingURL=41-audit-notifications.js.map