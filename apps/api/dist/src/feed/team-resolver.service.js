"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamResolverService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let TeamResolverService = class TeamResolverService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getTeamUserIds(userId, tenantId) {
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
        return { userIds: [userId], teamName: 'Mandiri' };
    }
};
exports.TeamResolverService = TeamResolverService;
exports.TeamResolverService = TeamResolverService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TeamResolverService);
//# sourceMappingURL=team-resolver.service.js.map