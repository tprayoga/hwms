import { S3Client } from '@aws-sdk/client-s3';
export declare class StorageService {
    private readonly logger;
    private s3Client;
    private useLocalFallback;
    constructor();
    isRemote(): boolean;
    getClient(): S3Client | null;
    private ensureBucket;
    uploadFile(bucket: string, fileKey: string, buffer: Buffer, contentType: string): Promise<string>;
    getFile(bucket: string, fileKey: string): Promise<Buffer | null>;
    private getLocal;
    deleteFile(bucket: string, fileKey: string): Promise<void>;
    private uploadLocal;
    private deleteLocal;
}
