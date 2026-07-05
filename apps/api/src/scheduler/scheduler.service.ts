import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { StorageService } from '../storage/storage.service';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { CheckinType, NotificationKind } from '@prisma/client';
import { tenantLocalStorage } from '../prisma/tenant-storage';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  
  private redisConnection: Redis | null = null;
  private attendanceQueue: Queue | null = null;
  private attendanceWorker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly storageService: StorageService,
  ) {}

  async onModuleInit() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    this.redisConnection = new Redis({
      host: redisHost,
      port: redisPort,
      maxRetriesPerRequest: null, // mandatory for BullMQ
    });

    this.logger.log(`Connecting BullMQ to Redis at ${redisHost}:${redisPort}`);

    // Define queues
    this.attendanceQueue = new Queue('attendance-jobs', {
      connection: this.redisConnection as any,
    });

    // Setup Worker
    this.attendanceWorker = new Worker(
      'attendance-jobs',
      async (job) => {
        this.logger.log(`Processing background job: ${job.name} (${job.id})`);
        try {
          if (job.name === 'send-reminders') {
            await this.processReminders();
          } else if (job.name === 'selfie-cleanup') {
            await this.processSelfieCleanup();
          } else if (job.name === 'export-attendance') {
            await this.processExportAttendance(job.data, job.id || 'export');
          }
        } catch (err: any) {
          this.logger.error(`Failed to process job ${job.name}: ${err.message}`);
          throw err;
        }
      },
      { connection: this.redisConnection as any }
    );

    // Register repeatable cron-like jobs
    await this.attendanceQueue.add(
      'send-reminders',
      {},
      {
        repeat: { pattern: '*/15 * * * *' }, // every 15 minutes
        jobId: 'reminder-repeatable',
      }
    );

    await this.attendanceQueue.add(
      'selfie-cleanup',
      {},
      {
        repeat: { pattern: '0 2 * * *' }, // daily at 2:00 AM
        jobId: 'cleanup-repeatable',
      }
    );

    this.logger.log('BullMQ repeatable jobs registered successfully.');
  }

  async onModuleDestroy() {
    if (this.attendanceWorker) await this.attendanceWorker.close();
    if (this.redisConnection) await this.redisConnection.quit();
    this.logger.log('BullMQ connections closed.');
  }

  // Trigger immediate export job
  async triggerExportJob(data: any): Promise<string> {
    if (!this.attendanceQueue) {
      throw new Error('Queue not initialized');
    }
    const job = await this.attendanceQueue.add('export-attendance', data);
    return job.id || 'export';
  }

  // Timezone-aware reminders
  private async processReminders() {
    this.logger.log('Running timezone-aware check-in/checkout reminders...');
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    // Fetch all active employees
    const users = await this.prisma.user.findMany({
      where: { employment_status: 'AKTIF' }
    });

    const todayDateStr = now.toISOString().split('T')[0];
    const today = new Date(todayDateStr);

    for (const user of users) {
      // Calculate local hour based on user's timezone
      const localTimeStr = now.toLocaleTimeString('en-US', {
        timeZone: user.timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      const [localHour, localMin] = localTimeStr.split(':').map(Number);
      this.logger.debug(`User ${user.full_name} (${user.timezone}) local time: ${localHour}:${localMin}`);

      // 1. Skip if today is holiday or approved leave
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

      // Query today's checkins for user
      const checkins = await this.prisma.checkin.findMany({
        where: { user_id: user.id, date: today }
      });
      const checkedIn = checkins.some(c => c.type === CheckinType.IN);
      const checkedOut = checkins.some(c => c.type === CheckinType.OUT);

      // A. Morning Check-in Reminder (08:00 - 09:00 local time)
      if (localHour === 8 && !checkedIn) {
        await this.pushService.sendPushNotification(user.id, {
          title: 'Reminder Check-in Pagi',
          body: `Halo ${user.full_name}, jangan lupa untuk check-in standup pagi ini. Tetap produktif!`,
          url: '/hari_ini'
        });
      }

      // B. Evening Checkout Reminder (17:00 - 18:00 local time)
      // Skip if checkin_mode is ONCE
      if (user.checkin_mode === 'ONCE') continue;

      if (localHour === 17 && checkedIn && !checkedOut) {
        await this.pushService.sendPushNotification(user.id, {
          title: 'Reminder Check-out Sore',
          body: `Halo ${user.full_name}, jangan lupa untuk check-out dan update progres tugas Anda sebelum pulang.`,
          url: '/hari_ini'
        });
      }
    }
  }

  // Deletes selfies older than 90 days
  private async processSelfieCleanup() {
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
        } catch (err: any) {
          this.logger.error(`Failed to clean up selfie for check-in ${c.id}: ${err.message}`);
        }
      }
    }
  }

  // Asynchronous Excel exporter
  private async processExportAttendance(data: any, jobId: string) {
    const { dateFrom, dateTo, userId, tenantId } = data;
    this.logger.log(`Running export generation for HR user ${userId} in tenant ${tenantId}`);

    // We must run within the tenant isolation context
    await tenantLocalStorage.run({ tenantId }, async () => {
      // 1. Fetch all tenant employees
      const employees = await this.prisma.user.findMany({
        orderBy: { full_name: 'asc' }
      });

      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);

      // 2. Setup Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Absensi Karyawan');

      // Styling parameters
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

      // Formating header row
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '0284C7' } // Sky-600
      };

      for (const emp of employees) {
        // Query checkins in date range
        const checkins = await this.prisma.checkin.findMany({
          where: {
            user_id: emp.id,
            submitted_at: { gte: start, lte: end }
          }
        });

        // Query approved leaves in date range
        const leaves = await this.prisma.leaveRequest.findMany({
          where: {
            user_id: emp.id,
            status: { in: ['APPROVED', 'AUTO_APPROVED'] },
            date_from: { lte: end },
            date_to: { gte: start }
          }
        });

        // Calculate counts
        const uniqueCheckinDates = Array.from(new Set(checkins.map(c => c.date.toISOString().split('T')[0])));
        
        let wfh = 0;
        let wfo = 0;
        let onsite = 0;
        let telat = 0;
        let autoCheckout = 0;
        let totalJam = 0;

        // Group check-ins per day to calculate durations
        const dayGroups: { [key: string]: { checkin?: Date; checkout?: Date } } = {};
        for (const c of checkins) {
          const dKey = c.date.toISOString().split('T')[0];
          if (!dayGroups[dKey]) dayGroups[dKey] = {};
          if (c.type === CheckinType.IN) {
            dayGroups[dKey].checkin = c.submitted_at;
            if (c.work_status === 'WFH') wfh++;
            else if (c.work_status === 'WFO') wfo++;
            else if (c.work_status === 'ONSITE') onsite++;
            if (c.is_late) telat++;
          } else {
            dayGroups[dKey].checkout = c.submitted_at;
            if (c.is_auto) autoCheckout++;
          }
        }

        // Calculate hours worked
        for (const day of Object.values(dayGroups)) {
          if (day.checkin && day.checkout) {
            const diffMs = day.checkout.getTime() - day.checkin.getTime();
            totalJam += diffMs / (1000 * 60 * 60); // convert to hours
          }
        }

        // Calculate leave days
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

      // Save workbook to reports folder
      const reportsDir = path.join(__dirname, '../../../../uploads/reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const fileKey = `report_attendance_${jobId}.xlsx`;
      const filePath = path.join(reportsDir, fileKey);
      await workbook.xlsx.writeFile(filePath);
      this.logger.log(`Excel report saved to path: ${filePath}`);

      // Also push to object storage so /reports/download can hand back a
      // presigned 24h URL (§7). Local FS copy is kept as a streaming fallback.
      try {
        const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
        await this.storageService.uploadFile(
          'reports',
          fileKey,
          buffer,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      } catch (err: any) {
        this.logger.warn(`Report upload to object storage failed (${fileKey}): ${err.message}. FS fallback remains.`);
      }

      // 3. Post system notification with download signed key
      await this.prisma.notification.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          kind: NotificationKind.APPROVAL_DECIDED,
          payload_json: {
            title: 'Laporan Absensi Siap Unduh',
            message: `Laporan absensi rentang ${dateFrom} s/d ${dateTo} telah selesai diproses.`,
            fileKey
          }
        }
      });
    });
  }
}
