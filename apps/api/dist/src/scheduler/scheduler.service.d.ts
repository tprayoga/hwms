import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { StorageService } from '../storage/storage.service';
export declare class SchedulerService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly pushService;
    private readonly storageService;
    private readonly logger;
    private redisConnection;
    private attendanceQueue;
    private attendanceWorker;
    constructor(prisma: PrismaService, pushService: PushService, storageService: StorageService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    triggerExportJob(data: any): Promise<string>;
    private processReminders;
    private processSelfieCleanup;
    private processExportAttendance;
}
