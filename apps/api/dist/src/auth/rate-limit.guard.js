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
exports.RateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis/redis.service");
let RateLimitGuard = class RateLimitGuard {
    redisService;
    constructor(redisService) {
        this.redisService = redisService;
    }
    async canActivate(context) {
        if (process.env.SKIP_RATE_LIMIT === 'true') {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const path = request.path || '';
        const redisClient = this.redisService.getClient();
        if (path.endsWith('/auth/login')) {
            let ip = request.ip || '127.0.0.1';
            const forwarded = request.headers['x-forwarded-for'];
            if (forwarded) {
                ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
            }
            const key = `rate_limit:login:${ip}`;
            const limit = 5;
            const current = await redisClient.incr(key);
            if (current === 1) {
                await redisClient.expire(key, 60);
            }
            if (current > limit) {
                throw new common_1.HttpException({
                    error: {
                        code: 'RATE_LIMITED',
                        message: 'Terlalu banyak percobaan masuk. Silakan coba lagi dalam 1 menit.',
                        details: { ip, current, limit }
                    }
                }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
        }
        if (path.includes('/checkins')) {
            const user = request.user;
            if (user && user.id) {
                const key = `rate_limit:checkin:${user.id}`;
                const limit = 10;
                const current = await redisClient.incr(key);
                if (current === 1) {
                    await redisClient.expire(key, 60);
                }
                if (current > limit) {
                    throw new common_1.HttpException({
                        error: {
                            code: 'RATE_LIMITED',
                            message: 'Terlalu banyak percobaan check-in. Silakan coba lagi dalam 1 menit.',
                            details: { userId: user.id, current, limit }
                        }
                    }, common_1.HttpStatus.TOO_MANY_REQUESTS);
                }
            }
        }
        return true;
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], RateLimitGuard);
//# sourceMappingURL=rate-limit.guard.js.map