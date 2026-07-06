import { Response } from 'express';
import { ObjectsService } from './objects.service';
export declare class ObjectsController {
    private readonly objectsService;
    constructor(objectsService: ObjectsService);
    getSelfie(attendanceId: string, reason: string | undefined, req: any, res: Response): Promise<void>;
    getEvidence(taskId: string, key: string, req: any, res: Response): Promise<void>;
}
