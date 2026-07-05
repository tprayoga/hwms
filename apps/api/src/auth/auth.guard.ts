import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SystemRole } from '@hwms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { getAccessSecret } from './jwt-secret';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Token autentikasi tidak ditemukan');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: getAccessSecret(),
      });

      // Find user in database to ensure they are active and get up-to-date roles
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { department: true, functional_role: true },
      });

      if (!user || user.employment_status !== 'AKTIF') {
        throw new UnauthorizedException('Akun tidak aktif atau tidak ditemukan');
      }

      // Attach user to request
      request['user'] = user;

      // Bind actorId to current tenant storage context for auditing
      const store = tenantLocalStorage.getStore();
      if (store) {
        store.actorId = user.id;
      }

      // Role check
      const requiredRoles = this.reflector.getAllAndOverride<SystemRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (!requiredRoles || requiredRoles.length === 0) {
        return true;
      }

      // Check if user has at least one of the required roles
      const hasRole = user.system_roles.some((role) => requiredRoles.includes(role as SystemRole));
      if (!hasRole) {
        throw new ForbiddenException('Anda tidak memiliki akses (FORBIDDEN_ROLE)');
      }

      return true;
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof UnauthorizedException) {
        throw e;
      }
      throw new UnauthorizedException('Token autentikasi kedaluwarsa atau tidak valid');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
