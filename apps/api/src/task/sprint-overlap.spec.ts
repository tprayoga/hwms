import { TaskService } from './task.service';
import { PrismaService } from '../prisma/prisma.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { BadRequestException } from '@nestjs/common';
import { describe, beforeAll, it, expect, vi } from 'vitest';

describe('Sprint Overlap Check', () => {
  let service: TaskService;
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = {
      sprint: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    } as unknown as PrismaService;

    service = new TaskService(prisma, null as any, { triggerRefresh: vi.fn() } as any);
  });

  it('should block sprint creation if dates overlap with another sprint in same project', async () => {
    // Mock that an overlapping sprint is found
    vi.spyOn(prisma.sprint, 'findFirst').mockResolvedValue({
      id: 'existing-sprint-id',
      number: 1,
    } as any);

    const body = {
      projectId: 'proj-id',
      number: 2,
      startDate: '2026-07-01T00:00:00Z',
      endDate: '2026-07-14T00:00:00Z',
    };

    await expect(
      tenantLocalStorage.run({ tenantId: 'tenant-id' }, () => {
        return service.createSprint(body);
      })
    ).rejects.toThrow(new BadRequestException('SPRINT_OVERLAP'));
  });

  it('should allow sprint creation if no overlapping dates are found', async () => {
    // Mock that no overlapping sprint is found (null)
    vi.spyOn(prisma.sprint, 'findFirst').mockResolvedValue(null);
    const createSpy = vi.spyOn(prisma.sprint, 'create').mockResolvedValue({
      id: 'new-sprint-id',
      number: 2,
    } as any);

    const body = {
      projectId: 'proj-id',
      number: 2,
      startDate: '2026-07-15T00:00:00Z',
      endDate: '2026-07-28T00:00:00Z',
    };

    const result = await tenantLocalStorage.run({ tenantId: 'tenant-id' }, () => {
      return service.createSprint(body);
    });

    expect(result.id).toBe('new-sprint-id');
    expect(createSpy).toHaveBeenCalled();
  });
});
