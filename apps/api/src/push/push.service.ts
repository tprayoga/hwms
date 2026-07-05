import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';
import { tenantLocalStorage } from '../prisma/tenant-storage';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private vapidKeys: { publicKey: string; privateKey: string } | null = null;
  private subject = 'mailto:admin@indotek.com';

  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(): string {
    const tenantId = tenantLocalStorage.getStore()?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Context Tenant ID tidak ditemukan');
    }
    return tenantId;
  }

  async onModuleInit() {
    const envPub = process.env.VAPID_PUBLIC_KEY;
    const envPriv = process.env.VAPID_PRIVATE_KEY;
    const envSub = process.env.VAPID_SUBJECT;

    if (envSub) this.subject = envSub;

    if (envPub && envPriv) {
      this.vapidKeys = { publicKey: envPub, privateKey: envPriv };
      this.logger.log('VAPID Keys loaded from environment configurations.');
    } else {
      const generated = webpush.generateVAPIDKeys();
      this.vapidKeys = generated;
      this.logger.warn('================ VAPID KEYS GENERATED DYNAMICALLY ================');
      this.logger.warn(`VAPID_PUBLIC_KEY=${generated.publicKey}`);
      this.logger.warn(`VAPID_PRIVATE_KEY=${generated.privateKey}`);
      this.logger.warn('Please add these to your local .env to stabilize push subscriptions!');
      this.logger.warn('==================================================================');
    }

    if (this.vapidKeys) {
      webpush.setVapidDetails(
        this.subject,
        this.vapidKeys.publicKey,
        this.vapidKeys.privateKey
      );
    }
  }

  getPublicKey() {
    return this.vapidKeys?.publicKey || '';
  }

  async saveSubscription(userId: string, subscription: any, userAgent?: string) {
    const tenantId = this.getTenantId();
    const endpoint = subscription.endpoint;
    if (!endpoint) {
      throw new BadRequestException('Push endpoint is missing');
    }

    const existing = await this.prisma.pushSubscription.findFirst({
      where: { user_id: userId, endpoint }
    });

    if (existing) {
      return this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          keys_json: subscription.keys || {},
          user_agent: userAgent || null
        }
      });
    }

    return this.prisma.pushSubscription.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        endpoint,
        keys_json: subscription.keys || {},
        user_agent: userAgent || null
      }
    });
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint }
    });
  }

  async sendPushNotification(userId: string, payload: { title: string; body: string; url?: string }) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { user_id: userId }
    });

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: sub.keys_json as any
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({
            notification: {
              title: payload.title,
              body: payload.body,
              icon: '/icons/icon-192x192.png',
              data: {
                url: payload.url || '/'
              }
            }
          })
        );
      } catch (error: any) {
        this.logger.error(`Push subscription error for user ${userId} on sub ${sub.id}: ${error.message}`);
        if (error.statusCode === 410 || error.statusCode === 404) {
          this.logger.warn(`Removing stale push subscription: ${sub.id}`);
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    }
  }

  async getNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 20
    });
  }
}
