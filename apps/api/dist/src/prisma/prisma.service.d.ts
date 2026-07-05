import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
export declare class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    readonly client: any;
    constructor();
    get raw(): PrismaClient;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
