import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantLocalStorage } from './tenant-storage';
import { PrismaService } from './prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let tenantId: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const payloadBase64 = token.split('.')[1];
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        if (payload && payload.tenantId) {
          tenantId = payload.tenantId;
        }
      } catch (err) {
        // Ignore token parse errors here; AuthGuard will reject invalid requests
      }
    }

    if (!tenantId) {
      // Fallback: resolve the ID of the default tenant 'indotek'
      const defaultTenant = await this.prisma.tenant.findUnique({
        where: { slug: 'indotek' },
      });
      if (defaultTenant) {
        tenantId = defaultTenant.id;
      }
    }

    if (tenantId) {
      tenantLocalStorage.run({ tenantId }, () => {
        next();
      });
    } else {
      next();
    }
  }
}
