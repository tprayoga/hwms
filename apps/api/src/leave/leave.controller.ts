import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Req, 
  UseInterceptors, 
  UploadedFile,
  Res,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeaveService } from './leave.service';
import { Public } from '../auth/public.decorator';
import * as fs from 'fs';
import * as path from 'path';

@Controller('leaves')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  private validateAttachmentUpload(file: Express.Multer.File) {
    if (!file) return;

    // Check size limit: 5MB
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new HttpException({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Ukuran dokumen cuti melebihi batas maksimal 5MB',
        }
      }, HttpStatus.PAYLOAD_TOO_LARGE);
    }

    // Check mime type whitelist
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new HttpException({
        error: {
          code: 'FILE_TYPE_INVALID',
          message: 'Format berkas tidak valid. Hanya menerima format JPEG, PNG, WebP, dan PDF.',
        }
      }, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async applyLeave(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any
  ) {
    const userId = req.user.id;
    this.validateAttachmentUpload(file);
    return this.leaveService.applyLeave(userId, body, file);
  }

  @Get('my')
  async getMyLeaveRequests(@Req() req: any) {
    const userId = req.user.id;
    return this.leaveService.getMyLeaveRequests(userId);
  }

  @Get('approvals/inbox')
  async getApprovalsInbox(@Req() req: any) {
    const userId = req.user.id;
    return this.leaveService.getApprovalsInbox(userId);
  }

  @Post('approvals/:id/decide')
  async decideLeaveRequest(
    @Param('id') requestId: string,
    @Req() req: any,
    @Body() body: any
  ) {
    const userId = req.user.id;
    return this.leaveService.decideLeaveRequest(userId, requestId, body);
  }

  @Post(':id/cancel')
  async cancelLeaveRequest(
    @Param('id') requestId: string,
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.leaveService.cancelLeaveRequest(userId, requestId);
  }

  @Public()
  @Get('attachments/:key')
  getAttachment(@Param('key') key: string, @Res() res: any) {
    const filePath = path.join(__dirname, '../../../../uploads/attachments', key);
    if (!fs.existsSync(filePath)) {
      res.status(404).send('File tidak ditemukan');
      return;
    }
    res.sendFile(filePath);
  }
}
