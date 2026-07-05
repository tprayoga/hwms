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
exports.LeaveController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const leave_service_1 = require("./leave.service");
const public_decorator_1 = require("../auth/public.decorator");
const fs = require("fs");
const path = require("path");
let LeaveController = class LeaveController {
    leaveService;
    constructor(leaveService) {
        this.leaveService = leaveService;
    }
    validateAttachmentUpload(file) {
        if (!file)
            return;
        const MAX_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            throw new common_1.HttpException({
                error: {
                    code: 'FILE_TOO_LARGE',
                    message: 'Ukuran dokumen cuti melebihi batas maksimal 5MB',
                }
            }, common_1.HttpStatus.PAYLOAD_TOO_LARGE);
        }
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new common_1.HttpException({
                error: {
                    code: 'FILE_TYPE_INVALID',
                    message: 'Format berkas tidak valid. Hanya menerima format JPEG, PNG, WebP, dan PDF.',
                }
            }, common_1.HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
    }
    async applyLeave(req, file, body) {
        const userId = req.user.id;
        this.validateAttachmentUpload(file);
        return this.leaveService.applyLeave(userId, body, file);
    }
    async getMyLeaveRequests(req) {
        const userId = req.user.id;
        return this.leaveService.getMyLeaveRequests(userId);
    }
    async getApprovalsInbox(req) {
        const userId = req.user.id;
        return this.leaveService.getApprovalsInbox(userId);
    }
    async decideLeaveRequest(requestId, req, body) {
        const userId = req.user.id;
        return this.leaveService.decideLeaveRequest(userId, requestId, body);
    }
    async cancelLeaveRequest(requestId, req) {
        const userId = req.user.id;
        return this.leaveService.cancelLeaveRequest(userId, requestId);
    }
    getAttachment(key, res) {
        const filePath = path.join(__dirname, '../../../../uploads/attachments', key);
        if (!fs.existsSync(filePath)) {
            res.status(404).send('File tidak ditemukan');
            return;
        }
        res.sendFile(filePath);
    }
};
exports.LeaveController = LeaveController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], LeaveController.prototype, "applyLeave", null);
__decorate([
    (0, common_1.Get)('my'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LeaveController.prototype, "getMyLeaveRequests", null);
__decorate([
    (0, common_1.Get)('approvals/inbox'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LeaveController.prototype, "getApprovalsInbox", null);
__decorate([
    (0, common_1.Post)('approvals/:id/decide'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], LeaveController.prototype, "decideLeaveRequest", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LeaveController.prototype, "cancelLeaveRequest", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('attachments/:key'),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LeaveController.prototype, "getAttachment", null);
exports.LeaveController = LeaveController = __decorate([
    (0, common_1.Controller)('leaves'),
    __metadata("design:paramtypes", [leave_service_1.LeaveService])
], LeaveController);
//# sourceMappingURL=leave.controller.js.map