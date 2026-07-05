"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const report_controller_1 = require("./report.controller");
const common_1 = require("@nestjs/common");
const vitest_1 = require("vitest");
const fs = require("fs");
const path = require("path");
(0, vitest_1.describe)('Report download tenant/authorization gate + presigned redirect', () => {
    const reportsDir = path.join(__dirname, '../../../../uploads/reports');
    const validKey = 'report_attendance_unit-test-123.xlsx';
    const validPath = path.join(reportsDir, validKey);
    const makeController = (findFirst, signedUrl) => {
        const scheduler = {};
        const prisma = { notification: { findFirst } };
        const objectAccess = { getSignedUrl: vitest_1.vi.fn().mockResolvedValue(signedUrl) };
        return new report_controller_1.ReportController(scheduler, prisma, objectAccess);
    };
    (0, vitest_1.beforeAll)(() => {
        fs.mkdirSync(reportsDir, { recursive: true });
        fs.writeFileSync(validPath, 'dummy-xlsx-bytes');
    });
    (0, vitest_1.afterAll)(() => {
        try {
            fs.unlinkSync(validPath);
        }
        catch { }
    });
    (0, vitest_1.it)('rejects a fileKey with no matching notification in the tenant (404)', async () => {
        const controller = makeController(vitest_1.vi.fn().mockResolvedValue(null), null);
        const res = { download: vitest_1.vi.fn(), redirect: vitest_1.vi.fn() };
        await (0, vitest_1.expect)(controller.downloadReport(validKey, res)).rejects.toBeInstanceOf(common_1.NotFoundException);
        (0, vitest_1.expect)(res.download).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.redirect).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('302-redirects to a presigned URL when object storage is available', async () => {
        const signed = 'http://minio.local/reports/' + validKey + '?X-Amz-Expires=86400&sig=abc';
        const controller = makeController(vitest_1.vi.fn().mockResolvedValue({ id: 'notif-1' }), signed);
        const res = { download: vitest_1.vi.fn(), redirect: vitest_1.vi.fn() };
        await controller.downloadReport(validKey, res);
        (0, vitest_1.expect)(res.redirect).toHaveBeenCalledWith(302, signed);
        (0, vitest_1.expect)(res.download).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('falls back to streaming the FS copy when no presigned URL is available', async () => {
        const controller = makeController(vitest_1.vi.fn().mockResolvedValue({ id: 'notif-1' }), null);
        const res = { download: vitest_1.vi.fn(), redirect: vitest_1.vi.fn() };
        await controller.downloadReport(validKey, res);
        (0, vitest_1.expect)(res.download).toHaveBeenCalledWith(validPath);
        (0, vitest_1.expect)(res.redirect).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects path traversal in the key (400) even if a notification is faked', async () => {
        const controller = makeController(vitest_1.vi.fn().mockResolvedValue({ id: 'notif-1' }), 'http://x');
        const res = { download: vitest_1.vi.fn(), redirect: vitest_1.vi.fn() };
        await (0, vitest_1.expect)(controller.downloadReport('..%2f..%2fsecret', res)).rejects.toBeInstanceOf(common_1.BadRequestException);
        (0, vitest_1.expect)(res.download).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.redirect).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=report-access.spec.js.map