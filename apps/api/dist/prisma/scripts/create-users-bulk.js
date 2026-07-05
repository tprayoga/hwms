"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const XLSX = require("xlsx");
const prisma = new client_1.PrismaClient();
function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--'))
            continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--'))
            out[key] = 'true';
        else {
            out[key] = next;
            i++;
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
    if (!args.file)
        fail('Wajib: --file <path .xlsx/.csv>. Lihat komentar kepala file untuk format kolom.');
    const dryRun = args['dry-run'] === 'true';
    const skipInvalid = args['skip-invalid'] === 'true';
    const tenants = await prisma.tenant.findMany();
    if (tenants.length === 0)
        fail('Tidak ada tenant. Jalankan seed dulu (membuat tenant `indotek`).');
    let tenant = tenants[0];
    if (args.tenant) {
        const found = tenants.find((t) => t.slug === args.tenant);
        if (!found)
            fail(`Tenant "${args.tenant}" tidak ada. Ada: ${tenants.map((t) => t.slug).join(', ')}`);
        tenant = found;
    }
    else if (tenants.length > 1) {
        fail(`Ada ${tenants.length} tenant — tentukan --tenant. Ada: ${tenants.map((t) => t.slug).join(', ')}`);
    }
    let rawRows;
    try {
        const wb = XLSX.readFile(args.file);
        rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    }
    catch (e) {
        return fail(`Gagal membaca "${args.file}": ${e.message}`);
    }
    if (rawRows.length === 0)
        fail('File tidak berisi baris data.');
    const [departments, functionalRoles, existingUsers] = await Promise.all([
        prisma.department.findMany({ where: { tenant_id: tenant.id } }),
        prisma.functionalRole.findMany({ where: { tenant_id: tenant.id } }),
        prisma.user.findMany({ where: { tenant_id: tenant.id }, select: { id: true, email: true, nik: true } }),
    ]);
    const validRoles = Object.values(client_1.SystemRole);
    const validModes = Object.values(client_1.CheckinMode);
    const seenEmails = new Set();
    const seenNiks = new Set();
    const resolved = rawRows.map((raw, idx) => {
        const errors = [];
        const email = String(raw['Email'] ?? '').trim();
        const fullName = String(raw['Nama Lengkap'] ?? '').trim();
        const nik = String(raw['NIK'] ?? '').trim();
        const deptName = String(raw['Departemen'] ?? '').trim();
        const roleCode = String(raw['Peran Fungsional'] ?? '').trim();
        const rolesCell = String(raw['Peran Sistem'] ?? '').trim();
        const timezone = String(raw['Zona Waktu'] ?? '').trim() || 'Asia/Jakarta';
        const modeCell = String(raw['Check-in Mode'] ?? '').trim() || 'TWICE';
        const managerEmail = String(raw['Email Atasan'] ?? '').trim();
        const password = String(raw['Sandi'] ?? '').trim() || 'UserPassword123';
        if (!email)
            errors.push('Email wajib diisi');
        if (!fullName)
            errors.push('Nama Lengkap wajib diisi');
        if (!nik)
            errors.push('NIK wajib diisi');
        if (email) {
            if (existingUsers.some((u) => u.email.toLowerCase() === email.toLowerCase()))
                errors.push(`Email ${email} sudah terdaftar di DB`);
            if (seenEmails.has(email.toLowerCase()))
                errors.push(`Email ${email} duplikat di dalam file`);
            seenEmails.add(email.toLowerCase());
        }
        if (nik) {
            if (existingUsers.some((u) => u.nik === nik))
                errors.push(`NIK ${nik} sudah terdaftar di DB`);
            if (seenNiks.has(nik))
                errors.push(`NIK ${nik} duplikat di dalam file`);
            seenNiks.add(nik);
        }
        let systemRoles = [client_1.SystemRole.EMPLOYEE];
        if (rolesCell) {
            const parts = rolesCell.split(/[;,]/).map((r) => r.trim()).filter(Boolean);
            const bad = parts.filter((r) => !validRoles.includes(r));
            if (bad.length)
                errors.push(`Peran Sistem tidak valid: ${bad.join(', ')} (pilihan: ${validRoles.join('|')})`);
            else
                systemRoles = parts;
        }
        if (!validModes.includes(modeCell))
            errors.push(`Check-in Mode "${modeCell}" tidak valid (${validModes.join('|')})`);
        let departmentId = null;
        if (deptName) {
            const d = departments.find((x) => x.name.toLowerCase() === deptName.toLowerCase());
            if (!d)
                errors.push(`Departemen "${deptName}" tidak dikenal`);
            else
                departmentId = d.id;
        }
        let functionalRoleId = null;
        if (roleCode) {
            const r = functionalRoles.find((x) => x.code.toLowerCase() === roleCode.toLowerCase() || x.name.toLowerCase() === roleCode.toLowerCase());
            if (!r)
                errors.push(`Peran Fungsional "${roleCode}" tidak dikenal`);
            else
                functionalRoleId = r.id;
        }
        let managerId = null;
        if (managerEmail) {
            const m = existingUsers.find((u) => u.email.toLowerCase() === managerEmail.toLowerCase());
            if (!m)
                errors.push(`Atasan "${managerEmail}" tidak ditemukan (harus sudah ada sebelum impor)`);
            else
                managerId = m.id;
        }
        return { row: idx + 2, email, fullName, nik, password, systemRoles, timezone, checkinMode: modeCell, departmentId, functionalRoleId, managerId, errors };
    });
    const valid = resolved.filter((r) => r.errors.length === 0);
    const invalid = resolved.filter((r) => r.errors.length > 0);
    console.log(`\nTotal baris : ${resolved.length}`);
    console.log(`Valid       : ${valid.length}`);
    console.log(`Bermasalah  : ${invalid.length}`);
    if (invalid.length) {
        console.log('\nBaris bermasalah:');
        for (const r of invalid)
            console.log(`  baris ${r.row} (${r.email || '?'}): ${r.errors.join('; ')}`);
    }
    if (dryRun) {
        console.log('\n[dry-run] Tidak ada yang ditulis ke DB.\n');
        return;
    }
    if (invalid.length && !skipInvalid) {
        fail('Ada baris bermasalah. Perbaiki file, atau jalankan ulang dengan --skip-invalid untuk membuat baris valid saja.');
    }
    if (valid.length === 0)
        fail('Tidak ada baris valid untuk dibuat.');
    await prisma.$transaction(async (tx) => {
        for (const r of valid) {
            await tx.user.create({
                data: {
                    tenant_id: tenant.id,
                    email: r.email,
                    password_hash: await bcrypt.hash(r.password, 10),
                    full_name: r.fullName,
                    nik: r.nik,
                    system_roles: r.systemRoles,
                    timezone: r.timezone,
                    checkin_mode: r.checkinMode,
                    leave_balance: 12,
                    employment_status: client_1.EmploymentStatus.AKTIF,
                    joined_at: new Date(),
                    department_id: r.departmentId,
                    functional_role_id: r.functionalRoleId,
                    manager_id: r.managerId,
                },
            });
        }
    });
    console.log(`\n✓ ${valid.length} user berhasil dibuat.${invalid.length ? ` (${invalid.length} dilewati)` : ''}\n`);
}
main()
    .catch((e) => { console.error('\n✗ Gagal:', e.message ?? e); process.exit(1); })
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=create-users-bulk.js.map