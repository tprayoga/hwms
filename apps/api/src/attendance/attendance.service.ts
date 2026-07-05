import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { 
  CheckinType, 
  WorkStatus, 
  TaskStatus, 
  NotificationKind, 
  BlockerStatus,
  Prisma
} from '@prisma/client';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { DEFAULT_TENANT_POLICY } from './policy.constants';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private getTenantId(): string {
    const tenantId = tenantLocalStorage.getStore()?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Context Tenant ID tidak ditemukan');
    }
    return tenantId;
  }

  // ==========================================
  // SELFIE ACCESS CONTROL (§6, §9 — UU PDP)
  // ==========================================

  /**
   * True if `managerId` sits anywhere above `subordinateId` in the manager
   * chain. Walks `manager_id` upward (findFirst is tenant-scoped by the Prisma
   * extension, so a cross-tenant chain never leaks). Cycle-safe and depth-capped.
   */
  async isManagerOf(managerId: string, subordinateId: string): Promise<boolean> {
    let currentId: string | null = subordinateId;
    const visited = new Set<string>();
    for (let depth = 0; depth < 20 && currentId; depth++) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const u = await this.prisma.user.findFirst({
        where: { id: currentId },
        select: { manager_id: true },
      });
      if (!u || !u.manager_id) break;
      if (u.manager_id === managerId) return true;
      currentId = u.manager_id;
    }
    return false;
  }

  // Minimum reason length for viewing another employee's selfie (§9 UU PDP).
  private static readonly SELFIE_REASON_MIN = 10;

  /**
   * Shared authorization + audit for viewing one checkin's selfie. When the
   * viewer is not the owner, requires HR or a manager in the owner's chain, a
   * reason of at least SELFIE_REASON_MIN chars, and writes a VIEW_SELFIE audit
   * row. Owner viewing own selfie: allowed, no reason, no audit.
   */
  private async authorizeSelfieAccessCore(
    viewer: { id: string; system_roles?: string[] },
    checkin: { id: string; user_id: string; selfie_key: string | null },
    tenantId: string,
    reason?: string,
  ): Promise<{ ownerId: string; checkinId: string; selfieKey: string | null }> {
    const ownerId = checkin.user_id;
    if (ownerId === viewer.id) {
      return { ownerId, checkinId: checkin.id, selfieKey: checkin.selfie_key };
    }

    const roles = viewer.system_roles || [];
    const isHR = roles.includes('HR');
    const isSuperAdmin = roles.includes('SUPER_ADMIN');
    const isManager = isHR || isSuperAdmin ? false : await this.isManagerOf(viewer.id, ownerId);
    if (!isHR && !isSuperAdmin && !isManager) {
      throw new ForbiddenException('Anda tidak berwenang melihat selfie ini (FORBIDDEN_SCOPE)');
    }

    const trimmedReason = (reason || '').trim();
    if (trimmedReason.length < AttendanceService.SELFIE_REASON_MIN) {
      throw new BadRequestException(
        `Alasan melihat selfie wajib diisi minimal ${AttendanceService.SELFIE_REASON_MIN} karakter (kontrol UU PDP)`,
      );
    }

    // AuditLog is exempt from the tenant/audit extension, so set tenant_id and
    // actor_id explicitly.
    await this.prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        actor_id: viewer.id,
        entity: 'Checkin',
        entity_id: checkin.id,
        action: 'VIEW_SELFIE',
        after_json: {
          reason: trimmedReason,
          target_user_id: ownerId,
          attendance_id: checkin.id,
          selfie_key: checkin.selfie_key,
          via_role: isHR ? 'HR' : isSuperAdmin ? 'SUPER_ADMIN' : 'MANAGER',
        },
      },
    });

    return { ownerId, checkinId: checkin.id, selfieKey: checkin.selfie_key };
  }

  /**
   * Authorize viewing a selfie identified by its storage key (legacy streaming
   * endpoint). Tenant-scoped: a key from another tenant is invisible (404).
   */
  async authorizeSelfieView(
    viewer: { id: string; system_roles?: string[] },
    key: string,
    reason?: string,
  ): Promise<{ ownerId: string; checkinId: string }> {
    const tenantId = this.getTenantId();
    const checkin = await this.prisma.checkin.findFirst({
      where: { selfie_key: key },
      select: { id: true, user_id: true, selfie_key: true },
    });
    if (!checkin) {
      throw new NotFoundException('Foto selfie tidak ditemukan');
    }
    const res = await this.authorizeSelfieAccessCore(viewer, checkin, tenantId, reason);
    return { ownerId: res.ownerId, checkinId: res.checkinId };
  }

  /**
   * Authorize viewing a selfie by attendance (checkin) id — the presigned-URL
   * path. Distinguishes cross-tenant access (403, via an un-tenant-scoped raw
   * lookup) from a genuinely unknown id (404), per §6/§9. Returns the selfie
   * storage key so the caller can presign it.
   */
  async authorizeSelfieViewById(
    viewer: { id: string; system_roles?: string[] },
    attendanceId: string,
    reason?: string,
  ): Promise<{ ownerId: string; selfieKey: string | null }> {
    const tenantId = this.getTenantId();

    // Raw (un-extended) lookup so we can tell "other tenant" (403) from
    // "does not exist" (404). The extended client would filter by tenant and
    // return null for both, collapsing the distinction.
    const checkin = await this.prisma.raw.checkin.findFirst({
      where: { id: attendanceId, deleted_at: null },
      select: { id: true, user_id: true, selfie_key: true, tenant_id: true },
    });
    if (!checkin) {
      throw new NotFoundException('Data kehadiran tidak ditemukan');
    }
    if (checkin.tenant_id !== tenantId) {
      // Cross-tenant access is always forbidden (§3.4 isolation).
      throw new ForbiddenException('Akses lintas tenant ditolak (FORBIDDEN_SCOPE)');
    }

    const res = await this.authorizeSelfieAccessCore(viewer, checkin, tenantId, reason);
    return { ownerId: res.ownerId, selfieKey: res.selfieKey };
  }

  // ==========================================
  // LATENESS & GEOFENCE HELPERS
  // ==========================================
  checkLateness(date: Date, timezone: string, windowEndStr: string): boolean {
    try {
      const localTimeStr = date.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      
      const [localHour, localMin] = localTimeStr.split(':').map(Number);
      const [endHour, endMin] = windowEndStr.split(':').map(Number);

      if (localHour > endHour) return true;
      if (localHour === endHour && localMin > endMin) return true;
      return false;
    } catch (e) {
      return false; // Fallback if timezone conversion fails
    }
  }

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  async getEffectivePolicy(user: any) {
    // 1. Check functional role policy
    if (user.functional_role_id) {
      const p = await this.prisma.policy.findFirst({
        where: { scope_type: 'ROLE', scope_id: user.functional_role_id }
      });
      if (p) return p;
    }
    // 2. Check department policy
    if (user.department_id) {
      const p = await this.prisma.policy.findFirst({
        where: { scope_type: 'DEPARTMENT', scope_id: user.department_id }
      });
      if (p) return p;
    }
    // 3. Check tenant policy
    const p = await this.prisma.policy.findFirst({
      where: { scope_type: 'TENANT', scope_id: user.tenant_id }
    });
    if (p) return p;

    // Fallback default policy (single source of truth shared with the seed).
    return { ...DEFAULT_TENANT_POLICY };
  }

  // ==========================================
  // GET TODAY STATUS API
  // ==========================================
  async getTodayStatus(userId: string) {
    const tenantId = this.getTenantId();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, functional_role: true }
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const todayDateStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayDateStr);

    // Fetch effective policy
    const policy = await this.getEffectivePolicy(user);

    // Fetch existing checkins for today
    const checkins = await this.prisma.checkin.findMany({
      where: { user_id: userId, date: today },
      orderBy: { submitted_at: 'asc' }
    });

    // Determine current state
    const todayCheckin = checkins.find(c => c.type === CheckinType.IN) || null;
    const checkout = checkins.find(c => c.type === CheckinType.OUT) || null;

    // Today's task picker spans ALL active projects, not just the first one.
    // Previously this used project.findFirst({ ACTIVE }) + that project's active
    // sprint, so tasks in any other project (e.g. a newly created one) never
    // appeared here even though the assignment notification fired.
    const now = new Date();

    // Active-sprint tasks: user's assigned, not-DONE tasks whose sprint is
    // currently running, across every ACTIVE project.
    const activeSprintTasks = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.DONE },
        assignments: { some: { user_id: userId, unassigned_at: null } },
        project: { status: 'ACTIVE' },
        sprint: { start_date: { lte: now }, end_date: { gte: now } },
      },
    });

    // Carry-over: assigned, not-DONE tasks from sprints that have already ended.
    const carryOverTasks = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.DONE },
        assignments: { some: { user_id: userId, unassigned_at: null } },
        project: { status: 'ACTIVE' },
        sprint: { end_date: { lt: now } },
      },
    });

    // Fetch active leave request
    const activeLeave = await this.prisma.leaveRequest.findFirst({
      where: {
        user_id: userId,
        status: { in: ['APPROVED', 'AUTO_APPROVED'] },
        date_from: { lte: today },
        date_to: { gte: today }
      }
    });

    return {
      todayCheckin,
      checkout,
      policy,
      activeSprintTasks,
      carryOverTasks,
      isOnLeave: !!activeLeave,
      leaveType: activeLeave?.type || null,
      leaveReason: activeLeave?.reason || null
    };
  }

  // ==========================================
  // IN CHECK-IN
  // ==========================================
  async checkin(userId: string, fileKey: string, body: any, force = false) {
    const tenantId = this.getTenantId();
    const now = new Date();
    const todayDateStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayDateStr);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, functional_role: true }
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    // 1. Double IN check
    const existing = await this.prisma.checkin.findFirst({
      where: { user_id: userId, date: today, type: CheckinType.IN }
    });
    if (existing) {
      throw new BadRequestException('CHECKIN_ALREADY_EXISTS');
    }

    // 2. Leave/holiday validation
    if (!force) {
      const isHoliday = await this.prisma.holiday.findFirst({ where: { date: today } });
      const isOnLeave = await this.prisma.leaveRequest.findFirst({
        where: {
          user_id: userId,
          status: { in: ['APPROVED', 'AUTO_APPROVED'] },
          date_from: { lte: today },
          date_to: { gte: today }
        }
      });
      if (isHoliday || isOnLeave) {
        throw new BadRequestException('CHECKIN_ON_LEAVE_DAY');
      }
    }

    // 3. Task limit check
    let items: any[] = [];
    if (body.items) {
      items = typeof body.items === 'string' ? JSON.parse(body.items) : body.items;
    }
    if (items.length > 5) {
      throw new BadRequestException('TASK_LIMIT_EXCEEDED');
    }

    // 4. Task owner & active sprint validations
    for (const item of items) {
      const task = await this.prisma.task.findUnique({
        where: { id: item.taskId },
        include: { assignments: { where: { unassigned_at: null } } }
      });
      if (!task) throw new NotFoundException(`Task ${item.taskId} tidak ditemukan`);
      
      const isOwner = task.assignments.some(a => a.user_id === userId);
      if (!isOwner) {
        throw new BadRequestException('TASK_NOT_OWNED');
      }
    }

    // 5. ONSITE without client validation
    const workStatus = body.workStatus as WorkStatus;
    if (workStatus === WorkStatus.ONSITE && !body.clientProjectId) {
      throw new BadRequestException('ONSITE_CLIENT_REQUIRED');
    }

    // 6. Geofence validations
    let geofenceOk = true;
    const lat = body.lat ? parseFloat(body.lat) : null;
    const lng = body.lng ? parseFloat(body.lng) : null;

    if (workStatus === WorkStatus.WFO || workStatus === WorkStatus.ONSITE) {
      if (lat !== null && lng !== null) {
        if (workStatus === WorkStatus.WFO) {
          // Check against tenant offices
          const offices = await this.prisma.location.findMany({
            where: { type: 'OFFICE' }
          });
          const inRange = offices.some(off => {
            if (off.lat === null || off.lng === null) return false;
            const dist = this.calculateDistance(lat, lng, Number(off.lat), Number(off.lng));
            return dist <= (off.radius_m || 200);
          });
          geofenceOk = inRange;
        } else if (workStatus === WorkStatus.ONSITE && body.clientProjectId) {
          // Check against client project coordinates
          // Since project doesn't have lat/lng directly in schema.prisma, we look up location with matching projectId
          const clientLoc = await this.prisma.location.findFirst({
            where: { type: 'CLIENT', name: { contains: body.clientProjectId } } // or lookup location by client project name
          });
          if (clientLoc && clientLoc.lat !== null && clientLoc.lng !== null) {
            const dist = this.calculateDistance(lat, lng, Number(clientLoc.lat), Number(clientLoc.lng));
            geofenceOk = dist <= (clientLoc.radius_m || 200);
          }
        }
      } else {
        geofenceOk = false; // missing coordinates for physical work status
      }
    }

    // 7. Lateness calculation
    const policy = await this.getEffectivePolicy(user);
    const isLate = this.checkLateness(now, user.timezone, policy.checkin_window_end);

    // 8. Atomic database transaction
    return this.prisma.raw.$transaction(async (tx) => {
      // 8.1 Create Checkin record
      const checkin = await tx.checkin.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          date: today,
          type: CheckinType.IN,
          work_status: workStatus,
          client_project_id: body.clientProjectId || null,
          lat: lat !== null ? new Prisma.Decimal(lat) : null,
          lng: lng !== null ? new Prisma.Decimal(lng) : null,
          gps_accuracy_m: body.accuracy ? new Prisma.Decimal(parseFloat(body.accuracy)) : null,
          selfie_key: fileKey,
          is_auto: false,
          is_late: isLate,
          is_offline_sync: body.isOfflineSync === 'true',
          geofence_ok: geofenceOk,
          device_timestamp: body.deviceTimestamp ? new Date(body.deviceTimestamp) : now,
          daily_note: body.dailyNote || null
        }
      });

      // 8.2 Create StandupItem records
      for (const item of items) {
        await tx.standupItem.create({
          data: {
            tenant_id: tenantId,
            checkin_id: checkin.id,
            task_id: item.taskId,
            note: item.note || null,
            planned: true,
            is_carried_over: false
          }
        });
      }

      // 8.3 Blocker registration
      let blockerData = body.blocker;
      if (blockerData) {
        const blocker = typeof blockerData === 'string' ? JSON.parse(blockerData) : blockerData;
        if (blocker.description) {
          const createdBlocker = await tx.blocker.create({
            data: {
              tenant_id: tenantId,
              task_id: blocker.taskId,
              reported_by: userId,
              description: blocker.description,
              mentioned_user_ids: blocker.mentionedUserIds || [],
              status: BlockerStatus.OPEN
            }
          });

          // Update task to BLOCKED status
          await tx.task.update({
            where: { id: blocker.taskId },
            data: { status: TaskStatus.BLOCKED }
          });

          // Mention notifications
          if (blocker.mentionedUserIds && blocker.mentionedUserIds.length > 0) {
            for (const mentionId of blocker.mentionedUserIds) {
              await tx.notification.create({
                data: {
                  tenant_id: tenantId,
                  user_id: mentionId,
                  kind: NotificationKind.MENTION,
                  payload_json: {
                    title: 'Anda di-mention dalam Blocker',
                    message: `${user.full_name} menyebut Anda pada blocker tugas: ${blocker.description}`
                  }
                }
              });
            }
          }
        }
      }

      return checkin;
    });
  }

  // ==========================================
  // OUT CHECK-OUT
  // ==========================================
  async checkout(userId: string, checkinId: string, fileKey: string, body: any) {
    const tenantId = this.getTenantId();
    const now = new Date();
    const todayDateStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayDateStr);

    // 1. Verification of open checkin
    const checkin = await this.prisma.checkin.findUnique({
      where: { id: checkinId },
      include: { standup_items: true }
    });
    if (!checkin || checkin.user_id !== userId || checkin.type !== CheckinType.IN) {
      throw new BadRequestException('CHECKIN_NO_OPEN_SESSION');
    }

    let updates: any[] = [];
    if (body.updates) {
      updates = typeof body.updates === 'string' ? JSON.parse(body.updates) : body.updates;
    }

    // 2. Transactional Checkout update
    return this.prisma.raw.$transaction(async (tx) => {
      // 2.1 Create OUT Checkin
      const checkoutRecord = await tx.checkin.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          date: today,
          type: CheckinType.OUT,
          work_status: checkin.work_status,
          client_project_id: checkin.client_project_id,
          lat: body.lat ? new Prisma.Decimal(parseFloat(body.lat)) : null,
          lng: body.lng ? new Prisma.Decimal(parseFloat(body.lng)) : null,
          selfie_key: fileKey,
          is_auto: false,
          is_late: false,
          is_offline_sync: body.isOfflineSync === 'true',
          geofence_ok: true,
          device_timestamp: body.deviceTimestamp ? new Date(body.deviceTimestamp) : now,
          daily_note: body.dailyNote || null
        }
      });

      // 2.2 Process task updates
      for (const upd of updates) {
        const percent = parseInt(upd.percent, 10);
        const status = upd.status as TaskStatus;

        // Find corresponding IN standup item
        const standup = checkin.standup_items.find(s => s.task_id === upd.taskId);
        
        // If task is not done, it is carried over
        const isCarriedOver = status !== TaskStatus.DONE;

        if (standup) {
          await tx.standupItem.update({
            where: { id: standup.id },
            data: {
              percent_after: percent,
              status_after: status,
              is_carried_over: isCarriedOver
            }
          });
        }

        // Copy completion metrics directly to the Task record
        await tx.task.update({
          where: { id: upd.taskId },
          data: {
            percent_complete: percent,
            status: status
          }
        });

        // If evidence is present, record it in TaskEvidence
        if (upd.evidence) {
          await tx.taskEvidence.create({
            data: {
              tenant_id: tenantId,
              task_id: upd.taskId,
              kind: 'LINK',
              url_or_key: upd.evidence,
              uploaded_by: userId
            }
          });
        }
      }

      return checkoutRecord;
    });
  }
}
