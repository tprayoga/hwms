import { 
  Controller, 
  Get, 
  Post, 
  Param, 
  Query, 
  Req, 
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { FeedService } from './feed.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus, BlockerStatus, NotificationKind } from '@prisma/client';
import { tenantLocalStorage } from '../prisma/tenant-storage';

@Controller('feed')
export class FeedController {
  constructor(
    private readonly feedService: FeedService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getFeed(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('team') team?: string
  ) {
    const userId = req.user.id;
    return this.feedService.getFeed(userId, date, team);
  }

  @Post('blockers/:id/resolve')
  async resolveBlocker(
    @Param('id') blockerId: string,
    @Req() req: any
  ) {
    const currentUser = req.user;
    const userId = currentUser.id;
    const tenantId = tenantLocalStorage.getStore()?.tenantId;
    if (!tenantId) throw new BadRequestException('Context Tenant ID tidak ditemukan');

    // 1. Fetch blocker
    const blocker = await this.prisma.blocker.findUnique({
      where: { id: blockerId },
      include: { 
        reporter: true,
        task: true
      }
    });

    if (!blocker) {
      throw new NotFoundException('Blocker tidak ditemukan');
    }

    if (blocker.status === BlockerStatus.RESOLVED) {
      throw new BadRequestException('Blocker sudah diselesaikan');
    }

    // 2. Validate authorization permissions: reporter, mentioned, manager, or SUPER_ADMIN
    const isReporter = blocker.reported_by === userId;
    const isMentioned = blocker.mentioned_user_ids.includes(userId);
    const isManager = blocker.reporter.manager_id === userId;
    const isSuperAdmin = (currentUser.system_roles || currentUser.roles || []).includes('SUPER_ADMIN');

    const isAuthorized = isReporter || isMentioned || isManager || isSuperAdmin;
    if (!isAuthorized) {
      throw new ForbiddenException('Anda tidak memiliki wewenang untuk menyelesaikan blocker ini');
    }

    // 3. Atomically resolve blocker and restore task status
    return this.prisma.raw.$transaction(async (tx) => {
      // 3.1 Update blocker
      const updatedBlocker = await tx.blocker.update({
        where: { id: blockerId },
        data: {
          status: BlockerStatus.RESOLVED,
          resolved_at: new Date(),
          resolved_by: userId
        }
      });

      // 3.2 Update task back to IN_PROGRESS
      await tx.task.update({
        where: { id: blocker.task_id },
        data: { status: TaskStatus.IN_PROGRESS }
      });

      // 3.3 Notify reporter
      await tx.notification.create({
        data: {
          tenant_id: tenantId,
          user_id: blocker.reported_by,
          kind: NotificationKind.ESCALATION,
          payload_json: {
            title: 'Blocker Terselesaikan',
            message: `Blocker pada tugas Anda "${blocker.task.title}" telah diselesaikan oleh ${currentUser.fullName || currentUser.email}.`
          }
        }
      });

      return {
        message: 'Blocker berhasil diselesaikan',
        blocker: updatedBlocker
      };
    });
  }
}
