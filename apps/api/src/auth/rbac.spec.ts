import { AuthGuard } from './auth.guard';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { SystemRole } from '@hwms/shared';
import { ROLES_KEY } from './roles.decorator';
import { describe, beforeAll, it, expect, vi } from 'vitest';

describe('RBAC AuthGuard Validation', () => {
  let guard: AuthGuard;
  let jwtService: JwtService;
  let reflector: Reflector;
  let prisma: PrismaService;

  beforeAll(() => {
    // Create direct mock objects
    jwtService = {
      verifyAsync: vi.fn(),
    } as unknown as JwtService;

    reflector = {
      getAllAndOverride: vi.fn(),
    } as unknown as Reflector;

    prisma = {
      user: {
        findUnique: vi.fn(),
      },
    } as unknown as PrismaService;

    // Manually instantiate to bypass dependency injection metadata issues in Vitest
    guard = new AuthGuard(jwtService, reflector, prisma);
  });

  const createMockContext = (authHeader?: string): ExecutionContext => {
    const req = {
      headers: {
        authorization: authHeader,
      },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('should allow public endpoints to bypass auth', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true); // isPublic = true
    const context = createMockContext();
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should reject requests without authorization header', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false); // isPublic = false
    const context = createMockContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Token autentikasi tidak ditemukan')
    );
  });

  it('should block employee from admin routes (FORBIDDEN_ROLE)', async () => {
    // Mock public = false and role = [SUPER_ADMIN]
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'isPublic') return false;
      if (key === ROLES_KEY) return [SystemRole.SUPER_ADMIN];
      return null;
    });

    vi.spyOn(jwtService, 'verifyAsync').mockResolvedValue({ sub: 'user-id' });
    
    // Mock user has only EMPLOYEE role
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'user-id',
      email: 'employee@indotek.com',
      system_roles: [SystemRole.EMPLOYEE],
      employment_status: 'AKTIF',
    } as any);

    const context = createMockContext('Bearer mock-token');
    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Anda tidak memiliki akses (FORBIDDEN_ROLE)')
    );
  });

  it('should allow superadmin to access admin routes', async () => {
    // Mock public = false and role = [SUPER_ADMIN]
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'isPublic') return false;
      if (key === ROLES_KEY) return [SystemRole.SUPER_ADMIN];
      return null;
    });

    vi.spyOn(jwtService, 'verifyAsync').mockResolvedValue({ sub: 'admin-id' });

    // Mock user has SUPER_ADMIN role
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'admin-id',
      email: 'superadmin@indotek.com',
      system_roles: [SystemRole.SUPER_ADMIN],
      employment_status: 'AKTIF',
    } as any);

    const context = createMockContext('Bearer mock-token');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });
});
