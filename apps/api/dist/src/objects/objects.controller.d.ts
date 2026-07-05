import { ObjectsService } from './objects.service';
export declare class ObjectsController {
    private readonly objectsService;
    constructor(objectsService: ObjectsService);
    getSelfie(attendanceId: string, reason: string | undefined, req: any): Promise<{
        url: string;
        expiresAt: string;
    }>;
    getEvidence(taskId: string, key: string, req: any): Promise<{
        url: string;
        expiresAt: string | null;
    }>;
}
