import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ObjectAccessService } from '../storage/object-access.service';

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
  ) {}

  private expiryIso(ttlSeconds: number): string {
    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
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

  async getEvidenceUrl(
    viewer: { id: string; tenant_id?: string },
    taskId: string,
    key: string,
  ): Promise<{ url: string; expiresAt: string | null }> {
    // Tenant-scoped by the Prisma extension: a task from another tenant is 404.
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deleted_at: null },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task tidak ditemukan');
    }

    // The key must actually belong to this task — prevents presigning arbitrary
    // object keys through the evidence route.
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
}
