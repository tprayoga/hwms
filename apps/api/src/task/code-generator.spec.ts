import { TaskService } from './task.service';
import { PrismaService } from '../prisma/prisma.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { describe, beforeAll, it, expect, vi } from 'vitest';

describe('Task Code Generator & Immutability', () => {
  let service: TaskService;
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = {
      project: {
        findUnique: vi.fn(),
      },
      sprint: {
        findUnique: vi.fn(),
      },
      task: {
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as PrismaService;

    const mockAggregation = {
      triggerRefresh: vi.fn(),
    } as any;

    service = new TaskService(prisma, null as any, mockAggregation);
  });

  it('should generate code in format PREFIX-SS-NNNN based on project prefix and task sequence', async () => {
    const tenantId = 'tenant-id';
    
    // Mock project prefix as "PROJ"
    vi.spyOn(prisma.project, 'findUnique').mockResolvedValue({
      id: 'proj-id',
      code_prefix: 'PROJ',
    } as any);

    // Mock sprint number as 3
    vi.spyOn(prisma.sprint, 'findUnique').mockResolvedValue({
      id: 'sprint-id',
      number: 3,
    } as any);

    // Mock 9 tasks exist -> next is 10 (0010)
    vi.spyOn(prisma.task, 'count').mockResolvedValue(9);
    
    // Intercept create call to assert code format
    const createSpy = vi.spyOn(prisma.task, 'create').mockImplementation((({ data }: any) => {
      return Promise.resolve({
        id: 'new-task-id',
        code: data.code,
      } as any);
    }) as any);

    const body = {
      projectId: 'proj-id',
      sprintId: 'sprint-id',
      title: 'Test Generator',
      plannedStart: new Date(),
      plannedEnd: new Date(),
    };

    const taskResult = await tenantLocalStorage.run({ tenantId }, () => {
      return service.createTask(body);
    });

    expect(taskResult.code).toBe('PROJ-03-0010');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'PROJ-03-0010',
        }),
      })
    );
  });

  it('should prevent mutating task code on update (immutability check)', async () => {
    const updateSpy = vi.spyOn(prisma.task, 'update').mockImplementation((({ data }: any) => {
      // Assert that 'code' is not part of the update payload
      expect(data.code).toBeUndefined();
      return Promise.resolve({
        id: 'task-id',
        code: 'PROJ-03-0010', // returned unchanged
        assignments: [],
      } as any);
    }) as any);

    const updateBody = {
      title: 'Updated Title',
      code: 'ATTEMPTED-CHANGE-CODE', // attempts to modify code
    };

    await service.updateTask('task-id', updateBody);
    expect(updateSpy).toHaveBeenCalled();
  });
});
