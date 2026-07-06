import { Controller, Post, Get, Body, Req, Param, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import { SchedulerService } from '../scheduler/scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@hwms/shared';

@Controller('reports')
export class ReportController {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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
  // Stream the report bytes through the authenticated API (same-origin) rather
  // than 302-redirecting to a presigned MinIO URL, which points at the internal
  // `minio:9000` host the browser cannot reach. StorageService abstracts MinIO
  // vs the local-FS fallback, so this works in both modes.
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

    const buffer = await this.storage.getFile('reports', key);
    if (!buffer) {
      throw new NotFoundException('Laporan tidak ditemukan atau sudah kedaluwarsa');
    }

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${key}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  }
}
