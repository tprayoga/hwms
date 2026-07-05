"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedEscalation = seedEscalation;
const upsert_1 = require("../lib/upsert");
const dates_1 = require("../lib/dates");
async function seedEscalation(prisma, ctx) {
    const log = (0, upsert_1.createLogger)('33-escalation');
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
    if (!tenant) {
        log.step('tenant indotek not found — run core first; skipping.');
        log.finish();
        return;
    }
    const tenantId = tenant.id;
    const pending = await prisma.leaveRequest.findMany({
        where: { tenant_id: tenantId, status: 'PENDING' },
        orderBy: [{ user_id: 'asc' }, { date_from: 'asc' }, { type: 'asc' }],
    });
    if (pending.length === 0) {
        log.step('no PENDING leaves found — run 12-leave first; skipping.');
        log.finish();
        return;
    }
    const target = pending[0];
    const backdated = (0, dates_1.jamLokal)('Asia/Jakarta', 9, 0, (0, dates_1.hariKerja)(-7));
    await prisma.leaveRequest.update({
        where: { id: target.id },
        data: { created_at: backdated, escalated_at: null },
    });
    log.step(`backdated PENDING leave ${target.id} (user ${target.user_id}) created_at -> ${backdated.toISOString()} ` +
        `(${pending.length} pending total)`);
    log.count('escalation_candidates', 1);
    log.finish();
}
//# sourceMappingURL=33-escalation.js.map