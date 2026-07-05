import { SchedulerService } from '../scheduler/scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectAccessService } from '../storage/object-access.service';
export declare class ReportController {
    private readonly schedulerService;
    private readonly prisma;
    private readonly objectAccess;
    constructor(schedulerService: SchedulerService, prisma: PrismaService, objectAccess: ObjectAccessService);
    exportAttendance(req: any, body: any): Promise<{
        message: string;
        jobId: string;
    }>;
    downloadReport(key: string, res: any): Promise<any>;
}
