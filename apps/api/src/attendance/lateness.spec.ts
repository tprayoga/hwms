import { AttendanceService } from './attendance.service';
import { describe, beforeAll, it, expect } from 'vitest';

describe('Timezone-aware Check-in Lateness Calculation', () => {
  let service: AttendanceService;

  beforeAll(() => {
    service = new AttendanceService(null as any, null as any);
  });

  it('should flag lateness correctly for Asia/Jakarta (WIB) timezone', () => {
    const policyEnd = '10:00';

    // 02:30 UTC is 09:30 WIB (Not Late)
    const onTimeWIB = new Date('2026-07-04T02:30:00Z');
    expect(service.checkLateness(onTimeWIB, 'Asia/Jakarta', policyEnd)).toBe(false);

    // 03:15 UTC is 10:15 WIB (Late)
    const lateWIB = new Date('2026-07-04T03:15:00Z');
    expect(service.checkLateness(lateWIB, 'Asia/Jakarta', policyEnd)).toBe(true);
  });

  it('should flag lateness correctly for Asia/Makassar (WITA) timezone', () => {
    const policyEnd = '10:00';

    // 01:30 UTC is 09:30 WITA (Not Late)
    const onTimeWITA = new Date('2026-07-04T01:30:00Z');
    expect(service.checkLateness(onTimeWITA, 'Asia/Makassar', policyEnd)).toBe(false);

    // 02:15 UTC is 10:15 WITA (Late)
    const lateWITA = new Date('2026-07-04T02:15:00Z');
    expect(service.checkLateness(lateWITA, 'Asia/Makassar', policyEnd)).toBe(true);

    // 02:30 UTC is 10:30 WITA (Late, even though it was 09:30 in Jakarta)
    const crossTimeWITA = new Date('2026-07-04T02:30:00Z');
    expect(service.checkLateness(crossTimeWITA, 'Asia/Makassar', policyEnd)).toBe(true);
  });

  it('should flag lateness correctly for Asia/Jayapura (WIT) timezone', () => {
    const policyEnd = '10:00';

    // 00:30 UTC is 09:30 WIT (Not Late)
    const onTimeWIT = new Date('2026-07-04T00:30:00Z');
    expect(service.checkLateness(onTimeWIT, 'Asia/Jayapura', policyEnd)).toBe(false);

    // 01:15 UTC is 10:15 WIT (Late)
    const lateWIT = new Date('2026-07-04T01:15:00Z');
    expect(service.checkLateness(lateWIT, 'Asia/Jayapura', policyEnd)).toBe(true);
  });
});
