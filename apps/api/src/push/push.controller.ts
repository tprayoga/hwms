import { Controller, Get, Post, Body, Req, Headers } from '@nestjs/common';
import { PushService } from './push.service';
import { Public } from '../auth/public.decorator';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Public()
  @Get('key')
  async getPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('subscribe')
  async subscribe(
    @Req() req: any,
    @Body() body: any,
    @Headers('user-agent') userAgent: string,
  ) {
    const userId = req.user.id;
    return this.pushService.saveSubscription(userId, body, userAgent);
  }

  @Post('unsubscribe')
  async unsubscribe(@Body('endpoint') endpoint: string) {
    return this.pushService.unsubscribe(endpoint);
  }

  @Get('notifications')
  async getNotifications(@Req() req: any) {
    const userId = req.user.id;
    return this.pushService.getNotifications(userId);
  }
}
