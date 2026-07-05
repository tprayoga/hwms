import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.SKIP_RATE_LIMIT === 'true') {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const path = request.path || '';
    const redisClient = this.redisService.getClient();

    // 1. Login Limit (5 per minute per IP)
    if (path.endsWith('/auth/login')) {
      // Resolve client IP address
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
        throw new HttpException({
          error: {
            code: 'RATE_LIMITED',
            message: 'Terlalu banyak percobaan masuk. Silakan coba lagi dalam 1 menit.',
            details: { ip, current, limit }
          }
        }, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // 2. Check-in/Checkout Limit (10 per minute per User)
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
          throw new HttpException({
            error: {
              code: 'RATE_LIMITED',
              message: 'Terlalu banyak percobaan check-in. Silakan coba lagi dalam 1 menit.',
              details: { userId: user.id, current, limit }
            }
          }, HttpStatus.TOO_MANY_REQUESTS);
        }
      }
    }

    return true;
  }
}
