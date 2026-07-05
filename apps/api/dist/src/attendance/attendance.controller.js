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
exports.AttendanceController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const attendance_service_1 = require("./attendance.service");
const redis_service_1 = require("../redis/redis.service");
const storage_service_1 = require("../storage/storage.service");
let AttendanceController = class AttendanceController {
    attendanceService;
    redis;
    storageService;
    constructor(attendanceService, redis, storageService) {
        this.attendanceService = attendanceService;
        this.redis = redis;
        this.storageService = storageService;
    }
    validateSelfieUpload(file) {
        if (!file)
            return;
        const MAX_SIZE = 2 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            throw new common_1.HttpException({
                error: {
                    code: 'FILE_TOO_LARGE',
                    message: 'Ukuran foto selfie melebihi batas maksimal 2MB',
                }
            }, common_1.HttpStatus.PAYLOAD_TOO_LARGE);
        }
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new common_1.HttpException({
                error: {
                    code: 'FILE_TYPE_INVALID',
                    message: 'Format berkas tidak valid. Hanya menerima format JPEG, PNG, dan WebP.',
                }
            }, common_1.HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
    }
    async getToday(req) {
        const userId = req.user.id;
        return this.attendanceService.getTodayStatus(userId);
    }
    async checkin(req, file, body, force) {
        const userId = req.user.id;
        const idempotencyKey = req.headers['idempotency-key'];
        if (idempotencyKey) {
            const cached = await this.redis.get(`idempotency:${idempotencyKey}`);
            if (cached) {
                return JSON.parse(cached);
            }
        }
        if (!file) {
            throw new common_1.BadRequestException('Foto selfie wajib diunggah');
        }
        this.validateSelfieUpload(file);
        const fileKey = `in_${userId}_${Date.now()}_${file.originalname || 'selfie.jpg'}`;
        await this.storageService.uploadFile('selfies', fileKey, file.buffer, file.mimetype);
        const isForce = force === 'true' || body.force === 'true';
        const result = await this.attendanceService.checkin(userId, fileKey, body, isForce);
        if (idempotencyKey) {
            await this.redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(result), 86400);
        }
        return result;
    }
    async checkout(checkinId, req, file, body) {
        const userId = req.user.id;
        const idempotencyKey = req.headers['idempotency-key'];
        if (idempotencyKey) {
            const cached = await this.redis.get(`idempotency:${idempotencyKey}`);
            if (cached) {
                return JSON.parse(cached);
            }
        }
        if (!file) {
            throw new common_1.BadRequestException('Foto selfie checkout wajib diunggah');
        }
        this.validateSelfieUpload(file);
        const fileKey = `out_${userId}_${Date.now()}_${file.originalname || 'selfie.jpg'}`;
        await this.storageService.uploadFile('selfies', fileKey, file.buffer, file.mimetype);
        const result = await this.attendanceService.checkout(userId, checkinId, fileKey, body);
        if (idempotencyKey) {
            await this.redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(result), 86400);
        }
        return result;
    }
    async getSelfie(key, reason, req, res) {
        await this.attendanceService.authorizeSelfieView(req.user, key, reason);
        const buffer = await this.storageService.getFile('selfies', key);
        if (!buffer) {
            res.status(404).send('Foto tidak ditemukan');
            return;
        }
        res.setHeader('Content-Type', this.selfieContentType(key));
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(buffer);
    }
    selfieContentType(key) {
        const ext = key.toLowerCase().split('.').pop();
        if (ext === 'png')
            return 'image/png';
        if (ext === 'webp')
            return 'image/webp';
        return 'image/jpeg';
    }
};
exports.AttendanceController = AttendanceController;
__decorate([
    (0, common_1.Get)('me/today'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "getToday", null);
__decorate([
    (0, common_1.Post)('checkins'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('selfie')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Query)('force')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, String]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "checkin", null);
__decorate([
    (0, common_1.Post)('checkins/:id/checkout'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('selfie')),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "checkout", null);
__decorate([
    (0, common_1.Get)('selfies/:key'),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Query)('reason')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AttendanceController.prototype, "getSelfie", null);
exports.AttendanceController = AttendanceController = __decorate([
    (0, common_1.Controller)('attendance'),
    __metadata("design:paramtypes", [attendance_service_1.AttendanceService,
        redis_service_1.RedisService,
        storage_service_1.StorageService])
], AttendanceController);
//# sourceMappingURL=attendance.controller.js.map