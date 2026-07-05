"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_service_1 = require("../prisma/prisma.service");
const task_aggregation_service_1 = require("../task/task-aggregation.service");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Excel Formula Reconciliation Integration Gate', () => {
    let prisma;
    const aggregation = new task_aggregation_service_1.TaskAggregationService({}, {});
    let excelTasks = [];
    let dbTasks = [];
    const TOLERANCE = 0.5;
    const roleNameToCode = (roleName) => {
        const n = roleName.trim();
        if (n === 'Product Owner')
            return 'PO';
        if (n === 'System Analyst')
            return 'SA';
        if (n === 'Infrastructure Engineer')
            return 'Infra';
        if (n === 'Backend Engineer')
            return 'BE';
        if (n === 'Frontend Engineer')
            return 'FE';
        if (n === 'Quality Assurance')
            return 'QA';
        if (n === 'Technical Writer')
            return 'TW';
        if (n === 'Sales' || n === 'Sales Representative')
            return 'Sales';
        return 'TBD';
    };
    const syntheticPct = (code) => {
        let h = 0;
        for (let i = 0; i < code.length; i++) {
            h = (h * 31 + code.charCodeAt(i)) & 0xffffffff;
        }
        return Math.abs(h) % 101;
    };
    const excelPct = (raw) => {
        let p = Number(raw ?? 0);
        if (p <= 1)
            p = p * 100;
        return p;
    };
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        const seedFilePath = path.join(__dirname, '../../../../seed/task_management_indotek.xlsx');
        const wb = XLSX.read(fs.readFileSync(seedFilePath), { type: 'buffer' });
        const ws = wb.Sheets['Sprint Tasks'];
        const dataRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const taskRows = dataRows.slice(2);
        excelTasks = taskRows.filter((r) => r && r.length > 0 && r[0]);
        const project = await prisma.project.findFirst({
            where: { name: 'Saft VE POC' },
        });
        if (project) {
            dbTasks = await prisma.task.findMany({
                where: { project_id: project.id },
                include: { sprint: true, functional_role: true },
            });
        }
    });
    (0, vitest_1.it)('imported every workbook row (count parity)', () => {
        (0, vitest_1.expect)(dbTasks.length).toBe(excelTasks.length);
        (0, vitest_1.expect)(dbTasks.length).toBe(456);
    });
    (0, vitest_1.it)('reconciles task count AND weight sum per sprint (import fidelity)', () => {
        const excel = {};
        const db = {};
        for (let i = 0; i < 12; i++) {
            excel[i] = { count: 0, weight: 0 };
            db[i] = { count: 0, weight: 0 };
        }
        for (const row of excelTasks) {
            const num = parseInt(String(row[1]).replace('Sprint ', ''), 10);
            if (excel[num]) {
                excel[num].count += 1;
                excel[num].weight += row[13] ? Number(row[13]) : 1;
            }
        }
        for (const t of dbTasks) {
            const num = t.sprint.number;
            if (db[num]) {
                db[num].count += 1;
                db[num].weight += Number(t.weight);
            }
        }
        for (let i = 0; i < 12; i++) {
            (0, vitest_1.expect)(db[i].count, `sprint ${i} task count`).toBe(excel[i].count);
            (0, vitest_1.expect)(Math.abs(db[i].weight - excel[i].weight), `sprint ${i} weight sum`).toBeLessThanOrEqual(0.0001);
        }
    });
    (0, vitest_1.it)('reconciles task count AND weight sum per role (import fidelity)', () => {
        const excel = {};
        const db = {};
        for (const row of excelTasks) {
            const code = roleNameToCode(String(row[3]));
            excel[code] = excel[code] || { count: 0, weight: 0 };
            excel[code].count += 1;
            excel[code].weight += row[13] ? Number(row[13]) : 1;
        }
        for (const t of dbTasks) {
            const code = t.functional_role?.code ?? 'TBD';
            db[code] = db[code] || { count: 0, weight: 0 };
            db[code].count += 1;
            db[code].weight += Number(t.weight);
        }
        for (const code of Object.keys(excel)) {
            (0, vitest_1.expect)(db[code]?.count ?? 0, `role ${code} task count`).toBe(excel[code].count);
            (0, vitest_1.expect)(Math.abs((db[code]?.weight ?? 0) - excel[code].weight), `role ${code} weight sum`).toBeLessThanOrEqual(0.0001);
        }
    });
    (0, vitest_1.it)('reconciles weighted completion per sprint within 0.5% (current data)', async () => {
        const excel = {};
        const db = {};
        for (let i = 0; i < 12; i++) {
            excel[i] = [];
            db[i] = [];
        }
        for (const row of excelTasks) {
            const num = parseInt(String(row[1]).replace('Sprint ', ''), 10);
            if (excel[num])
                excel[num].push({ percent_complete: excelPct(row[12]), weight: row[13] ? Number(row[13]) : 1 });
        }
        for (const t of dbTasks) {
            if (db[t.sprint.number])
                db[t.sprint.number].push(t);
        }
        for (let i = 0; i < 12; i++) {
            const e = await aggregation.calculateProgress(excel[i]);
            const d = await aggregation.calculateProgress(db[i]);
            const diff = Math.abs(e.progressPct - d.progressPct);
            console.log(`Sprint ${i}: Excel=${e.progressPct}% DB=${d.progressPct}% diff=${diff}%`);
            (0, vitest_1.expect)(diff, `sprint ${i} completion`).toBeLessThanOrEqual(TOLERANCE);
        }
    });
    (0, vitest_1.it)('reconciles the production formula against Excel with synthetic non-zero completion', async () => {
        const excelBySprint = {};
        const sysBySprint = {};
        const excelByRole = {};
        const sysByRole = {};
        for (const row of excelTasks) {
            const code = String(row[0]).trim();
            const pct = syntheticPct(code);
            const weight = row[13] ? Number(row[13]) : 1;
            const num = parseInt(String(row[1]).replace('Sprint ', ''), 10);
            const role = roleNameToCode(String(row[3]));
            (excelBySprint[num] = excelBySprint[num] || []).push({ percent_complete: pct, weight });
            (excelByRole[role] = excelByRole[role] || []).push({ percent_complete: pct, weight });
        }
        for (const t of dbTasks) {
            const pct = syntheticPct(t.code);
            const num = t.sprint.number;
            const role = t.functional_role?.code ?? 'TBD';
            (sysBySprint[num] = sysBySprint[num] || []).push({ percent_complete: pct, weight: Number(t.weight) });
            (sysByRole[role] = sysByRole[role] || []).push({ percent_complete: pct, weight: Number(t.weight) });
        }
        for (let i = 0; i < 12; i++) {
            const e = await aggregation.calculateProgress(excelBySprint[i] || []);
            const s = await aggregation.calculateProgress(sysBySprint[i] || []);
            (0, vitest_1.expect)(s.progressPct, `synthetic sprint ${i}`).toBeGreaterThan(0);
            (0, vitest_1.expect)(Math.abs(e.progressPct - s.progressPct), `synthetic sprint ${i}`).toBeLessThanOrEqual(TOLERANCE);
        }
        for (const role of Object.keys(excelByRole)) {
            const e = await aggregation.calculateProgress(excelByRole[role]);
            const s = await aggregation.calculateProgress(sysByRole[role] || []);
            (0, vitest_1.expect)(Math.abs(e.progressPct - s.progressPct), `synthetic role ${role}`).toBeLessThanOrEqual(TOLERANCE);
        }
    });
});
//# sourceMappingURL=reconciliation.spec.js.map