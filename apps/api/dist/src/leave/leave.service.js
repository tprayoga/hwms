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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaveService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_service_1 = require("../storage/storage.service");
const client_1 = require("@prisma/client");
const tenant_storage_1 = require("../prisma/tenant-storage");
let LeaveService = class LeaveService {
    prisma;
    storageService;
    constructor(prisma, storageService) {
        this.prisma = prisma;
        this.storageService = storageService;
    }
    getTenantId() {
        const tenantId = tenant_storage_1.tenantLocalStorage.getStore()?.tenantId;
        if (!tenantId) {
            throw new common_1.BadRequestException('Context Tenant ID tidak ditemukan');
        }
        return tenantId;
    }
    calculateLeaveDays(dateFrom, dateTo) {
        const diffTime = dateTo.getTime() - dateFrom.getTime();
        if (diffTime < 0)
            return 0;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    async applyLeave(userId, body, file) {
        const tenantId = this.getTenantId();
        const { type, dateFromStr, dateToStr, reason } = body;
        if (!type || !dateFromStr || !dateToStr || !reason) {
            throw new common_1.BadRequestException('Parameter pengajuan cuti tidak lengkap');
        }
        const dateFrom = new Date(dateFromStr);
        const dateTo = new Date(dateToStr);
        if (dateTo < dateFrom) {
            throw new common_1.BadRequestException('Tanggal berakhir tidak boleh mendahului tanggal mulai');
        }
        const days = this.calculateLeaveDays(dateFrom, dateTo);
        if (days <= 0) {
            throw new common_1.BadRequestException('Jumlah hari cuti tidak valid');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { department: true }
        });
        if (!user)
            throw new common_1.NotFoundException('Karyawan tidak ditemukan');
        if (type === client_1.LeaveType.CUTI) {
            if (user.leave_balance < days) {
                throw new common_1.BadRequestException('INSUFFICIENT_LEAVE_BALANCE');
            }
        }
        if (type === client_1.LeaveType.SAKIT && !file) {
            throw new common_1.BadRequestException('ATTACHMENT_REQUIRED_FOR_SICK_LEAVE');
        }
        let attachmentKey = null;
        if (file) {
            const fileExt = file.originalname ? file.originalname.split('.').pop() : 'pdf';
            const key = `leave_${userId}_${Date.now()}.${fileExt}`;
            attachmentKey = await this.storageService.uploadFile('attachments', key, file.buffer, file.mimetype);
        }
        let approverId = user.manager_id;
        if (!approverId) {
            const superAdmin = await this.prisma.user.findFirst({
                where: { system_roles: { has: 'SUPER_ADMIN' } }
            });
            approverId = superAdmin?.id || null;
        }
        if (!approverId) {
            throw new common_1.BadRequestException('Tidak ada atasan atau admin yang ditugaskan untuk menyetujui');
        }
        const leaveRequest = await this.prisma.leaveRequest.create({
            data: {
                tenant_id: tenantId,
                user_id: userId,
                approver_id: approverId,
                type: type,
                date_from: dateFrom,
                date_to: dateTo,
                hours: new client_1.Prisma.Decimal(days * 8),
                attachment_key: attachmentKey,
                reason: reason,
                status: client_1.LeaveStatus.PENDING
            }
        });
        await this.prisma.notification.create({
            data: {
                tenant_id: tenantId,
                user_id: approverId,
                kind: client_1.NotificationKind.APPROVAL_IN,
                payload_json: {
                    title: 'Pengajuan Cuti Baru',
                    message: `Karyawan ${user.full_name} mengajukan ${type} selama ${days} hari (${dateFromStr} s/d ${dateToStr}).`,
                    requestId: leaveRequest.id
                }
            }
        });
        return leaveRequest;
    }
    async getMyLeaveRequests(userId) {
        return this.prisma.leaveRequest.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' }
        });
    }
    async getApprovalsInbox(userId) {
        return this.prisma.leaveRequest.findMany({
            where: {
                approver_id: userId,
                status: client_1.LeaveStatus.PENDING
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
            orderBy: { created_at: 'asc' }
        });
    }
    async decideLeaveRequest(approverId, requestId, body) {
        const tenantId = this.getTenantId();
        const { status, decisionNote } = body;
        if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
            throw new common_1.BadRequestException('Status keputusan tidak valid');
        }
        if (status === 'REJECTED' && (!decisionNote || decisionNote.trim() === '')) {
            throw new common_1.BadRequestException('DECISION_NOTE_REQUIRED_FOR_REJECTION');
        }
        const request = await this.prisma.leaveRequest.findUnique({
            where: { id: requestId },
            include: { requester: true }
        });
        if (!request) {
            throw new common_1.NotFoundException('Pengajuan cuti tidak ditemukan');
        }
        if (request.approver_id !== approverId) {
            throw new common_1.BadRequestException('Anda tidak berwenang untuk memutuskan pengajuan ini');
        }
        if (request.status !== client_1.LeaveStatus.PENDING) {
            throw new common_1.BadRequestException('Pengajuan ini sudah diproses sebelumnya');
        }
        const days = this.calculateLeaveDays(request.date_from, request.date_to);
        return this.prisma.raw.$transaction(async (tx) => {
            if (status === 'APPROVED') {
                if (request.type === client_1.LeaveType.CUTI) {
                    const user = await tx.user.findUnique({ where: { id: request.user_id } });
                    if (!user || user.leave_balance < days) {
                        throw new common_1.BadRequestException('INSUFFICIENT_LEAVE_BALANCE');
                    }
                    await tx.user.update({
                        where: { id: request.user_id },
                        data: { leave_balance: { decrement: days } }
                    });
                }
            }
            const updatedRequest = await tx.leaveRequest.update({
                where: { id: requestId },
                data: {
                    status: status,
                    decided_at: new Date(),
                    decision_note: decisionNote || null
                }
            });
            await tx.notification.create({
                data: {
                    tenant_id: tenantId,
                    user_id: request.user_id,
                    kind: client_1.NotificationKind.APPROVAL_DECIDED,
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
    async cancelLeaveRequest(userId, requestId) {
        const tenantId = this.getTenantId();
        const request = await this.prisma.leaveRequest.findUnique({
            where: { id: requestId }
        });
        if (!request) {
            throw new common_1.NotFoundException('Pengajuan tidak ditemukan');
        }
        if (request.user_id !== userId) {
            throw new common_1.BadRequestException('Anda tidak dapat membatalkan pengajuan milik orang lain');
        }
        if (request.status === client_1.LeaveStatus.CANCELLED) {
            throw new common_1.BadRequestException('Pengajuan sudah dibatalkan sebelumnya');
        }
        const days = this.calculateLeaveDays(request.date_from, request.date_to);
        return this.prisma.raw.$transaction(async (tx) => {
            if (request.status === client_1.LeaveStatus.APPROVED || request.status === client_1.LeaveStatus.AUTO_APPROVED) {
                if (request.type === client_1.LeaveType.CUTI) {
                    await tx.user.update({
                        where: { id: request.user_id },
                        data: { leave_balance: { increment: days } }
                    });
                }
            }
            const updatedRequest = await tx.leaveRequest.update({
                where: { id: requestId },
                data: { status: client_1.LeaveStatus.CANCELLED }
            });
            return updatedRequest;
        });
    }
};
exports.LeaveService = LeaveService;
exports.LeaveService = LeaveService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        storage_service_1.StorageService])
], LeaveService);
//# sourceMappingURL=leave.service.js.map