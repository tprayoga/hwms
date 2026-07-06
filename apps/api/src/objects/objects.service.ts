import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ObjectAccessService } from '../storage/object-access.service';
import { StorageService } from '../storage/storage.service';

/**
 * Object-access orchestration (§7, §9). Turns an authorization decision into a
 * short-lived presigned MinIO URL. Selfie access delegates the scope/reason/audit
 * rules to AttendanceService; evidence access is role/tenant-scoped and logged
 * without a mandatory reason (not personal data).
 */
@Injectable()
export class ObjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly objectAccess: ObjectAccessService,
    private readonly storage: StorageService,
  ) {}

  private expiryIso(ttlSeconds: number): string {
    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
  }

  private contentTypeFor(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  }

  /**
   * Stream selfie bytes through the authenticated API instead of a presigned
   * MinIO URL. Keeps MinIO fully internal (DEPLOY.md: object storage is not
   * published) and same-origin, so the browser can render it. Authorization,
   * reason-gating and audit are unchanged (delegated to AttendanceService).
   */
  async getSelfieBytes(
    viewer: { id: string; system_roles?: string[]; tenant_id?: string },
    attendanceId: string,
    reason?: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const { selfieKey } = await this.attendance.authorizeSelfieViewById(viewer, attendanceId, reason);
    if (!selfieKey) {
      throw new NotFoundException('Selfie tidak tersedia (mungkin telah dihapus sesuai retensi 90 hari)');
    }
    const buffer = await this.storage.getFile('selfies', selfieKey);
    if (!buffer) {
      throw new NotFoundException('Selfie tidak ditemukan di penyimpanan');
    }
    return { buffer, contentType: this.contentTypeFor(selfieKey) };
  }

  async getSelfieUrl(
    viewer: { id: string; system_roles?: string[]; tenant_id?: string },
    attendanceId: string,
    reason?: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const { selfieKey } = await this.attendance.authorizeSelfieViewById(viewer, attendanceId, reason);
    if (!selfieKey) {
      // selfie_key null → never uploaded, or purged by the 90-day lifecycle job.
      throw new NotFoundException('Selfie tidak tersedia (mungkin telah dihapus sesuai retensi 90 hari)');
    }

    const ttl = ObjectAccessService.TTL_PRIVATE;
    const url = await this.objectAccess.getSignedUrl('selfies', selfieKey, ttl);
    if (!url) {
      throw new ServiceUnavailableException('Penyimpanan objek tidak tersedia untuk menerbitkan URL');
    }
    return { url, expiresAt: this.expiryIso(ttl) };
  }

  // Shared lookup + audit for evidence access. Tenant-scoped by the Prisma
  // extension; the key must actually belong to the task (prevents accessing
  // arbitrary object keys through this route).
  private async resolveEvidence(
    viewer: { id: string; tenant_id?: string },
    taskId: string,
    key: string,
  ): Promise<{ kind: string; url_or_key: string }> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deleted_at: null },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task tidak ditemukan');
    }

    const evidence = await this.prisma.taskEvidence.findFirst({
      where: { task_id: taskId, url_or_key: key },
      select: { id: true, kind: true, url_or_key: true },
    });
    if (!evidence) {
      throw new NotFoundException('Bukti tidak ditemukan untuk task ini');
    }

    // Log the access (no reason required — evidence is not personal data).
    await this.prisma.auditLog.create({
      data: {
        tenant_id: viewer.tenant_id!,
        actor_id: viewer.id,
        entity: 'Task',
        entity_id: taskId,
        action: 'VIEW_EVIDENCE',
        after_json: { evidence_key: key, kind: evidence.kind },
      },
    });

    return { kind: evidence.kind, url_or_key: evidence.url_or_key };
  }

  async getEvidenceUrl(
    viewer: { id: string; tenant_id?: string },
    taskId: string,
    key: string,
  ): Promise<{ url: string; expiresAt: string | null }> {
    const evidence = await this.resolveEvidence(viewer, taskId, key);

    // LINK evidence is an external URL — return it directly, nothing to presign.
    if (evidence.kind === 'LINK') {
      return { url: evidence.url_or_key, expiresAt: null };
    }

    const ttl = ObjectAccessService.TTL_PRIVATE;
    const url = await this.objectAccess.getSignedUrl('evidences', key, ttl);
    if (!url) {
      throw new ServiceUnavailableException('Penyimpanan objek tidak tersedia untuk menerbitkan URL');
    }
    return { url, expiresAt: this.expiryIso(ttl) };
  }

  /**
   * Evidence for direct consumption: LINK → the external URL; FILE → the bytes
   * streamed through the API (same-origin), keeping MinIO internal like selfies.
   */
  async getEvidenceResource(
    viewer: { id: string; tenant_id?: string },
    taskId: string,
    key: string,
  ): Promise<{ kind: 'LINK'; url: string } | { kind: 'FILE'; buffer: Buffer; contentType: string }> {
    const evidence = await this.resolveEvidence(viewer, taskId, key);
    if (evidence.kind === 'LINK') {
      return { kind: 'LINK', url: evidence.url_or_key };
    }
    const buffer = await this.storage.getFile('evidences', key);
    if (!buffer) {
      throw new NotFoundException('Berkas bukti tidak ditemukan di penyimpanan');
    }
    return { kind: 'FILE', buffer, contentType: this.evidenceContentType(key) };
  }

  private evidenceContentType(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    return 'application/octet-stream';
  }
}
