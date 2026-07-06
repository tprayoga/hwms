import { Controller, Get, Param, Query, Req, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { ObjectsService } from './objects.service';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@hwms/shared';

/**
 * Secure object access (§7, §9). Issues short-lived presigned MinIO URLs instead
 * of streaming bytes through the API. Selfie access is scope-checked and, for
 * other people's selfies, requires a reason that is recorded to audit_logs.
 */
@Controller('objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  // Owner → presigned URL directly. MANAGER/HR/SUPER_ADMIN viewing someone
  // else's selfie MUST pass `reason` (min 10 chars); each access is audited.
  // Cross-tenant → 403. All roles allowed (owner path needs no elevated role).
  @Get('selfie/:attendanceId')
  async getSelfie(
    @Param('attendanceId') attendanceId: string,
    @Query('reason') reason: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    // Stream the image bytes (authenticated, same-origin) rather than a presigned
    // MinIO URL, which would point at the internal `minio:9000` host the browser
    // cannot reach. Authorization + audit happen inside the service.
    const { buffer, contentType } = await this.objectsService.getSelfieBytes(req.user, attendanceId, reason);
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  // Evidence is not personal data: role-scoped presigned URL, logged but no
  // mandatory reason. Restricted to roles that manage/track work.
  @Get('evidence/:taskId/:key')
  @Roles(
    SystemRole.EMPLOYEE,
    SystemRole.MANAGER,
    SystemRole.PM_ADMIN,
    SystemRole.CTO,
    SystemRole.HR,
    SystemRole.SUPER_ADMIN,
  )
  async getEvidence(
    @Param('taskId') taskId: string,
    @Param('key') key: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    if (!key) {
      throw new BadRequestException('Kunci bukti tidak valid');
    }
    const r = await this.objectsService.getEvidenceResource(req.user, taskId, key);
    // LINK evidence is an external URL → redirect the browser to it. FILE
    // evidence streams its bytes through the API (MinIO stays internal).
    if (r.kind === 'LINK') {
      res.redirect(302, r.url);
      return;
    }
    res.set({
      'Content-Type': r.contentType,
      'Cache-Control': 'private, max-age=300',
      'Content-Length': String(r.buffer.length),
    });
    res.send(r.buffer);
  }
}
