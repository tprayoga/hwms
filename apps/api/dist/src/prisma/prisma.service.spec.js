"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const prisma_service_1 = require("./prisma.service");
const tenant_storage_1 = require("./tenant-storage");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('PrismaService Tenant Isolation', () => {
    let service;
    (0, vitest_1.beforeAll)(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [prisma_service_1.PrismaService],
        }).compile();
        service = module.get(prisma_service_1.PrismaService);
        await service.onModuleInit();
    });
    (0, vitest_1.afterAll)(async () => {
        await service.onModuleDestroy();
    });
    (0, vitest_1.it)('should automatically scope queries to the active tenant', async () => {
        const tenantA = await service.tenant.create({
            data: { name: 'Test Tenant A', slug: 'test-tenant-a' },
        });
        const tenantB = await service.tenant.create({
            data: { name: 'Test Tenant B', slug: 'test-tenant-b' },
        });
        const userA = await service.user.create({
            data: {
                tenant_id: tenantA.id,
                email: 'userA@tenant-a.com',
                full_name: 'User A',
                nik: 'NIK-A',
                password_hash: 'hash',
                joined_at: new Date(),
                system_roles: ['EMPLOYEE'],
            },
        });
        const userB = await service.user.create({
            data: {
                tenant_id: tenantB.id,
                email: 'userB@tenant-b.com',
                full_name: 'User B',
                nik: 'NIK-B',
                password_hash: 'hash',
                joined_at: new Date(),
                system_roles: ['EMPLOYEE'],
            },
        });
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantA.id }, async () => {
            const users = await service.user.findMany();
            (0, vitest_1.expect)(users.length).toBe(1);
            (0, vitest_1.expect)(users[0].email).toBe('userA@tenant-a.com');
        });
        await tenant_storage_1.tenantLocalStorage.run({ tenantId: tenantB.id }, async () => {
            const users = await service.user.findMany();
            (0, vitest_1.expect)(users.length).toBe(1);
            (0, vitest_1.expect)(users[0].email).toBe('userB@tenant-b.com');
        });
        await service.user.deleteMany({
            where: { id: { in: [userA.id, userB.id] } },
        });
        await service.tenant.deleteMany({
            where: { id: { in: [tenantA.id, tenantB.id] } },
        });
    });
});
//# sourceMappingURL=prisma.service.spec.js.map