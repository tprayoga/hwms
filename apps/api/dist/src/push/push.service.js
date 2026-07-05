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
var PushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const webpush = require("web-push");
const tenant_storage_1 = require("../prisma/tenant-storage");
let PushService = PushService_1 = class PushService {
    prisma;
    logger = new common_1.Logger(PushService_1.name);
    vapidKeys = null;
    subject = 'mailto:admin@indotek.com';
    constructor(prisma) {
        this.prisma = prisma;
    }
    getTenantId() {
        const tenantId = tenant_storage_1.tenantLocalStorage.getStore()?.tenantId;
        if (!tenantId) {
            throw new common_1.BadRequestException('Context Tenant ID tidak ditemukan');
        }
        return tenantId;
    }
    async onModuleInit() {
        const envPub = process.env.VAPID_PUBLIC_KEY;
        const envPriv = process.env.VAPID_PRIVATE_KEY;
        const envSub = process.env.VAPID_SUBJECT;
        if (envSub)
            this.subject = envSub;
        if (envPub && envPriv) {
            this.vapidKeys = { publicKey: envPub, privateKey: envPriv };
            this.logger.log('VAPID Keys loaded from environment configurations.');
        }
        else {
            const generated = webpush.generateVAPIDKeys();
            this.vapidKeys = generated;
            this.logger.warn('================ VAPID KEYS GENERATED DYNAMICALLY ================');
            this.logger.warn(`VAPID_PUBLIC_KEY=${generated.publicKey}`);
            this.logger.warn(`VAPID_PRIVATE_KEY=${generated.privateKey}`);
            this.logger.warn('Please add these to your local .env to stabilize push subscriptions!');
            this.logger.warn('==================================================================');
        }
        if (this.vapidKeys) {
            webpush.setVapidDetails(this.subject, this.vapidKeys.publicKey, this.vapidKeys.privateKey);
        }
    }
    getPublicKey() {
        return this.vapidKeys?.publicKey || '';
    }
    async saveSubscription(userId, subscription, userAgent) {
        const tenantId = this.getTenantId();
        const endpoint = subscription.endpoint;
        if (!endpoint) {
            throw new common_1.BadRequestException('Push endpoint is missing');
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
    async unsubscribe(endpoint) {
        await this.prisma.pushSubscription.deleteMany({
            where: { endpoint }
        });
    }
    async sendPushNotification(userId, payload) {
        const subscriptions = await this.prisma.pushSubscription.findMany({
            where: { user_id: userId }
        });
        for (const sub of subscriptions) {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: sub.keys_json
            };
            try {
                await webpush.sendNotification(pushSubscription, JSON.stringify({
                    notification: {
                        title: payload.title,
                        body: payload.body,
                        icon: '/icons/icon-192x192.png',
                        data: {
                            url: payload.url || '/'
                        }
                    }
                }));
            }
            catch (error) {
                this.logger.error(`Push subscription error for user ${userId} on sub ${sub.id}: ${error.message}`);
                if (error.statusCode === 410 || error.statusCode === 404) {
                    this.logger.warn(`Removing stale push subscription: ${sub.id}`);
                    await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
                }
            }
        }
    }
    async getNotifications(userId) {
        return this.prisma.notification.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
            take: 20
        });
    }
};
exports.PushService = PushService;
exports.PushService = PushService = PushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PushService);
//# sourceMappingURL=push.service.js.map