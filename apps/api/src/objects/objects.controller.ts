import { Controller, Get, Param, Query, Req, BadRequestException } from '@nestjs/common';
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
  ) {
    return this.objectsService.getSelfieUrl(req.user, attendanceId, reason);
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
  ) {
    if (!key) {
      throw new BadRequestException('Kunci bukti tidak valid');
    }
    return this.objectsService.getEvidenceUrl(req.user, taskId, key);
  }
}
