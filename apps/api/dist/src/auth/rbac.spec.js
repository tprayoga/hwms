"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_guard_1 = require("./auth.guard");
const common_1 = require("@nestjs/common");
const shared_1 = require("@hwms/shared");
const roles_decorator_1 = require("./roles.decorator");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('RBAC AuthGuard Validation', () => {
    let guard;
    let jwtService;
    let reflector;
    let prisma;
    (0, vitest_1.beforeAll)(() => {
        jwtService = {
            verifyAsync: vitest_1.vi.fn(),
        };
        reflector = {
            getAllAndOverride: vitest_1.vi.fn(),
        };
        prisma = {
            user: {
                findUnique: vitest_1.vi.fn(),
            },
        };
        guard = new auth_guard_1.AuthGuard(jwtService, reflector, prisma);
    });
    const createMockContext = (authHeader) => {
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
        };
    };
    (0, vitest_1.it)('should allow public endpoints to bypass auth', async () => {
        vitest_1.vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
        const context = createMockContext();
        const result = await guard.canActivate(context);
        (0, vitest_1.expect)(result).toBe(true);
    });
    (0, vitest_1.it)('should reject requests without authorization header', async () => {
        vitest_1.vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
        const context = createMockContext();
        await (0, vitest_1.expect)(guard.canActivate(context)).rejects.toThrow(new common_1.UnauthorizedException('Token autentikasi tidak ditemukan'));
    });
    (0, vitest_1.it)('should block employee from admin routes (FORBIDDEN_ROLE)', async () => {
        vitest_1.vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
            if (key === 'isPublic')
                return false;
            if (key === roles_decorator_1.ROLES_KEY)
                return [shared_1.SystemRole.SUPER_ADMIN];
            return null;
        });
        vitest_1.vi.spyOn(jwtService, 'verifyAsync').mockResolvedValue({ sub: 'user-id' });
        vitest_1.vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
            id: 'user-id',
            email: 'employee@indotek.com',
            system_roles: [shared_1.SystemRole.EMPLOYEE],
            employment_status: 'AKTIF',
        });
        const context = createMockContext('Bearer mock-token');
        await (0, vitest_1.expect)(guard.canActivate(context)).rejects.toThrow(new common_1.ForbiddenException('Anda tidak memiliki akses (FORBIDDEN_ROLE)'));
    });
    (0, vitest_1.it)('should allow superadmin to access admin routes', async () => {
        vitest_1.vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
            if (key === 'isPublic')
                return false;
            if (key === roles_decorator_1.ROLES_KEY)
                return [shared_1.SystemRole.SUPER_ADMIN];
            return null;
        });
        vitest_1.vi.spyOn(jwtService, 'verifyAsync').mockResolvedValue({ sub: 'admin-id' });
        vitest_1.vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
            id: 'admin-id',
            email: 'superadmin@indotek.com',
            system_roles: [shared_1.SystemRole.SUPER_ADMIN],
            employment_status: 'AKTIF',
        });
        const context = createMockContext('Bearer mock-token');
        const result = await guard.canActivate(context);
        (0, vitest_1.expect)(result).toBe(true);
    });
});
//# sourceMappingURL=rbac.spec.js.map