"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("./prisma.service");
const tenant_middleware_1 = require("./tenant.middleware");
const tenant_storage_1 = require("./tenant-storage");
const attendance_service_1 = require("../attendance/attendance.service");
const redis_service_1 = require("../redis/redis.service");
const common_1 = require("@nestjs/common");
const vitest_1 = require("vitest");
function makeToken(tenantId, userId) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: userId, tenantId })).toString('base64url');
    return `${header}.${payload}.sig`;
}
function runMiddleware(mw, req) {
    return new Promise((resolve, reject) => {
        mw.use(req, {}, () => {
            const store = tenant_storage_1.tenantLocalStorage.getStore();
            resolve(store?.tenantId ?? null);
        }).catch(reject);
    });
}
(0, vitest_1.describe)('Multi-Tenant Isolation — Endpoint / Middleware Gate', () => {
    let prisma;
    let mw;
    let tenantAId;
    let tenantBId;
    let userAId;
    let userBId;
    const slugs = ['tenant-ep-a', 'tenant-ep-b'];
    const cleanup = async () => {
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
            await prisma.auditLog.deleteMany({ where: scope });
        }
        await prisma.tenant.deleteMany({ where: { slug: { in: slugs } } });
    };
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        mw = new tenant_middleware_1.TenantMiddleware(prisma);
        await cleanup();
        const seedTenant = async (slug, name, prefix, email, goal, code) => {
            const tenant = await prisma.tenant.create({ data: { name, slug, is_active: true } });
            return tenant_storage_1.tenantLocalStorage.run({ tenantId: tenant.id }, async () => {
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
    (0, vitest_1.afterAll)(async () => {
        await cleanup();
    });
    (0, vitest_1.it)('resolves tenant from the JWT payload, not from any header', async () => {
        const resolvedA = await runMiddleware(mw, {
            headers: { authorization: `Bearer ${makeToken(tenantAId, userAId)}` },
        });
        const resolvedB = await runMiddleware(mw, {
            headers: { authorization: `Bearer ${makeToken(tenantBId, userBId)}` },
        });
        (0, vitest_1.expect)(resolvedA).toBe(tenantAId);
        (0, vitest_1.expect)(resolvedB).toBe(tenantBId);
    });
    (0, vitest_1.it)('IGNORES a forged x-tenant-id header (anti-spoofing, §3.4)', async () => {
        const resolved = await runMiddleware(mw, {
            headers: {
                authorization: `Bearer ${makeToken(tenantAId, userAId)}`,
                'x-tenant-id': tenantBId,
                'x-tenant': tenantBId,
            },
        });
        (0, vitest_1.expect)(resolved).toBe(tenantAId);
    });
    (0, vitest_1.it)('leaks zero cross-tenant rows across projects, sprints, tasks, users, checkins', async () => {
        const assertScoped = async (req, ownTenantId, otherTenantId) => {
            await new Promise((resolve, reject) => {
                mw.use(req, {}, async () => {
                    try {
                        for (const model of ['project', 'sprint', 'task', 'user', 'checkin', 'leaveRequest']) {
                            const rows = await prisma[model].findMany({});
                            const leaked = rows.filter((r) => r.tenant_id === otherTenantId);
                            (0, vitest_1.expect)(leaked.length, `${model} leaked ${otherTenantId} rows`).toBe(0);
                            (0, vitest_1.expect)(rows.every((r) => r.tenant_id === ownTenantId), `${model} all rows own tenant`).toBe(true);
                        }
                        resolve();
                    }
                    catch (e) {
                        reject(e);
                    }
                }).catch(reject);
            });
        };
        await assertScoped({ headers: { authorization: `Bearer ${makeToken(tenantAId, userAId)}` } }, tenantAId, tenantBId);
        await assertScoped({ headers: { authorization: `Bearer ${makeToken(tenantBId, userBId)}` } }, tenantBId, tenantAId);
    });
    (0, vitest_1.it)('rejects cross-tenant selfie access with 403 (FORBIDDEN_SCOPE)', async () => {
        const attendance = new attendance_service_1.AttendanceService(prisma, new redis_service_1.RedisService());
        const checkinB = await prisma.raw.checkin.findFirst({ where: { user_id: userBId }, select: { id: true } });
        (0, vitest_1.expect)(checkinB).toBeTruthy();
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantAId, actorId: userAId }, async () => {
            await (0, vitest_1.expect)(attendance.authorizeSelfieViewById({ id: userAId, system_roles: ['HR'] }, checkinB.id, 'Alasan lintas tenant yang cukup panjang')).rejects.toBeInstanceOf(common_1.ForbiddenException);
        });
    });
});
//# sourceMappingURL=tenant-isolation-endpoint.spec.js.map