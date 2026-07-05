import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  Req
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TaskService } from './task.service';
import { TaskAggregationService } from './task-aggregation.service';
import { Roles } from '../auth/roles.decorator';
import { SystemRole } from '@hwms/shared';

@Controller('tasks')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly aggregationService: TaskAggregationService
  ) {}

  // ==========================================
  // PROJECTS CRUD
  // ==========================================
  @Get('projects')
  async getProjects() {
    return this.taskService.getProjects();
  }

  @Post('projects')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async createProject(@Body() body: any) {
    return this.taskService.createProject(body);
  }

  @Patch('projects/:id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async updateProject(@Param('id') id: string, @Body() body: any) {
    return this.taskService.updateProject(id, body);
  }

  @Delete('projects/:id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async deleteProject(@Param('id') id: string) {
    return this.taskService.deleteProject(id);
  }

  // ==========================================
  // SPRINTS CRUD
  // ==========================================
  @Get('sprints')
  async getSprints() {
    return this.taskService.getSprints();
  }

  @Post('sprints')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async createSprint(@Body() body: any) {
    return this.taskService.createSprint(body);
  }

  @Patch('sprints/:id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async updateSprint(@Param('id') id: string, @Body() body: any) {
    return this.taskService.updateSprint(id, body);
  }

  @Delete('sprints/:id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async deleteSprint(@Param('id') id: string) {
    return this.taskService.deleteSprint(id);
  }

  // ==========================================
  // TASKS CRUD & ASSIGNMENT
  // ==========================================
  @Get()
  async getTasks(
    @Query('sprintId') sprintId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('myTasks') myTasks?: string,
    @Req() req?: any
  ) {
    const filters: any = { sprintId, projectId, status, priority };
    if (myTasks === 'true' && req && req.user) {
      filters.myTasksUserId = req.user.id;
    }
    return this.taskService.getTasks(filters);
  }

  @Post()
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async createTask(@Body() body: any) {
    return this.taskService.createTask(body);
  }

  @Patch(':id')
  async updateTask(@Param('id') id: string, @Body() body: any) {
    // Both PMs and employees (for task status / progress updates) can update tasks.
    // Specific field mutability validation is done in task.service.ts
    return this.taskService.updateTask(id, body);
  }

  @Delete(':id')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async deleteTask(@Param('id') id: string) {
    return this.taskService.deleteTask(id);
  }

  // Lightweight roster for the "Assign Owner" picker. Accessible to task managers
  // (SUPER_ADMIN/PM_ADMIN) who cannot reach the SUPER_ADMIN/HR-only /admin/users.
  @Get('assignable-users')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async getAssignableUsers() {
    return this.taskService.getAssignableUsers();
  }

  @Post(':id/assign')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async assignOwner(@Param('id') id: string, @Body('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId wajib disertakan');
    }
    return this.taskService.assignOwner(id, userId);
  }

  // ==========================================
  // BULK EXCEL IMPORT
  // ==========================================
  @Post('import/preview')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId: string
  ) {
    if (!file) {
      throw new BadRequestException('Berkas Excel tidak ditemukan');
    }
    if (!projectId) {
      throw new BadRequestException('projectId wajib disertakan');
    }
    return this.taskService.previewImport(file, projectId);
  }

  @Post('import/commit')
  @Roles(SystemRole.SUPER_ADMIN, SystemRole.PM_ADMIN)
  async commitImport(@Body('previewId') previewId: string) {
    if (!previewId) {
      throw new BadRequestException('previewId wajib disertakan');
    }
    return this.taskService.commitImport(previewId);
  }

  // ==========================================
  // CACHED AGGREGATIONS
  // ==========================================
  @Get('aggregation/sprint/:sprintId')
  async getSprintAggregation(@Param('sprintId') sprintId: string) {
    return this.aggregationService.getSprintAggregation(sprintId);
  }

  @Get('aggregation/user/:userId')
  async getUserAggregation(@Param('userId') userId: string) {
    return this.aggregationService.getUserAggregation(userId);
  }

  @Get('aggregation/role/:roleId')
  async getRoleAggregation(@Param('roleId') roleId: string) {
    return this.aggregationService.getRoleAggregation(roleId);
  }
}
