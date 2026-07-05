import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async getTeamUserIds(userId: string, tenantId: string): Promise<{ userIds: string[]; teamName: string }> {
    // 1. Fetch user's active project task assignments (where task is not deleted and assignment is active)
    const userAssignments = await this.prisma.taskAssignment.findMany({
      where: { 
        user_id: userId, 
        unassigned_at: null,
        task: { deleted_at: null }
      },
      include: { 
        task: { include: { project: true } } 
      }
    });

    const projectIds = Array.from(new Set(userAssignments.map(a => a.task.project_id)));

    if (projectIds.length > 0) {
      // Get all users who share assignments in these projects
      const teamAssignments = await this.prisma.taskAssignment.findMany({
        where: { 
          task: { project_id: { in: projectIds }, deleted_at: null }, 
          unassigned_at: null 
        }
      });
      const userIds = Array.from(new Set(teamAssignments.map(a => a.user_id)));
      
      const projects = await this.prisma.project.findMany({
        where: { id: { in: projectIds } }
      });
      const teamName = `Proyek: ${projects.map(p => p.name).join(', ')}`;
      
      return { userIds, teamName };
    }

    // 2. Fallback to Department membership
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      include: { department: true }
    });

    if (user && user.department_id && user.department) {
      const deptUsers = await this.prisma.user.findMany({
        where: { department_id: user.department_id }
      });
      const userIds = deptUsers.map(u => u.id);
      const teamName = `Departemen: ${user.department.name}`;
      return { userIds, teamName };
    }

    // 3. Last fallback: just the user
    return { userIds: [userId], teamName: 'Mandiri' };
  }
}
