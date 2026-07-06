import { ReportController } from './report.controller';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';

/**
 * Report download authorization + streaming (§7, GAP §4.1.1).
 * The endpoint is scoped to HR/SUPER_ADMIN (guard-level, exercised elsewhere)
 * and the fileKey must belong to a report notification in the caller's tenant.
 * The bytes are streamed through the authenticated API (StorageService abstracts
 * MinIO vs the local-FS fallback) rather than 302-redirecting to a presigned
 * MinIO URL, which points at the internal host the browser cannot reach.
 */
describe('Report download tenant/authorization gate + streaming', () => {
  const validKey = 'report_attendance_unit-test-123.xlsx';

  const makeController = (findFirst: any, fileBuffer: Buffer | null) => {
    const scheduler = {} as any;
    const prisma = { notification: { findFirst } } as any;
    const storage = { getFile: vi.fn().mockResolvedValue(fileBuffer) } as any;
    return new ReportController(scheduler, prisma, storage);
  };

  const makeRes = () => ({ set: vi.fn(), send: vi.fn(), redirect: vi.fn() }) as any;

  it('rejects a fileKey with no matching notification in the tenant (404)', async () => {
    const controller = makeController(vi.fn().mockResolvedValue(null), Buffer.from('x'));
    const res = makeRes();
    await expect(controller.downloadReport(validKey, res)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('streams the report bytes when found', async () => {
    const bytes = Buffer.from('dummy-xlsx-bytes');
    const controller = makeController(vi.fn().mockResolvedValue({ id: 'notif-1' }), bytes);
    const res = makeRes();
    await controller.downloadReport(validKey, res);
    expect(res.send).toHaveBeenCalledWith(bytes);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${validKey}"`,
      }),
    );
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('404 when the report is missing from storage', async () => {
    const controller = makeController(vi.fn().mockResolvedValue({ id: 'notif-1' }), null);
    const res = makeRes();
    await expect(controller.downloadReport(validKey, res)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('rejects path traversal in the key (400) even if a notification is faked', async () => {
    const controller = makeController(vi.fn().mockResolvedValue({ id: 'notif-1' }), Buffer.from('x'));
    const res = makeRes();
    await expect(controller.downloadReport('..%2f..%2fsecret', res)).rejects.toBeInstanceOf(BadRequestException);
    expect(res.send).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
