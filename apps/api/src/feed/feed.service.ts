import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamResolverService } from './team-resolver.service';
import { CheckinType, TaskStatus, BlockerStatus } from '@prisma/client';
import { tenantLocalStorage } from '../prisma/tenant-storage';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamResolver: TeamResolverService,
  ) {}

  private getTenantId(): string {
    const tenantId = tenantLocalStorage.getStore()?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Context Tenant ID tidak ditemukan');
    }
    return tenantId;
  }

  async getFeed(userId: string, dateParam?: string, teamFilter?: string) {
    const tenantId = this.getTenantId();
    
    // 1. Resolve date
    const targetDateStr = dateParam || new Date().toISOString().split('T')[0];
    const targetDate = new Date(targetDateStr);

    // 2. Resolve team user IDs
    let userIds: string[] = [];
    let teamName = 'Tim';

    if (teamFilter) {
      // If a specific team filter is passed, we resolve it
      if (teamFilter.startsWith('DEPT:')) {
        const deptId = teamFilter.replace('DEPT:', '');
        const deptUsers = await this.prisma.user.findMany({ where: { department_id: deptId } });
        userIds = deptUsers.map(u => u.id);
        teamName = 'Filter Departemen';
      } else if (teamFilter.startsWith('PROJ:')) {
        const projId = teamFilter.replace('PROJ:', '');
        const projAssignments = await this.prisma.taskAssignment.findMany({
          where: { task: { project_id: projId }, unassigned_at: null }
        });
        userIds = Array.from(new Set(projAssignments.map(a => a.user_id)));
        teamName = 'Filter Proyek';
      }
    } else {
      // Default: own team resolver
      const resolved = await this.teamResolver.getTeamUserIds(userId, tenantId);
      userIds = resolved.userIds;
      teamName = resolved.teamName;
    }

    // 3. Fetch checkins for the target date and users
    const checkins = await this.prisma.checkin.findMany({
      where: {
        user_id: { in: userIds },
        date: targetDate,
      },
      include: {
        user: {
          include: {
            functional_role: true,
            department: true,
          }
        },
        standup_items: {
          include: {
            task: {
              include: {
                evidences: true
              }
            }
          }
        }
      },
      orderBy: { submitted_at: 'asc' }
    });

    // Group checkins by user to pair IN and OUT
    const userEntries: Record<string, { inCheckin: any, outCheckin: any }> = {};
    for (const c of checkins) {
      if (!userEntries[c.user_id]) {
        userEntries[c.user_id] = { inCheckin: null, outCheckin: null };
      }
      if (c.type === CheckinType.IN) {
        userEntries[c.user_id].inCheckin = c;
      } else if (c.type === CheckinType.OUT) {
        userEntries[c.user_id].outCheckin = c;
      }
    }

    // Build feed list
    const feedList: any[] = [];

    for (const uId of Object.keys(userEntries)) {
      const { inCheckin, outCheckin } = userEntries[uId];
      if (!inCheckin) continue; // Only entries that have checked-in are shown in standup feed

      const userObj = inCheckin.user;
      
      // Fetch open blockers for tasks worked on by this user today
      const taskIds = inCheckin.standup_items.map((s: any) => s.task_id);
      const openBlockers = await this.prisma.blocker.findMany({
        where: {
          task_id: { in: taskIds },
          status: BlockerStatus.OPEN
        },
        include: {
          task: true,
          reporter: true
        }
      });

      const hasOpenBlocker = openBlockers.length > 0;

      // Calculate flags
      const isLate = inCheckin.is_late;
      const isAuto = outCheckin?.is_auto || false;
      const isOffline = inCheckin.is_offline_sync || outCheckin?.is_offline_sync || false;
      
      // Verify if any task resolved as DONE lacks evidences
      let noEvidence = false;
      for (const item of inCheckin.standup_items) {
        const isDone = item.status_after === TaskStatus.DONE || item.task?.status === TaskStatus.DONE;
        if (isDone) {
          const hasEvidence = item.task?.evidences && item.task.evidences.length > 0;
          if (!hasEvidence) {
            noEvidence = true;
            break;
          }
        }
      }

      feedList.push({
        userId: userObj.id,
        fullName: userObj.full_name,
        email: userObj.email,
        roleCode: userObj.functional_role?.code || 'GEN',
        deptName: userObj.department?.name || 'Umum',
        checkinId: inCheckin.id,
        checkoutCheckinId: outCheckin ? outCheckin.id : null,
        workStatus: inCheckin.work_status,
        clientProjectId: inCheckin.client_project_id,
        checkinTime: inCheckin.device_timestamp,
        checkoutTime: outCheckin ? outCheckin.device_timestamp : null,
        selfieKey: inCheckin.selfie_key,
        checkoutSelfieKey: outCheckin ? outCheckin.selfie_key : null,
        dailyNote: inCheckin.daily_note,
        checkoutDailyNote: outCheckin ? outCheckin.daily_note : null,
        standupItems: inCheckin.standup_items.map((item: any) => ({
          taskId: item.task_id,
          code: item.task?.code || '',
          title: item.task?.title || '',
          plannedNote: item.note,
          percentBefore: item.task?.percent_complete || 0,
          percentAfter: item.percent_after,
          statusBefore: item.task?.status || TaskStatus.NOT_STARTED,
          statusAfter: item.status_after,
          isCarryOver: item.is_carried_over
        })),
        blockers: openBlockers.map(b => ({
          id: b.id,
          description: b.description,
          taskCode: b.task?.code || '',
          taskTitle: b.task?.title || '',
          reporterName: b.reporter?.full_name || '',
          reportedBy: b.reported_by,
          mentionedUserIds: b.mentioned_user_ids,
          reporterManagerId: b.reporter?.manager_id || ''
        })),
        flags: {
          late: isLate,
          auto: isAuto,
          offline: isOffline,
          noEvidence: noEvidence
        },
        hasOpenBlocker
      });
    }

    // Sort feed: Pinned (has active blocker) first, then by checkin time descending
    feedList.sort((a, b) => {
      if (a.hasOpenBlocker && !b.hasOpenBlocker) return -1;
      if (!a.hasOpenBlocker && b.hasOpenBlocker) return 1;
      
      const timeA = new Date(a.checkinTime).getTime();
      const timeB = new Date(b.checkinTime).getTime();
      return timeB - timeA;
    });

    return {
      teamName,
      date: targetDateStr,
      entries: feedList
    };
  }
}
