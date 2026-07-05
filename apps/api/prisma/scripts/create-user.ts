/**
 * create-user — CLI helper untuk membuat satu user tanpa perlu login/token
 * atau mencari UUID. Resolusi department (nama), functional_role (kode), dan
 * manager (email) dilakukan otomatis. Password di-hash dengan bcrypt.
 *
 * Jalankan di dalam image API (ts-node + prisma sudah tersedia di sana):
 *
 *   docker compose -f docker-compose.prod.yml --env-file .env.prod \
 *     run --rm --entrypoint "" api \
 *     pnpm exec ts-node prisma/scripts/create-user.ts \
 *       --email budi@posbakum.local --name "Budi Santoso" --nik EMP-100 \
 *       --password Rahasia123 --roles EMPLOYEE \
 *       --dept Engineering --role BE --manager manager.eng@indotek.com
 *
 * Flag:
 *   --email    (wajib)  email login, unik
 *   --name     (wajib)  nama lengkap
 *   --nik      (wajib)  nomor induk karyawan, unik
 *   --password (opsional, default: UserPassword123)
 *   --roles    (opsional, default: EMPLOYEE) daftar dipisah koma:
 *              EMPLOYEE|MANAGER|PM_ADMIN|HR|CTO|SUPER_ADMIN
 *   --dept     (opsional) nama Department, mis. Engineering|Operations|Sales|HR
 *   --role     (opsional) kode FunctionalRole, mis. PO|SA|Infra|BE|FE|QA|TW|Sales
 *   --manager  (opsional) email atasan/approver default
 *   --tz       (opsional, default: Asia/Jakarta) Asia/Jakarta|Asia/Makassar|Asia/Jayapura
 *   --mode     (opsional, default: TWICE) TWICE|ONCE
 *   --leave    (opsional, default: 12) saldo cuti awal
 *   --tenant   (opsional) slug tenant bila lebih dari satu (default: satu-satunya)
 */
import { PrismaClient, SystemRole, CheckinMode, EmploymentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = 'true';
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function fail(msg: string): never {
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

  // --- Tenant ---
  const tenants = await prisma.tenant.findMany();
  if (tenants.length === 0) {
    fail('Tidak ada tenant. Jalankan seed dulu (membuat tenant `indotek`).');
  }
  let tenant = tenants[0];
  if (args.tenant) {
    const found = tenants.find((t) => t.slug === args.tenant);
    if (!found) fail(`Tenant slug "${args.tenant}" tidak ada. Ada: ${tenants.map((t) => t.slug).join(', ')}`);
    tenant = found;
  } else if (tenants.length > 1) {
    fail(`Ada ${tenants.length} tenant — tentukan --tenant. Ada: ${tenants.map((t) => t.slug).join(', ')}`);
  }

  // --- Roles ---
  const validRoles = Object.values(SystemRole) as string[];
  const rolesRaw = (args.roles ?? 'EMPLOYEE').split(',').map((r) => r.trim()).filter(Boolean);
  for (const r of rolesRaw) {
    if (!validRoles.includes(r)) fail(`system_role "${r}" tidak valid. Pilihan: ${validRoles.join(', ')}`);
  }
  const systemRoles = rolesRaw as SystemRole[];

  // --- Checkin mode ---
  const mode = (args.mode ?? 'TWICE') as CheckinMode;
  if (!(Object.values(CheckinMode) as string[]).includes(mode)) {
    fail(`--mode "${mode}" tidak valid. Pilihan: ${Object.values(CheckinMode).join(', ')}`);
  }

  // --- Department (by name) ---
  let departmentId: string | null = null;
  if (args.dept) {
    const dept = await prisma.department.findFirst({ where: { tenant_id: tenant.id, name: args.dept } });
    if (!dept) {
      const all = await prisma.department.findMany({ where: { tenant_id: tenant.id }, select: { name: true } });
      fail(`Department "${args.dept}" tidak ada. Ada: ${all.map((d) => d.name).join(', ') || '(kosong)'}`);
    }
    departmentId = dept.id;
  }

  // --- Functional role (by code) ---
  let functionalRoleId: string | null = null;
  if (args.role) {
    const fr = await prisma.functionalRole.findFirst({ where: { tenant_id: tenant.id, code: args.role } });
    if (!fr) {
      const all = await prisma.functionalRole.findMany({ where: { tenant_id: tenant.id }, select: { code: true } });
      fail(`FunctionalRole kode "${args.role}" tidak ada. Ada: ${all.map((f) => f.code).join(', ') || '(kosong)'}`);
    }
    functionalRoleId = fr.id;
  }

  // --- Manager (by email) ---
  let managerId: string | null = null;
  if (args.manager) {
    const mgr = await prisma.user.findFirst({ where: { tenant_id: tenant.id, email: args.manager } });
    if (!mgr) fail(`Manager dengan email "${args.manager}" tidak ada.`);
    managerId = mgr.id;
  }

  // --- Duplicate guard ---
  const dup = await prisma.user.findFirst({
    where: { tenant_id: tenant.id, OR: [{ email }, { nik }] },
    select: { email: true, nik: true },
  });
  if (dup) fail(`User sudah ada (email/nik bentrok): ${dup.email} / ${dup.nik}`);

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
      employment_status: EmploymentStatus.AKTIF,
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
