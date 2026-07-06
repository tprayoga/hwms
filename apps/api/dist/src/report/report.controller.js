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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportController = void 0;
const common_1 = require("@nestjs/common");
const scheduler_service_1 = require("../scheduler/scheduler.service");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_service_1 = require("../storage/storage.service");
const roles_decorator_1 = require("../auth/roles.decorator");
const shared_1 = require("@hwms/shared");
let ReportController = class ReportController {
    schedulerService;
    prisma;
    storage;
    constructor(schedulerService, prisma, storage) {
        this.schedulerService = schedulerService;
        this.prisma = prisma;
        this.storage = storage;
    }
    async exportAttendance(req, body) {
        const { dateFrom, dateTo } = body;
        if (!dateFrom || !dateTo) {
            throw new common_1.BadRequestException('Parameter rentang tanggal tidak lengkap');
        }
        const jobId = await this.schedulerService.triggerExportJob({
            dateFrom,
            dateTo,
            userId: req.user.id,
            tenantId: req.user.tenant_id
        });
        return { message: 'Proses ekspor dimulai secara asinkron.', jobId };
    }
    async downloadReport(key, res) {
        if (key.includes('/') || key.includes('\\') || key.includes('..')) {
            throw new common_1.BadRequestException('Nama berkas tidak valid');
        }
        const owningNotification = await this.prisma.notification.findFirst({
            where: { payload_json: { path: ['fileKey'], equals: key } },
            select: { id: true },
        });
        if (!owningNotification) {
            throw new common_1.NotFoundException('Laporan tidak ditemukan atau bukan milik tenant Anda');
        }
        const buffer = await this.storage.getFile('reports', key);
        if (!buffer) {
            throw new common_1.NotFoundException('Laporan tidak ditemukan atau sudah kedaluwarsa');
        }
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${key}"`,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, no-store',
        });
        res.send(buffer);
    }
};
exports.ReportController = ReportController;
__decorate([
    (0, common_1.Post)('attendance/export'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.HR),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ReportController.prototype, "exportAttendance", null);
__decorate([
    (0, common_1.Get)('download/:key'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.HR),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ReportController.prototype, "downloadReport", null);
exports.ReportController = ReportController = __decorate([
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [scheduler_service_1.SchedulerService,
        prisma_service_1.PrismaService,
        storage_service_1.StorageService])
], ReportController);
//# sourceMappingURL=report.controller.js.map