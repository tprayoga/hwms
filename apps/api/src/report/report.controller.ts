import { Controller, Post, Get, Body, Req, Param, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import { SchedulerService } from '../scheduler/scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectAccessService } from '../storage/object-access.service';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@hwms/shared';
import * as fs from 'fs';
import * as path from 'path';

@Controller('reports')
export class ReportController {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly prisma: PrismaService,
    private readonly objectAccess: ObjectAccessService,
  ) {}

  @Post('attendance/export')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.HR)
  async exportAttendance(@Req() req: any, @Body() body: any) {
    const { dateFrom, dateTo } = body;
    if (!dateFrom || !dateTo) {
      throw new BadRequestException('Parameter rentang tanggal tidak lengkap');
    }
    const jobId = await this.schedulerService.triggerExportJob({
      dateFrom,
      dateTo,
      userId: req.user.id,
      tenantId: req.user.tenant_id
    });
    return { message: 'Proses ekspor dimulai secara asinkron.', jobId };
  }

  // Authenticated report download (§7, GAP §4.1.1). No longer @Public. Scoped to
  // HR/SUPER_ADMIN, and the fileKey must belong to a report notification in the
  // requester's tenant — prevents guessing another tenant's export by jobId.
  //
  // Phase 8.1: when object storage is available, 302-redirect to a presigned 24h
  // URL (§7) so bytes stream from MinIO, not the API. The endpoint is preserved
  // (same path/contract) so existing clients keep working; the local FS copy is
  // a streaming fallback when object storage is not configured.
  @Get('download/:key')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.HR)
  async downloadReport(@Param('key') key: string, @Res() res: any) {
    // Reject path traversal in the key before anything touches storage.
    if (key.includes('/') || key.includes('\\') || key.includes('..')) {
      throw new BadRequestException('Nama berkas tidak valid');
    }

    // Tenant-scoped by the Prisma extension: only matches a notification in the
    // caller's tenant that carries this fileKey.
    const owningNotification = await this.prisma.notification.findFirst({
      where: { payload_json: { path: ['fileKey'], equals: key } },
      select: { id: true },
    });
    if (!owningNotification) {
      throw new NotFoundException('Laporan tidak ditemukan atau bukan milik tenant Anda');
    }

    // Preferred path: presigned 24h URL from object storage.
    const signedUrl = await this.objectAccess.getSignedUrl('reports', key, ObjectAccessService.TTL_REPORT);
    if (signedUrl) {
      return res.redirect(302, signedUrl);
    }

    // Fallback: stream the local FS copy (object storage not configured).
    const filePath = path.join(__dirname, '../../../../uploads/reports', key);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Laporan tidak ditemukan atau sudah kedaluwarsa');
    }

    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtime.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {}
      throw new BadRequestException('URL download sudah kedaluwarsa (lebih dari 24 jam)');
    }

    res.download(filePath);
  }
}
