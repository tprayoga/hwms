import { TaskAggregationService } from './task-aggregation.service';
import { RAGStatus, TaskStatus } from '@prisma/client';
import { describe, beforeAll, it, expect, vi } from 'vitest';

describe('Task Progress Aggregation & RAG Bounds', () => {
  let service: TaskAggregationService;

  beforeAll(() => {
    // We instantiate with nulls since we are only testing the pure logic helper calculateProgress
    service = new TaskAggregationService(null as any, null as any);
  });

  it('should return 0% progress and Green RAG when task list is empty', async () => {
    const { progressPct, rag } = await service.calculateProgress([]);
    expect(progressPct).toBe(0);
    expect(rag).toBe(RAGStatus.GREEN);
  });

  it('should calculate weighted progress correctly for multiple tasks', async () => {
    const tasks = [
      { percent_complete: 50, weight: 1.0, status: TaskStatus.IN_PROGRESS },
      { percent_complete: 100, weight: 3.0, status: TaskStatus.DONE },
    ];
    // sumWeight = 4.0
    // sumWeightedProgress = (50*1) + (100*3) = 350
    // expected = 350 / 4 = 87.5%
    const { progressPct } = await service.calculateProgress(tasks);
    expect(progressPct).toBe(87.5);
  });

  it('should handle zero weights correctly defaulting to 0%', async () => {
    const tasks = [
      { percent_complete: 100, weight: 0.0, status: TaskStatus.DONE },
      { percent_complete: 80, weight: 0.0, status: TaskStatus.IN_PROGRESS },
    ];
    const { progressPct } = await service.calculateProgress(tasks);
    expect(progressPct).toBe(0);
  });

  it('should classify Green RAG for progress >= 85%', async () => {
    const tasks = [{ percent_complete: 85, weight: 1.0, status: TaskStatus.IN_PROGRESS }];
    const { rag } = await service.calculateProgress(tasks);
    expect(rag).toBe(RAGStatus.GREEN);
  });

  it('should classify Yellow RAG for progress between 60% and 84%', async () => {
    const tasks84 = [{ percent_complete: 84, weight: 1.0, status: TaskStatus.IN_PROGRESS }];
    const tasks60 = [{ percent_complete: 60, weight: 1.0, status: TaskStatus.IN_PROGRESS }];

    expect((await service.calculateProgress(tasks84)).rag).toBe(RAGStatus.YELLOW);
    expect((await service.calculateProgress(tasks60)).rag).toBe(RAGStatus.YELLOW);
  });

  it('should classify Red RAG for progress < 60% with no blockers or delays', async () => {
    const tasks = [
      { 
        percent_complete: 59, 
        weight: 1.0, 
        status: TaskStatus.IN_PROGRESS,
        planned_end: new Date(Date.now() + 86400000) // in future, not delayed
      }
    ];
    const { rag } = await service.calculateProgress(tasks);
    expect(rag).toBe(RAGStatus.RED);
  });

  it('should classify Black RAG for progress < 60% with active blockers', async () => {
    const tasks = [
      { 
        percent_complete: 50, 
        weight: 1.0, 
        status: TaskStatus.BLOCKED,
        planned_end: new Date(Date.now() + 86400000),
        blockers: [{ status: 'OPEN' }]
      }
    ];
    const { rag } = await service.calculateProgress(tasks);
    expect(rag).toBe(RAGStatus.BLACK);
  });

  it('should classify Black RAG for progress < 60% when delayed past planned end date', async () => {
    const tasks = [
      { 
        percent_complete: 40, 
        weight: 1.0, 
        status: TaskStatus.IN_PROGRESS,
        planned_end: new Date(Date.now() - 86400000) // yesterday, delayed!
      }
    ];
    const { rag } = await service.calculateProgress(tasks);
    expect(rag).toBe(RAGStatus.BLACK);
  });
});
