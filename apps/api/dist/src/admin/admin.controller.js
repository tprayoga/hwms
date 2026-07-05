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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const prisma_service_1 = require("../prisma/prisma.service");
const roles_decorator_1 = require("../auth/roles.decorator");
const shared_1 = require("@hwms/shared");
const tenant_storage_1 = require("../prisma/tenant-storage");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
let AdminController = class AdminController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    getTenantId() {
        const tenantId = tenant_storage_1.tenantLocalStorage.getStore()?.tenantId;
        if (!tenantId) {
            throw new common_1.BadRequestException('Context Tenant ID tidak ditemukan');
        }
        return tenantId;
    }
    async getUsers() {
        return this.prisma.user.findMany({
            include: {
                department: true,
                functional_role: true,
                manager: true
            },
            orderBy: { created_at: 'desc' }
        });
    }
    async createUser(body) {
        const tenantId = this.getTenantId();
        const passwordHash = await bcrypt.hash(body.password || 'UserPassword123', 10);
        return this.prisma.user.create({
            data: {
                tenant_id: tenantId,
                email: body.email,
                password_hash: passwordHash,
                full_name: body.fullName,
                nik: body.nik,
                department_id: body.departmentId || null,
                functional_role_id: body.functionalRoleId || null,
                manager_id: body.managerId || null,
                system_roles: body.systemRoles || [shared_1.SystemRole.EMPLOYEE],
                timezone: body.timezone || 'Asia/Jakarta',
                checkin_mode: body.checkinMode || shared_1.CheckinMode.TWICE,
                leave_balance: body.leaveBalance ?? 12,
                employment_status: body.employmentStatus || shared_1.EmploymentStatus.AKTIF,
                joined_at: body.joinedAt ? new Date(body.joinedAt) : new Date(),
            }
        });
    }
    async updateUser(id, body) {
        const updateData = {
            email: body.email,
            full_name: body.fullName,
            nik: body.nik,
            department_id: body.departmentId,
            functional_role_id: body.functionalRoleId,
            manager_id: body.managerId,
            system_roles: body.systemRoles,
            timezone: body.timezone,
            checkin_mode: body.checkinMode,
            leave_balance: body.leaveBalance,
            employment_status: body.employmentStatus,
        };
        if (body.joinedAt) {
            updateData.joined_at = new Date(body.joinedAt);
        }
        if (body.password) {
            updateData.password_hash = await bcrypt.hash(body.password, 10);
        }
        return this.prisma.user.update({
            where: { id },
            data: updateData
        });
    }
    async deleteUser(id) {
        return this.prisma.user.delete({
            where: { id }
        });
    }
    async previewUserImport(file) {
        if (!file) {
            throw new common_1.BadRequestException('Berkas Excel tidak ditemukan');
        }
        try {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rawRows = XLSX.utils.sheet_to_json(sheet);
            const departments = await this.prisma.department.findMany();
            const functionalRoles = await this.prisma.functionalRole.findMany();
            const existingUsers = await this.prisma.user.findMany();
            const previewRows = [];
            let validCount = 0;
            let invalidCount = 0;
            for (const raw of rawRows) {
                const email = raw['Email'] || '';
                const fullName = raw['Nama Lengkap'] || '';
                const nik = String(raw['NIK'] || '');
                const deptName = raw['Departemen'] || '';
                const roleCode = raw['Peran Fungsional'] || '';
                const timezone = raw['Zona Waktu'] || 'Asia/Jakarta';
                const checkinMode = raw['Check-in Mode'] || 'TWICE';
                const managerEmail = raw['Email Atasan'] || '';
                const password = raw['Sandi'] || 'UserPassword123';
                const errors = [];
                if (!email)
                    errors.push('Email wajib diisi');
                if (!fullName)
                    errors.push('Nama Lengkap wajib diisi');
                if (!nik)
                    errors.push('NIK wajib diisi');
                const isEmailRegistered = existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase());
                const isDuplicateInFile = previewRows.some(r => r.email.toLowerCase() === email.toLowerCase());
                if (isEmailRegistered || isDuplicateInFile) {
                    errors.push(`Email ${email} sudah terdaftar`);
                }
                const matchedDept = departments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
                if (deptName && !matchedDept) {
                    errors.push(`Departemen "${deptName}" tidak dikenal`);
                }
                const matchedRole = functionalRoles.find(r => r.code.toLowerCase() === roleCode.toLowerCase() || r.name.toLowerCase() === roleCode.toLowerCase());
                if (roleCode && !matchedRole) {
                    errors.push(`Peran fungsional "${roleCode}" tidak dikenal`);
                }
                let matchedManager = null;
                if (managerEmail) {
                    matchedManager = existingUsers.find(u => u.email.toLowerCase() === managerEmail.toLowerCase());
                    if (!matchedManager) {
                        errors.push(`Atasan dengan email "${managerEmail}" tidak ditemukan`);
                    }
                }
                const isValid = errors.length === 0;
                if (isValid)
                    validCount++;
                else
                    invalidCount++;
                previewRows.push({
                    email,
                    fullName,
                    nik,
                    departmentName: deptName,
                    departmentId: matchedDept?.id || null,
                    functionalRoleCode: roleCode,
                    functionalRoleId: matchedRole?.id || null,
                    timezone,
                    checkinMode,
                    managerEmail,
                    managerId: matchedManager?.id || null,
                    password,
                    errors,
                    isValid
                });
            }
            return {
                total: rawRows.length,
                valid: validCount,
                invalid: invalidCount,
                rows: previewRows
            };
        }
        catch (e) {
            throw new common_1.BadRequestException(`Gagal mengurai file Excel: ${e.message}`);
        }
    }
    async commitUserImport(body) {
        if (!body.rows || !Array.isArray(body.rows)) {
            throw new common_1.BadRequestException('Data baris impor tidak valid');
        }
        const validRows = body.rows.filter(r => r.isValid);
        if (validRows.length === 0) {
            throw new common_1.BadRequestException('Tidak ada baris valid yang dapat diimpor');
        }
        const tenantId = this.getTenantId();
        const createdUsers = [];
        await this.prisma.$transaction(async (tx) => {
            for (const row of validRows) {
                const passwordHash = await bcrypt.hash(row.password || 'UserPassword123', 10);
                const user = await tx.user.create({
                    data: {
                        tenant_id: tenantId,
                        email: row.email,
                        password_hash: passwordHash,
                        full_name: row.fullName,
                        nik: row.nik,
                        department_id: row.departmentId,
                        functional_role_id: row.functionalRoleId,
                        manager_id: row.managerId,
                        system_roles: [shared_1.SystemRole.EMPLOYEE],
                        timezone: row.timezone || 'Asia/Jakarta',
                        checkin_mode: row.checkinMode || shared_1.CheckinMode.TWICE,
                        leave_balance: 12,
                        employment_status: shared_1.EmploymentStatus.AKTIF,
                        joined_at: new Date()
                    }
                });
                createdUsers.push(user);
            }
        });
        return {
            message: `${createdUsers.length} pengguna berhasil diimpor`,
            usersCount: createdUsers.length
        };
    }
    async exportPersonalData(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                department: true,
                functional_role: true,
                checkins: {
                    include: {
                        standup_items: true
                    }
                },
                leave_requests: true,
                wfh_quotas: true,
                scorecards: true,
                notifications: true,
                audit_logs: true
            }
        });
        if (!user) {
            throw new common_1.NotFoundException('Pengguna tidak ditemukan');
        }
        const { password_hash, ...safeUserData } = user;
        return {
            compliance: {
                regulation: 'UU PDP No. 27 Tahun 2022 Pasal 9 (Hak Pemilik Data Pribadi)',
                exportedAt: new Date().toISOString(),
                tenant: 'PT Indotek Buana Karya'
            },
            personalData: safeUserData
        };
    }
    async getLocations() {
        return this.prisma.location.findMany({
            orderBy: { created_at: 'desc' }
        });
    }
    async createLocation(body) {
        const tenantId = this.getTenantId();
        return this.prisma.location.create({
            data: {
                tenant_id: tenantId,
                name: body.name,
                type: body.type,
                lat: body.lat ? parseFloat(body.lat) : null,
                lng: body.lng ? parseFloat(body.lng) : null,
                radius_m: body.radiusM ? parseInt(body.radiusM) : 200
            }
        });
    }
    async updateLocation(id, body) {
        return this.prisma.location.update({
            where: { id },
            data: {
                name: body.name,
                type: body.type,
                lat: body.lat ? parseFloat(body.lat) : null,
                lng: body.lng ? parseFloat(body.lng) : null,
                radius_m: body.radiusM ? parseInt(body.radiusM) : undefined
            }
        });
    }
    async deleteLocation(id) {
        return this.prisma.location.delete({
            where: { id }
        });
    }
    async getHolidays() {
        return this.prisma.holiday.findMany({
            orderBy: { date: 'asc' }
        });
    }
    async createHoliday(body) {
        const tenantId = this.getTenantId();
        return this.prisma.holiday.create({
            data: {
                tenant_id: tenantId,
                date: new Date(body.date),
                name: body.name,
                is_cuti_bersama: !!body.isCutiBersama
            }
        });
    }
    async updateHoliday(id, body) {
        return this.prisma.holiday.update({
            where: { id },
            data: {
                date: body.date ? new Date(body.date) : undefined,
                name: body.name,
                is_cuti_bersama: body.isCutiBersama !== undefined ? !!body.isCutiBersama : undefined
            }
        });
    }
    async deleteHoliday(id) {
        return this.prisma.holiday.delete({
            where: { id }
        });
    }
    async getDepartments() {
        return this.prisma.department.findMany({
            orderBy: { name: 'asc' }
        });
    }
    async createDepartment(body) {
        const tenantId = this.getTenantId();
        return this.prisma.department.create({
            data: {
                tenant_id: tenantId,
                name: body.name
            }
        });
    }
    async updateDepartment(id, body) {
        return this.prisma.department.update({
            where: { id },
            data: {
                name: body.name
            }
        });
    }
    async deleteDepartment(id) {
        return this.prisma.department.delete({
            where: { id }
        });
    }
    async getTeams() {
        return this.prisma.team.findMany({
            include: { project: true },
            orderBy: { name: 'asc' }
        });
    }
    async createTeam(body) {
        const tenantId = this.getTenantId();
        return this.prisma.team.create({
            data: {
                tenant_id: tenantId,
                name: body.name,
                project_id: body.projectId || null
            }
        });
    }
    async updateTeam(id, body) {
        return this.prisma.team.update({
            where: { id },
            data: {
                name: body.name,
                project_id: body.projectId !== undefined ? body.projectId : undefined
            }
        });
    }
    async deleteTeam(id) {
        return this.prisma.team.delete({
            where: { id }
        });
    }
    async getFunctionalRoles() {
        return this.prisma.functionalRole.findMany({
            orderBy: { name: 'asc' }
        });
    }
    async createFunctionalRole(body) {
        const tenantId = this.getTenantId();
        return this.prisma.functionalRole.create({
            data: {
                tenant_id: tenantId,
                name: body.name,
                code: body.code
            }
        });
    }
    async updateFunctionalRole(id, body) {
        return this.prisma.functionalRole.update({
            where: { id },
            data: {
                name: body.name,
                code: body.code
            }
        });
    }
    async deleteFunctionalRole(id) {
        return this.prisma.functionalRole.delete({
            where: { id }
        });
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('users'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getUsers", null);
__decorate([
    (0, common_1.Post)('users'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createUser", null);
__decorate([
    (0, common_1.Patch)('users/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Delete)('users/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteUser", null);
__decorate([
    (0, common_1.Post)('users/import/preview'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "previewUserImport", null);
__decorate([
    (0, common_1.Post)('users/import/commit'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "commitUserImport", null);
__decorate([
    (0, common_1.Get)('users/:id/export-personal-data'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "exportPersonalData", null);
__decorate([
    (0, common_1.Get)('locations'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getLocations", null);
__decorate([
    (0, common_1.Post)('locations'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createLocation", null);
__decorate([
    (0, common_1.Patch)('locations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateLocation", null);
__decorate([
    (0, common_1.Delete)('locations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteLocation", null);
__decorate([
    (0, common_1.Get)('holidays'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getHolidays", null);
__decorate([
    (0, common_1.Post)('holidays'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createHoliday", null);
__decorate([
    (0, common_1.Patch)('holidays/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateHoliday", null);
__decorate([
    (0, common_1.Delete)('holidays/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteHoliday", null);
__decorate([
    (0, common_1.Get)('departments'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getDepartments", null);
__decorate([
    (0, common_1.Post)('departments'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createDepartment", null);
__decorate([
    (0, common_1.Patch)('departments/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateDepartment", null);
__decorate([
    (0, common_1.Delete)('departments/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteDepartment", null);
__decorate([
    (0, common_1.Get)('teams'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getTeams", null);
__decorate([
    (0, common_1.Post)('teams'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createTeam", null);
__decorate([
    (0, common_1.Patch)('teams/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateTeam", null);
__decorate([
    (0, common_1.Delete)('teams/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteTeam", null);
__decorate([
    (0, common_1.Get)('functional-roles'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getFunctionalRoles", null);
__decorate([
    (0, common_1.Post)('functional-roles'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createFunctionalRole", null);
__decorate([
    (0, common_1.Patch)('functional-roles/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateFunctionalRole", null);
__decorate([
    (0, common_1.Delete)('functional-roles/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteFunctionalRole", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.HR),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map