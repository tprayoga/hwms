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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_secret_1 = require("./jwt-secret");
const bcrypt = require("bcryptjs");
let AuthService = class AuthService {
    prisma;
    jwtService;
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async validateUser(email, pass) {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });
        if (user && await bcrypt.compare(pass, user.password_hash)) {
            if (user.employment_status !== 'AKTIF') {
                throw new common_1.UnauthorizedException('Akun Anda tidak aktif');
            }
            const { password_hash, ...result } = user;
            return result;
        }
        return null;
    }
    async login(user) {
        const payload = {
            sub: user.id,
            email: user.email,
            roles: user.system_roles,
            tenantId: user.tenant_id
        };
        const accessToken = await this.jwtService.signAsync(payload, {
            secret: (0, jwt_secret_1.getAccessSecret)(),
            expiresIn: '15m',
        });
        const refreshToken = await this.jwtService.signAsync({ sub: user.id, tenantId: user.tenant_id }, {
            secret: (0, jwt_secret_1.getRefreshSecret)(),
            expiresIn: '14d',
        });
        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                nik: user.nik,
                roles: user.system_roles,
                timezone: user.timezone,
                checkinMode: user.checkin_mode,
            }
        };
    }
    async refresh(token) {
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: (0, jwt_secret_1.getRefreshSecret)(),
            });
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });
            if (!user || user.employment_status !== 'AKTIF') {
                throw new common_1.UnauthorizedException('Pengguna tidak aktif atau tidak ditemukan');
            }
            return this.login(user);
        }
        catch (e) {
            throw new common_1.UnauthorizedException('Token refresh tidak valid atau kedaluwarsa');
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map