import { AdminController } from './admin.controller';
import { PrismaService } from '../prisma/prisma.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import * as XLSX from 'xlsx';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';

describe('Admin User Import Validation', () => {
  let controller: AdminController;
  let prisma: PrismaService;
  let tenantId: string;

  beforeAll(async () => {
    // Manually instantiate services to bypass Vitest's constructor metadata injection limitation
    prisma = new PrismaService();
    await prisma.onModuleInit();

    controller = new AdminController(prisma);

    // Retrieve default tenant ID
    const defaultTenant = await prisma.tenant.findUnique({
      where: { slug: 'indotek' },
    });
    tenantId = defaultTenant!.id;
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('should parse Excel file and validate rows correctly', async () => {
    // Construct in-memory test Excel file
    const importData = [
      {
        'Email': 'valid.imported@indotek.com',
        'Nama Lengkap': 'Valid Imported',
        'NIK': 'NIK-IMP-01',
        'Departemen': 'Engineering',
        'Peran Fungsional': 'BE',
        'Email Atasan': 'superadmin@indotek.com',
        'Sandi': 'Password123'
      },
      {
        'Email': 'superadmin@indotek.com', // Duplicate email (from seed)
        'Nama Lengkap': 'Super Admin Duplicate',
        'NIK': 'SA-001',
        'Departemen': 'UnknownDept', // Invalid Department
        'Peran Fungsional': 'InvalidRole', // Invalid Role
        'Email Atasan': 'unknown.manager@indotek.com', // Invalid Manager
        'Sandi': 'Password123'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(importData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Karyawan');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'karyawan_import.xlsx',
      encoding: '7bit',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: excelBuffer,
      size: excelBuffer.length,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    // Run preview inside tenantLocalStorage context
    const result = await tenantLocalStorage.run({ tenantId }, async () => {
      return controller.previewUserImport(mockFile);
    });

    expect(result.total).toBe(2);
    expect(result.valid).toBe(1);
    expect(result.invalid).toBe(1);

    const validRow = result.rows.find(r => r.email === 'valid.imported@indotek.com');
    expect(validRow).toBeDefined();
    expect(validRow.isValid).toBe(true);
    expect(validRow.errors).toHaveLength(0);

    const invalidRow = result.rows.find(r => r.email === 'superadmin@indotek.com');
    expect(invalidRow).toBeDefined();
    expect(invalidRow.isValid).toBe(false);
    expect(invalidRow.errors).toContain('Email superadmin@indotek.com sudah terdaftar');
    expect(invalidRow.errors).toContain('Departemen "UnknownDept" tidak dikenal');
    expect(invalidRow.errors).toContain('Peran fungsional "InvalidRole" tidak dikenal');
    expect(invalidRow.errors).toContain('Atasan dengan email "unknown.manager@indotek.com" tidak ditemukan');
  });
});
