"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const attendance_service_1 = require("./attendance.service");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const common_1 = require("@nestjs/common");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Selfie Access Control & Audit (UU PDP)', () => {
    let prisma;
    let service;
    const slugs = ['selfie-test-a', 'selfie-test-b'];
    const selfieKey = 'sel_access_test_key.jpg';
    const otherTenantKey = 'sel_access_test_key_B.jpg';
    let tenantAId;
    let tenantBId;
    let managerId;
    let grandManagerId;
    let subordinateId;
    let hrId;
    let unrelatedId;
    let tenantBHrId;
    const mkUser = (tenantId, email, nik, roles, managerId) => prisma.user.create({
        data: {
            tenant_id: tenantId,
            email,
            password_hash: 'x',
            full_name: email,
            nik,
            system_roles: roles,
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
            await prisma.user.updateMany({ where: scope, data: { manager_id: null } });
            await prisma.user.deleteMany({ where: scope });
        }
        await prisma.tenant.deleteMany({ where: { slug: { in: slugs } } });
    };
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        service = new attendance_service_1.AttendanceService(prisma, new redis_service_1.RedisService());
        await cleanup();
        const tenantA = await prisma.tenant.create({ data: { name: 'Selfie A', slug: slugs[0], is_active: true } });
        const tenantB = await prisma.tenant.create({ data: { name: 'Selfie B', slug: slugs[1], is_active: true } });
        tenantAId = tenantA.id;
        tenantBId = tenantB.id;
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantAId }, async () => {
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
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantBId }, async () => {
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
    (0, vitest_1.afterAll)(async () => {
        await cleanup();
        await prisma.onModuleDestroy?.();
    });
    const run = (tenantId, actorId, fn) => tenant_storage_1.tenantLocalStorage.run({ tenantId, actorId }, fn);
    const countViewAudits = () => prisma.auditLog.count({
        where: { tenant_id: tenantAId, action: 'VIEW_SELFIE', entity: 'Checkin' },
    });
    (0, vitest_1.it)('lets the owner view their own selfie without an audit entry', async () => {
        const before = await countViewAudits();
        await run(tenantAId, subordinateId, async () => {
            const res = await service.authorizeSelfieView({ id: subordinateId, system_roles: ['EMPLOYEE'] }, selfieKey);
            (0, vitest_1.expect)(res.ownerId).toBe(subordinateId);
        });
        (0, vitest_1.expect)(await countViewAudits()).toBe(before);
    });
    (0, vitest_1.it)('lets HR view a subordinate selfie WITH a reason and records an audit', async () => {
        const before = await countViewAudits();
        await run(tenantAId, hrId, async () => {
            await service.authorizeSelfieView({ id: hrId, system_roles: ['HR'] }, selfieKey, 'Verifikasi kehadiran payroll');
        });
        (0, vitest_1.expect)(await countViewAudits()).toBe(before + 1);
        const latest = await prisma.auditLog.findFirst({
            where: { tenant_id: tenantAId, action: 'VIEW_SELFIE' },
            orderBy: { at: 'desc' },
        });
        (0, vitest_1.expect)(latest?.after_json?.via_role).toBe('HR');
        (0, vitest_1.expect)(latest?.after_json?.reason).toContain('payroll');
        (0, vitest_1.expect)(latest?.after_json?.target_user_id).toBe(subordinateId);
    });
    (0, vitest_1.it)('lets a manager in the owner chain view (direct and transitive) with reason + audit', async () => {
        const before = await countViewAudits();
        await run(tenantAId, managerId, async () => {
            await service.authorizeSelfieView({ id: managerId, system_roles: ['MANAGER'] }, selfieKey, 'Review harian tim');
        });
        await run(tenantAId, grandManagerId, async () => {
            await service.authorizeSelfieView({ id: grandManagerId, system_roles: ['MANAGER'] }, selfieKey, 'Audit lintas tim');
        });
        (0, vitest_1.expect)(await countViewAudits()).toBe(before + 2);
    });
    (0, vitest_1.it)('refuses an unrelated employee (FORBIDDEN_SCOPE) and writes no audit', async () => {
        const before = await countViewAudits();
        await run(tenantAId, unrelatedId, async () => {
            await (0, vitest_1.expect)(service.authorizeSelfieView({ id: unrelatedId, system_roles: ['EMPLOYEE'] }, selfieKey, 'iseng')).rejects.toBeInstanceOf(common_1.ForbiddenException);
        });
        (0, vitest_1.expect)(await countViewAudits()).toBe(before);
    });
    (0, vitest_1.it)('requires a reason when viewing another user selfie', async () => {
        await run(tenantAId, hrId, async () => {
            await (0, vitest_1.expect)(service.authorizeSelfieView({ id: hrId, system_roles: ['HR'] }, selfieKey, '  ')).rejects.toBeInstanceOf(common_1.BadRequestException);
        });
    });
    (0, vitest_1.it)('returns NotFound for an unknown selfie key', async () => {
        await run(tenantAId, hrId, async () => {
            await (0, vitest_1.expect)(service.authorizeSelfieView({ id: hrId, system_roles: ['HR'] }, 'does-not-exist.jpg', 'x reason')).rejects.toBeInstanceOf(common_1.NotFoundException);
        });
    });
    (0, vitest_1.it)('isolates tenants: tenant B HR cannot resolve a tenant A selfie key (404)', async () => {
        await run(tenantBId, tenantBHrId, async () => {
            await (0, vitest_1.expect)(service.authorizeSelfieView({ id: tenantBHrId, system_roles: ['HR'] }, selfieKey, 'cross tenant')).rejects.toBeInstanceOf(common_1.NotFoundException);
        });
    });
});
//# sourceMappingURL=selfie-access.spec.js.map