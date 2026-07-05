import { Injectable, UnauthorizedException } from '@nestjs/common';
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
