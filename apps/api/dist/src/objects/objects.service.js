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
exports.ObjectsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const attendance_service_1 = require("../attendance/attendance.service");
const object_access_service_1 = require("../storage/object-access.service");
const storage_service_1 = require("../storage/storage.service");
let ObjectsService = class ObjectsService {
    prisma;
    attendance;
    objectAccess;
    storage;
    constructor(prisma, attendance, objectAccess, storage) {
        this.prisma = prisma;
        this.attendance = attendance;
        this.objectAccess = objectAccess;
        this.storage = storage;
    }
    expiryIso(ttlSeconds) {
        return new Date(Date.now() + ttlSeconds * 1000).toISOString();
    }
    contentTypeFor(key) {
        const ext = key.split('.').pop()?.toLowerCase();
        if (ext === 'png')
            return 'image/png';
        if (ext === 'webp')
            return 'image/webp';
        return 'image/jpeg';
    }
    async getSelfieBytes(viewer, attendanceId, reason) {
        const { selfieKey } = await this.attendance.authorizeSelfieViewById(viewer, attendanceId, reason);
        if (!selfieKey) {
            throw new common_1.NotFoundException('Selfie tidak tersedia (mungkin telah dihapus sesuai retensi 90 hari)');
        }
        const buffer = await this.storage.getFile('selfies', selfieKey);
        if (!buffer) {
            throw new common_1.NotFoundException('Selfie tidak ditemukan di penyimpanan');
        }
        return { buffer, contentType: this.contentTypeFor(selfieKey) };
    }
    async getSelfieUrl(viewer, attendanceId, reason) {
        const { selfieKey } = await this.attendance.authorizeSelfieViewById(viewer, attendanceId, reason);
        if (!selfieKey) {
            throw new common_1.NotFoundException('Selfie tidak tersedia (mungkin telah dihapus sesuai retensi 90 hari)');
        }
        const ttl = object_access_service_1.ObjectAccessService.TTL_PRIVATE;
        const url = await this.objectAccess.getSignedUrl('selfies', selfieKey, ttl);
        if (!url) {
            throw new common_1.ServiceUnavailableException('Penyimpanan objek tidak tersedia untuk menerbitkan URL');
        }
        return { url, expiresAt: this.expiryIso(ttl) };
    }
    async resolveEvidence(viewer, taskId, key) {
        const task = await this.prisma.task.findFirst({
            where: { id: taskId, deleted_at: null },
            select: { id: true },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task tidak ditemukan');
        }
        const evidence = await this.prisma.taskEvidence.findFirst({
            where: { task_id: taskId, url_or_key: key },
            select: { id: true, kind: true, url_or_key: true },
        });
        if (!evidence) {
            throw new common_1.NotFoundException('Bukti tidak ditemukan untuk task ini');
        }
        await this.prisma.auditLog.create({
            data: {
                tenant_id: viewer.tenant_id,
                actor_id: viewer.id,
                entity: 'Task',
                entity_id: taskId,
                action: 'VIEW_EVIDENCE',
                after_json: { evidence_key: key, kind: evidence.kind },
            },
        });
        return { kind: evidence.kind, url_or_key: evidence.url_or_key };
    }
    async getEvidenceUrl(viewer, taskId, key) {
        const evidence = await this.resolveEvidence(viewer, taskId, key);
        if (evidence.kind === 'LINK') {
            return { url: evidence.url_or_key, expiresAt: null };
        }
        const ttl = object_access_service_1.ObjectAccessService.TTL_PRIVATE;
        const url = await this.objectAccess.getSignedUrl('evidences', key, ttl);
        if (!url) {
            throw new common_1.ServiceUnavailableException('Penyimpanan objek tidak tersedia untuk menerbitkan URL');
        }
        return { url, expiresAt: this.expiryIso(ttl) };
    }
    async getEvidenceResource(viewer, taskId, key) {
        const evidence = await this.resolveEvidence(viewer, taskId, key);
        if (evidence.kind === 'LINK') {
            return { kind: 'LINK', url: evidence.url_or_key };
        }
        const buffer = await this.storage.getFile('evidences', key);
        if (!buffer) {
            throw new common_1.NotFoundException('Berkas bukti tidak ditemukan di penyimpanan');
        }
        return { kind: 'FILE', buffer, contentType: this.evidenceContentType(key) };
    }
    evidenceContentType(key) {
        const ext = key.split('.').pop()?.toLowerCase();
        if (ext === 'pdf')
            return 'application/pdf';
        if (ext === 'png')
            return 'image/png';
        if (ext === 'webp')
            return 'image/webp';
        if (ext === 'jpg' || ext === 'jpeg')
            return 'image/jpeg';
        return 'application/octet-stream';
    }
};
exports.ObjectsService = ObjectsService;
exports.ObjectsService = ObjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        attendance_service_1.AttendanceService,
        object_access_service_1.ObjectAccessService,
        storage_service_1.StorageService])
], ObjectsService);
//# sourceMappingURL=objects.service.js.map