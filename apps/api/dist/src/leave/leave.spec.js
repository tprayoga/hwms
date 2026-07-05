"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const leave_service_1 = require("./leave.service");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_service_1 = require("../storage/storage.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const client_1 = require("@prisma/client");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Leave Requests & Approvals Integration', () => {
    let service;
    let prisma;
    let tenantId;
    let employeeId;
    let managerId;
    let testLeaveRequestId;
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        const storageService = new storage_service_1.StorageService();
        service = new leave_service_1.LeaveService(prisma, storageService);
        const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
        tenantId = tenant.id;
        const superAdmin = await prisma.user.findFirst({
            where: { email: 'superadmin@indotek.com' }
        });
        managerId = superAdmin.id;
        const employee = await tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
            return prisma.user.create({
                data: {
                    tenant_id: tenantId,
                    email: 'employee-leave-test@indotek.com',
                    full_name: 'Employee Leave Test',
                    nik: 'NIK-LEAVE-01',
                    password_hash: 'hash',
                    system_roles: ['EMPLOYEE'],
                    manager_id: managerId,
                    leave_balance: 10,
                    joined_at: new Date()
                }
            });
        });
        employeeId = employee.id;
    });
    (0, vitest_1.afterAll)(async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            if (employeeId) {
                await prisma.notification.deleteMany({ where: { user_id: employeeId } });
                await prisma.notification.deleteMany({ where: { user_id: managerId } });
                await prisma.leaveRequest.deleteMany({ where: { user_id: employeeId } });
                await prisma.user.delete({ where: { id: employeeId } });
            }
        });
    });
    (0, vitest_1.it)('should block CUTI submission if requested days exceed balance', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const body = {
                type: client_1.LeaveType.CUTI,
                dateFromStr: '2026-07-01',
                dateToStr: '2026-07-12',
                reason: 'Long summer holiday'
            };
            await (0, vitest_1.expect)(service.applyLeave(employeeId, body)).rejects.toThrow('INSUFFICIENT_LEAVE_BALANCE');
        });
    });
    (0, vitest_1.it)('should block SAKIT submission if doctor attachment is missing', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const body = {
                type: client_1.LeaveType.SAKIT,
                dateFromStr: '2026-07-01',
                dateToStr: '2026-07-02',
                reason: 'Fever'
            };
            await (0, vitest_1.expect)(service.applyLeave(employeeId, body)).rejects.toThrow('ATTACHMENT_REQUIRED_FOR_SICK_LEAVE');
        });
    });
    (0, vitest_1.it)('should submit PENDING CUTI request without immediately deducting balance, and log APPROVAL_IN notification', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const body = {
                type: client_1.LeaveType.CUTI,
                dateFromStr: '2026-07-01',
                dateToStr: '2026-07-03',
                reason: 'Family visit'
            };
            const request = await service.applyLeave(employeeId, body);
            testLeaveRequestId = request.id;
            (0, vitest_1.expect)(request.status).toBe(client_1.LeaveStatus.PENDING);
            const user = await prisma.user.findUnique({ where: { id: employeeId } });
            (0, vitest_1.expect)(user?.leave_balance).toBe(10);
            const notifications = await prisma.notification.findMany({
                where: { user_id: managerId, kind: client_1.NotificationKind.APPROVAL_IN }
            });
            (0, vitest_1.expect)(notifications.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(notifications[0].payload_json.requestId).toBe(request.id);
        });
    });
    (0, vitest_1.it)('should allow manager to approve CUTI request, deduct balance, and log APPROVAL_DECIDED notification', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const request = await service.decideLeaveRequest(managerId, testLeaveRequestId, {
                status: 'APPROVED',
                decisionNote: 'Enjoy your break!'
            });
            (0, vitest_1.expect)(request.status).toBe(client_1.LeaveStatus.APPROVED);
            const user = await prisma.user.findUnique({ where: { id: employeeId } });
            (0, vitest_1.expect)(user?.leave_balance).toBe(7);
            const notifications = await prisma.notification.findMany({
                where: { user_id: employeeId, kind: client_1.NotificationKind.APPROVAL_DECIDED }
            });
            (0, vitest_1.expect)(notifications.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(notifications[0].payload_json.status).toBe('APPROVED');
        });
    });
    (0, vitest_1.it)('should allow cancellation of approved CUTI request and refund balance', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const request = await service.cancelLeaveRequest(employeeId, testLeaveRequestId);
            (0, vitest_1.expect)(request.status).toBe(client_1.LeaveStatus.CANCELLED);
            const user = await prisma.user.findUnique({ where: { id: employeeId } });
            (0, vitest_1.expect)(user?.leave_balance).toBe(10);
        });
    });
});
//# sourceMappingURL=leave.spec.js.map