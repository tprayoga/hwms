import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LeaveType, LeaveStatus, NotificationKind, Prisma } from '@prisma/client';
import { tenantLocalStorage } from '../prisma/tenant-storage';

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  private getTenantId(): string {
    const tenantId = tenantLocalStorage.getStore()?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Context Tenant ID tidak ditemukan');
    }
    return tenantId;
  }

  // Calculate day difference inclusive
  private calculateLeaveDays(dateFrom: Date, dateTo: Date): number {
    const diffTime = dateTo.getTime() - dateFrom.getTime();
    if (diffTime < 0) return 0;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  async applyLeave(userId: string, body: any, file?: Express.Multer.File) {
    const tenantId = this.getTenantId();

    const { type, dateFromStr, dateToStr, reason } = body;
    if (!type || !dateFromStr || !dateToStr || !reason) {
      throw new BadRequestException('Parameter pengajuan cuti tidak lengkap');
    }

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);

    if (dateTo < dateFrom) {
      throw new BadRequestException('Tanggal berakhir tidak boleh mendahului tanggal mulai');
    }

    const days = this.calculateLeaveDays(dateFrom, dateTo);
    if (days <= 0) {
      throw new BadRequestException('Jumlah hari cuti tidak valid');
    }

    // 1. Fetch user profile
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true }
    });
    if (!user) throw new NotFoundException('Karyawan tidak ditemukan');

    // 2. Validate leave balance for CUTI type
    if (type === LeaveType.CUTI) {
      if (user.leave_balance < days) {
        throw new BadRequestException('INSUFFICIENT_LEAVE_BALANCE');
      }
    }

    // 3. Attachment check for SAKIT type
    if (type === LeaveType.SAKIT && !file) {
      throw new BadRequestException('ATTACHMENT_REQUIRED_FOR_SICK_LEAVE');
    }

    // 4. Upload file if present
    let attachmentKey: string | null = null;
    if (file) {
      const fileExt = file.originalname ? file.originalname.split('.').pop() : 'pdf';
      const key = `leave_${userId}_${Date.now()}.${fileExt}`;
      attachmentKey = await this.storageService.uploadFile('attachments', key, file.buffer, file.mimetype);
    }

    // 5. Resolve approver manager
    let approverId = user.manager_id;
    if (!approverId) {
      const superAdmin = await this.prisma.user.findFirst({
        where: { system_roles: { has: 'SUPER_ADMIN' } }
      });
      approverId = superAdmin?.id || null;
    }

    if (!approverId) {
      throw new BadRequestException('Tidak ada atasan atau admin yang ditugaskan untuk menyetujui');
    }

    // 6. Create LeaveRequest in PENDING state
    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        approver_id: approverId,
        type: type as LeaveType,
        date_from: dateFrom,
        date_to: dateTo,
        hours: new Prisma.Decimal(days * 8), // Standard 8 hours per working day
        attachment_key: attachmentKey,
        reason: reason,
        status: LeaveStatus.PENDING
      }
    });

    // 7. Create notification for approver
    await this.prisma.notification.create({
      data: {
        tenant_id: tenantId,
        user_id: approverId,
        kind: NotificationKind.APPROVAL_IN,
        payload_json: {
          title: 'Pengajuan Cuti Baru',
          message: `Karyawan ${user.full_name} mengajukan ${type} selama ${days} hari (${dateFromStr} s/d ${dateToStr}).`,
          requestId: leaveRequest.id
        }
      }
    });

    return leaveRequest;
  }

  async getMyLeaveRequests(userId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
  }

  async getApprovalsInbox(userId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { 
        approver_id: userId,
        status: LeaveStatus.PENDING
      },
      include: {
        requester: {
          select: {
            id: true,
            full_name: true,
            email: true,
            leave_balance: true
          }
        }
      },
      orderBy: { created_at: 'asc' } // oldest first
    });
  }

  async decideLeaveRequest(approverId: string, requestId: string, body: any) {
    const tenantId = this.getTenantId();
    const { status, decisionNote } = body;

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('Status keputusan tidak valid');
    }

    if (status === 'REJECTED' && (!decisionNote || decisionNote.trim() === '')) {
      throw new BadRequestException('DECISION_NOTE_REQUIRED_FOR_REJECTION');
    }

    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { requester: true }
    });

    if (!request) {
      throw new NotFoundException('Pengajuan cuti tidak ditemukan');
    }

    if (request.approver_id !== approverId) {
      throw new BadRequestException('Anda tidak berwenang untuk memutuskan pengajuan ini');
    }

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Pengajuan ini sudah diproses sebelumnya');
    }

    const days = this.calculateLeaveDays(request.date_from, request.date_to);

    return this.prisma.raw.$transaction(async (tx) => {
      if (status === 'APPROVED') {
        if (request.type === LeaveType.CUTI) {
          // Re-verify balance inside transaction
          const user = await tx.user.findUnique({ where: { id: request.user_id } });
          if (!user || user.leave_balance < days) {
            throw new BadRequestException('INSUFFICIENT_LEAVE_BALANCE');
          }
          // Deduct balance
          await tx.user.update({
            where: { id: request.user_id },
            data: { leave_balance: { decrement: days } }
          });
        }
      }

      // Update LeaveRequest
      const updatedRequest = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: status as LeaveStatus,
          decided_at: new Date(),
          decision_note: decisionNote || null
        }
      });

      // Notify requester
      await tx.notification.create({
        data: {
          tenant_id: tenantId,
          user_id: request.user_id,
          kind: NotificationKind.APPROVAL_DECIDED,
          payload_json: {
            title: 'Keputusan Pengajuan Cuti',
            message: `Pengajuan ${request.type} Anda (${request.date_from.toISOString().split('T')[0]} s/d ${request.date_to.toISOString().split('T')[0]}) telah ${status} oleh atasan.`,
            status: status,
            note: decisionNote || ''
          }
        }
      });

      return updatedRequest;
    });
  }

  async cancelLeaveRequest(userId: string, requestId: string) {
    const tenantId = this.getTenantId();

    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      throw new NotFoundException('Pengajuan tidak ditemukan');
    }

    if (request.user_id !== userId) {
      throw new BadRequestException('Anda tidak dapat membatalkan pengajuan milik orang lain');
    }

    if (request.status === LeaveStatus.CANCELLED) {
      throw new BadRequestException('Pengajuan sudah dibatalkan sebelumnya');
    }

    const days = this.calculateLeaveDays(request.date_from, request.date_to);

    return this.prisma.raw.$transaction(async (tx) => {
      // Refund balance if it was already APPROVED
      if (request.status === LeaveStatus.APPROVED || request.status === LeaveStatus.AUTO_APPROVED) {
        if (request.type === LeaveType.CUTI) {
          await tx.user.update({
            where: { id: request.user_id },
            data: { leave_balance: { increment: days } }
          });
        }
      }

      const updatedRequest = await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: LeaveStatus.CANCELLED }
      });

      return updatedRequest;
    });
  }
}
