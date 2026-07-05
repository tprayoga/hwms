"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const push_service_1 = require("../push/push.service");
const storage_service_1 = require("../storage/storage.service");
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const client_1 = require("@prisma/client");
const tenant_storage_1 = require("../prisma/tenant-storage");
let SchedulerService = SchedulerService_1 = class SchedulerService {
    prisma;
    pushService;
    storageService;
    logger = new common_1.Logger(SchedulerService_1.name);
    redisConnection = null;
    attendanceQueue = null;
    attendanceWorker = null;
    constructor(prisma, pushService, storageService) {
        this.prisma = prisma;
        this.pushService = pushService;
        this.storageService = storageService;
    }
    async onModuleInit() {
        const redisHost = process.env.REDIS_HOST || 'localhost';
        const redisPort = parseInt(process.env.REDIS_PORT || '6379');
        this.redisConnection = new ioredis_1.Redis({
            host: redisHost,
            port: redisPort,
            maxRetriesPerRequest: null,
        });
        this.logger.log(`Connecting BullMQ to Redis at ${redisHost}:${redisPort}`);
        this.attendanceQueue = new bullmq_1.Queue('attendance-jobs', {
            connection: this.redisConnection,
        });
        this.attendanceWorker = new bullmq_1.Worker('attendance-jobs', async (job) => {
            this.logger.log(`Processing background job: ${job.name} (${job.id})`);
            try {
                if (job.name === 'send-reminders') {
                    await this.processReminders();
                }
                else if (job.name === 'selfie-cleanup') {
                    await this.processSelfieCleanup();
                }
                else if (job.name === 'export-attendance') {
                    await this.processExportAttendance(job.data, job.id || 'export');
                }
            }
            catch (err) {
                this.logger.error(`Failed to process job ${job.name}: ${err.message}`);
                throw err;
            }
        }, { connection: this.redisConnection });
        await this.attendanceQueue.add('send-reminders', {}, {
            repeat: { pattern: '*/15 * * * *' },
            jobId: 'reminder-repeatable',
        });
        await this.attendanceQueue.add('selfie-cleanup', {}, {
            repeat: { pattern: '0 2 * * *' },
            jobId: 'cleanup-repeatable',
        });
        this.logger.log('BullMQ repeatable jobs registered successfully.');
    }
    async onModuleDestroy() {
        if (this.attendanceWorker)
            await this.attendanceWorker.close();
        if (this.redisConnection)
            await this.redisConnection.quit();
        this.logger.log('BullMQ connections closed.');
    }
    async triggerExportJob(data) {
        if (!this.attendanceQueue) {
            throw new Error('Queue not initialized');
        }
        const job = await this.attendanceQueue.add('export-attendance', data);
        return job.id || 'export';
    }
    async processReminders() {
        this.logger.log('Running timezone-aware check-in/checkout reminders...');
        const now = new Date();
        const utcHour = now.getUTCHours();
        const utcMinute = now.getUTCMinutes();
        const users = await this.prisma.user.findMany({
            where: { employment_status: 'AKTIF' }
        });
        const todayDateStr = now.toISOString().split('T')[0];
        const today = new Date(todayDateStr);
        for (const user of users) {
            const localTimeStr = now.toLocaleTimeString('en-US', {
                timeZone: user.timezone,
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
            const [localHour, localMin] = localTimeStr.split(':').map(Number);
            this.logger.debug(`User ${user.full_name} (${user.timezone}) local time: ${localHour}:${localMin}`);
            const isHoliday = await this.prisma.holiday.findFirst({ where: { date: today } });
            const isOnLeave = await this.prisma.leaveRequest.findFirst({
                where: {
                    user_id: user.id,
                    status: { in: ['APPROVED', 'AUTO_APPROVED'] },
                    date_from: { lte: today },
                    date_to: { gte: today }
                }
            });
            if (isHoliday || isOnLeave) {
                this.logger.debug(`Skipping reminders for ${user.full_name} today (Holiday/Leave).`);
                continue;
            }
            const checkins = await this.prisma.checkin.findMany({
                where: { user_id: user.id, date: today }
            });
            const checkedIn = checkins.some(c => c.type === client_1.CheckinType.IN);
            const checkedOut = checkins.some(c => c.type === client_1.CheckinType.OUT);
            if (localHour === 8 && !checkedIn) {
                await this.pushService.sendPushNotification(user.id, {
                    title: 'Reminder Check-in Pagi',
                    body: `Halo ${user.full_name}, jangan lupa untuk check-in standup pagi ini. Tetap produktif!`,
                    url: '/hari_ini'
                });
            }
            if (user.checkin_mode === 'ONCE')
                continue;
            if (localHour === 17 && checkedIn && !checkedOut) {
                await this.pushService.sendPushNotification(user.id, {
                    title: 'Reminder Check-out Sore',
                    body: `Halo ${user.full_name}, jangan lupa untuk check-out dan update progres tugas Anda sebelum pulang.`,
                    url: '/hari_ini'
                });
            }
        }
    }
    async processSelfieCleanup() {
        this.logger.log('Starting selfie media cleanup (>90 days old)...');
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const oldCheckins = await this.prisma.checkin.findMany({
            where: {
                submitted_at: { lt: cutoff },
                selfie_key: { not: null }
            }
        });
        this.logger.log(`Found ${oldCheckins.length} check-in selfies to clean up.`);
        for (const c of oldCheckins) {
            if (c.selfie_key) {
                try {
                    await this.storageService.deleteFile('selfies', c.selfie_key);
                    await this.prisma.checkin.update({
                        where: { id: c.id },
                        data: { selfie_key: null }
                    });
                    this.logger.debug(`Cleaned up selfie for check-in ${c.id}`);
                }
                catch (err) {
                    this.logger.error(`Failed to clean up selfie for check-in ${c.id}: ${err.message}`);
                }
            }
        }
    }
    async processExportAttendance(data, jobId) {
        const { dateFrom, dateTo, userId, tenantId } = data;
        this.logger.log(`Running export generation for HR user ${userId} in tenant ${tenantId}`);
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const employees = await this.prisma.user.findMany({
                orderBy: { full_name: 'asc' }
            });
            const start = new Date(dateFrom);
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Absensi Karyawan');
            worksheet.columns = [
                { header: 'NIK', key: 'nik', width: 15 },
                { header: 'Nama Lengkap', key: 'nama', width: 25 },
                { header: 'Hari Kerja', key: 'hariKerja', width: 12 },
                { header: 'WFH', key: 'wfh', width: 8 },
                { header: 'WFO', key: 'wfo', width: 8 },
                { header: 'Onsite', key: 'onsite', width: 8 },
                { header: 'Telat', key: 'telat', width: 8 },
                { header: 'Auto-Checkout', key: 'autoCheckout', width: 15 },
                { header: 'Cuti/Izin/Sakit', key: 'cutiIzinSakit', width: 15 },
                { header: 'Total Jam Kerja', key: 'totalJam', width: 15 },
            ];
            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '0284C7' }
            };
            for (const emp of employees) {
                const checkins = await this.prisma.checkin.findMany({
                    where: {
                        user_id: emp.id,
                        submitted_at: { gte: start, lte: end }
                    }
                });
                const leaves = await this.prisma.leaveRequest.findMany({
                    where: {
                        user_id: emp.id,
                        status: { in: ['APPROVED', 'AUTO_APPROVED'] },
                        date_from: { lte: end },
                        date_to: { gte: start }
                    }
                });
                const uniqueCheckinDates = Array.from(new Set(checkins.map(c => c.date.toISOString().split('T')[0])));
                let wfh = 0;
                let wfo = 0;
                let onsite = 0;
                let telat = 0;
                let autoCheckout = 0;
                let totalJam = 0;
                const dayGroups = {};
                for (const c of checkins) {
                    const dKey = c.date.toISOString().split('T')[0];
                    if (!dayGroups[dKey])
                        dayGroups[dKey] = {};
                    if (c.type === client_1.CheckinType.IN) {
                        dayGroups[dKey].checkin = c.submitted_at;
                        if (c.work_status === 'WFH')
                            wfh++;
                        else if (c.work_status === 'WFO')
                            wfo++;
                        else if (c.work_status === 'ONSITE')
                            onsite++;
                        if (c.is_late)
                            telat++;
                    }
                    else {
                        dayGroups[dKey].checkout = c.submitted_at;
                        if (c.is_auto)
                            autoCheckout++;
                    }
                }
                for (const day of Object.values(dayGroups)) {
                    if (day.checkin && day.checkout) {
                        const diffMs = day.checkout.getTime() - day.checkin.getTime();
                        totalJam += diffMs / (1000 * 60 * 60);
                    }
                }
                let cutiIzinSakit = 0;
                for (const l of leaves) {
                    const lStart = l.date_from < start ? start : l.date_from;
                    const lEnd = l.date_to > end ? end : l.date_to;
                    const diffTime = lEnd.getTime() - lStart.getTime();
                    if (diffTime >= 0) {
                        cutiIzinSakit += Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                    }
                }
                const hariKerja = uniqueCheckinDates.length + cutiIzinSakit;
                worksheet.addRow({
                    nik: emp.nik,
                    nama: emp.full_name,
                    hariKerja,
                    wfh,
                    wfo,
                    onsite,
                    telat,
                    autoCheckout,
                    cutiIzinSakit,
                    totalJam: Math.round(totalJam * 10) / 10,
                });
            }
            const reportsDir = path.join(__dirname, '../../../../uploads/reports');
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
            const fileKey = `report_attendance_${jobId}.xlsx`;
            const filePath = path.join(reportsDir, fileKey);
            await workbook.xlsx.writeFile(filePath);
            this.logger.log(`Excel report saved to path: ${filePath}`);
            try {
                const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
                await this.storageService.uploadFile('reports', fileKey, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            }
            catch (err) {
                this.logger.warn(`Report upload to object storage failed (${fileKey}): ${err.message}. FS fallback remains.`);
            }
            await this.prisma.notification.create({
                data: {
                    tenant_id: tenantId,
                    user_id: userId,
                    kind: client_1.NotificationKind.APPROVAL_DECIDED,
                    payload_json: {
                        title: 'Laporan Absensi Siap Unduh',
                        message: `Laporan absensi rentang ${dateFrom} s/d ${dateTo} telah selesai diproses.`,
                        fileKey
                    }
                }
            });
        });
    }
};
exports.SchedulerService = SchedulerService;
exports.SchedulerService = SchedulerService = SchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        push_service_1.PushService,
        storage_service_1.StorageService])
], SchedulerService);
//# sourceMappingURL=scheduler.service.js.map