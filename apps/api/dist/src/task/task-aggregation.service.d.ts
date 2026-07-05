import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RAGStatus } from '@prisma/client';
export declare class TaskAggregationService implements OnModuleInit {
    private readonly prisma;
    private readonly redis;
    private debounceTimers;
    constructor(prisma: PrismaService, redis: RedisService);
    onModuleInit(): void;
    calculateProgress(tasks: any[]): Promise<{
        progressPct: number;
        rag: RAGStatus;
    }>;
    getSprintAggregation(sprintId: string): Promise<any>;
    getUserAggregation(userId: string): Promise<any>;
    getRoleAggregation(roleId: string): Promise<any>;
    refreshSprintAggregation(sprintId: string): Promise<{
        sprintId: string;
        updatedAt: string;
        progressPct: number;
        rag: RAGStatus;
    }>;
    refreshUserAggregation(userId: string): Promise<{
        userId: string;
        updatedAt: string;
        progressPct: number;
        rag: RAGStatus;
    }>;
    refreshRoleAggregation(roleId: string): Promise<{
        roleId: string;
        updatedAt: string;
        progressPct: number;
        rag: RAGStatus;
    }>;
    triggerRefresh(sprintId?: string, userId?: string, roleId?: string): void;
    private refreshAllActiveAggregations;
}
