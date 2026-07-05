import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private useLocalFallback = false;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;
    const region = process.env.S3_REGION || 'us-east-1';

    if (endpoint && accessKey && secretKey) {
      try {
        this.s3Client = new S3Client({
          endpoint,
          region,
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          },
          forcePathStyle: true, // required for MinIO
        });
        this.logger.log(`S3/MinIO client initialized pointing to: ${endpoint}`);
      } catch (err: any) {
        this.logger.error(`Failed to initialize S3 client: ${err.message}. Using filesystem fallback.`);
        this.useLocalFallback = true;
      }
    } else {
      this.logger.warn('S3 configurations not fully set. Falling back to local filesystem storage.');
      this.useLocalFallback = true;
    }
  }

  /** True when a real S3/MinIO backend is configured (not the local fallback). */
  isRemote(): boolean {
    return !this.useLocalFallback && !!this.s3Client;
  }

  /** The configured S3 client, or null in local-fallback mode. Used by the
   * presigner (ObjectAccessService) — access authorization is the caller's job. */
  getClient(): S3Client | null {
    return this.s3Client;
  }

  /** Idempotently create a bucket. MinIO returns an error if it already exists,
   * which we swallow. No-op in local-fallback mode. */
  private async ensureBucket(bucket: string): Promise<void> {
    if (!this.s3Client) return;
    try {
      await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
      this.logger.log(`Created MinIO bucket "${bucket}"`);
    } catch (err: any) {
      const code = err?.name || err?.Code;
      if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists') {
        return; // already present — fine
      }
      // Non-fatal: the subsequent PutObject will surface a real problem.
      this.logger.warn(`ensureBucket("${bucket}") skipped: ${err.message}`);
    }
  }

  async uploadFile(bucket: string, fileKey: string, buffer: Buffer, contentType: string): Promise<string> {
    if (this.useLocalFallback || !this.s3Client) {
      return this.uploadLocal(bucket, fileKey, buffer);
    }

    await this.ensureBucket(bucket);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fileKey,
          Body: buffer,
          ContentType: contentType,
        })
      );
      this.logger.log(`Uploaded file to MinIO bucket "${bucket}": ${fileKey}`);
      return fileKey;
    } catch (err: any) {
      this.logger.error(`MinIO upload failed (${bucket}/${fileKey}): ${err.message}. Falling back to filesystem.`);
      return this.uploadLocal(bucket, fileKey, buffer);
    }
  }

  /**
   * Retrieve an object's bytes. Works for both MinIO (GetObject) and the local
   * filesystem fallback. Returns null when the object does not exist so callers
   * can respond 404 without leaking storage-layer errors. Access authorization
   * is the caller's responsibility — this method performs no permission checks.
   */
  async getFile(bucket: string, fileKey: string): Promise<Buffer | null> {
    if (this.useLocalFallback || !this.s3Client) {
      return this.getLocal(bucket, fileKey);
    }

    try {
      const res = await this.s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: fileKey }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err: any) {
      // NoSuchKey / 404 → treat as missing; other errors fall back to local disk
      // (e.g. objects written before MinIO was configured).
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        return null;
      }
      this.logger.error(`MinIO get failed (${bucket}/${fileKey}): ${err.message}. Trying local fallback.`);
      return this.getLocal(bucket, fileKey);
    }
  }

  private getLocal(bucket: string, fileKey: string): Buffer | null {
    const filePath = path.join(__dirname, '../../../../uploads', bucket, fileKey);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      return fs.readFileSync(filePath);
    } catch (err: any) {
      this.logger.error(`Failed to read local file ${filePath}: ${err.message}`);
      return null;
    }
  }

  async deleteFile(bucket: string, fileKey: string): Promise<void> {
    if (this.useLocalFallback || !this.s3Client) {
      this.deleteLocal(bucket, fileKey);
      return;
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: fileKey,
        })
      );
      this.logger.log(`Deleted file from MinIO bucket "${bucket}": ${fileKey}`);
    } catch (err: any) {
      this.logger.error(`MinIO delete failed (${bucket}/${fileKey}): ${err.message}. Trying local fallback.`);
      this.deleteLocal(bucket, fileKey);
    }
  }

  private uploadLocal(bucket: string, fileKey: string, buffer: Buffer): string {
    const uploadDir = path.join(__dirname, '../../../../uploads', bucket);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, fileKey), buffer);
    this.logger.log(`Stored file locally at ${bucket}/${fileKey}`);
    return fileKey;
  }

  private deleteLocal(bucket: string, fileKey: string): void {
    const filePath = path.join(__dirname, '../../../../uploads', bucket, fileKey);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted file locally at ${bucket}/${fileKey}`);
      } catch (err: any) {
        this.logger.error(`Failed to delete local file ${filePath}: ${err.message}`);
      }
    }
  }
}
