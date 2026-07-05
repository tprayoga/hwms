"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertBy = upsertBy;
exports.findOrCreate = findOrCreate;
exports.createLogger = createLogger;
function upsertBy(delegate, where, create, update = {}) {
    return delegate.upsert({ where, create, update });
}
async function findOrCreate(delegate, where, create) {
    const existing = await delegate.findFirst({ where });
    if (existing)
        return existing;
    return delegate.create({ data: create });
}
function createLogger(moduleName) {
    const counts = {};
    const t0 = Date.now();
    return {
        step: (msg) => console.log(`  [${moduleName}] ${msg}`),
        count: (key, by = 1) => {
            counts[key] = (counts[key] ?? 0) + by;
        },
        finish: () => {
            const parts = Object.entries(counts).map(([k, v]) => `${k}=${v}`);
            const summary = parts.length ? parts.join(' ') : 'no counters';
            console.log(`✓ [${moduleName}] ${summary} (${Date.now() - t0}ms)`);
        },
    };
}
//# sourceMappingURL=upsert.js.map