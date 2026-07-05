"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedPolicies = seedPolicies;
const client_1 = require("@prisma/client");
const upsert_1 = require("../lib/upsert");
const policy_constants_1 = require("../../../src/attendance/policy.constants");
const NOC_DEPT_NAME = 'NOC';
async function seedPolicies(prisma, ctx) {
    const log = (0, upsert_1.createLogger)('30-policies');
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
    if (!tenant) {
        log.step('tenant indotek not found — run core first; skipping.');
        log.finish();
        return;
    }
    const tenantId = tenant.id;
    await (0, upsert_1.findOrCreate)(prisma.policy, { tenant_id: tenantId, scope_type: client_1.PolicyScopeType.TENANT, scope_id: tenantId }, {
        tenant_id: tenantId,
        scope_type: client_1.PolicyScopeType.TENANT,
        scope_id: tenantId,
        checkin_window_start: policy_constants_1.DEFAULT_TENANT_POLICY.checkin_window_start,
        checkin_window_end: policy_constants_1.DEFAULT_TENANT_POLICY.checkin_window_end,
        auto_checkout_at: policy_constants_1.DEFAULT_TENANT_POLICY.auto_checkout_at,
        default_checkin_mode: policy_constants_1.DEFAULT_TENANT_POLICY.default_checkin_mode,
        wfh_days_per_week: policy_constants_1.DEFAULT_TENANT_POLICY.wfh_days_per_week,
        mandatory_wfo_weekdays: [...policy_constants_1.DEFAULT_TENANT_POLICY.mandatory_wfo_weekdays],
    });
    log.count('tenant_policy');
    const noc = await (0, upsert_1.findOrCreate)(prisma.department, { tenant_id: tenantId, name: NOC_DEPT_NAME }, { tenant_id: tenantId, name: NOC_DEPT_NAME });
    await (0, upsert_1.findOrCreate)(prisma.policy, { tenant_id: tenantId, scope_type: client_1.PolicyScopeType.DEPARTMENT, scope_id: noc.id }, {
        tenant_id: tenantId,
        scope_type: client_1.PolicyScopeType.DEPARTMENT,
        scope_id: noc.id,
        checkin_window_start: '06:00',
        checkin_window_end: '22:00',
        auto_checkout_at: '22:00',
        default_checkin_mode: policy_constants_1.DEFAULT_TENANT_POLICY.default_checkin_mode,
        wfh_days_per_week: 5,
        mandatory_wfo_weekdays: [],
    });
    log.count('department_policy');
    log.finish();
}
//# sourceMappingURL=30-policies.js.map