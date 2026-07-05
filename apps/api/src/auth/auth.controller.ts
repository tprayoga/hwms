import { Controller, Post, Patch, Body, Req, Res, Get, UseGuards, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body() loginDto: { email: string; password?: string; passcode?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const password = loginDto.password || loginDto.passcode;
    if (!password) {
      throw new UnauthorizedException('Password wajib diisi');
    }
    const user = await this.authService.validateUser(loginDto.email, password);
    if (!user) {
      throw new UnauthorizedException('Email atau password salah (AUTH_INVALID_CREDENTIALS)');
    }

    const { accessToken, refreshToken, user: userProfile } = await this.authService.login(user);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    });

    return {
      accessToken,
      user: userProfile,
    };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies['refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token tidak ditemukan');
    }

    const { accessToken, refreshToken: newRefreshToken, user: userProfile } = await this.authService.refresh(refreshToken);

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });

    return {
      accessToken,
      user: userProfile,
    };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return { message: 'Keluar berhasil' };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const user = req['user'] as any;
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      nik: user.nik,
      roles: user.system_roles,
      timezone: user.timezone,
      checkinMode: user.checkin_mode,
      department: user.department ? { id: user.department.id, name: user.department.name } : null,
      functionalRole: user.functional_role ? { id: user.functional_role.id, name: user.functional_role.name, code: user.functional_role.code } : null,
    };
  }

  // Self-service password change (any authenticated user, own account only).
  @Post('password/change')
  async changePassword(
    @Req() req: Request,
    @Body() body: { oldPassword?: string; newPassword?: string },
  ) {
    const user = req['user'] as any;
    return this.authService.changePassword(user.id, body.oldPassword || '', body.newPassword || '');
  }

  // Self-service profile edit (full name & timezone only).
  @Patch('me')
  async updateMe(
    @Req() req: Request,
    @Body() body: { fullName?: string; timezone?: string },
  ) {
    const user = req['user'] as any;
    return this.authService.updateProfile(user.id, body);
  }
}
