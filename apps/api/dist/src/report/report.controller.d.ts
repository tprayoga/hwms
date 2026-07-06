import { SchedulerService } from '../scheduler/scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
export declare class ReportController {
    private readonly schedulerService;
    private readonly prisma;
    private readonly storage;
    constructor(schedulerService: SchedulerService, prisma: PrismaService, storage: StorageService);
    exportAttendance(req: any, body: any): Promise<{
        message: string;
        jobId: string;
    }>;
    downloadReport(key: string, res: any): Promise<void>;
}
