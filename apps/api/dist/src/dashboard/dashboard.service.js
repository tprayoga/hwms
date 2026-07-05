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
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const team_resolver_service_1 = require("../feed/team-resolver.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const client_1 = require("@prisma/client");
let DashboardService = class DashboardService {
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
    async getTeamDashboard(userId, teamFilter, dateFromStr, dateToStr) {
        const tenantId = this.getTenantId();
        let userIds = [];
        let teamName = '';
        if (teamFilter) {
            if (teamFilter.startsWith('DEPT:')) {
                const deptId = teamFilter.split(':')[1];
                const users = await this.prisma.user.findMany({ where: { department_id: deptId } });
                userIds = users.map(u => u.id);
                const dept = await this.prisma.department.findUnique({ where: { id: deptId } });
                teamName = dept ? `Departemen: ${dept.name}` : 'Departemen';
            }
            else if (teamFilter.startsWith('PROJ:')) {
                const projId = teamFilter.split(':')[1];
                const assignments = await this.prisma.taskAssignment.findMany({
                    where: { task: { project_id: projId, deleted_at: null }, unassigned_at: null }
                });
                userIds = Array.from(new Set(assignments.map(a => a.user_id)));
                const proj = await this.prisma.project.findUnique({ where: { id: projId } });
                teamName = proj ? `Proyek: ${proj.name}` : 'Proyek';
            }
        }
        else {
            const teamRes = await this.teamResolver.getTeamUserIds(userId, tenantId);
            userIds = teamRes.userIds;
            teamName = teamRes.teamName;
        }
        const todayStr = new Date().toISOString().split('T')[0];
        const start = dateFromStr ? new Date(dateFromStr) : new Date(todayStr);
        const end = dateToStr ? new Date(dateToStr) : new Date(todayStr);
        const endOfDay = new Date(end);
        endOfDay.setHours(23, 59, 59, 999);
        const checkins = await this.prisma.checkin.findMany({
            where: {
                user_id: { in: userIds },
                submitted_at: { gte: start, lte: endOfDay }
            },
            include: {
                user: { include: { department: true, functional_role: true } },
                standup_items: { include: { task: true } }
            },
            orderBy: { submitted_at: 'desc' }
        });
        const grouped = {};
        for (const c of checkins) {
            const dateKey = c.date.toISOString().split('T')[0];
            const groupKey = `${c.user_id}_${dateKey}`;
            if (!grouped[groupKey]) {
                grouped[groupKey] = {
                    user: {
                        id: c.user.id,
                        fullName: c.user.full_name,
                        email: c.user.email,
                        deptName: c.user.department?.name || '-',
                        roleCode: c.user.functional_role?.code || '-',
                    },
                    date: dateKey,
                    checkin: null,
                    checkout: null,
                    standupTasks: [],
                };
            }
            if (c.type === client_1.CheckinType.IN) {
                grouped[groupKey].checkin = c;
                grouped[groupKey].standupTasks = c.standup_items.map((item) => ({
                    id: item.task.id,
                    code: item.task.code,
                    title: item.task.title,
                    percentBefore: item.percent_complete_before,
                    percentAfter: item.percent_complete_after,
                    statusBefore: item.status_before,
                    statusAfter: item.status_after,
                    isCarryOver: item.is_carry_over,
                    plannedNote: item.planned_note,
                }));
            }
            else {
                grouped[groupKey].checkout = c;
            }
        }
        const attendanceList = Object.values(grouped).map(g => {
            const late = g.checkin?.is_late || false;
            const auto = g.checkout?.is_auto || false;
            const offline = g.checkin?.is_offline_sync || g.checkout?.is_offline_sync || false;
            const geofence_ok = g.checkin?.geofence_ok !== false;
            let noEvidence = false;
            if (g.checkout) {
                const doneTasks = g.standupTasks.filter((t) => t.statusAfter === client_1.TaskStatus.DONE);
                if (doneTasks.length > 0) {
                    noEvidence = false;
                }
            }
            return {
                user: g.user,
                date: g.date,
                workStatus: g.checkin?.work_status || '-',
                checkinTime: g.checkin?.submitted_at || null,
                checkoutTime: g.checkout?.submitted_at || null,
                tasksCount: g.standupTasks.length,
                flags: {
                    late,
                    auto,
                    offline,
                    noEvidence,
                    geofence_ok
                }
            };
        });
        const openBlockers = await this.prisma.blocker.findMany({
            where: {
                status: 'OPEN',
                reported_by: { in: userIds }
            },
            include: {
                reporter: true,
                task: true
            },
            orderBy: { created_at: 'asc' }
        });
        const blockerAging = openBlockers.map(b => {
            const daysOpen = Math.ceil((new Date().getTime() - b.created_at.getTime()) / (1000 * 60 * 60 * 24));
            return {
                id: b.id,
                taskCode: b.task.code,
                taskTitle: b.task.title,
                description: b.description,
                reporterName: b.reporter.full_name,
                createdAt: b.created_at,
                daysOpen
            };
        });
        const anomaliesCount = attendanceList.filter(a => a.flags.late || a.flags.auto || a.flags.offline || !a.flags.geofence_ok).length;
        return {
            teamName,
            attendanceList,
            blockerAging,
            anomaliesCount
        };
    }
    async getProgramDashboard() {
        const tenantId = this.getTenantId();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const checkinsToday = await this.prisma.checkin.findMany({
            where: { submitted_at: { gte: todayStart, lte: todayEnd } },
            include: { user: true }
        });
        const uniqueUsersCheckedIn = Array.from(new Set(checkinsToday.map(c => c.user_id)));
        const totalHadir = uniqueUsersCheckedIn.length;
        const wfhCount = Array.from(new Set(checkinsToday.filter(c => c.work_status === 'WFH').map(c => c.user_id))).length;
        const wfoCount = Array.from(new Set(checkinsToday.filter(c => c.work_status === 'WFO').map(c => c.user_id))).length;
        const onsiteCount = Array.from(new Set(checkinsToday.filter(c => c.work_status === 'ONSITE').map(c => c.user_id))).length;
        const openBlockersCount = await this.prisma.blocker.count({ where: { status: 'OPEN' } });
        const lateCount = await this.prisma.checkin.count({
            where: { submitted_at: { gte: todayStart, lte: todayEnd }, is_late: true }
        });
        const autoCount = await this.prisma.checkin.count({
            where: { submitted_at: { gte: todayStart, lte: todayEnd }, is_auto: true }
        });
        const geofenceFailures = await this.prisma.checkin.count({
            where: { submitted_at: { gte: todayStart, lte: todayEnd }, geofence_ok: false }
        });
        const anomaliesCount = lateCount + autoCount + geofenceFailures;
        const sprints = await this.prisma.sprint.findMany({
            include: { project: true, tasks: { where: { deleted_at: null } } },
            orderBy: { start_date: 'desc' }
        });
        const sprintMetrics = sprints.map(s => {
            const totalWeight = s.tasks.reduce((sum, t) => sum + Number(t.weight || 1), 0);
            let progress = 0;
            if (totalWeight > 0) {
                const weightedSum = s.tasks.reduce((sum, t) => sum + (t.percent_complete * Number(t.weight || 1)), 0);
                progress = Math.round(weightedSum / totalWeight);
            }
            let rag = 'RED';
            if (progress >= 85)
                rag = 'GREEN';
            else if (progress >= 60)
                rag = 'YELLOW';
            const hasOpenBlocker = s.tasks.some(t => t.status === 'BLOCKED');
            const isPastEnd = new Date() > s.end_date;
            if (progress < 65 && (hasOpenBlocker || isPastEnd)) {
                rag = 'BLACK';
            }
            return {
                id: s.id,
                name: `Sprint ${s.number}`,
                projectName: s.project.name,
                startDate: s.start_date,
                endDate: s.end_date,
                progress,
                rag,
                tasksCount: s.tasks.length
            };
        });
        const activeSprint = await this.prisma.sprint.findFirst({
            where: { start_date: { lte: new Date() }, end_date: { gte: new Date() } },
            include: {
                tasks: {
                    where: { deleted_at: null },
                    include: {
                        assignments: {
                            where: { unassigned_at: null },
                            include: { user: { include: { functional_role: true } } }
                        }
                    }
                }
            }
        });
        const roleCompletion = {};
        if (activeSprint) {
            for (const t of activeSprint.tasks) {
                const weight = Number(t.weight || 1);
                const activeAssignment = t.assignments[0];
                const role = activeAssignment?.user?.functional_role;
                const roleName = role?.name || 'Unassigned';
                const roleCode = role?.code || 'TBD';
                if (!roleCompletion[roleCode]) {
                    roleCompletion[roleCode] = { name: roleName, totalWeight: 0, weightedProgress: 0 };
                }
                roleCompletion[roleCode].totalWeight += weight;
                roleCompletion[roleCode].weightedProgress += t.percent_complete * weight;
            }
        }
        const roleMetrics = Object.entries(roleCompletion).map(([code, r]) => {
            const progress = r.totalWeight > 0 ? Math.round(r.weightedProgress / r.totalWeight) : 0;
            let rag = 'RED';
            if (progress >= 85)
                rag = 'GREEN';
            else if (progress >= 60)
                rag = 'YELLOW';
            return {
                code,
                name: r.name,
                progress,
                rag
            };
        });
        const statusCounts = await this.prisma.task.groupBy({
            by: ['status'],
            where: { deleted_at: null },
            _count: { id: true }
        });
        const statusDistribution = statusCounts.map(sc => ({
            status: sc.status,
            count: sc._count.id
        }));
        return {
            metrics: {
                totalHadir,
                wfhCount,
                wfoCount,
                onsiteCount,
                openBlockersCount,
                anomaliesCount
            },
            sprintMetrics,
            roleMetrics,
            statusDistribution
        };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        team_resolver_service_1.TeamResolverService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map