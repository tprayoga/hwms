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
var AttendanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const client_1 = require("@prisma/client");
const tenant_storage_1 = require("../prisma/tenant-storage");
const policy_constants_1 = require("./policy.constants");
let AttendanceService = class AttendanceService {
    static { AttendanceService_1 = this; }
    prisma;
    redis;
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    getTenantId() {
        const tenantId = tenant_storage_1.tenantLocalStorage.getStore()?.tenantId;
        if (!tenantId) {
            throw new common_1.BadRequestException('Context Tenant ID tidak ditemukan');
        }
        return tenantId;
    }
    async isManagerOf(managerId, subordinateId) {
        let currentId = subordinateId;
        const visited = new Set();
        for (let depth = 0; depth < 20 && currentId; depth++) {
            if (visited.has(currentId))
                break;
            visited.add(currentId);
            const u = await this.prisma.user.findFirst({
                where: { id: currentId },
                select: { manager_id: true },
            });
            if (!u || !u.manager_id)
                break;
            if (u.manager_id === managerId)
                return true;
            currentId = u.manager_id;
        }
        return false;
    }
    static SELFIE_REASON_MIN = 10;
    async authorizeSelfieAccessCore(viewer, checkin, tenantId, reason) {
        const ownerId = checkin.user_id;
        if (ownerId === viewer.id) {
            return { ownerId, checkinId: checkin.id, selfieKey: checkin.selfie_key };
        }
        const roles = viewer.system_roles || [];
        const isHR = roles.includes('HR');
        const isSuperAdmin = roles.includes('SUPER_ADMIN');
        const isManager = isHR || isSuperAdmin ? false : await this.isManagerOf(viewer.id, ownerId);
        if (!isHR && !isSuperAdmin && !isManager) {
            throw new common_1.ForbiddenException('Anda tidak berwenang melihat selfie ini (FORBIDDEN_SCOPE)');
        }
        const trimmedReason = (reason || '').trim();
        if (trimmedReason.length < AttendanceService_1.SELFIE_REASON_MIN) {
            throw new common_1.BadRequestException(`Alasan melihat selfie wajib diisi minimal ${AttendanceService_1.SELFIE_REASON_MIN} karakter (kontrol UU PDP)`);
        }
        await this.prisma.auditLog.create({
            data: {
                tenant_id: tenantId,
                actor_id: viewer.id,
                entity: 'Checkin',
                entity_id: checkin.id,
                action: 'VIEW_SELFIE',
                after_json: {
                    reason: trimmedReason,
                    target_user_id: ownerId,
                    attendance_id: checkin.id,
                    selfie_key: checkin.selfie_key,
                    via_role: isHR ? 'HR' : isSuperAdmin ? 'SUPER_ADMIN' : 'MANAGER',
                },
            },
        });
        return { ownerId, checkinId: checkin.id, selfieKey: checkin.selfie_key };
    }
    async authorizeSelfieView(viewer, key, reason) {
        const tenantId = this.getTenantId();
        const checkin = await this.prisma.checkin.findFirst({
            where: { selfie_key: key },
            select: { id: true, user_id: true, selfie_key: true },
        });
        if (!checkin) {
            throw new common_1.NotFoundException('Foto selfie tidak ditemukan');
        }
        const res = await this.authorizeSelfieAccessCore(viewer, checkin, tenantId, reason);
        return { ownerId: res.ownerId, checkinId: res.checkinId };
    }
    async authorizeSelfieViewById(viewer, attendanceId, reason) {
        const tenantId = this.getTenantId();
        const checkin = await this.prisma.raw.checkin.findFirst({
            where: { id: attendanceId, deleted_at: null },
            select: { id: true, user_id: true, selfie_key: true, tenant_id: true },
        });
        if (!checkin) {
            throw new common_1.NotFoundException('Data kehadiran tidak ditemukan');
        }
        if (checkin.tenant_id !== tenantId) {
            throw new common_1.ForbiddenException('Akses lintas tenant ditolak (FORBIDDEN_SCOPE)');
        }
        const res = await this.authorizeSelfieAccessCore(viewer, checkin, tenantId, reason);
        return { ownerId: res.ownerId, selfieKey: res.selfieKey };
    }
    checkLateness(date, timezone, windowEndStr) {
        try {
            const localTimeStr = date.toLocaleTimeString('en-US', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });
            const [localHour, localMin] = localTimeStr.split(':').map(Number);
            const [endHour, endMin] = windowEndStr.split(':').map(Number);
            if (localHour > endHour)
                return true;
            if (localHour === endHour && localMin > endMin)
                return true;
            return false;
        }
        catch (e) {
            return false;
        }
    }
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const phi1 = (lat1 * Math.PI) / 180;
        const phi2 = (lat2 * Math.PI) / 180;
        const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
        const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    async getEffectivePolicy(user) {
        if (user.functional_role_id) {
            const p = await this.prisma.policy.findFirst({
                where: { scope_type: 'ROLE', scope_id: user.functional_role_id }
            });
            if (p)
                return p;
        }
        if (user.department_id) {
            const p = await this.prisma.policy.findFirst({
                where: { scope_type: 'DEPARTMENT', scope_id: user.department_id }
            });
            if (p)
                return p;
        }
        const p = await this.prisma.policy.findFirst({
            where: { scope_type: 'TENANT', scope_id: user.tenant_id }
        });
        if (p)
            return p;
        return { ...policy_constants_1.DEFAULT_TENANT_POLICY };
    }
    async getTodayStatus(userId) {
        const tenantId = this.getTenantId();
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { department: true, functional_role: true }
        });
        if (!user)
            throw new common_1.NotFoundException('User tidak ditemukan');
        const todayDateStr = new Date().toISOString().split('T')[0];
        const today = new Date(todayDateStr);
        const policy = await this.getEffectivePolicy(user);
        const checkins = await this.prisma.checkin.findMany({
            where: { user_id: userId, date: today },
            orderBy: { submitted_at: 'asc' }
        });
        const todayCheckin = checkins.find(c => c.type === client_1.CheckinType.IN) || null;
        const checkout = checkins.find(c => c.type === client_1.CheckinType.OUT) || null;
        const activeProject = await this.prisma.project.findFirst({
            where: { status: 'ACTIVE' }
        });
        let activeSprintTasks = [];
        let carryOverTasks = [];
        if (activeProject) {
            const activeSprint = await this.prisma.sprint.findFirst({
                where: {
                    project_id: activeProject.id,
                    start_date: { lte: new Date() },
                    end_date: { gte: new Date() }
                }
            });
            if (activeSprint) {
                activeSprintTasks = await this.prisma.task.findMany({
                    where: {
                        sprint_id: activeSprint.id,
                        assignments: { some: { user_id: userId, unassigned_at: null } }
                    }
                });
                carryOverTasks = await this.prisma.task.findMany({
                    where: {
                        project_id: activeProject.id,
                        sprint_id: { not: activeSprint.id },
                        status: { not: client_1.TaskStatus.DONE },
                        assignments: { some: { user_id: userId, unassigned_at: null } }
                    }
                });
            }
        }
        const activeLeave = await this.prisma.leaveRequest.findFirst({
            where: {
                user_id: userId,
                status: { in: ['APPROVED', 'AUTO_APPROVED'] },
                date_from: { lte: today },
                date_to: { gte: today }
            }
        });
        return {
            todayCheckin,
            checkout,
            policy,
            activeSprintTasks,
            carryOverTasks,
            isOnLeave: !!activeLeave,
            leaveType: activeLeave?.type || null,
            leaveReason: activeLeave?.reason || null
        };
    }
    async checkin(userId, fileKey, body, force = false) {
        const tenantId = this.getTenantId();
        const now = new Date();
        const todayDateStr = new Date().toISOString().split('T')[0];
        const today = new Date(todayDateStr);
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { department: true, functional_role: true }
        });
        if (!user)
            throw new common_1.NotFoundException('User tidak ditemukan');
        const existing = await this.prisma.checkin.findFirst({
            where: { user_id: userId, date: today, type: client_1.CheckinType.IN }
        });
        if (existing) {
            throw new common_1.BadRequestException('CHECKIN_ALREADY_EXISTS');
        }
        if (!force) {
            const isHoliday = await this.prisma.holiday.findFirst({ where: { date: today } });
            const isOnLeave = await this.prisma.leaveRequest.findFirst({
                where: {
                    user_id: userId,
                    status: { in: ['APPROVED', 'AUTO_APPROVED'] },
                    date_from: { lte: today },
                    date_to: { gte: today }
                }
            });
            if (isHoliday || isOnLeave) {
                throw new common_1.BadRequestException('CHECKIN_ON_LEAVE_DAY');
            }
        }
        let items = [];
        if (body.items) {
            items = typeof body.items === 'string' ? JSON.parse(body.items) : body.items;
        }
        if (items.length > 5) {
            throw new common_1.BadRequestException('TASK_LIMIT_EXCEEDED');
        }
        for (const item of items) {
            const task = await this.prisma.task.findUnique({
                where: { id: item.taskId },
                include: { assignments: { where: { unassigned_at: null } } }
            });
            if (!task)
                throw new common_1.NotFoundException(`Task ${item.taskId} tidak ditemukan`);
            const isOwner = task.assignments.some(a => a.user_id === userId);
            if (!isOwner) {
                throw new common_1.BadRequestException('TASK_NOT_OWNED');
            }
        }
        const workStatus = body.workStatus;
        if (workStatus === client_1.WorkStatus.ONSITE && !body.clientProjectId) {
            throw new common_1.BadRequestException('ONSITE_CLIENT_REQUIRED');
        }
        let geofenceOk = true;
        const lat = body.lat ? parseFloat(body.lat) : null;
        const lng = body.lng ? parseFloat(body.lng) : null;
        if (workStatus === client_1.WorkStatus.WFO || workStatus === client_1.WorkStatus.ONSITE) {
            if (lat !== null && lng !== null) {
                if (workStatus === client_1.WorkStatus.WFO) {
                    const offices = await this.prisma.location.findMany({
                        where: { type: 'OFFICE' }
                    });
                    const inRange = offices.some(off => {
                        if (off.lat === null || off.lng === null)
                            return false;
                        const dist = this.calculateDistance(lat, lng, Number(off.lat), Number(off.lng));
                        return dist <= (off.radius_m || 200);
                    });
                    geofenceOk = inRange;
                }
                else if (workStatus === client_1.WorkStatus.ONSITE && body.clientProjectId) {
                    const clientLoc = await this.prisma.location.findFirst({
                        where: { type: 'CLIENT', name: { contains: body.clientProjectId } }
                    });
                    if (clientLoc && clientLoc.lat !== null && clientLoc.lng !== null) {
                        const dist = this.calculateDistance(lat, lng, Number(clientLoc.lat), Number(clientLoc.lng));
                        geofenceOk = dist <= (clientLoc.radius_m || 200);
                    }
                }
            }
            else {
                geofenceOk = false;
            }
        }
        const policy = await this.getEffectivePolicy(user);
        const isLate = this.checkLateness(now, user.timezone, policy.checkin_window_end);
        return this.prisma.raw.$transaction(async (tx) => {
            const checkin = await tx.checkin.create({
                data: {
                    tenant_id: tenantId,
                    user_id: userId,
                    date: today,
                    type: client_1.CheckinType.IN,
                    work_status: workStatus,
                    client_project_id: body.clientProjectId || null,
                    lat: lat !== null ? new client_1.Prisma.Decimal(lat) : null,
                    lng: lng !== null ? new client_1.Prisma.Decimal(lng) : null,
                    gps_accuracy_m: body.accuracy ? new client_1.Prisma.Decimal(parseFloat(body.accuracy)) : null,
                    selfie_key: fileKey,
                    is_auto: false,
                    is_late: isLate,
                    is_offline_sync: body.isOfflineSync === 'true',
                    geofence_ok: geofenceOk,
                    device_timestamp: body.deviceTimestamp ? new Date(body.deviceTimestamp) : now,
                    daily_note: body.dailyNote || null
                }
            });
            for (const item of items) {
                await tx.standupItem.create({
                    data: {
                        tenant_id: tenantId,
                        checkin_id: checkin.id,
                        task_id: item.taskId,
                        note: item.note || null,
                        planned: true,
                        is_carried_over: false
                    }
                });
            }
            let blockerData = body.blocker;
            if (blockerData) {
                const blocker = typeof blockerData === 'string' ? JSON.parse(blockerData) : blockerData;
                if (blocker.description) {
                    const createdBlocker = await tx.blocker.create({
                        data: {
                            tenant_id: tenantId,
                            task_id: blocker.taskId,
                            reported_by: userId,
                            description: blocker.description,
                            mentioned_user_ids: blocker.mentionedUserIds || [],
                            status: client_1.BlockerStatus.OPEN
                        }
                    });
                    await tx.task.update({
                        where: { id: blocker.taskId },
                        data: { status: client_1.TaskStatus.BLOCKED }
                    });
                    if (blocker.mentionedUserIds && blocker.mentionedUserIds.length > 0) {
                        for (const mentionId of blocker.mentionedUserIds) {
                            await tx.notification.create({
                                data: {
                                    tenant_id: tenantId,
                                    user_id: mentionId,
                                    kind: client_1.NotificationKind.MENTION,
                                    payload_json: {
                                        title: 'Anda di-mention dalam Blocker',
                                        message: `${user.full_name} menyebut Anda pada blocker tugas: ${blocker.description}`
                                    }
                                }
                            });
                        }
                    }
                }
            }
            return checkin;
        });
    }
    async checkout(userId, checkinId, fileKey, body) {
        const tenantId = this.getTenantId();
        const now = new Date();
        const todayDateStr = new Date().toISOString().split('T')[0];
        const today = new Date(todayDateStr);
        const checkin = await this.prisma.checkin.findUnique({
            where: { id: checkinId },
            include: { standup_items: true }
        });
        if (!checkin || checkin.user_id !== userId || checkin.type !== client_1.CheckinType.IN) {
            throw new common_1.BadRequestException('CHECKIN_NO_OPEN_SESSION');
        }
        let updates = [];
        if (body.updates) {
            updates = typeof body.updates === 'string' ? JSON.parse(body.updates) : body.updates;
        }
        return this.prisma.raw.$transaction(async (tx) => {
            const checkoutRecord = await tx.checkin.create({
                data: {
                    tenant_id: tenantId,
                    user_id: userId,
                    date: today,
                    type: client_1.CheckinType.OUT,
                    work_status: checkin.work_status,
                    client_project_id: checkin.client_project_id,
                    lat: body.lat ? new client_1.Prisma.Decimal(parseFloat(body.lat)) : null,
                    lng: body.lng ? new client_1.Prisma.Decimal(parseFloat(body.lng)) : null,
                    selfie_key: fileKey,
                    is_auto: false,
                    is_late: false,
                    is_offline_sync: body.isOfflineSync === 'true',
                    geofence_ok: true,
                    device_timestamp: body.deviceTimestamp ? new Date(body.deviceTimestamp) : now,
                    daily_note: body.dailyNote || null
                }
            });
            for (const upd of updates) {
                const percent = parseInt(upd.percent, 10);
                const status = upd.status;
                const standup = checkin.standup_items.find(s => s.task_id === upd.taskId);
                const isCarriedOver = status !== client_1.TaskStatus.DONE;
                if (standup) {
                    await tx.standupItem.update({
                        where: { id: standup.id },
                        data: {
                            percent_after: percent,
                            status_after: status,
                            is_carried_over: isCarriedOver
                        }
                    });
                }
                await tx.task.update({
                    where: { id: upd.taskId },
                    data: {
                        percent_complete: percent,
                        status: status
                    }
                });
                if (upd.evidence) {
                    await tx.taskEvidence.create({
                        data: {
                            tenant_id: tenantId,
                            task_id: upd.taskId,
                            kind: 'LINK',
                            url_or_key: upd.evidence,
                            uploaded_by: userId
                        }
                    });
                }
            }
            return checkoutRecord;
        });
    }
};
exports.AttendanceService = AttendanceService;
exports.AttendanceService = AttendanceService = AttendanceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], AttendanceService);
//# sourceMappingURL=attendance.service.js.map