"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const report_controller_1 = require("./report.controller");
const common_1 = require("@nestjs/common");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Report download tenant/authorization gate + streaming', () => {
    const validKey = 'report_attendance_unit-test-123.xlsx';
    const makeController = (findFirst, fileBuffer) => {
        const scheduler = {};
        const prisma = { notification: { findFirst } };
        const storage = { getFile: vitest_1.vi.fn().mockResolvedValue(fileBuffer) };
        return new report_controller_1.ReportController(scheduler, prisma, storage);
    };
    const makeRes = () => ({ set: vitest_1.vi.fn(), send: vitest_1.vi.fn(), redirect: vitest_1.vi.fn() });
    (0, vitest_1.it)('rejects a fileKey with no matching notification in the tenant (404)', async () => {
        const controller = makeController(vitest_1.vi.fn().mockResolvedValue(null), Buffer.from('x'));
        const res = makeRes();
        await (0, vitest_1.expect)(controller.downloadReport(validKey, res)).rejects.toBeInstanceOf(common_1.NotFoundException);
        (0, vitest_1.expect)(res.send).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('streams the report bytes when found', async () => {
        const bytes = Buffer.from('dummy-xlsx-bytes');
        const controller = makeController(vitest_1.vi.fn().mockResolvedValue({ id: 'notif-1' }), bytes);
        const res = makeRes();
        await controller.downloadReport(validKey, res);
        (0, vitest_1.expect)(res.send).toHaveBeenCalledWith(bytes);
        (0, vitest_1.expect)(res.set).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${validKey}"`,
        }));
        (0, vitest_1.expect)(res.redirect).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('404 when the report is missing from storage', async () => {
        const controller = makeController(vitest_1.vi.fn().mockResolvedValue({ id: 'notif-1' }), null);
        const res = makeRes();
        await (0, vitest_1.expect)(controller.downloadReport(validKey, res)).rejects.toBeInstanceOf(common_1.NotFoundException);
        (0, vitest_1.expect)(res.send).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects path traversal in the key (400) even if a notification is faked', async () => {
        const controller = makeController(vitest_1.vi.fn().mockResolvedValue({ id: 'notif-1' }), Buffer.from('x'));
        const res = makeRes();
        await (0, vitest_1.expect)(controller.downloadReport('..%2f..%2fsecret', res)).rejects.toBeInstanceOf(common_1.BadRequestException);
        (0, vitest_1.expect)(res.send).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.redirect).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=report-access.spec.js.map