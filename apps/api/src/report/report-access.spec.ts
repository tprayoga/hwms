import { ReportController } from './report.controller';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Report download authorization + presigned migration (§7, GAP §4.1.1).
 * The endpoint is no longer @Public: it is scoped to HR/SUPER_ADMIN (guard-level,
 * exercised elsewhere) and the fileKey must belong to a report notification in
 * the caller's tenant. When object storage is available it 302-redirects to a
 * presigned 24h URL; otherwise it streams the local FS copy.
 */
describe('Report download tenant/authorization gate + presigned redirect', () => {
  const reportsDir = path.join(__dirname, '../../../../uploads/reports');
  const validKey = 'report_attendance_unit-test-123.xlsx';
  const validPath = path.join(reportsDir, validKey);

  const makeController = (findFirst: any, signedUrl: string | null) => {
    const scheduler = {} as any;
    const prisma = { notification: { findFirst } } as any;
    const objectAccess = { getSignedUrl: vi.fn().mockResolvedValue(signedUrl) } as any;
    return new ReportController(scheduler, prisma, objectAccess);
  };

  beforeAll(() => {
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(validPath, 'dummy-xlsx-bytes');
  });

  afterAll(() => {
    try { fs.unlinkSync(validPath); } catch {}
  });

  it('rejects a fileKey with no matching notification in the tenant (404)', async () => {
    const controller = makeController(vi.fn().mockResolvedValue(null), null);
    const res = { download: vi.fn(), redirect: vi.fn() } as any;
    await expect(controller.downloadReport(validKey, res)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.download).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('302-redirects to a presigned URL when object storage is available', async () => {
    const signed = 'http://minio.local/reports/' + validKey + '?X-Amz-Expires=86400&sig=abc';
    const controller = makeController(vi.fn().mockResolvedValue({ id: 'notif-1' }), signed);
    const res = { download: vi.fn(), redirect: vi.fn() } as any;
    await controller.downloadReport(validKey, res);
    expect(res.redirect).toHaveBeenCalledWith(302, signed);
    expect(res.download).not.toHaveBeenCalled();
  });

  it('falls back to streaming the FS copy when no presigned URL is available', async () => {
    const controller = makeController(vi.fn().mockResolvedValue({ id: 'notif-1' }), null);
    const res = { download: vi.fn(), redirect: vi.fn() } as any;
    await controller.downloadReport(validKey, res);
    expect(res.download).toHaveBeenCalledWith(validPath);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('rejects path traversal in the key (400) even if a notification is faked', async () => {
    const controller = makeController(vi.fn().mockResolvedValue({ id: 'notif-1' }), 'http://x');
    const res = { download: vi.fn(), redirect: vi.fn() } as any;
    await expect(controller.downloadReport('..%2f..%2fsecret', res)).rejects.toBeInstanceOf(BadRequestException);
    expect(res.download).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
