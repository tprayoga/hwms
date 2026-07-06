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
exports.ObjectsController = void 0;
const common_1 = require("@nestjs/common");
const objects_service_1 = require("./objects.service");
const roles_decorator_1 = require("../auth/roles.decorator");
const shared_1 = require("@hwms/shared");
let ObjectsController = class ObjectsController {
    objectsService;
    constructor(objectsService) {
        this.objectsService = objectsService;
    }
    async getSelfie(attendanceId, reason, req, res) {
        const { buffer, contentType } = await this.objectsService.getSelfieBytes(req.user, attendanceId, reason);
        res.set({
            'Content-Type': contentType,
            'Cache-Control': 'private, max-age=300',
            'Content-Length': String(buffer.length),
        });
        res.send(buffer);
    }
    async getEvidence(taskId, key, req, res) {
        if (!key) {
            throw new common_1.BadRequestException('Kunci bukti tidak valid');
        }
        const r = await this.objectsService.getEvidenceResource(req.user, taskId, key);
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
};
exports.ObjectsController = ObjectsController;
__decorate([
    (0, common_1.Get)('selfie/:attendanceId'),
    __param(0, (0, common_1.Param)('attendanceId')),
    __param(1, (0, common_1.Query)('reason')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ObjectsController.prototype, "getSelfie", null);
__decorate([
    (0, common_1.Get)('evidence/:taskId/:key'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.EMPLOYEE, shared_1.SystemRole.MANAGER, shared_1.SystemRole.PM_ADMIN, shared_1.SystemRole.CTO, shared_1.SystemRole.HR, shared_1.SystemRole.SUPER_ADMIN),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('key')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], ObjectsController.prototype, "getEvidence", null);
exports.ObjectsController = ObjectsController = __decorate([
    (0, common_1.Controller)('objects'),
    __metadata("design:paramtypes", [objects_service_1.ObjectsService])
], ObjectsController);
//# sourceMappingURL=objects.controller.js.map