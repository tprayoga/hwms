"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAttendance = seedAttendance;
const client_1 = require("@prisma/client");
const dates_1 = require("../lib/dates");
const upsert_1 = require("../lib/upsert");
const storage_service_1 = require("../../../src/storage/storage.service");
const ONCE_USER_EMAILS = ['eng2.fe@indotek.com', 'sales3@indotek.com'];
const HISTORY_WORKING_DAYS = 20;
const PLACEHOLDER_JPEG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
    'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
    'CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA' +
    'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK' +
    'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG' +
    'h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl' +
    '5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA' +
    'AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYk' +
    'NOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE' +
    'hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk' +
    '5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
function categoryFor(r) {
    if (r < 0.7)
        return 'normal';
    if (r < 0.78)
        return 'late';
    if (r < 0.83)
        return 'out_of_range';
    if (r < 0.87)
        return 'forgot_checkout';
    if (r < 0.92)
        return 'wfh';
    if (r < 0.97)
        return 'leave';
    return 'alpa';
}
const LEAVE_TYPES = [client_1.LeaveType.CUTI, client_1.LeaveType.IZIN, client_1.LeaveType.SAKIT];
function isoDay(d) {
    return d.toISOString().slice(0, 10);
}
async function seedAttendance(prisma, ctx) {
    const log = (0, upsert_1.createLogger)('11-attendance');
    const rng = ctx.rng;
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
    if (!tenant) {
        log.step('tenant indotek not found — run core first; skipping.');
        log.finish();
        return;
    }
    const tenantId = tenant.id;
    const users = await prisma.user.findMany({
        where: { tenant_id: tenant.id, employment_status: 'AKTIF' },
        orderBy: { nik: 'asc' },
        select: { id: true, email: true, nik: true, timezone: true, manager_id: true },
    });
    const onceIds = new Set();
    for (const email of ONCE_USER_EMAILS) {
        const u = users.find((x) => x.email === email);
        if (u) {
            await prisma.user.update({ where: { id: u.id }, data: { checkin_mode: client_1.CheckinMode.ONCE } });
            onceIds.add(u.id);
        }
    }
    const office = await prisma.location.findFirst({
        where: { tenant_id: tenant.id, type: 'OFFICE' },
    });
    const officeLat = office?.lat ? Number(office.lat) : -6.917464;
    const officeLng = office?.lng ? Number(office.lng) : 107.619122;
    const storage = new storage_service_1.StorageService();
    const selfieBucket = process.env.S3_BUCKET_SELFIES || 'selfies';
    const jpeg = Buffer.from(PLACEHOLDER_JPEG_B64, 'base64');
    const selfieKeyByUser = {};
    for (const u of users) {
        const key = `seed/placeholder/${u.nik}.jpg`;
        selfieKeyByUser[u.id] = key;
        try {
            await storage.uploadFile(selfieBucket, key, jpeg, 'image/jpeg');
        }
        catch (e) {
            log.step(`selfie upload skipped for ${u.nik}: ${e?.message ?? e}`);
        }
    }
    log.count('selfie_objects', users.length);
    const holidayRows = await prisma.holiday.findMany({
        where: { tenant_id: tenant.id },
        select: { date: true },
    });
    const holidaySet = new Set(holidayRows.map((h) => isoDay(new Date(h.date))));
    const cutoff = new Date(ctx.anchor.getTime() - 90 * 24 * 3600 * 1000);
    const days = [];
    for (let offset = 1; offset <= HISTORY_WORKING_DAYS; offset++) {
        const d = (0, dates_1.hariKerja)(-offset);
        if (d < cutoff)
            continue;
        if (holidaySet.has(isoDay(d)))
            continue;
        days.push(d);
    }
    const attendancePlan = {
        wfh: [],
        leave: [],
    };
    const counts = {
        in: 0,
        out: 0,
        late: 0,
        out_of_range: 0,
        auto_checkout: 0,
        wfh: 0,
        leave: 0,
        alpa: 0,
        normal: 0,
        forgot_checkout: 0,
    };
    const jitter = (base, spread) => base + (rng.next() * 2 - 1) * spread;
    async function putCheckin(rec) {
        const skewMs = rng.int(-180, 180) * 1000;
        const deviceTs = new Date(rec.submittedAt.getTime() + skewMs);
        const data = {
            work_status: rec.workStatus,
            lat: rec.lat,
            lng: rec.lng,
            gps_accuracy_m: rng.int(5, 30),
            selfie_key: rec.selfieKey,
            is_auto: rec.isAuto,
            is_late: rec.isLate,
            geofence_ok: rec.geofenceOk,
            device_timestamp: deviceTs,
            submitted_at: rec.submittedAt,
        };
        await prisma.checkin.upsert({
            where: {
                user_id_date_type: { user_id: rec.userId, date: rec.date, type: rec.type },
            },
            create: { tenant_id: tenantId, user_id: rec.userId, date: rec.date, type: rec.type, ...data },
            update: data,
        });
    }
    for (const u of users) {
        const once = onceIds.has(u.id);
        for (const day of days) {
            const cat = categoryFor(rng.next());
            if (cat === 'alpa') {
                counts.alpa++;
                continue;
            }
            if (cat === 'leave') {
                const type = LEAVE_TYPES[rng.int(0, LEAVE_TYPES.length - 1)];
                attendancePlan.leave.push({ userId: u.id, date: day, type, timezone: u.timezone, managerId: u.manager_id });
                counts.leave++;
                continue;
            }
            const isWfh = cat === 'wfh';
            const workStatus = isWfh ? client_1.WorkStatus.WFH : client_1.WorkStatus.WFO;
            const isLate = cat === 'late';
            const isOor = cat === 'out_of_range';
            let inH;
            let inM;
            if (isLate) {
                const t = rng.int(601, 719);
                inH = Math.floor(t / 60);
                inM = t % 60;
            }
            else {
                inH = rng.int(7, 9);
                inM = rng.int(0, 59);
            }
            const inAt = (0, dates_1.jamLokal)(u.timezone, inH, inM, day);
            let lat;
            let lng;
            let geofenceOk;
            if (isOor) {
                lat = officeLat + 0.05;
                lng = officeLng + 0.05;
                geofenceOk = false;
            }
            else if (isWfh) {
                lat = jitter(officeLat, 0.03);
                lng = jitter(officeLng, 0.03);
                geofenceOk = true;
            }
            else {
                lat = jitter(officeLat, 0.0005);
                lng = jitter(officeLng, 0.0005);
                geofenceOk = true;
            }
            await putCheckin({
                userId: u.id,
                date: day,
                type: client_1.CheckinType.IN,
                workStatus,
                lat,
                lng,
                selfieKey: selfieKeyByUser[u.id],
                isLate,
                isAuto: false,
                geofenceOk,
                submittedAt: inAt,
            });
            counts.in++;
            if (isLate)
                counts.late++;
            if (isOor)
                counts.out_of_range++;
            if (cat === 'normal')
                counts.normal++;
            if (cat === 'forgot_checkout')
                counts.forgot_checkout++;
            if (isWfh) {
                counts.wfh++;
                attendancePlan.wfh.push({ userId: u.id, date: day, timezone: u.timezone, managerId: u.manager_id });
            }
            if (once)
                continue;
            if (cat === 'forgot_checkout') {
                const outAt = (0, dates_1.jamLokal)(u.timezone, 18, 0, day);
                await putCheckin({
                    userId: u.id,
                    date: day,
                    type: client_1.CheckinType.OUT,
                    workStatus,
                    lat,
                    lng,
                    selfieKey: selfieKeyByUser[u.id],
                    isLate: false,
                    isAuto: true,
                    geofenceOk,
                    submittedAt: outAt,
                });
                counts.out++;
                counts.auto_checkout++;
            }
            else {
                const t = rng.int(990, 1140);
                const outAt = (0, dates_1.jamLokal)(u.timezone, Math.floor(t / 60), t % 60, day);
                await putCheckin({
                    userId: u.id,
                    date: day,
                    type: client_1.CheckinType.OUT,
                    workStatus,
                    lat: isWfh ? lat : jitter(officeLat, 0.0005),
                    lng: isWfh ? lng : jitter(officeLng, 0.0005),
                    selfieKey: selfieKeyByUser[u.id],
                    isLate: false,
                    isAuto: false,
                    geofenceOk: true,
                    submittedAt: outAt,
                });
                counts.out++;
            }
        }
    }
    ctx.refs.attendance = attendancePlan;
    ctx.refs.onceUserIds = [...onceIds];
    log.step(`days=${days.length} users=${users.length} | IN=${counts.in} OUT=${counts.out} ` +
        `late=${counts.late} oor=${counts.out_of_range} auto=${counts.auto_checkout} ` +
        `wfh=${counts.wfh} leave=${counts.leave} alpa=${counts.alpa}`);
    log.count('checkins', counts.in + counts.out);
    log.finish();
}
//# sourceMappingURL=11-attendance.js.map