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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoCheckoutService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let AutoCheckoutService = class AutoCheckoutService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    onModuleInit() {
        setInterval(async () => {
            try {
                await this.runAutoCheckoutScan();
            }
            catch (err) {
                console.error('Failed to run auto-checkout scan:', err);
            }
        }, 60 * 60 * 1000);
    }
    async runAutoCheckoutScan() {
        const now = new Date();
        const todayDateStr = now.toISOString().split('T')[0];
        const today = new Date(todayDateStr);
        const openCheckins = await this.prisma.checkin.findMany({
            where: {
                date: today,
                type: client_1.CheckinType.IN,
            },
            include: {
                user: true,
            },
        });
        for (const checkin of openCheckins) {
            const user = checkin.user;
            if (user.checkin_mode !== client_1.CheckinMode.TWICE) {
                continue;
            }
            const hasCheckout = await this.prisma.checkin.findFirst({
                where: {
                    user_id: user.id,
                    date: today,
                    type: client_1.CheckinType.OUT,
                },
            });
            if (hasCheckout) {
                continue;
            }
            try {
                const localTimeStr = now.toLocaleTimeString('en-US', {
                    timeZone: user.timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                });
                const [localHour] = localTimeStr.split(':').map(Number);
                if (localHour >= 18) {
                    await this.prisma.checkin.create({
                        data: {
                            tenant_id: checkin.tenant_id,
                            user_id: user.id,
                            date: today,
                            type: client_1.CheckinType.OUT,
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
            }
            catch (err) {
                console.error(`Failed to process auto-checkout for user ${user.email}:`, err);
            }
        }
    }
};
exports.AutoCheckoutService = AutoCheckoutService;
exports.AutoCheckoutService = AutoCheckoutService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AutoCheckoutService);
//# sourceMappingURL=auto-checkout.service.js.map