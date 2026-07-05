"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new client_1.PrismaClient();
function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) {
                out[key] = 'true';
            }
            else {
                out[key] = next;
                i++;
            }
        }
    }
    return out;
}
function fail(msg) {
    console.error(`\n✗ ${msg}\n`);
    process.exit(1);
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log('Lihat komentar di kepala file untuk daftar flag lengkap.');
        process.exit(0);
    }
    const email = args.email?.trim();
    const fullName = args.name?.trim();
    const nik = args.nik?.trim();
    if (!email || !fullName || !nik) {
        fail('Wajib: --email, --name, --nik.');
    }
    const tenants = await prisma.tenant.findMany();
    if (tenants.length === 0) {
        fail('Tidak ada tenant. Jalankan seed dulu (membuat tenant `indotek`).');
    }
    let tenant = tenants[0];
    if (args.tenant) {
        const found = tenants.find((t) => t.slug === args.tenant);
        if (!found)
            fail(`Tenant slug "${args.tenant}" tidak ada. Ada: ${tenants.map((t) => t.slug).join(', ')}`);
        tenant = found;
    }
    else if (tenants.length > 1) {
        fail(`Ada ${tenants.length} tenant — tentukan --tenant. Ada: ${tenants.map((t) => t.slug).join(', ')}`);
    }
    const validRoles = Object.values(client_1.SystemRole);
    const rolesRaw = (args.roles ?? 'EMPLOYEE').split(',').map((r) => r.trim()).filter(Boolean);
    for (const r of rolesRaw) {
        if (!validRoles.includes(r))
            fail(`system_role "${r}" tidak valid. Pilihan: ${validRoles.join(', ')}`);
    }
    const systemRoles = rolesRaw;
    const mode = (args.mode ?? 'TWICE');
    if (!Object.values(client_1.CheckinMode).includes(mode)) {
        fail(`--mode "${mode}" tidak valid. Pilihan: ${Object.values(client_1.CheckinMode).join(', ')}`);
    }
    let departmentId = null;
    if (args.dept) {
        const dept = await prisma.department.findFirst({ where: { tenant_id: tenant.id, name: args.dept } });
        if (!dept) {
            const all = await prisma.department.findMany({ where: { tenant_id: tenant.id }, select: { name: true } });
            fail(`Department "${args.dept}" tidak ada. Ada: ${all.map((d) => d.name).join(', ') || '(kosong)'}`);
        }
        departmentId = dept.id;
    }
    let functionalRoleId = null;
    if (args.role) {
        const fr = await prisma.functionalRole.findFirst({ where: { tenant_id: tenant.id, code: args.role } });
        if (!fr) {
            const all = await prisma.functionalRole.findMany({ where: { tenant_id: tenant.id }, select: { code: true } });
            fail(`FunctionalRole kode "${args.role}" tidak ada. Ada: ${all.map((f) => f.code).join(', ') || '(kosong)'}`);
        }
        functionalRoleId = fr.id;
    }
    let managerId = null;
    if (args.manager) {
        const mgr = await prisma.user.findFirst({ where: { tenant_id: tenant.id, email: args.manager } });
        if (!mgr)
            fail(`Manager dengan email "${args.manager}" tidak ada.`);
        managerId = mgr.id;
    }
    const dup = await prisma.user.findFirst({
        where: { tenant_id: tenant.id, OR: [{ email }, { nik }] },
        select: { email: true, nik: true },
    });
    if (dup)
        fail(`User sudah ada (email/nik bentrok): ${dup.email} / ${dup.nik}`);
    const password = args.password ?? 'UserPassword123';
    const passwordHash = await bcrypt.hash(password, 10);
    const leaveBalance = args.leave ? parseInt(args.leave, 10) : 12;
    const user = await prisma.user.create({
        data: {
            tenant_id: tenant.id,
            email,
            password_hash: passwordHash,
            full_name: fullName,
            nik,
            system_roles: systemRoles,
            timezone: args.tz ?? 'Asia/Jakarta',
            checkin_mode: mode,
            leave_balance: Number.isNaN(leaveBalance) ? 12 : leaveBalance,
            employment_status: client_1.EmploymentStatus.AKTIF,
            joined_at: new Date(),
            department_id: departmentId,
            functional_role_id: functionalRoleId,
            manager_id: managerId,
        },
    });
    console.log('\n✓ User dibuat:');
    console.log(`  id       : ${user.id}`);
    console.log(`  email    : ${user.email}`);
    console.log(`  nik      : ${user.nik}`);
    console.log(`  roles    : ${user.system_roles.join(', ')}`);
    console.log(`  timezone : ${user.timezone}`);
    console.log(`  password : ${password}   (segera minta user menggantinya)\n`);
}
main()
    .catch((e) => {
    console.error('\n✗ Gagal membuat user:', e.message ?? e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=create-user.js.map