import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ObjectAccessService } from '../storage/object-access.service';
import { StorageService } from '../storage/storage.service';
export declare class ObjectsService {
    private readonly prisma;
    private readonly attendance;
    private readonly objectAccess;
    private readonly storage;
    constructor(prisma: PrismaService, attendance: AttendanceService, objectAccess: ObjectAccessService, storage: StorageService);
    private expiryIso;
    private contentTypeFor;
    getSelfieBytes(viewer: {
        id: string;
        system_roles?: string[];
        tenant_id?: string;
    }, attendanceId: string, reason?: string): Promise<{
        buffer: Buffer;
        contentType: string;
    }>;
    getSelfieUrl(viewer: {
        id: string;
        system_roles?: string[];
        tenant_id?: string;
    }, attendanceId: string, reason?: string): Promise<{
        url: string;
        expiresAt: string;
    }>;
    private resolveEvidence;
    getEvidenceUrl(viewer: {
        id: string;
        tenant_id?: string;
    }, taskId: string, key: string): Promise<{
        url: string;
        expiresAt: string | null;
    }>;
    getEvidenceResource(viewer: {
        id: string;
        tenant_id?: string;
    }, taskId: string, key: string): Promise<{
        kind: 'LINK';
        url: string;
    } | {
        kind: 'FILE';
        buffer: Buffer;
        contentType: string;
    }>;
    private evidenceContentType;
}
