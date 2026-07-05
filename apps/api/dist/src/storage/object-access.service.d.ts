import { StorageService } from './storage.service';
export declare class ObjectAccessService {
    private readonly storage;
    private readonly logger;
    static readonly TTL_PRIVATE = 300;
    static readonly TTL_REPORT: number;
    constructor(storage: StorageService);
    isRemote(): boolean;
    getSignedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string | null>;
}
