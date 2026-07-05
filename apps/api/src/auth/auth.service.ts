import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { getAccessSecret, getRefreshSecret } from './jwt-secret';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (user && await bcrypt.compare(pass, user.password_hash)) {
      if (user.employment_status !== 'AKTIF') {
        throw new UnauthorizedException('Akun Anda tidak aktif');
      }
      const { password_hash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { 
      sub: user.id, 
      email: user.email, 
      roles: user.system_roles, 
      tenantId: user.tenant_id 
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: getAccessSecret(),
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync({ sub: user.id, tenantId: user.tenant_id }, {
      secret: getRefreshSecret(),
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

  // Self-service password change. Verifies the current password, enforces a
  // minimum strength, then stores the new bcrypt hash. Tenant scope is enforced
  // by the Prisma middleware from the authenticated request context.
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!oldPassword || !newPassword) {
      throw new BadRequestException('Sandi lama dan sandi baru wajib diisi');
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('Sandi baru minimal 8 karakter');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    const matches = await bcrypt.compare(oldPassword, user.password_hash);
    if (!matches) {
      throw new UnauthorizedException('Sandi lama salah');
    }
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      throw new BadRequestException('Sandi baru tidak boleh sama dengan sandi lama');
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password_hash } });
    return { message: 'Sandi berhasil diperbarui' };
  }

  // Self-service profile edit. Only fields a user may change about themselves;
  // email/nik/roles/department stay under admin control (see AdminController).
  async updateProfile(userId: string, body: { fullName?: string; timezone?: string }) {
    const data: { full_name?: string; timezone?: string } = {};

    if (body.fullName !== undefined) {
      const name = body.fullName.trim();
      if (!name) throw new BadRequestException('Nama lengkap tidak boleh kosong');
      data.full_name = name;
    }
    if (body.timezone !== undefined) {
      const allowed = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'];
      if (!allowed.includes(body.timezone)) {
        throw new BadRequestException(`Zona waktu tidak valid (pilihan: ${allowed.join(', ')})`);
      }
      data.timezone = body.timezone;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Tidak ada perubahan yang dikirim');
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

  async refresh(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: getRefreshSecret(),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.employment_status !== 'AKTIF') {
        throw new UnauthorizedException('Pengguna tidak aktif atau tidak ditemukan');
      }

      // Rotate tokens
      return this.login(user);
    } catch (e) {
      throw new UnauthorizedException('Token refresh tidak valid atau kedaluwarsa');
    }
  }
}
