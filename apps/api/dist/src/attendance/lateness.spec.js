"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const attendance_service_1 = require("./attendance.service");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Timezone-aware Check-in Lateness Calculation', () => {
    let service;
    (0, vitest_1.beforeAll)(() => {
        service = new attendance_service_1.AttendanceService(null, null);
    });
    (0, vitest_1.it)('should flag lateness correctly for Asia/Jakarta (WIB) timezone', () => {
        const policyEnd = '10:00';
        const onTimeWIB = new Date('2026-07-04T02:30:00Z');
        (0, vitest_1.expect)(service.checkLateness(onTimeWIB, 'Asia/Jakarta', policyEnd)).toBe(false);
        const lateWIB = new Date('2026-07-04T03:15:00Z');
        (0, vitest_1.expect)(service.checkLateness(lateWIB, 'Asia/Jakarta', policyEnd)).toBe(true);
    });
    (0, vitest_1.it)('should flag lateness correctly for Asia/Makassar (WITA) timezone', () => {
        const policyEnd = '10:00';
        const onTimeWITA = new Date('2026-07-04T01:30:00Z');
        (0, vitest_1.expect)(service.checkLateness(onTimeWITA, 'Asia/Makassar', policyEnd)).toBe(false);
        const lateWITA = new Date('2026-07-04T02:15:00Z');
        (0, vitest_1.expect)(service.checkLateness(lateWITA, 'Asia/Makassar', policyEnd)).toBe(true);
        const crossTimeWITA = new Date('2026-07-04T02:30:00Z');
        (0, vitest_1.expect)(service.checkLateness(crossTimeWITA, 'Asia/Makassar', policyEnd)).toBe(true);
    });
    (0, vitest_1.it)('should flag lateness correctly for Asia/Jayapura (WIT) timezone', () => {
        const policyEnd = '10:00';
        const onTimeWIT = new Date('2026-07-04T00:30:00Z');
        (0, vitest_1.expect)(service.checkLateness(onTimeWIT, 'Asia/Jayapura', policyEnd)).toBe(false);
        const lateWIT = new Date('2026-07-04T01:15:00Z');
        (0, vitest_1.expect)(service.checkLateness(lateWIT, 'Asia/Jayapura', policyEnd)).toBe(true);
    });
});
//# sourceMappingURL=lateness.spec.js.map