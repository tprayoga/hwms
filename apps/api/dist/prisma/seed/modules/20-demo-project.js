"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDemoProject = seedDemoProject;
const client_1 = require("@prisma/client");
const upsert_1 = require("../lib/upsert");
const dates_1 = require("../lib/dates");
const storage_service_1 = require("../../../src/storage/storage.service");
const task_aggregation_service_1 = require("../../../src/task/task-aggregation.service");
const PROJECT_NAME = 'HWMS Internal Rollout';
const CODE_PREFIX = 'HIR';
const NUM_SPRINTS = 4;
const TASKS_PER_SPRINT = 15;
const NUM_BLOCKED = 8;
const NUM_OPEN_BLOCKERS = 5;
const NUM_EVIDENCE_TASKS = 10;
const PLACEHOLDER_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PLACEHOLDER_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R/Size 4>>\n%%EOF\n';
const WORKSTREAMS = ['Onboarding', 'Migrasi Data', 'Integrasi SSO', 'Pelatihan', 'Go-Live'];
function pctForSprint(sprintNumber, rng) {
    switch (sprintNumber) {
        case 1:
            return 100;
        case 2:
            return rng.int(60, 80);
        case 3:
            return rng.int(20, 40);
        default:
            return 0;
    }
}
function statusForPct(pct) {
    if (pct >= 100)
        return client_1.TaskStatus.DONE;
    if (pct <= 0)
        return client_1.TaskStatus.NOT_STARTED;
    return client_1.TaskStatus.IN_PROGRESS;
}
async function seedDemoProject(prisma, ctx) {
    const log = (0, upsert_1.createLogger)('20-demo-project');
    const rng = ctx.rng;
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
    if (!tenant) {
        log.step('tenant indotek not found — run core first; skipping.');
        log.finish();
        return;
    }
    const tenantId = tenant.id;
    const saft = await prisma.project.findFirst({ where: { tenant_id: tenantId, name: 'Saft VE POC' } });
    const saftBaseline = saft
        ? await prisma.task.aggregate({
            where: { project_id: saft.id },
            _count: { _all: true },
            _sum: { percent_complete: true },
        })
        : null;
    const roles = await prisma.functionalRole.findMany({ where: { tenant_id: tenantId }, orderBy: { code: 'asc' } });
    const users = await prisma.user.findMany({
        where: { tenant_id: tenantId, employment_status: 'AKTIF' },
        orderBy: { nik: 'asc' },
        select: { id: true, manager_id: true, system_roles: true },
    });
    if (roles.length === 0 || users.length === 0) {
        log.step('no roles/users — run core first; skipping.');
        log.finish();
        return;
    }
    const assignPool = users.filter((u) => u.system_roles.includes('EMPLOYEE'));
    const owners = assignPool.length > 0 ? assignPool : users;
    const project = await (0, upsert_1.findOrCreate)(prisma.project, { tenant_id: tenantId, name: PROJECT_NAME }, { tenant_id: tenantId, name: PROJECT_NAME, code_prefix: CODE_PREFIX, status: 'ACTIVE' });
    const sprints = {};
    for (let n = 1; n <= NUM_SPRINTS; n++) {
        const start = (0, dates_1.hariKerja)((n - 3) * 10);
        const end = (0, dates_1.hariKerja)((n - 3) * 10 + 9);
        sprints[n] = await (0, upsert_1.findOrCreate)(prisma.sprint, { tenant_id: tenantId, project_id: project.id, number: n }, {
            tenant_id: tenantId,
            project_id: project.id,
            number: n,
            start_date: start,
            end_date: end,
            goal: `Demo sprint ${n} — HWMS internal rollout`,
        });
    }
    const demoTasks = [];
    let counter = 0;
    for (let n = 1; n <= NUM_SPRINTS; n++) {
        const sprint = sprints[n];
        for (let j = 0; j < TASKS_PER_SPRINT; j++) {
            counter++;
            const code = `${CODE_PREFIX}-${String(n).padStart(2, '0')}-${String(counter).padStart(4, '0')}`;
            const weight = rng.int(1, 5);
            const percent = pctForSprint(n, rng);
            const status = statusForPct(percent);
            const role = roles[rng.int(0, roles.length - 1)];
            const priority = rng.pick([
                client_1.TaskPriority.CRITICAL,
                client_1.TaskPriority.HIGH,
                client_1.TaskPriority.MEDIUM,
                client_1.TaskPriority.LOW,
            ]);
            const risk = rng.pick([client_1.RiskLevel.HIGH, client_1.RiskLevel.MEDIUM, client_1.RiskLevel.LOW]);
            const workstream = rng.pick(WORKSTREAMS);
            const data = {
                sprint_id: sprint.id,
                functional_role_id: role.id,
                workstream,
                title: `${workstream} — item ${counter}`,
                deliverable: `Deliverable untuk ${workstream.toLowerCase()} (${code})`,
                priority,
                status,
                percent_complete: percent,
                weight,
                risk_level: risk,
                planned_start: sprint.start_date,
                planned_end: sprint.end_date,
            };
            const task = await prisma.task.upsert({
                where: { code },
                create: { tenant_id: tenantId, project_id: project.id, code, ...data },
                update: data,
            });
            const owner = owners[counter % owners.length];
            await (0, upsert_1.findOrCreate)(prisma.taskAssignment, { tenant_id: tenantId, task_id: task.id, user_id: owner.id, unassigned_at: null }, { tenant_id: tenantId, task_id: task.id, user_id: owner.id });
            demoTasks.push({ id: task.id, code, sprintNumber: n, weight, percent });
        }
    }
    const blockerCandidates = demoTasks.filter((t) => t.sprintNumber >= 2);
    const chosen = new Set();
    const pickIdx = (pool) => {
        let idx = rng.int(0, pool.length - 1);
        let guard = 0;
        while (chosen.has(idx) && guard < 10000) {
            idx = rng.int(0, pool.length - 1);
            guard++;
        }
        chosen.add(idx);
        return pool[idx];
    };
    let openBlockers = 0;
    let resolvedBlockers = 0;
    for (let k = 0; k < NUM_BLOCKED; k++) {
        const t = pickIdx(blockerCandidates);
        const isOpen = k < NUM_OPEN_BLOCKERS;
        const reporter = users[rng.int(0, users.length - 1)];
        const resolver = users[rng.int(0, users.length - 1)];
        const openedAt = new Date(ctx.anchor.getTime() - rng.int(3, 10) * 24 * 3600 * 1000);
        await (0, upsert_1.findOrCreate)(prisma.blocker, { tenant_id: tenantId, task_id: t.id }, {
            tenant_id: tenantId,
            task_id: t.id,
            reported_by: reporter.id,
            description: `Blocker demo pada ${t.code}: menunggu dependensi eksternal.`,
            mentioned_user_ids: reporter.manager_id ? [reporter.manager_id] : [],
            status: isOpen ? client_1.BlockerStatus.OPEN : client_1.BlockerStatus.RESOLVED,
            opened_at: openedAt,
            resolved_at: isOpen ? null : new Date(openedAt.getTime() + 2 * 24 * 3600 * 1000),
            resolved_by: isOpen ? null : resolver.id,
        });
        await prisma.task.update({
            where: { id: t.id },
            data: { status: isOpen ? client_1.TaskStatus.BLOCKED : client_1.TaskStatus.IN_PROGRESS },
        });
        if (isOpen)
            openBlockers++;
        else
            resolvedBlockers++;
    }
    const storage = new storage_service_1.StorageService();
    const evidenceBucket = process.env.S3_BUCKET_EVIDENCES || 'evidences';
    const pdfKey = 'seed/evidence/placeholder.pdf';
    const pngKey = 'seed/evidence/placeholder.png';
    try {
        await storage.uploadFile(evidenceBucket, pdfKey, Buffer.from(PLACEHOLDER_PDF, 'utf-8'), 'application/pdf');
        await storage.uploadFile(evidenceBucket, pngKey, Buffer.from(PLACEHOLDER_PNG_B64, 'base64'), 'image/png');
    }
    catch (e) {
        log.step(`evidence placeholder upload skipped: ${e?.message ?? e}`);
    }
    const evidencePool = demoTasks.filter((t) => t.sprintNumber <= 3);
    for (let k = 0; k < Math.min(NUM_EVIDENCE_TASKS, evidencePool.length); k++) {
        const t = evidencePool[k * 3 % evidencePool.length];
        const key = k % 2 === 0 ? pdfKey : pngKey;
        const uploader = users[rng.int(0, users.length - 1)];
        await (0, upsert_1.findOrCreate)(prisma.taskEvidence, { tenant_id: tenantId, task_id: t.id, url_or_key: key }, { tenant_id: tenantId, task_id: t.id, kind: client_1.EvidenceKind.FILE, url_or_key: key, uploaded_by: uploader.id });
    }
    const aggregation = new task_aggregation_service_1.TaskAggregationService({}, {});
    const perSprint = {};
    for (let n = 1; n <= NUM_SPRINTS; n++) {
        const tasks = await prisma.task.findMany({
            where: { project_id: project.id, sprint_id: sprints[n].id },
            include: { blockers: true },
        });
        const agg = await aggregation.calculateProgress(tasks);
        perSprint[n] = agg;
        log.step(`sprint ${n}: progress=${agg.progressPct}% rag=${agg.rag} (${tasks.length} tasks)`);
    }
    ctx.refs.demoProject = { projectId: project.id, perSprint };
    if (saft && saftBaseline) {
        const after = await prisma.task.aggregate({
            where: { project_id: saft.id },
            _count: { _all: true },
            _sum: { percent_complete: true },
        });
        const beforeCount = saftBaseline._count._all;
        const afterCount = after._count._all;
        const beforeSum = saftBaseline._sum.percent_complete ?? 0;
        const afterSum = after._sum.percent_complete ?? 0;
        if (afterCount !== beforeCount || afterSum !== beforeSum) {
            throw new Error(`GUARD FAILED: Saft VE POC drifted — count ${beforeCount}->${afterCount}, ` +
                `sum(percent_complete) ${beforeSum}->${afterSum}. Demo module must never touch Saft.`);
        }
        log.step(`guard OK: Saft VE POC intact (count=${afterCount}, sum%=${afterSum}).`);
    }
    log.count('tasks', demoTasks.length);
    log.count('blockers_open', openBlockers);
    log.count('blockers_resolved', resolvedBlockers);
    log.finish();
}
//# sourceMappingURL=20-demo-project.js.map