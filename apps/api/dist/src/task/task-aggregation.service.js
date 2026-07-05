"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskAggregationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const client_1 = require("@prisma/client");
let TaskAggregationService = class TaskAggregationService {
    prisma;
    redis;
    debounceTimers = new Map();
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    onModuleInit() {
        setInterval(async () => {
            try {
                await this.refreshAllActiveAggregations();
            }
            catch (err) {
                console.error('Failed to run aggregation cron refresh:', err);
            }
        }, 5 * 60 * 1000);
    }
    async calculateProgress(tasks) {
        if (tasks.length === 0) {
            return { progressPct: 0, rag: client_1.RAGStatus.GREEN };
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
            if (task.blockers && task.blockers.some((b) => b.status === 'OPEN')) {
                hasOpenBlocker = true;
            }
            if (task.status !== 'DONE' && new Date(task.planned_end) < now) {
                hasDelayedTask = true;
            }
        }
        const progressPct = sumWeight > 0 ? (sumWeightedProgress / sumWeight) : 0;
        let rag = client_1.RAGStatus.GREEN;
        if (progressPct >= 85) {
            rag = client_1.RAGStatus.GREEN;
        }
        else if (progressPct >= 60) {
            rag = client_1.RAGStatus.YELLOW;
        }
        else {
            if (hasOpenBlocker || hasDelayedTask) {
                rag = client_1.RAGStatus.BLACK;
            }
            else {
                rag = client_1.RAGStatus.RED;
            }
        }
        return { progressPct: Math.round(progressPct * 100) / 100, rag };
    }
    async getSprintAggregation(sprintId) {
        const key = `aggregation:sprint:${sprintId}`;
        const cached = await this.redis.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        return this.refreshSprintAggregation(sprintId);
    }
    async getUserAggregation(userId) {
        const key = `aggregation:user:${userId}`;
        const cached = await this.redis.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        return this.refreshUserAggregation(userId);
    }
    async getRoleAggregation(roleId) {
        const key = `aggregation:role:${roleId}`;
        const cached = await this.redis.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        return this.refreshRoleAggregation(roleId);
    }
    async refreshSprintAggregation(sprintId) {
        const tasks = await this.prisma.task.findMany({
            where: { sprint_id: sprintId },
            include: { blockers: true }
        });
        const result = await this.calculateProgress(tasks);
        const data = { ...result, sprintId, updatedAt: new Date().toISOString() };
        await this.redis.set(`aggregation:sprint:${sprintId}`, JSON.stringify(data), 3600);
        return data;
    }
    async refreshUserAggregation(userId) {
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
    async refreshRoleAggregation(roleId) {
        const tasks = await this.prisma.task.findMany({
            where: { functional_role_id: roleId },
            include: { blockers: true }
        });
        const result = await this.calculateProgress(tasks);
        const data = { ...result, roleId, updatedAt: new Date().toISOString() };
        await this.redis.set(`aggregation:role:${roleId}`, JSON.stringify(data), 3600);
        return data;
    }
    triggerRefresh(sprintId, userId, roleId) {
        const key = `refresh:${sprintId || ''}:${userId || ''}:${roleId || ''}`;
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }
        const timer = setTimeout(async () => {
            this.debounceTimers.delete(key);
            try {
                if (sprintId)
                    await this.refreshSprintAggregation(sprintId);
                if (userId)
                    await this.refreshUserAggregation(userId);
                if (roleId)
                    await this.refreshRoleAggregation(roleId);
            }
            catch (err) {
                console.error('Error refreshing debounced aggregation:', err);
            }
        }, 60000);
        this.debounceTimers.set(key, timer);
    }
    async refreshAllActiveAggregations() {
        const now = new Date();
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
};
exports.TaskAggregationService = TaskAggregationService;
exports.TaskAggregationService = TaskAggregationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], TaskAggregationService);
//# sourceMappingURL=task-aggregation.service.js.map