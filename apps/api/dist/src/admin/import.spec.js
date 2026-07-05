"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin_controller_1 = require("./admin.controller");
const prisma_service_1 = require("../prisma/prisma.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const XLSX = require("xlsx");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Admin User Import Validation', () => {
    let controller;
    let prisma;
    let tenantId;
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        controller = new admin_controller_1.AdminController(prisma);
        const defaultTenant = await prisma.tenant.findUnique({
            where: { slug: 'indotek' },
        });
        tenantId = defaultTenant.id;
    });
    (0, vitest_1.afterAll)(async () => {
        await prisma.onModuleDestroy();
    });
    (0, vitest_1.it)('should parse Excel file and validate rows correctly', async () => {
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
                'Email': 'superadmin@indotek.com',
                'Nama Lengkap': 'Super Admin Duplicate',
                'NIK': 'SA-001',
                'Departemen': 'UnknownDept',
                'Peran Fungsional': 'InvalidRole',
                'Email Atasan': 'unknown.manager@indotek.com',
                'Sandi': 'Password123'
            }
        ];
        const worksheet = XLSX.utils.json_to_sheet(importData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Karyawan');
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const mockFile = {
            fieldname: 'file',
            originalname: 'karyawan_import.xlsx',
            encoding: '7bit',
            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: excelBuffer,
            size: excelBuffer.length,
            stream: null,
            destination: '',
            filename: '',
            path: '',
        };
        const result = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            return controller.previewUserImport(mockFile);
        });
        (0, vitest_1.expect)(result.total).toBe(2);
        (0, vitest_1.expect)(result.valid).toBe(1);
        (0, vitest_1.expect)(result.invalid).toBe(1);
        const validRow = result.rows.find(r => r.email === 'valid.imported@indotek.com');
        (0, vitest_1.expect)(validRow).toBeDefined();
        (0, vitest_1.expect)(validRow.isValid).toBe(true);
        (0, vitest_1.expect)(validRow.errors).toHaveLength(0);
        const invalidRow = result.rows.find(r => r.email === 'superadmin@indotek.com');
        (0, vitest_1.expect)(invalidRow).toBeDefined();
        (0, vitest_1.expect)(invalidRow.isValid).toBe(false);
        (0, vitest_1.expect)(invalidRow.errors).toContain('Email superadmin@indotek.com sudah terdaftar');
        (0, vitest_1.expect)(invalidRow.errors).toContain('Departemen "UnknownDept" tidak dikenal');
        (0, vitest_1.expect)(invalidRow.errors).toContain('Peran fungsional "InvalidRole" tidak dikenal');
        (0, vitest_1.expect)(invalidRow.errors).toContain('Atasan dengan email "unknown.manager@indotek.com" tidak ditemukan');
    });
});
//# sourceMappingURL=import.spec.js.map