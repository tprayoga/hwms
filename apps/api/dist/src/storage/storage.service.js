"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const client_s3_1 = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
let StorageService = StorageService_1 = class StorageService {
    logger = new common_1.Logger(StorageService_1.name);
    s3Client = null;
    useLocalFallback = false;
    constructor() {
        const endpoint = process.env.S3_ENDPOINT;
        const accessKey = process.env.S3_ACCESS_KEY;
        const secretKey = process.env.S3_SECRET_KEY;
        const region = process.env.S3_REGION || 'us-east-1';
        if (endpoint && accessKey && secretKey) {
            try {
                this.s3Client = new client_s3_1.S3Client({
                    endpoint,
                    region,
                    credentials: {
                        accessKeyId: accessKey,
                        secretAccessKey: secretKey,
                    },
                    forcePathStyle: true,
                });
                this.logger.log(`S3/MinIO client initialized pointing to: ${endpoint}`);
            }
            catch (err) {
                this.logger.error(`Failed to initialize S3 client: ${err.message}. Using filesystem fallback.`);
                this.useLocalFallback = true;
            }
        }
        else {
            this.logger.warn('S3 configurations not fully set. Falling back to local filesystem storage.');
            this.useLocalFallback = true;
        }
    }
    isRemote() {
        return !this.useLocalFallback && !!this.s3Client;
    }
    getClient() {
        return this.s3Client;
    }
    async ensureBucket(bucket) {
        if (!this.s3Client)
            return;
        try {
            await this.s3Client.send(new client_s3_1.CreateBucketCommand({ Bucket: bucket }));
            this.logger.log(`Created MinIO bucket "${bucket}"`);
        }
        catch (err) {
            const code = err?.name || err?.Code;
            if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists') {
                return;
            }
            this.logger.warn(`ensureBucket("${bucket}") skipped: ${err.message}`);
        }
    }
    async uploadFile(bucket, fileKey, buffer, contentType) {
        if (this.useLocalFallback || !this.s3Client) {
            return this.uploadLocal(bucket, fileKey, buffer);
        }
        await this.ensureBucket(bucket);
        try {
            await this.s3Client.send(new client_s3_1.PutObjectCommand({
                Bucket: bucket,
                Key: fileKey,
                Body: buffer,
                ContentType: contentType,
            }));
            this.logger.log(`Uploaded file to MinIO bucket "${bucket}": ${fileKey}`);
            return fileKey;
        }
        catch (err) {
            this.logger.error(`MinIO upload failed (${bucket}/${fileKey}): ${err.message}. Falling back to filesystem.`);
            return this.uploadLocal(bucket, fileKey, buffer);
        }
    }
    async getFile(bucket, fileKey) {
        if (this.useLocalFallback || !this.s3Client) {
            return this.getLocal(bucket, fileKey);
        }
        try {
            const res = await this.s3Client.send(new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: fileKey }));
            const bytes = await res.Body?.transformToByteArray();
            return bytes ? Buffer.from(bytes) : null;
        }
        catch (err) {
            if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
                return null;
            }
            this.logger.error(`MinIO get failed (${bucket}/${fileKey}): ${err.message}. Trying local fallback.`);
            return this.getLocal(bucket, fileKey);
        }
    }
    getLocal(bucket, fileKey) {
        const filePath = path.join(__dirname, '../../../../uploads', bucket, fileKey);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        try {
            return fs.readFileSync(filePath);
        }
        catch (err) {
            this.logger.error(`Failed to read local file ${filePath}: ${err.message}`);
            return null;
        }
    }
    async deleteFile(bucket, fileKey) {
        if (this.useLocalFallback || !this.s3Client) {
            this.deleteLocal(bucket, fileKey);
            return;
        }
        try {
            await this.s3Client.send(new client_s3_1.DeleteObjectCommand({
                Bucket: bucket,
                Key: fileKey,
            }));
            this.logger.log(`Deleted file from MinIO bucket "${bucket}": ${fileKey}`);
        }
        catch (err) {
            this.logger.error(`MinIO delete failed (${bucket}/${fileKey}): ${err.message}. Trying local fallback.`);
            this.deleteLocal(bucket, fileKey);
        }
    }
    uploadLocal(bucket, fileKey, buffer) {
        const uploadDir = path.join(__dirname, '../../../../uploads', bucket);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(path.join(uploadDir, fileKey), buffer);
        this.logger.log(`Stored file locally at ${bucket}/${fileKey}`);
        return fileKey;
    }
    deleteLocal(bucket, fileKey) {
        const filePath = path.join(__dirname, '../../../../uploads', bucket, fileKey);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                this.logger.log(`Deleted file locally at ${bucket}/${fileKey}`);
            }
            catch (err) {
                this.logger.error(`Failed to delete local file ${filePath}: ${err.message}`);
            }
        }
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = StorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], StorageService);
//# sourceMappingURL=storage.service.js.map