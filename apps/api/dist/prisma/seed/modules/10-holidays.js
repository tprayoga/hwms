"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedHolidays = seedHolidays;
const upsert_1 = require("../lib/upsert");
const HOLIDAYS = [
    [1, 1, 'Tahun Baru Masehi', false],
    [2, 17, 'Tahun Baru Imlek', false],
    [3, 18, 'Hari Suci Nyepi', false],
    [3, 20, 'Hari Raya Idul Fitri (Hari Ke-1)', false],
    [3, 21, 'Hari Raya Idul Fitri (Hari Ke-2)', false],
    [3, 23, 'Cuti Bersama Idul Fitri', true],
    [3, 24, 'Cuti Bersama Idul Fitri', true],
    [4, 3, 'Wafat Isa Almasih', false],
    [5, 1, 'Hari Buruh Internasional', false],
    [5, 27, 'Hari Raya Idul Adha', false],
    [6, 1, 'Hari Lahir Pancasila', false],
    [6, 16, 'Tahun Baru Islam', false],
    [8, 17, 'Hari Kemerdekaan RI', false],
    [12, 25, 'Hari Raya Natal', false],
];
async function seedHolidays(prisma, ctx) {
    const log = (0, upsert_1.createLogger)('10-holidays');
    const year = ctx.anchor.getUTCFullYear();
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
    if (!tenant) {
        log.step('tenant indotek not found — run core first; skipping.');
        log.finish();
        return;
    }
    for (const [month, day, name, cutiBersama] of HOLIDAYS) {
        const date = new Date(Date.UTC(year, month - 1, day));
        await (0, upsert_1.upsertBy)(prisma.holiday, { tenant_id_date: { tenant_id: tenant.id, date } }, { tenant_id: tenant.id, date, name, is_cuti_bersama: cutiBersama }, { name, is_cuti_bersama: cutiBersama });
        log.count(cutiBersama ? 'cuti_bersama' : 'nasional');
    }
    log.finish();
}
//# sourceMappingURL=10-holidays.js.map