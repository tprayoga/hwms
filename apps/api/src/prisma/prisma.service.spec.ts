import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { tenantLocalStorage } from './tenant-storage';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

describe('PrismaService Tenant Isolation', () => {
  let service: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    await service.onModuleInit();
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('should automatically scope queries to the active tenant', async () => {
    // 1. Create two test tenants
    const tenantA = await service.tenant.create({
      data: { name: 'Test Tenant A', slug: 'test-tenant-a' },
    });
    const tenantB = await service.tenant.create({
      data: { name: 'Test Tenant B', slug: 'test-tenant-b' },
    });

    // 2. Create users under each tenant (context is empty, so we explicitly provide tenant_id)
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

    // 3. Query under Tenant A context
    await tenantLocalStorage.run({ tenantId: tenantA.id }, async () => {
      const users = await service.user.findMany();
      expect(users.length).toBe(1);
      expect(users[0].email).toBe('userA@tenant-a.com');
    });

    // 4. Query under Tenant B context
    await tenantLocalStorage.run({ tenantId: tenantB.id }, async () => {
      const users = await service.user.findMany();
      expect(users.length).toBe(1);
      expect(users[0].email).toBe('userB@tenant-b.com');
    });

    // Cleanup
    await service.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await service.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
  });
});
