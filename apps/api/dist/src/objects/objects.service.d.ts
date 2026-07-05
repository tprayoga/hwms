import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ObjectAccessService } from '../storage/object-access.service';
export declare class ObjectsService {
    private readonly prisma;
    private readonly attendance;
    private readonly objectAccess;
    constructor(prisma: PrismaService, attendance: AttendanceService, objectAccess: ObjectAccessService);
    private expiryIso;
    getSelfieUrl(viewer: {
        id: string;
        system_roles?: string[];
        tenant_id?: string;
    }, attendanceId: string, reason?: string): Promise<{
        url: string;
        expiresAt: string;
    }>;
    getEvidenceUrl(viewer: {
        id: string;
        tenant_id?: string;
    }, taskId: string, key: string): Promise<{
        url: string;
        expiresAt: string | null;
    }>;
}
