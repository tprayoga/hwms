"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TENANT_POLICY = void 0;
const client_1 = require("@prisma/client");
exports.DEFAULT_TENANT_POLICY = {
    checkin_window_start: '08:00',
    checkin_window_end: '10:00',
    auto_checkout_at: '18:00',
    default_checkin_mode: client_1.CheckinMode.TWICE,
    wfh_days_per_week: 2,
    mandatory_wfo_weekdays: [2, 4],
};
//# sourceMappingURL=policy.constants.js.map