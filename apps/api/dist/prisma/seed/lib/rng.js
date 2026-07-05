"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SEED = void 0;
exports.mulberry32 = mulberry32;
exports.resolveSeed = resolveSeed;
exports.createRng = createRng;
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
exports.DEFAULT_SEED = 0x48574d53;
function resolveSeed() {
    const raw = process.env.SEED_RNG_SEED;
    if (raw === undefined || raw.trim() === '')
        return exports.DEFAULT_SEED;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
        throw new Error(`Invalid SEED_RNG_SEED: ${raw} (must be a number)`);
    }
    return n >>> 0;
}
function createRng(seed = resolveSeed()) {
    const rand = mulberry32(seed);
    return {
        next: rand,
        int: (min, max) => min + Math.floor(rand() * (max - min + 1)),
        pick: (arr) => {
            if (arr.length === 0)
                throw new Error('Rng.pick called on empty array');
            return arr[Math.floor(rand() * arr.length)];
        },
        chance: (p) => rand() < p,
    };
}
//# sourceMappingURL=rng.js.map