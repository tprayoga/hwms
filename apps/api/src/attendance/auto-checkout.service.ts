import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CheckinType, CheckinMode } from '@prisma/client';

@Injectable()
export class AutoCheckoutService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Run the timezone auto-checkout scan every hour (3600 seconds)
    setInterval(async () => {
      try {
        await this.runAutoCheckoutScan();
      } catch (err) {
        console.error('Failed to run auto-checkout scan:', err);
      }
    }, 60 * 60 * 1000);
  }

  async runAutoCheckoutScan() {
    const now = new Date();
    const todayDateStr = now.toISOString().split('T')[0];
    const today = new Date(todayDateStr);

    // Fetch all IN checkins for today that don't have a corresponding OUT checkin yet
    const openCheckins = await this.prisma.checkin.findMany({
      where: {
        date: today,
        type: CheckinType.IN,
      },
      include: {
        user: true,
      },
    });

    for (const checkin of openCheckins) {
      const user = checkin.user;
      
      // Only auto-checkout TWICE check-in mode users
      if (user.checkin_mode !== CheckinMode.TWICE) {
        continue;
      }

      // Check if user already checked out
      const hasCheckout = await this.prisma.checkin.findFirst({
        where: {
          user_id: user.id,
          date: today,
          type: CheckinType.OUT,
        },
      });
      if (hasCheckout) {
        continue;
      }

      // Calculate user's current local hour
      try {
        const localTimeStr = now.toLocaleTimeString('en-US', {
          timeZone: user.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const [localHour] = localTimeStr.split(':').map(Number);

        // If local hour is >= 18 (18:00 / 6 PM), trigger auto-checkout
        if (localHour >= 18) {
          await this.prisma.checkin.create({
            data: {
              tenant_id: checkin.tenant_id,
              user_id: user.id,
              date: today,
              type: CheckinType.OUT,
              work_status: checkin.work_status,
              client_project_id: checkin.client_project_id,
              is_auto: true,
              is_late: false,
              geofence_ok: true,
              device_timestamp: now,
              daily_note: 'Auto-checkout otomatis oleh sistem (18:00)',
            },
          });
          console.log(`Auto-checked out user ${user.email} (timezone: ${user.timezone}, local hour: ${localHour})`);
        }
      } catch (err) {
        console.error(`Failed to process auto-checkout for user ${user.email}:`, err);
      }
    }
  }
}
