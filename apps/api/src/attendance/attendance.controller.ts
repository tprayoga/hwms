import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Req, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  Query,
  Res,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttendanceService } from './attendance.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { Request } from 'express';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly redis: RedisService,
    private readonly storageService: StorageService,
  ) {}

  private validateSelfieUpload(file: Express.Multer.File) {
    if (!file) return;

    // Check size limit: 2MB
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new HttpException({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Ukuran foto selfie melebihi batas maksimal 2MB',
        }
      }, HttpStatus.PAYLOAD_TOO_LARGE);
    }

    // Check mime type whitelist
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new HttpException({
        error: {
          code: 'FILE_TYPE_INVALID',
          message: 'Format berkas tidak valid. Hanya menerima format JPEG, PNG, dan WebP.',
        }
      }, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
  }

  @Get('me/today')
  async getToday(@Req() req: any) {
    const userId = req.user.id;
    return this.attendanceService.getTodayStatus(userId);
  }

  @Post('checkins')
  @UseInterceptors(FileInterceptor('selfie'))
  async checkin(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Query('force') force?: string
  ) {
    const userId = req.user.id;
    
    // Idempotency check
    const idempotencyKey = req.headers['idempotency-key'];
    if (idempotencyKey) {
      const cached = await this.redis.get(`idempotency:${idempotencyKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    if (!file) {
      throw new BadRequestException('Foto selfie wajib diunggah');
    }

    this.validateSelfieUpload(file);

    const fileKey = `in_${userId}_${Date.now()}_${file.originalname || 'selfie.jpg'}`;
    await this.storageService.uploadFile('selfies', fileKey, file.buffer, file.mimetype);

    const isForce = force === 'true' || body.force === 'true';

    const result = await this.attendanceService.checkin(userId, fileKey, body, isForce);

    // Cache idempotency response for 24 hours
    if (idempotencyKey) {
      await this.redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(result), 86400);
    }

    return result;
  }

  @Post('checkins/:id/checkout')
  @UseInterceptors(FileInterceptor('selfie'))
  async checkout(
    @Param('id') checkinId: string,
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any
  ) {
    const userId = req.user.id;

    // Idempotency check
    const idempotencyKey = req.headers['idempotency-key'];
    if (idempotencyKey) {
      const cached = await this.redis.get(`idempotency:${idempotencyKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    if (!file) {
      throw new BadRequestException('Foto selfie checkout wajib diunggah');
    }

    this.validateSelfieUpload(file);

    const fileKey = `out_${userId}_${Date.now()}_${file.originalname || 'selfie.jpg'}`;
    await this.storageService.uploadFile('selfies', fileKey, file.buffer, file.mimetype);

    const result = await this.attendanceService.checkout(userId, checkinId, fileKey, body);

    // Cache idempotency
    if (idempotencyKey) {
      await this.redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(result), 86400);
    }

    return result;
  }

  // Authenticated selfie access (§6, §9 — UU PDP). Owner may view own selfie;
  // HR and managers-in-chain may view a subordinate's selfie but MUST supply a
  // reason, which is recorded to audit_logs. No longer @Public.
  @Get('selfies/:key')
  async getSelfie(
    @Param('key') key: string,
    @Query('reason') reason: string | undefined,
    @Req() req: any,
    @Res() res: any,
  ) {
    await this.attendanceService.authorizeSelfieView(req.user, key, reason);

    const buffer = await this.storageService.getFile('selfies', key);
    if (!buffer) {
      res.status(404).send('Foto tidak ditemukan');
      return;
    }

    res.setHeader('Content-Type', this.selfieContentType(key));
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }

  private selfieContentType(key: string): string {
    const ext = key.toLowerCase().split('.').pop();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  }
}
