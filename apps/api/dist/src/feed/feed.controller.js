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
exports.FeedController = void 0;
const common_1 = require("@nestjs/common");
const feed_service_1 = require("./feed.service");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const tenant_storage_1 = require("../prisma/tenant-storage");
let FeedController = class FeedController {
    feedService;
    prisma;
    constructor(feedService, prisma) {
        this.feedService = feedService;
        this.prisma = prisma;
    }
    async getFeed(req, date, team) {
        const userId = req.user.id;
        return this.feedService.getFeed(userId, date, team);
    }
    async resolveBlocker(blockerId, req) {
        const currentUser = req.user;
        const userId = currentUser.id;
        const tenantId = tenant_storage_1.tenantLocalStorage.getStore()?.tenantId;
        if (!tenantId)
            throw new common_1.BadRequestException('Context Tenant ID tidak ditemukan');
        const blocker = await this.prisma.blocker.findUnique({
            where: { id: blockerId },
            include: {
                reporter: true,
                task: true
            }
        });
        if (!blocker) {
            throw new common_1.NotFoundException('Blocker tidak ditemukan');
        }
        if (blocker.status === client_1.BlockerStatus.RESOLVED) {
            throw new common_1.BadRequestException('Blocker sudah diselesaikan');
        }
        const isReporter = blocker.reported_by === userId;
        const isMentioned = blocker.mentioned_user_ids.includes(userId);
        const isManager = blocker.reporter.manager_id === userId;
        const isSuperAdmin = (currentUser.system_roles || currentUser.roles || []).includes('SUPER_ADMIN');
        const isAuthorized = isReporter || isMentioned || isManager || isSuperAdmin;
        if (!isAuthorized) {
            throw new common_1.ForbiddenException('Anda tidak memiliki wewenang untuk menyelesaikan blocker ini');
        }
        return this.prisma.raw.$transaction(async (tx) => {
            const updatedBlocker = await tx.blocker.update({
                where: { id: blockerId },
                data: {
                    status: client_1.BlockerStatus.RESOLVED,
                    resolved_at: new Date(),
                    resolved_by: userId
                }
            });
            await tx.task.update({
                where: { id: blocker.task_id },
                data: { status: client_1.TaskStatus.IN_PROGRESS }
            });
            await tx.notification.create({
                data: {
                    tenant_id: tenantId,
                    user_id: blocker.reported_by,
                    kind: client_1.NotificationKind.ESCALATION,
                    payload_json: {
                        title: 'Blocker Terselesaikan',
                        message: `Blocker pada tugas Anda "${blocker.task.title}" telah diselesaikan oleh ${currentUser.fullName || currentUser.email}.`
                    }
                }
            });
            return {
                message: 'Blocker berhasil diselesaikan',
                blocker: updatedBlocker
            };
        });
    }
};
exports.FeedController = FeedController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('date')),
    __param(2, (0, common_1.Query)('team')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "getFeed", null);
__decorate([
    (0, common_1.Post)('blockers/:id/resolve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], FeedController.prototype, "resolveBlocker", null);
exports.FeedController = FeedController = __decorate([
    (0, common_1.Controller)('feed'),
    __metadata("design:paramtypes", [feed_service_1.FeedService,
        prisma_service_1.PrismaService])
], FeedController);
//# sourceMappingURL=feed.controller.js.map