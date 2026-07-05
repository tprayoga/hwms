import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RAGStatus } from '@prisma/client';

@Injectable()
export class TaskAggregationService implements OnModuleInit {
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    // Background Cron: refresh active sprint aggregations every 5 minutes
    setInterval(async () => {
      try {
        await this.refreshAllActiveAggregations();
      } catch (err) {
        console.error('Failed to run aggregation cron refresh:', err);
      }
    }, 5 * 60 * 1000);
  }

  // ==========================================
  // CORE FORMULA & STATUS
  // ==========================================
  async calculateProgress(tasks: any[]): Promise<{ progressPct: number; rag: RAGStatus }> {
    if (tasks.length === 0) {
      return { progressPct: 0, rag: RAGStatus.GREEN };
    }

    let sumWeight = 0;
    let sumWeightedProgress = 0;
    let hasOpenBlocker = false;
    let hasDelayedTask = false;

    const now = new Date();

    for (const task of tasks) {
      const weight = Number(task.weight ?? 1.0);
      const pct = Number(task.percent_complete ?? 0);

      sumWeight += weight;
      sumWeightedProgress += (pct * weight);

      // Check blockers
      if (task.blockers && task.blockers.some((b: any) => b.status === 'OPEN')) {
        hasOpenBlocker = true;
      }

      // Check delay (past planned end and not done)
      if (task.status !== 'DONE' && new Date(task.planned_end) < now) {
        hasDelayedTask = true;
      }
    }

    const progressPct = sumWeight > 0 ? (sumWeightedProgress / sumWeight) : 0;

    let rag: RAGStatus = RAGStatus.GREEN;
    if (progressPct >= 85) {
      rag = RAGStatus.GREEN;
    } else if (progressPct >= 60) {
      rag = RAGStatus.YELLOW;
    } else {
      if (hasOpenBlocker || hasDelayedTask) {
        rag = RAGStatus.BLACK;
      } else {
        rag = RAGStatus.RED;
      }
    }

    return { progressPct: Math.round(progressPct * 100) / 100, rag };
  }

  // ==========================================
  // CACHED RETRIEVALS
  // ==========================================
  async getSprintAggregation(sprintId: string) {
    const key = `aggregation:sprint:${sprintId}`;
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return this.refreshSprintAggregation(sprintId);
  }

  async getUserAggregation(userId: string) {
    const key = `aggregation:user:${userId}`;
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return this.refreshUserAggregation(userId);
  }

  async getRoleAggregation(roleId: string) {
    const key = `aggregation:role:${roleId}`;
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return this.refreshRoleAggregation(roleId);
  }

  // ==========================================
  // REFRESH METHODS (WRITE TO REDIS)
  // ==========================================
  async refreshSprintAggregation(sprintId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { sprint_id: sprintId },
      include: { blockers: true }
    });
    const result = await this.calculateProgress(tasks);
    const data = { ...result, sprintId, updatedAt: new Date().toISOString() };
    await this.redis.set(`aggregation:sprint:${sprintId}`, JSON.stringify(data), 3600); // Cache 1h
    return data;
  }

  async refreshUserAggregation(userId: string) {
    // Find tasks where user is currently assigned
    const assignments = await this.prisma.taskAssignment.findMany({
      where: { user_id: userId, unassigned_at: null },
      include: { task: { include: { blockers: true } } }
    });
    const tasks = assignments.map(a => a.task);
    const result = await this.calculateProgress(tasks);
    const data = { ...result, userId, updatedAt: new Date().toISOString() };
    await this.redis.set(`aggregation:user:${userId}`, JSON.stringify(data), 3600);
    return data;
  }

  async refreshRoleAggregation(roleId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { functional_role_id: roleId },
      include: { blockers: true }
    });
    const result = await this.calculateProgress(tasks);
    const data = { ...result, roleId, updatedAt: new Date().toISOString() };
    await this.redis.set(`aggregation:role:${roleId}`, JSON.stringify(data), 3600);
    return data;
  }

  // ==========================================
  // DEBOUNCED QUEUE TRIGGER
  // ==========================================
  triggerRefresh(sprintId?: string, userId?: string, roleId?: string) {
    const key = `refresh:${sprintId || ''}:${userId || ''}:${roleId || ''}`;
    
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key)!);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(key);
      try {
        if (sprintId) await this.refreshSprintAggregation(sprintId);
        if (userId) await this.refreshUserAggregation(userId);
        if (roleId) await this.refreshRoleAggregation(roleId);
      } catch (err) {
        console.error('Error refreshing debounced aggregation:', err);
      }
    }, 60000); // 60s debounce

    this.debounceTimers.set(key, timer);
  }

  // Helper to refresh all active entities (e.g. current sprints)
  private async refreshAllActiveAggregations() {
    const now = new Date();
    // Fetch active sprints
    const activeSprints = await this.prisma.sprint.findMany({
      where: {
        start_date: { lte: now },
        end_date: { gte: now }
      }
    });

    for (const sprint of activeSprints) {
      await this.refreshSprintAggregation(sprint.id);
    }
  }
}
