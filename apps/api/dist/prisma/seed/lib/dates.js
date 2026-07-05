"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANCHOR_DATE = void 0;
exports.hariKerja = hariKerja;
exports.jamLokal = jamLokal;
const TZ_OFFSET_HOURS = {
    'Asia/Jakarta': 7,
    'Asia/Makassar': 8,
    'Asia/Jayapura': 9,
};
function lastMondayBefore(ref) {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
    const dow = d.getUTCDay();
    let diff = (dow + 6) % 7;
    if (diff === 0)
        diff = 7;
    d.setUTCDate(d.getUTCDate() - diff);
    return d;
}
function resolveAnchor() {
    const raw = process.env.SEED_ANCHOR_DATE;
    if (raw && raw.trim() !== '') {
        const d = new Date(raw.trim());
        if (Number.isNaN(d.getTime())) {
            throw new Error(`Invalid SEED_ANCHOR_DATE: ${raw} (expected ISO date)`);
        }
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
    return lastMondayBefore(new Date());
}
exports.ANCHOR_DATE = resolveAnchor();
function hariKerja(offset, from = exports.ANCHOR_DATE) {
    const d = new Date(from.getTime());
    const step = offset >= 0 ? 1 : -1;
    let remaining = Math.abs(offset);
    while (remaining > 0) {
        d.setUTCDate(d.getUTCDate() + step);
        const dow = d.getUTCDay();
        if (dow !== 0 && dow !== 6)
            remaining--;
    }
    return d;
}
function jamLokal(tz, h, m, date = exports.ANCHOR_DATE) {
    const offset = TZ_OFFSET_HOURS[tz];
    if (offset === undefined) {
        throw new Error(`Unknown timezone for jamLokal: ${tz}`);
    }
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h - offset, m, 0, 0));
}
//# sourceMappingURL=dates.js.map