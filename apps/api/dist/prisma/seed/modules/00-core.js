"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedCore = seedCore;
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
function excelDateToDate(excelSerial) {
    if (typeof excelSerial === 'number') {
        const offset = excelSerial > 60 ? 1 : 0;
        const utcDays = Math.floor(excelSerial - 25569 - offset);
        const utcValue = utcDays * 86400;
        return new Date(utcValue * 1000);
    }
    return new Date(excelSerial);
}
async function seedCore(prisma, ctx) {
    console.log('Starting Phase 7 Hardening Database Seeding...');
    console.log('Cleaning up existing database records...');
    await prisma.taskAssignment.deleteMany({});
    await prisma.standupItem.deleteMany({});
    await prisma.blocker.deleteMany({});
    await prisma.taskDependency.deleteMany({});
    await prisma.taskEvidence.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.sprint.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.checkin.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.pushSubscription.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.department.deleteMany({});
    await prisma.functionalRole.deleteMany({});
    await prisma.location.deleteMany({});
    await prisma.holiday.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.tenant.deleteMany({});
    console.log('Database clean completed.');
    const tenant = await prisma.tenant.create({
        data: {
            name: 'PT Indotek Buana Karya',
            slug: 'indotek',
            theme_json: {
                primaryColor: '#0ea5e9',
                darkMode: true,
            },
            is_active: true,
        },
    });
    console.log(`Tenant created: ${tenant.name} (${tenant.id})`);
    const deptNames = ['Engineering', 'Operations', 'Sales', 'HR'];
    const depts = {};
    for (const name of deptNames) {
        const dept = await prisma.department.create({
            data: {
                tenant_id: tenant.id,
                name,
            },
        });
        depts[name] = dept;
    }
    console.log(`Created ${deptNames.length} departments.`);
    const rolesData = [
        { name: 'Product Owner', code: 'PO' },
        { name: 'System Analyst', code: 'SA' },
        { name: 'Infrastructure Engineer', code: 'Infra' },
        { name: 'Backend Engineer', code: 'BE' },
        { name: 'Frontend Engineer', code: 'FE' },
        { name: 'Quality Assurance', code: 'QA' },
        { name: 'Technical Writer', code: 'TW' },
        { name: 'Sales Representative', code: 'Sales' },
    ];
    const functionalRoles = {};
    for (const role of rolesData) {
        const fRole = await prisma.functionalRole.create({
            data: {
                tenant_id: tenant.id,
                name: role.name,
                code: role.code,
            },
        });
        functionalRoles[role.code] = fRole;
    }
    console.log(`Created ${rolesData.length} functional roles.`);
    const passwordHash = await bcrypt.hash('SuperSecurePassword123', 10);
    const superAdmin = await prisma.user.create({
        data: {
            tenant_id: tenant.id,
            email: 'superadmin@indotek.com',
            password_hash: passwordHash,
            full_name: 'Super Admin',
            nik: 'SA-001',
            system_roles: [client_1.SystemRole.SUPER_ADMIN, client_1.SystemRole.MANAGER],
            timezone: 'Asia/Jakarta',
            checkin_mode: client_1.CheckinMode.TWICE,
            leave_balance: 12,
            employment_status: client_1.EmploymentStatus.AKTIF,
            joined_at: new Date('2026-01-01T00:00:00Z'),
            department_id: depts['Engineering'].id,
            functional_role_id: functionalRoles['BE'].id,
        },
    });
    const managersData = [
        { email: 'manager.eng@indotek.com', name: 'Eng Manager', nik: 'M-ENG', dept: 'Engineering', role: 'SA', tz: 'Asia/Jakarta', sysRoles: [client_1.SystemRole.MANAGER] },
        { email: 'manager.ops@indotek.com', name: 'Ops Manager', nik: 'M-OPS', dept: 'Operations', role: 'Infra', tz: 'Asia/Makassar', sysRoles: [client_1.SystemRole.MANAGER] },
        { email: 'manager.sales@indotek.com', name: 'Sales Manager', nik: 'M-SLS', dept: 'Sales', role: 'Sales', tz: 'Asia/Jayapura', sysRoles: [client_1.SystemRole.MANAGER] },
        { email: 'manager.hr@indotek.com', name: 'HR Manager', nik: 'M-HR', dept: 'HR', role: 'Sales', tz: 'Asia/Jakarta', sysRoles: [client_1.SystemRole.MANAGER, client_1.SystemRole.HR] },
        { email: 'pm.admin@indotek.com', name: 'PM Administrator', nik: 'PM-001', dept: 'Engineering', role: 'PO', tz: 'Asia/Jakarta', sysRoles: [client_1.SystemRole.PM_ADMIN] },
    ];
    const managers = {};
    for (const m of managersData) {
        const user = await prisma.user.create({
            data: {
                tenant_id: tenant.id,
                email: m.email,
                password_hash: passwordHash,
                full_name: m.name,
                nik: m.nik,
                system_roles: m.sysRoles,
                timezone: m.tz,
                checkin_mode: client_1.CheckinMode.TWICE,
                leave_balance: 12,
                employment_status: client_1.EmploymentStatus.AKTIF,
                joined_at: new Date('2026-01-01T00:00:00Z'),
                department_id: depts[m.dept].id,
                functional_role_id: functionalRoles[m.role].id,
                manager_id: superAdmin.id,
            },
        });
        managers[m.email] = user;
    }
    const employeesData = [
        { email: 'eng1.po@indotek.com', name: 'WIB PO', nik: 'EMP-01', role: 'PO', dept: 'Engineering', tz: 'Asia/Jakarta', mgr: 'manager.eng@indotek.com' },
        { email: 'eng1.sa@indotek.com', name: 'WIB SA', nik: 'EMP-02', role: 'SA', dept: 'Engineering', tz: 'Asia/Jakarta', mgr: 'manager.eng@indotek.com' },
        { email: 'eng1.tw@indotek.com', name: 'WIB TW', nik: 'EMP-03', role: 'TW', dept: 'Engineering', tz: 'Asia/Jakarta', mgr: 'manager.eng@indotek.com' },
        { email: 'eng1.be@indotek.com', name: 'WIB BE 1', nik: 'EMP-04', role: 'BE', dept: 'Engineering', tz: 'Asia/Jakarta', mgr: 'manager.eng@indotek.com' },
        { email: 'eng1.fe@indotek.com', name: 'WIB FE 1', nik: 'EMP-05', role: 'FE', dept: 'Engineering', tz: 'Asia/Jakarta', mgr: 'manager.eng@indotek.com' },
        { email: 'eng1.qa@indotek.com', name: 'WIB QA 1', nik: 'EMP-06', role: 'QA', dept: 'Engineering', tz: 'Asia/Jakarta', mgr: 'manager.eng@indotek.com' },
        { email: 'eng2.be@indotek.com', name: 'WITA BE 2', nik: 'EMP-07', role: 'BE', dept: 'Engineering', tz: 'Asia/Makassar', mgr: 'manager.eng@indotek.com' },
        { email: 'eng2.fe@indotek.com', name: 'WITA FE 2', nik: 'EMP-08', role: 'FE', dept: 'Engineering', tz: 'Asia/Makassar', mgr: 'manager.eng@indotek.com' },
        { email: 'eng2.qa@indotek.com', name: 'WITA QA 2', nik: 'EMP-09', role: 'QA', dept: 'Engineering', tz: 'Asia/Makassar', mgr: 'manager.eng@indotek.com' },
        { email: 'eng1.infra@indotek.com', name: 'WITA Infra 1', nik: 'EMP-10', role: 'Infra', dept: 'Engineering', tz: 'Asia/Makassar', mgr: 'manager.eng@indotek.com' },
        { email: 'sales1@indotek.com', name: 'WITA Sales 1', nik: 'EMP-11', role: 'Sales', dept: 'Sales', tz: 'Asia/Makassar', mgr: 'manager.sales@indotek.com' },
        { email: 'sales2@indotek.com', name: 'WITA Sales 2', nik: 'EMP-12', role: 'Sales', dept: 'Sales', tz: 'Asia/Makassar', mgr: 'manager.sales@indotek.com' },
        { email: 'eng3.be@indotek.com', name: 'WIT BE 3', nik: 'EMP-13', role: 'BE', dept: 'Engineering', tz: 'Asia/Jayapura', mgr: 'manager.eng@indotek.com' },
        { email: 'eng3.fe@indotek.com', name: 'WIT FE 3', nik: 'EMP-14', role: 'FE', dept: 'Engineering', tz: 'Asia/Jayapura', mgr: 'manager.eng@indotek.com' },
        { email: 'eng3.qa@indotek.com', name: 'WIT QA 3', nik: 'EMP-15', role: 'QA', dept: 'Engineering', tz: 'Asia/Jayapura', mgr: 'manager.eng@indotek.com' },
        { email: 'eng2.infra@indotek.com', name: 'WIT Infra 2', nik: 'EMP-16', role: 'Infra', dept: 'Engineering', tz: 'Asia/Jayapura', mgr: 'manager.eng@indotek.com' },
        { email: 'sales3@indotek.com', name: 'WIT Sales 3', nik: 'EMP-17', role: 'Sales', dept: 'Sales', tz: 'Asia/Jayapura', mgr: 'manager.sales@indotek.com' },
        { email: 'sales4@indotek.com', name: 'WIT Sales 4', nik: 'EMP-18', role: 'Sales', dept: 'Sales', tz: 'Asia/Jayapura', mgr: 'manager.sales@indotek.com' },
    ];
    const employees = {};
    for (const e of employeesData) {
        const mgrUser = managers[e.mgr];
        const user = await prisma.user.create({
            data: {
                tenant_id: tenant.id,
                email: e.email,
                password_hash: passwordHash,
                full_name: e.name,
                nik: e.nik,
                system_roles: [client_1.SystemRole.EMPLOYEE],
                timezone: e.tz,
                checkin_mode: client_1.CheckinMode.TWICE,
                leave_balance: 12,
                employment_status: client_1.EmploymentStatus.AKTIF,
                joined_at: new Date('2026-01-01T00:00:00Z'),
                department_id: depts[e.dept].id,
                functional_role_id: functionalRoles[e.role].id,
                manager_id: mgrUser ? mgrUser.id : null,
            },
        });
        employees[e.email] = user;
    }
    const allUsersMap = {
        ...employees,
        ...managers,
        'superadmin@indotek.com': superAdmin,
    };
    console.log(`Created 24 dummy users successfully.`);
    const holidaysData = [
        { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi', isCutiBersama: false },
        { date: '2026-01-15', name: 'Isra Mikraj Nabi Muhammad SAW', isCutiBersama: false },
        { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili', isCutiBersama: false },
        { date: '2026-03-18', name: 'Hari Suci Nyepi Tahun Baru Saka 1948', isCutiBersama: false },
        { date: '2026-03-20', name: 'Hari Raya Idul Fitri 1447 Hijriah (Hari Ke-1)', isCutiBersama: false },
        { date: '2026-03-21', name: 'Hari Raya Idul Fitri 1447 Hijriah (Hari Ke-2)', isCutiBersama: false },
        { date: '2026-03-23', name: 'Cuti Bersama Hari Raya Idul Fitri 1447 H', isCutiBersama: true },
        { date: '2026-03-24', name: 'Cuti Bersama Hari Raya Idul Fitri 1447 H', isCutiBersama: true },
        { date: '2026-04-03', name: 'Wafat Isa Almasih (Jumat Agung)', isCutiBersama: false },
        { date: '2026-05-01', name: 'Hari Buruh Internasional', isCutiBersama: false },
        { date: '2026-05-14', name: 'Kenaikan Isa Almasih', isCutiBersama: false },
        { date: '2026-05-27', name: 'Hari Raya Idul Adha 1447 Hijriah', isCutiBersama: false },
        { date: '2026-05-31', name: 'Hari Raya Waisak 2570 BE', isCutiBersama: false },
        { date: '2026-06-01', name: 'Hari Lahir Pancasila', isCutiBersama: false },
        { date: '2026-06-16', name: 'Tahun Baru Islam 1448 Hijriah', isCutiBersama: false },
        { date: '2026-08-17', name: 'Hari Kemerdekaan Republik Indonesia', isCutiBersama: false },
        { date: '2026-08-25', name: 'Maulid Nabi Muhammad SAW', isCutiBersama: false },
        { date: '2026-12-25', name: 'Hari Raya Natal', isCutiBersama: false },
        { date: '2026-12-28', name: 'Cuti Bersama Hari Raya Natal', isCutiBersama: true },
    ];
    for (const holiday of holidaysData) {
        await prisma.holiday.create({
            data: {
                tenant_id: tenant.id,
                date: new Date(holiday.date),
                name: holiday.name,
                is_cuti_bersama: holiday.isCutiBersama,
            },
        });
    }
    console.log(`Preloaded ${holidaysData.length} Indonesia holidays.`);
    const project = await prisma.project.create({
        data: {
            tenant_id: tenant.id,
            name: 'Saft VE POC',
            code_prefix: 'SV',
            status: 'ACTIVE',
        },
    });
    const sprints = {};
    const projectStartDate = new Date('2026-06-01T00:00:00Z');
    for (let i = 0; i < 12; i++) {
        const sStart = new Date(projectStartDate.getTime() + i * 14 * 24 * 60 * 60 * 1000);
        const sEnd = new Date(sStart.getTime() + 13 * 24 * 60 * 60 * 1000 + 23 * 3600 * 1000 + 59 * 60000);
        const sprint = await prisma.sprint.create({
            data: {
                tenant_id: tenant.id,
                project_id: project.id,
                number: i,
                start_date: sStart,
                end_date: sEnd,
                goal: `Sprint ${i} milestone execution goal.`,
            },
        });
        sprints[i] = sprint;
    }
    console.log(`Created project "Saft VE POC" and 12 sprints (0 to 11).`);
    await prisma.location.create({
        data: {
            tenant_id: tenant.id,
            name: 'Bandung Office',
            type: client_1.LocationType.OFFICE,
            lat: -6.917464,
            lng: 107.619122,
            radius_m: 200,
        },
    });
    console.log('Importing 456 tasks from seed workbook...');
    const seedFilePath = path.join(__dirname, '../../../../../seed/task_management_indotek.xlsx');
    const wb = XLSX.read(fs.readFileSync(seedFilePath), { type: 'buffer' });
    const ws = wb.Sheets['Sprint Tasks'];
    const dataRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const taskRows = dataRows.slice(2);
    let importCount = 0;
    for (const row of taskRows) {
        if (!row || row.length === 0 || !row[0])
            continue;
        const code = String(row[0]).trim();
        const sprintName = String(row[1]).trim();
        const roleName = String(row[3]).trim();
        const workstream = String(row[4]).trim();
        const title = String(row[5]).trim();
        const deliverable = String(row[6]).trim();
        const priorityStr = String(row[7]).trim();
        const plannedStartVal = row[8];
        const plannedEndVal = row[9];
        const ownerName = String(row[10]).trim();
        const statusStr = String(row[11]).trim();
        let completePctVal = row[12];
        const weightVal = row[13];
        const riskStr = String(row[18]).trim();
        const notes = row[20] ? String(row[20]).trim() : null;
        const sprintNumber = parseInt(sprintName.replace('Sprint ', ''), 10);
        const sprint = sprints[sprintNumber];
        if (!sprint) {
            console.warn(`Sprint ${sprintNumber} not found for row ${code}. skipping.`);
            continue;
        }
        let roleCode = 'TBD';
        if (roleName === 'Product Owner')
            roleCode = 'PO';
        else if (roleName === 'System Analyst')
            roleCode = 'SA';
        else if (roleName === 'Infrastructure Engineer')
            roleCode = 'Infra';
        else if (roleName === 'Backend Engineer')
            roleCode = 'BE';
        else if (roleName === 'Frontend Engineer')
            roleCode = 'FE';
        else if (roleName === 'Quality Assurance')
            roleCode = 'QA';
        else if (roleName === 'Technical Writer')
            roleCode = 'TW';
        else if (roleName === 'Sales' || roleName === 'Sales Representative')
            roleCode = 'Sales';
        const fRole = functionalRoles[roleCode];
        let priority = 'MEDIUM';
        if (priorityStr.toUpperCase() === 'HIGH')
            priority = 'HIGH';
        else if (priorityStr.toUpperCase() === 'LOW')
            priority = 'LOW';
        else if (priorityStr.toUpperCase() === 'CRITICAL')
            priority = 'CRITICAL';
        let status = 'NOT_STARTED';
        if (statusStr === 'In Progress')
            status = 'IN_PROGRESS';
        else if (statusStr === 'Done')
            status = 'DONE';
        else if (statusStr === 'Blocked')
            status = 'BLOCKED';
        else if (statusStr === 'Deferred')
            status = 'DEFERRED';
        else if (statusStr === 'Cancelled')
            status = 'CANCELLED';
        let risk_level = 'MEDIUM';
        if (riskStr.toUpperCase() === 'HIGH')
            risk_level = 'HIGH';
        else if (riskStr.toUpperCase() === 'LOW')
            risk_level = 'LOW';
        if (completePctVal <= 1) {
            completePctVal = Math.round(completePctVal * 100);
        }
        else {
            completePctVal = Math.round(completePctVal);
        }
        const planned_start = excelDateToDate(plannedStartVal);
        const planned_end = excelDateToDate(plannedEndVal);
        const task = await prisma.task.create({
            data: {
                tenant_id: tenant.id,
                project_id: project.id,
                sprint_id: sprint.id,
                functional_role_id: fRole ? fRole.id : null,
                code,
                workstream,
                title,
                deliverable,
                priority,
                planned_start,
                planned_end,
                status,
                percent_complete: completePctVal,
                weight: weightVal ? Number(weightVal) : 1,
                risk_level,
                notes,
            },
        });
        if (ownerName !== 'TBD') {
            let assignee = null;
            if (roleCode === 'PO')
                assignee = allUsersMap['eng1.po@indotek.com'];
            else if (roleCode === 'SA')
                assignee = allUsersMap['eng1.sa@indotek.com'];
            else if (roleCode === 'TW')
                assignee = allUsersMap['eng1.tw@indotek.com'];
            else if (roleCode === 'BE') {
                const bes = ['eng1.be@indotek.com', 'eng2.be@indotek.com', 'eng3.be@indotek.com'];
                assignee = allUsersMap[bes[importCount % 3]];
            }
            else if (roleCode === 'FE') {
                const fes = ['eng1.fe@indotek.com', 'eng2.fe@indotek.com', 'eng3.fe@indotek.com'];
                assignee = allUsersMap[fes[importCount % 3]];
            }
            else if (roleCode === 'QA') {
                const qas = ['eng1.qa@indotek.com', 'eng2.qa@indotek.com', 'eng3.qa@indotek.com'];
                assignee = allUsersMap[qas[importCount % 3]];
            }
            else if (roleCode === 'Infra') {
                const infras = ['eng1.infra@indotek.com', 'eng2.infra@indotek.com'];
                assignee = allUsersMap[infras[importCount % 2]];
            }
            else if (roleCode === 'Sales') {
                const sales = ['sales1@indotek.com', 'sales2@indotek.com', 'sales3@indotek.com', 'sales4@indotek.com'];
                assignee = allUsersMap[sales[importCount % 4]];
            }
            if (assignee) {
                await prisma.taskAssignment.create({
                    data: {
                        tenant_id: tenant.id,
                        task_id: task.id,
                        user_id: assignee.id,
                        assigned_at: new Date(),
                    },
                });
            }
        }
        importCount++;
    }
    console.log(`Successfully seeded ${importCount} tasks into project "Saft VE POC"!`);
    console.log('Phase 7 Seeding successfully finished!');
    ctx.refs.tenant = tenant;
    ctx.refs.departments = depts;
    ctx.refs.functionalRoles = functionalRoles;
    ctx.refs.users = allUsersMap;
    ctx.refs.project = project;
    ctx.refs.sprints = sprints;
}
//# sourceMappingURL=00-core.js.map