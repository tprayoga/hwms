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
    async changePassword(userId, oldPassword, newPassword) {
        if (!oldPassword || !newPassword) {
            throw new common_1.BadRequestException('Sandi lama dan sandi baru wajib diisi');
        }
        if (newPassword.length < 8) {
            throw new common_1.BadRequestException('Sandi baru minimal 8 karakter');
        }
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('Pengguna tidak ditemukan');
        }
        const matches = await bcrypt.compare(oldPassword, user.password_hash);
        if (!matches) {
            throw new common_1.UnauthorizedException('Sandi lama salah');
        }
        if (await bcrypt.compare(newPassword, user.password_hash)) {
            throw new common_1.BadRequestException('Sandi baru tidak boleh sama dengan sandi lama');
        }
        const password_hash = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({ where: { id: userId }, data: { password_hash } });
        return { message: 'Sandi berhasil diperbarui' };
    }
    async updateProfile(userId, body) {
        const data = {};
        if (body.fullName !== undefined) {
            const name = body.fullName.trim();
            if (!name)
                throw new common_1.BadRequestException('Nama lengkap tidak boleh kosong');
            data.full_name = name;
        }
        if (body.timezone !== undefined) {
            const allowed = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
            if (!allowed.includes(body.timezone)) {
                throw new common_1.BadRequestException(`Zona waktu tidak valid (pilihan: ${allowed.join(', ')})`);
            }
            data.timezone = body.timezone;
        }
        if (Object.keys(data).length === 0) {
            throw new common_1.BadRequestException('Tidak ada perubahan yang dikirim');
        }
        const user = await this.prisma.user.update({ where: { id: userId }, data });
        return {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            nik: user.nik,
            roles: user.system_roles,
            timezone: user.timezone,
            checkinMode: user.checkin_mode,
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