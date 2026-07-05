import { Injectable, Logger } from '@nestjs/common';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

/**
 * Single, audited path for object access (§7, §9). Issues short-lived presigned
 * MinIO GET URLs so bytes stream directly from object storage rather than
 * through the API. Authorization is enforced by the callers (Objects/Report
 * controllers) — this service only mints the URL for an already-authorized key.
 */
@Injectable()
export class ObjectAccessService {
  private readonly logger = new Logger(ObjectAccessService.name);

  /** Selfies & evidence: short TTL — the browser fetches once, right away. */
  static readonly TTL_PRIVATE = 300; // 5 minutes
  /** Report exports: 24h signed URL per PRD §7. */
  static readonly TTL_REPORT = 24 * 60 * 60;

  constructor(private readonly storage: StorageService) {}

  /** True when presigned URLs can be issued (a real MinIO backend is configured). */
  isRemote(): boolean {
    return this.storage.isRemote();
  }

  /**
   * Presign a GET for `bucket/key` valid for `ttlSeconds`. Returns null in
   * local-fallback mode (no object storage), so callers can degrade to the
   * legacy streaming path.
   */
  async getSignedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string | null> {
    const client = this.storage.getClient();
    if (!client) return null;
    try {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      return await getSignedUrl(client, cmd, { expiresIn: ttlSeconds });
    } catch (err: any) {
      this.logger.error(`Failed to presign ${bucket}/${key}: ${err.message}`);
      return null;
    }
  }
}
