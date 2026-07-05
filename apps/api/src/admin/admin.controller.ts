import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Delete, 
  Body, 
  Param, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  NotFoundException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';
import { SystemRole, CheckinMode, EmploymentStatus } from '@hwms/shared';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcryptjs';

@Controller('admin')
@Roles(SystemRole.SUPER_ADMIN, SystemRole.HR)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(): string {
    const tenantId = tenantLocalStorage.getStore()?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Context Tenant ID tidak ditemukan');
    }
    return tenantId;
  }

  // ==========================================
  // USERS CRUD
  // ==========================================

  @Get('users')
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

  @Post('users')
  async createUser(@Body() body: any) {
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
        system_roles: body.systemRoles || [SystemRole.EMPLOYEE],
        timezone: body.timezone || 'Asia/Jakarta',
        checkin_mode: body.checkinMode || CheckinMode.TWICE,
        leave_balance: body.leaveBalance ?? 12,
        employment_status: body.employmentStatus || EmploymentStatus.AKTIF,
        joined_at: body.joinedAt ? new Date(body.joinedAt) : new Date(),
      }
    });
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    const updateData: any = {
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

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.prisma.user.delete({
      where: { id }
    });
  }

  // ==========================================
  // EXCEL IMPORT USER
  // ==========================================

  @Post('users/import/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewUserImport(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Berkas Excel tidak ditemukan');
    }

    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet) as any[];

      const departments = await this.prisma.department.findMany();
      const functionalRoles = await this.prisma.functionalRole.findMany();
      const existingUsers = await this.prisma.user.findMany();

      const previewRows: any[] = [];
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

        const errors: string[] = [];

        // Check required fields
        if (!email) errors.push('Email wajib diisi');
        if (!fullName) errors.push('Nama Lengkap wajib diisi');
        if (!nik) errors.push('NIK wajib diisi');

        // Check duplicate email
        const isEmailRegistered = existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase());
        const isDuplicateInFile = previewRows.some(r => r.email.toLowerCase() === email.toLowerCase());
        if (isEmailRegistered || isDuplicateInFile) {
          errors.push(`Email ${email} sudah terdaftar`);
        }

        // Match department
        const matchedDept = departments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
        if (deptName && !matchedDept) {
          errors.push(`Departemen "${deptName}" tidak dikenal`);
        }

        // Match functional role (either by code or name)
        const matchedRole = functionalRoles.find(
          r => r.code.toLowerCase() === roleCode.toLowerCase() || r.name.toLowerCase() === roleCode.toLowerCase()
        );
        if (roleCode && !matchedRole) {
          errors.push(`Peran fungsional "${roleCode}" tidak dikenal`);
        }

        // Match supervisor/manager
        let matchedManager: any = null;
        if (managerEmail) {
          matchedManager = existingUsers.find(u => u.email.toLowerCase() === managerEmail.toLowerCase());
          if (!matchedManager) {
            errors.push(`Atasan dengan email "${managerEmail}" tidak ditemukan`);
          }
        }

        const isValid = errors.length === 0;
        if (isValid) validCount++;
        else invalidCount++;

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
    } catch (e: any) {
      throw new BadRequestException(`Gagal mengurai file Excel: ${e.message}`);
    }
  }

  @Post('users/import/commit')
  async commitUserImport(@Body() body: { rows: any[] }) {
    if (!body.rows || !Array.isArray(body.rows)) {
      throw new BadRequestException('Data baris impor tidak valid');
    }

    const validRows = body.rows.filter(r => r.isValid);
    if (validRows.length === 0) {
      throw new BadRequestException('Tidak ada baris valid yang dapat diimpor');
    }

    const tenantId = this.getTenantId();
    const createdUsers: any[] = [];

    // Perform database transaction
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
            system_roles: [SystemRole.EMPLOYEE],
            timezone: row.timezone || 'Asia/Jakarta',
            checkin_mode: (row.checkinMode as CheckinMode) || CheckinMode.TWICE,
            leave_balance: 12,
            employment_status: EmploymentStatus.AKTIF,
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

  // ==========================================
  // UU PDP §9 SUBJECT DATA EXPORT
  // ==========================================

  @Get('users/:id/export-personal-data')
  async exportPersonalData(@Param('id') id: string) {
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
      throw new NotFoundException('Pengguna tidak ditemukan');
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

  // ==========================================
  // LOCATIONS CRUD
  // ==========================================

  @Get('locations')
  async getLocations() {
    return this.prisma.location.findMany({
      orderBy: { created_at: 'desc' }
    });
  }

  @Post('locations')
  async createLocation(@Body() body: any) {
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

  @Patch('locations/:id')
  async updateLocation(@Param('id') id: string, @Body() body: any) {
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

  @Delete('locations/:id')
  async deleteLocation(@Param('id') id: string) {
    return this.prisma.location.delete({
      where: { id }
    });
  }

  // ==========================================
  // HOLIDAYS CRUD
  // ==========================================

  @Get('holidays')
  async getHolidays() {
    return this.prisma.holiday.findMany({
      orderBy: { date: 'asc' }
    });
  }

  @Post('holidays')
  async createHoliday(@Body() body: any) {
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

  @Patch('holidays/:id')
  async updateHoliday(@Param('id') id: string, @Body() body: any) {
    return this.prisma.holiday.update({
      where: { id },
      data: {
        date: body.date ? new Date(body.date) : undefined,
        name: body.name,
        is_cuti_bersama: body.isCutiBersama !== undefined ? !!body.isCutiBersama : undefined
      }
    });
  }

  @Delete('holidays/:id')
  async deleteHoliday(@Param('id') id: string) {
    return this.prisma.holiday.delete({
      where: { id }
    });
  }

  // ==========================================
  // DEPARTMENTS CRUD
  // ==========================================

  @Get('departments')
  async getDepartments() {
    return this.prisma.department.findMany({
      orderBy: { name: 'asc' }
    });
  }

  @Post('departments')
  async createDepartment(@Body() body: any) {
    const tenantId = this.getTenantId();
    return this.prisma.department.create({
      data: {
        tenant_id: tenantId,
        name: body.name
      }
    });
  }

  @Patch('departments/:id')
  async updateDepartment(@Param('id') id: string, @Body() body: any) {
    return this.prisma.department.update({
      where: { id },
      data: {
        name: body.name
      }
    });
  }

  @Delete('departments/:id')
  async deleteDepartment(@Param('id') id: string) {
    return this.prisma.department.delete({
      where: { id }
    });
  }

  // ==========================================
  // TEAMS CRUD
  // ==========================================

  @Get('teams')
  async getTeams() {
    return this.prisma.team.findMany({
      include: { project: true },
      orderBy: { name: 'asc' }
    });
  }

  @Post('teams')
  async createTeam(@Body() body: any) {
    const tenantId = this.getTenantId();
    return this.prisma.team.create({
      data: {
        tenant_id: tenantId,
        name: body.name,
        project_id: body.projectId || null
      }
    });
  }

  @Patch('teams/:id')
  async updateTeam(@Param('id') id: string, @Body() body: any) {
    return this.prisma.team.update({
      where: { id },
      data: {
        name: body.name,
        project_id: body.projectId !== undefined ? body.projectId : undefined
      }
    });
  }

  @Delete('teams/:id')
  async deleteTeam(@Param('id') id: string) {
    return this.prisma.team.delete({
      where: { id }
    });
  }

  // ==========================================
  // FUNCTIONAL ROLES CRUD
  // ==========================================

  @Get('functional-roles')
  async getFunctionalRoles() {
    return this.prisma.functionalRole.findMany({
      orderBy: { name: 'asc' }
    });
  }

  @Post('functional-roles')
  async createFunctionalRole(@Body() body: any) {
    const tenantId = this.getTenantId();
    return this.prisma.functionalRole.create({
      data: {
        tenant_id: tenantId,
        name: body.name,
        code: body.code
      }
    });
  }

  @Patch('functional-roles/:id')
  async updateFunctionalRole(@Param('id') id: string, @Body() body: any) {
    return this.prisma.functionalRole.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code
      }
    });
  }

  @Delete('functional-roles/:id')
  async deleteFunctionalRole(@Param('id') id: string) {
    return this.prisma.functionalRole.delete({
      where: { id }
    });
  }
}
