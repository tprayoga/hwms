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
exports.FeedService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const team_resolver_service_1 = require("./team-resolver.service");
const client_1 = require("@prisma/client");
const tenant_storage_1 = require("../prisma/tenant-storage");
let FeedService = class FeedService {
    prisma;
    teamResolver;
    constructor(prisma, teamResolver) {
        this.prisma = prisma;
        this.teamResolver = teamResolver;
    }
    getTenantId() {
        const tenantId = tenant_storage_1.tenantLocalStorage.getStore()?.tenantId;
        if (!tenantId) {
            throw new common_1.BadRequestException('Context Tenant ID tidak ditemukan');
        }
        return tenantId;
    }
    async getFeed(userId, dateParam, teamFilter) {
        const tenantId = this.getTenantId();
        const targetDateStr = dateParam || new Date().toISOString().split('T')[0];
        const targetDate = new Date(targetDateStr);
        let userIds = [];
        let teamName = 'Tim';
        if (teamFilter) {
            if (teamFilter.startsWith('DEPT:')) {
                const deptId = teamFilter.replace('DEPT:', '');
                const deptUsers = await this.prisma.user.findMany({ where: { department_id: deptId } });
                userIds = deptUsers.map(u => u.id);
                teamName = 'Filter Departemen';
            }
            else if (teamFilter.startsWith('PROJ:')) {
                const projId = teamFilter.replace('PROJ:', '');
                const projAssignments = await this.prisma.taskAssignment.findMany({
                    where: { task: { project_id: projId }, unassigned_at: null }
                });
                userIds = Array.from(new Set(projAssignments.map(a => a.user_id)));
                teamName = 'Filter Proyek';
            }
        }
        else {
            const resolved = await this.teamResolver.getTeamUserIds(userId, tenantId);
            userIds = resolved.userIds;
            teamName = resolved.teamName;
        }
        const checkins = await this.prisma.checkin.findMany({
            where: {
                user_id: { in: userIds },
                date: targetDate,
            },
            include: {
                user: {
                    include: {
                        functional_role: true,
                        department: true,
                    }
                },
                standup_items: {
                    include: {
                        task: {
                            include: {
                                evidences: true
                            }
                        }
                    }
                }
            },
            orderBy: { submitted_at: 'asc' }
        });
        const userEntries = {};
        for (const c of checkins) {
            if (!userEntries[c.user_id]) {
                userEntries[c.user_id] = { inCheckin: null, outCheckin: null };
            }
            if (c.type === client_1.CheckinType.IN) {
                userEntries[c.user_id].inCheckin = c;
            }
            else if (c.type === client_1.CheckinType.OUT) {
                userEntries[c.user_id].outCheckin = c;
            }
        }
        const feedList = [];
        for (const uId of Object.keys(userEntries)) {
            const { inCheckin, outCheckin } = userEntries[uId];
            if (!inCheckin)
                continue;
            const userObj = inCheckin.user;
            const taskIds = inCheckin.standup_items.map((s) => s.task_id);
            const openBlockers = await this.prisma.blocker.findMany({
                where: {
                    task_id: { in: taskIds },
                    status: client_1.BlockerStatus.OPEN
                },
                include: {
                    task: true,
                    reporter: true
                }
            });
            const hasOpenBlocker = openBlockers.length > 0;
            const isLate = inCheckin.is_late;
            const isAuto = outCheckin?.is_auto || false;
            const isOffline = inCheckin.is_offline_sync || outCheckin?.is_offline_sync || false;
            let noEvidence = false;
            for (const item of inCheckin.standup_items) {
                const isDone = item.status_after === client_1.TaskStatus.DONE || item.task?.status === client_1.TaskStatus.DONE;
                if (isDone) {
                    const hasEvidence = item.task?.evidences && item.task.evidences.length > 0;
                    if (!hasEvidence) {
                        noEvidence = true;
                        break;
                    }
                }
            }
            feedList.push({
                userId: userObj.id,
                fullName: userObj.full_name,
                email: userObj.email,
                roleCode: userObj.functional_role?.code || 'GEN',
                deptName: userObj.department?.name || 'Umum',
                checkinId: inCheckin.id,
                checkoutCheckinId: outCheckin ? outCheckin.id : null,
                workStatus: inCheckin.work_status,
                clientProjectId: inCheckin.client_project_id,
                checkinTime: inCheckin.device_timestamp,
                checkoutTime: outCheckin ? outCheckin.device_timestamp : null,
                selfieKey: inCheckin.selfie_key,
                checkoutSelfieKey: outCheckin ? outCheckin.selfie_key : null,
                dailyNote: inCheckin.daily_note,
                checkoutDailyNote: outCheckin ? outCheckin.daily_note : null,
                standupItems: inCheckin.standup_items.map((item) => ({
                    taskId: item.task_id,
                    code: item.task?.code || '',
                    title: item.task?.title || '',
                    plannedNote: item.note,
                    percentBefore: item.task?.percent_complete || 0,
                    percentAfter: item.percent_after,
                    statusBefore: item.task?.status || client_1.TaskStatus.NOT_STARTED,
                    statusAfter: item.status_after,
                    isCarryOver: item.is_carried_over
                })),
                blockers: openBlockers.map(b => ({
                    id: b.id,
                    description: b.description,
                    taskCode: b.task?.code || '',
                    taskTitle: b.task?.title || '',
                    reporterName: b.reporter?.full_name || '',
                    reportedBy: b.reported_by,
                    mentionedUserIds: b.mentioned_user_ids,
                    reporterManagerId: b.reporter?.manager_id || ''
                })),
                flags: {
                    late: isLate,
                    auto: isAuto,
                    offline: isOffline,
                    noEvidence: noEvidence
                },
                hasOpenBlocker
            });
        }
        feedList.sort((a, b) => {
            if (a.hasOpenBlocker && !b.hasOpenBlocker)
                return -1;
            if (!a.hasOpenBlocker && b.hasOpenBlocker)
                return 1;
            const timeA = new Date(a.checkinTime).getTime();
            const timeB = new Date(b.checkinTime).getTime();
            return timeB - timeA;
        });
        return {
            teamName,
            date: targetDateStr,
            entries: feedList
        };
    }
};
exports.FeedService = FeedService;
exports.FeedService = FeedService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        team_resolver_service_1.TeamResolverService])
], FeedService);
//# sourceMappingURL=feed.service.js.map