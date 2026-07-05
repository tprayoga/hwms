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
exports.AuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const roles_decorator_1 = require("./roles.decorator");
const public_decorator_1 = require("./public.decorator");
const prisma_service_1 = require("../prisma/prisma.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const jwt_secret_1 = require("./jwt-secret");
let AuthGuard = class AuthGuard {
    jwtService;
    reflector;
    prisma;
    constructor(jwtService, reflector, prisma) {
        this.jwtService = jwtService;
        this.reflector = reflector;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            throw new common_1.UnauthorizedException('Token autentikasi tidak ditemukan');
        }
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: (0, jwt_secret_1.getAccessSecret)(),
            });
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
                include: { department: true, functional_role: true },
            });
            if (!user || user.employment_status !== 'AKTIF') {
                throw new common_1.UnauthorizedException('Akun tidak aktif atau tidak ditemukan');
            }
            request['user'] = user;
            const store = tenant_storage_1.tenantLocalStorage.getStore();
            if (store) {
                store.actorId = user.id;
            }
            const requiredRoles = this.reflector.getAllAndOverride(roles_decorator_1.ROLES_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);
            if (!requiredRoles || requiredRoles.length === 0) {
                return true;
            }
            const hasRole = user.system_roles.some((role) => requiredRoles.includes(role));
            if (!hasRole) {
                throw new common_1.ForbiddenException('Anda tidak memiliki akses (FORBIDDEN_ROLE)');
            }
            return true;
        }
        catch (e) {
            if (e instanceof common_1.ForbiddenException || e instanceof common_1.UnauthorizedException) {
                throw e;
            }
            throw new common_1.UnauthorizedException('Token autentikasi kedaluwarsa atau tidak valid');
        }
    }
    extractTokenFromHeader(request) {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        core_1.Reflector,
        prisma_service_1.PrismaService])
], AuthGuard);
//# sourceMappingURL=auth.guard.js.map