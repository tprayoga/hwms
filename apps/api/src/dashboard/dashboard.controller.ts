import { Controller, Get, Query, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@hwms/shared';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('team')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.CTO, SystemRole.PM_ADMIN, SystemRole.MANAGER)
  async getTeamDashboard(
    @Req() req: any,
    @Query('team') team: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    const userId = req.user.id;
    return this.dashboardService.getTeamDashboard(userId, team, dateFrom, dateTo);
  }

  @Get('program')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.CTO, SystemRole.PM_ADMIN)
  async getProgramDashboard() {
    return this.dashboardService.getProgramDashboard();
  }
}
