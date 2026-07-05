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
exports.TaskService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const redis_service_1 = require("../redis/redis.service");
const task_aggregation_service_1 = require("./task-aggregation.service");
const client_1 = require("@prisma/client");
const tenant_storage_1 = require("../prisma/tenant-storage");
const XLSX = require("xlsx");
const crypto_1 = require("crypto");
let TaskService = class TaskService {
    prisma;
    redis;
    aggregationService;
    constructor(prisma, redis, aggregationService) {
        this.prisma = prisma;
        this.redis = redis;
        this.aggregationService = aggregationService;
    }
    getTenantId() {
        const tenantId = tenant_storage_1.tenantLocalStorage.getStore()?.tenantId;
        if (!tenantId) {
            throw new common_1.BadRequestException('Context Tenant ID tidak ditemukan');
        }
        return tenantId;
    }
    async getProjects() {
        return this.prisma.project.findMany({
            orderBy: { name: 'asc' }
        });
    }
    async createProject(body) {
        const tenantId = this.getTenantId();
        return this.prisma.project.create({
            data: {
                tenant_id: tenantId,
                name: body.name,
                code_prefix: body.codePrefix.toUpperCase(),
                status: body.status || 'ACTIVE'
            }
        });
    }
    async updateProject(id, body) {
        return this.prisma.project.update({
            where: { id },
            data: {
                name: body.name,
                code_prefix: body.codePrefix ? body.codePrefix.toUpperCase() : undefined,
                status: body.status
            }
        });
    }
    async deleteProject(id) {
        return this.prisma.project.delete({
            where: { id }
        });
    }
    async getSprints() {
        return this.prisma.sprint.findMany({
            include: { project: true },
            orderBy: { number: 'asc' }
        });
    }
    async createSprint(body) {
        const tenantId = this.getTenantId();
        const projectId = body.projectId;
        const start = new Date(body.startDate);
        const end = new Date(body.endDate);
        const overlap = await this.prisma.sprint.findFirst({
            where: {
                project_id: projectId,
                start_date: { lte: end },
                end_date: { gte: start }
            }
        });
        if (overlap) {
            throw new common_1.BadRequestException('SPRINT_OVERLAP');
        }
        return this.prisma.sprint.create({
            data: {
                tenant_id: tenantId,
                project_id: projectId,
                number: parseInt(body.number),
                start_date: start,
                end_date: end,
                goal: body.goal || null
            }
        });
    }
    async updateSprint(id, body) {
        const start = body.startDate ? new Date(body.startDate) : null;
        const end = body.endDate ? new Date(body.endDate) : null;
        if (start && end) {
            const currentSprint = await this.prisma.sprint.findUnique({ where: { id } });
            if (!currentSprint)
                throw new common_1.NotFoundException('Sprint tidak ditemukan');
            const overlap = await this.prisma.sprint.findFirst({
                where: {
                    project_id: currentSprint.project_id,
                    id: { not: id },
                    start_date: { lte: end },
                    end_date: { gte: start }
                }
            });
            if (overlap) {
                throw new common_1.BadRequestException('SPRINT_OVERLAP');
            }
        }
        const result = await this.prisma.sprint.update({
            where: { id },
            data: {
                number: body.number ? parseInt(body.number) : undefined,
                start_date: start || undefined,
                end_date: end || undefined,
                goal: body.goal
            }
        });
        this.aggregationService.triggerRefresh(id);
        return result;
    }
    async deleteSprint(id) {
        const result = await this.prisma.sprint.delete({
            where: { id }
        });
        this.aggregationService.triggerRefresh(id);
        return result;
    }
    async getTasks(filters) {
        const where = {};
        if (filters.sprintId)
            where.sprint_id = filters.sprintId;
        if (filters.projectId)
            where.project_id = filters.projectId;
        if (filters.status)
            where.status = filters.status;
        if (filters.priority)
            where.priority = filters.priority;
        if (filters.myTasksUserId) {
            where.assignments = {
                some: {
                    user_id: filters.myTasksUserId,
                    unassigned_at: null
                }
            };
        }
        return this.prisma.task.findMany({
            where,
            include: {
                project: true,
                sprint: true,
                functional_role: true,
                assignments: {
                    where: { unassigned_at: null },
                    include: { user: true }
                },
                blockers: true
            },
            orderBy: { code: 'asc' }
        });
    }
    async createTask(body) {
        const tenantId = this.getTenantId();
        const projectId = body.projectId;
        const sprintId = body.sprintId;
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project)
            throw new common_1.NotFoundException('Project tidak ditemukan');
        const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
        if (!sprint)
            throw new common_1.NotFoundException('Sprint tidak ditemukan');
        const count = await this.prisma.task.count({ where: { project_id: projectId } });
        const nextIndex = count + 1;
        const ss = String(sprint.number).padStart(2, '0');
        const nnnn = String(nextIndex).padStart(4, '0');
        const code = `${project.code_prefix}-${ss}-${nnnn}`;
        const task = await this.prisma.task.create({
            data: {
                tenant_id: tenantId,
                project_id: projectId,
                sprint_id: sprintId,
                functional_role_id: body.functionalRoleId || null,
                code,
                workstream: body.workstream || 'General',
                title: body.title,
                deliverable: body.deliverable || null,
                priority: body.priority || client_1.TaskPriority.MEDIUM,
                planned_start: new Date(body.plannedStart),
                planned_end: new Date(body.plannedEnd),
                status: body.status || client_1.TaskStatus.NOT_STARTED,
                percent_complete: body.percentComplete || 0,
                weight: body.weight !== undefined ? Number(body.weight) : 1.0,
                risk_level: body.riskLevel || client_1.RiskLevel.LOW,
                notes: body.notes || null,
            }
        });
        this.aggregationService.triggerRefresh(sprintId, undefined, body.functionalRoleId || undefined);
        return task;
    }
    async updateTask(id, body) {
        const { code, ...safeBody } = body;
        const updateData = {
            functional_role_id: safeBody.functionalRoleId,
            workstream: safeBody.workstream,
            title: safeBody.title,
            deliverable: safeBody.deliverable,
            priority: safeBody.priority,
            status: safeBody.status,
            percent_complete: safeBody.percentComplete !== undefined ? parseInt(safeBody.percentComplete) : undefined,
            weight: safeBody.weight !== undefined ? Number(safeBody.weight) : undefined,
            risk_level: safeBody.riskLevel,
            notes: safeBody.notes
        };
        if (safeBody.plannedStart)
            updateData.planned_start = new Date(safeBody.plannedStart);
        if (safeBody.plannedEnd)
            updateData.planned_end = new Date(safeBody.plannedEnd);
        const task = await this.prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                assignments: { where: { unassigned_at: null } }
            }
        });
        const activeAssignees = task.assignments.map(a => a.user_id);
        for (const userId of activeAssignees) {
            this.aggregationService.triggerRefresh(task.sprint_id, userId, task.functional_role_id || undefined);
        }
        if (activeAssignees.length === 0) {
            this.aggregationService.triggerRefresh(task.sprint_id, undefined, task.functional_role_id || undefined);
        }
        return task;
    }
    async deleteTask(id) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: { assignments: { where: { unassigned_at: null } } }
        });
        if (!task)
            throw new common_1.NotFoundException('Tugas tidak ditemukan');
        await this.prisma.task.delete({ where: { id } });
        const activeAssignees = task.assignments.map(a => a.user_id);
        for (const userId of activeAssignees) {
            this.aggregationService.triggerRefresh(task.sprint_id, userId, task.functional_role_id || undefined);
        }
        if (activeAssignees.length === 0) {
            this.aggregationService.triggerRefresh(task.sprint_id, undefined, task.functional_role_id || undefined);
        }
        return task;
    }
    async getAssignableUsers() {
        return this.prisma.user.findMany({
            where: { employment_status: 'AKTIF', deleted_at: null },
            select: { id: true, full_name: true, email: true },
            orderBy: { full_name: 'asc' },
        });
    }
    async assignOwner(taskId, userId) {
        const tenantId = this.getTenantId();
        const task = await this.prisma.task.findUnique({ where: { id: taskId } });
        if (!task)
            throw new common_1.NotFoundException('Tugas tidak ditemukan');
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('Pengguna tidak ditemukan');
        const assignment = await this.prisma.$transaction(async (tx) => {
            await tx.taskAssignment.updateMany({
                where: { task_id: taskId, unassigned_at: null },
                data: { unassigned_at: new Date() }
            });
            const newAssignment = await tx.taskAssignment.create({
                data: {
                    tenant_id: tenantId,
                    task_id: taskId,
                    user_id: userId,
                }
            });
            await tx.notification.create({
                data: {
                    tenant_id: tenantId,
                    user_id: userId,
                    kind: client_1.NotificationKind.TASK_ASSIGNED,
                    payload_json: {
                        title: 'Tugas Baru Ditugaskan',
                        message: `Anda telah ditugaskan pada tugas "${task.title}" (${task.code})`
                    }
                }
            });
            return newAssignment;
        });
        this.aggregationService.triggerRefresh(task.sprint_id, userId, task.functional_role_id || undefined);
        return assignment;
    }
    async previewImport(file, projectId) {
        const tenantId = this.getTenantId();
        try {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rawRows = XLSX.utils.sheet_to_json(sheet);
            const sprints = await this.prisma.sprint.findMany({ where: { project_id: projectId } });
            const roles = await this.prisma.functionalRole.findMany();
            const users = await this.prisma.user.findMany();
            const previewRows = [];
            let validCount = 0;
            let invalidCount = 0;
            for (const raw of rawRows) {
                const sprintNumStr = raw['Sprint'] || '';
                const workstream = raw['Workstream'] || 'General';
                const taskTitle = raw['Task'] || '';
                const deliverable = raw['Deliverable'] || '';
                const priorityStr = raw['Priority'] || 'MEDIUM';
                const plannedStartVal = raw['Planned Start'];
                const plannedEndVal = raw['Planned End'];
                const ownerEmail = raw['Owner'] || '';
                const statusStr = raw['Status'] || 'NOT_STARTED';
                const pctStr = raw['% Complete'] || '0';
                const weightStr = raw['Weight'] || '1.0';
                const riskStr = raw['Risk Level'] || 'LOW';
                const notes = raw['Notes'] || '';
                const errors = [];
                if (!taskTitle)
                    errors.push('Kolom "Task" (Judul Tugas) wajib diisi');
                if (!sprintNumStr)
                    errors.push('Kolom "Sprint" wajib diisi');
                const sprintNum = parseInt(sprintNumStr, 10);
                const sprint = sprints.find(s => s.number === sprintNum);
                if (sprintNumStr && !sprint) {
                    errors.push(`Sprint ${sprintNumStr} tidak ditemukan dalam project ini`);
                }
                let plannedStart = plannedStartVal ? this.parseExcelDate(plannedStartVal) : null;
                let plannedEnd = plannedEndVal ? this.parseExcelDate(plannedEndVal) : null;
                if (!plannedStart)
                    errors.push('Planned Start wajib diisi');
                if (!plannedEnd)
                    errors.push('Planned End wajib diisi');
                if (sprint && plannedStart && plannedEnd) {
                    if (plannedStart < sprint.start_date || plannedEnd > sprint.end_date) {
                        errors.push(`Tanggal di luar batas sprint ${sprint.number} (${sprint.start_date.toLocaleDateString()} - ${sprint.end_date.toLocaleDateString()})`);
                    }
                }
                const roleCode = raw['Role'] || '';
                const matchedRole = roles.find(r => r.code.toUpperCase() === roleCode.toUpperCase());
                if (roleCode && !matchedRole) {
                    errors.push(`Peran fungsional "${roleCode}" tidak dikenal`);
                }
                let ownerId = null;
                let isUnassigned = false;
                if (ownerEmail && ownerEmail.toUpperCase() !== 'TBD') {
                    const matchedOwner = users.find(u => u.email.toLowerCase() === ownerEmail.toLowerCase());
                    if (matchedOwner) {
                        ownerId = matchedOwner.id;
                    }
                    else {
                        errors.push(`Owner dengan email "${ownerEmail}" tidak ditemukan`);
                    }
                }
                else {
                    isUnassigned = true;
                }
                let priority = client_1.TaskPriority.MEDIUM;
                if (priorityStr) {
                    const formatted = priorityStr.toUpperCase();
                    if (Object.values(client_1.TaskPriority).includes(formatted)) {
                        priority = formatted;
                    }
                    else {
                        errors.push(`Prioritas "${priorityStr}" tidak valid (gunakan LOW/MEDIUM/HIGH/CRITICAL)`);
                    }
                }
                let status = client_1.TaskStatus.NOT_STARTED;
                if (statusStr) {
                    const formatted = statusStr.toUpperCase().replace(/\s+/g, '_');
                    if (Object.values(client_1.TaskStatus).includes(formatted)) {
                        status = formatted;
                    }
                    else {
                        errors.push(`Status "${statusStr}" tidak valid`);
                    }
                }
                let percentComplete = 0;
                if (pctStr) {
                    const pct = Math.round(Number(pctStr) * 100);
                    percentComplete = isNaN(pct) ? 0 : Math.min(100, Math.max(0, pct));
                }
                let weight = 1.0;
                if (weightStr) {
                    weight = Number(weightStr);
                    if (isNaN(weight))
                        weight = 1.0;
                }
                let riskLevel = client_1.RiskLevel.LOW;
                if (riskStr) {
                    const formatted = riskStr.toUpperCase();
                    if (Object.values(client_1.RiskLevel).includes(formatted)) {
                        riskLevel = formatted;
                    }
                }
                const isValid = errors.length === 0;
                if (isValid)
                    validCount++;
                else
                    invalidCount++;
                previewRows.push({
                    sprintId: sprint?.id || null,
                    sprintNumber: sprintNum,
                    workstream,
                    title: taskTitle,
                    deliverable,
                    priority,
                    plannedStart: plannedStart ? plannedStart.toISOString() : null,
                    plannedEnd: plannedEnd ? plannedEnd.toISOString() : null,
                    ownerEmail: isUnassigned ? 'TBD' : ownerEmail,
                    ownerId,
                    status,
                    percentComplete,
                    weight,
                    functionalRoleId: matchedRole?.id || null,
                    roleCode,
                    riskLevel,
                    notes,
                    errors,
                    isValid
                });
            }
            const previewId = (0, crypto_1.randomUUID)();
            const previewData = {
                projectId,
                total: rawRows.length,
                valid: validCount,
                invalid: invalidCount,
                rows: previewRows
            };
            await this.redis.set(`import:preview:${previewId}`, JSON.stringify(previewData), 1800);
            return {
                previewId,
                ...previewData
            };
        }
        catch (e) {
            throw new common_1.BadRequestException(`Gagal mengurai file Excel: ${e.message}`);
        }
    }
    async commitImport(previewId) {
        const tenantId = this.getTenantId();
        const cached = await this.redis.get(`import:preview:${previewId}`);
        if (!cached) {
            throw new common_1.BadRequestException('IMPORT_PREVIEW_EXPIRED');
        }
        const previewData = JSON.parse(cached);
        const validRows = previewData.rows.filter((r) => r.isValid);
        if (validRows.length === 0) {
            throw new common_1.BadRequestException('Tidak ada baris valid yang dapat diimpor');
        }
        const projectId = previewData.projectId;
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project)
            throw new common_1.NotFoundException('Project tidak ditemukan');
        const createdTasks = [];
        let count = await this.prisma.task.count({ where: { project_id: projectId } });
        await this.prisma.$transaction(async (tx) => {
            for (const row of validRows) {
                count++;
                const ss = String(row.sprintNumber).padStart(2, '0');
                const nnnn = String(count).padStart(4, '0');
                const code = `${project.code_prefix}-${ss}-${nnnn}`;
                const task = await tx.task.create({
                    data: {
                        tenant_id: tenantId,
                        project_id: projectId,
                        sprint_id: row.sprintId,
                        functional_role_id: row.functionalRoleId,
                        code,
                        workstream: row.workstream,
                        title: row.title,
                        deliverable: row.deliverable || null,
                        priority: row.priority,
                        planned_start: new Date(row.plannedStart),
                        planned_end: new Date(row.plannedEnd),
                        status: row.status,
                        percent_complete: row.percentComplete,
                        weight: row.weight,
                        risk_level: row.riskLevel,
                        notes: row.notes || null,
                    }
                });
                if (row.ownerId) {
                    await tx.taskAssignment.create({
                        data: {
                            tenant_id: tenantId,
                            task_id: task.id,
                            user_id: row.ownerId
                        }
                    });
                    await tx.notification.create({
                        data: {
                            tenant_id: tenantId,
                            user_id: row.ownerId,
                            kind: client_1.NotificationKind.TASK_ASSIGNED,
                            payload_json: {
                                title: 'Tugas Baru Ditugaskan',
                                message: `Anda telah ditugaskan pada tugas "${task.title}" (${code})`
                            }
                        }
                    });
                }
                createdTasks.push(task);
            }
        });
        const sprintIds = Array.from(new Set(validRows.map((r) => r.sprintId)));
        for (const sprintId of sprintIds) {
            this.aggregationService.triggerRefresh(sprintId);
        }
        const userIds = Array.from(new Set(validRows.map((r) => r.ownerId).filter(id => !!id)));
        for (const userId of userIds) {
            this.aggregationService.triggerRefresh(undefined, userId);
        }
        await this.redis.del(`import:preview:${previewId}`);
        return {
            message: `${createdTasks.length} tugas berhasil diimpor`,
            tasksCount: createdTasks.length
        };
    }
    parseExcelDate(val) {
        if (val instanceof Date)
            return val;
        if (typeof val === 'number') {
            return new Date((val - 25569) * 86400 * 1000);
        }
        if (typeof val === 'string') {
            const d = new Date(val);
            if (!isNaN(d.getTime()))
                return d;
        }
        return null;
    }
};
exports.TaskService = TaskService;
exports.TaskService = TaskService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        task_aggregation_service_1.TaskAggregationService])
], TaskService);
//# sourceMappingURL=task.service.js.map