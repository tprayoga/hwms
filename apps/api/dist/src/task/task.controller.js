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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const task_service_1 = require("./task.service");
const task_aggregation_service_1 = require("./task-aggregation.service");
const roles_decorator_1 = require("../auth/roles.decorator");
const shared_1 = require("@hwms/shared");
let TaskController = class TaskController {
    taskService;
    aggregationService;
    constructor(taskService, aggregationService) {
        this.taskService = taskService;
        this.aggregationService = aggregationService;
    }
    async getProjects() {
        return this.taskService.getProjects();
    }
    async createProject(body) {
        return this.taskService.createProject(body);
    }
    async updateProject(id, body) {
        return this.taskService.updateProject(id, body);
    }
    async deleteProject(id) {
        return this.taskService.deleteProject(id);
    }
    async getSprints() {
        return this.taskService.getSprints();
    }
    async createSprint(body) {
        return this.taskService.createSprint(body);
    }
    async updateSprint(id, body) {
        return this.taskService.updateSprint(id, body);
    }
    async deleteSprint(id) {
        return this.taskService.deleteSprint(id);
    }
    async getTasks(sprintId, projectId, status, priority, myTasks, req) {
        const filters = { sprintId, projectId, status, priority };
        if (myTasks === 'true' && req && req.user) {
            filters.myTasksUserId = req.user.id;
        }
        return this.taskService.getTasks(filters);
    }
    async createTask(body) {
        return this.taskService.createTask(body);
    }
    async updateTask(id, body) {
        return this.taskService.updateTask(id, body);
    }
    async deleteTask(id) {
        return this.taskService.deleteTask(id);
    }
    async getAssignableUsers() {
        return this.taskService.getAssignableUsers();
    }
    async assignOwner(id, userId) {
        if (!userId) {
            throw new common_1.BadRequestException('userId wajib disertakan');
        }
        return this.taskService.assignOwner(id, userId);
    }
    async previewImport(file, projectId) {
        if (!file) {
            throw new common_1.BadRequestException('Berkas Excel tidak ditemukan');
        }
        if (!projectId) {
            throw new common_1.BadRequestException('projectId wajib disertakan');
        }
        return this.taskService.previewImport(file, projectId);
    }
    async commitImport(previewId) {
        if (!previewId) {
            throw new common_1.BadRequestException('previewId wajib disertakan');
        }
        return this.taskService.commitImport(previewId);
    }
    async getSprintAggregation(sprintId) {
        return this.aggregationService.getSprintAggregation(sprintId);
    }
    async getUserAggregation(userId) {
        return this.aggregationService.getUserAggregation(userId);
    }
    async getRoleAggregation(roleId) {
        return this.aggregationService.getRoleAggregation(roleId);
    }
};
exports.TaskController = TaskController;
__decorate([
    (0, common_1.Get)('projects'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "getProjects", null);
__decorate([
    (0, common_1.Post)('projects'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "createProject", null);
__decorate([
    (0, common_1.Patch)('projects/:id'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "updateProject", null);
__decorate([
    (0, common_1.Delete)('projects/:id'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "deleteProject", null);
__decorate([
    (0, common_1.Get)('sprints'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "getSprints", null);
__decorate([
    (0, common_1.Post)('sprints'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "createSprint", null);
__decorate([
    (0, common_1.Patch)('sprints/:id'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "updateSprint", null);
__decorate([
    (0, common_1.Delete)('sprints/:id'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "deleteSprint", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('sprintId')),
    __param(1, (0, common_1.Query)('projectId')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('priority')),
    __param(4, (0, common_1.Query)('myTasks')),
    __param(5, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "getTasks", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "createTask", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "updateTask", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "deleteTask", null);
__decorate([
    (0, common_1.Get)('assignable-users'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "getAssignableUsers", null);
__decorate([
    (0, common_1.Post)(':id/assign'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "assignOwner", null);
__decorate([
    (0, common_1.Post)('import/preview'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Query)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "previewImport", null);
__decorate([
    (0, common_1.Post)('import/commit'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.PM_ADMIN),
    __param(0, (0, common_1.Body)('previewId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "commitImport", null);
__decorate([
    (0, common_1.Get)('aggregation/sprint/:sprintId'),
    __param(0, (0, common_1.Param)('sprintId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "getSprintAggregation", null);
__decorate([
    (0, common_1.Get)('aggregation/user/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "getUserAggregation", null);
__decorate([
    (0, common_1.Get)('aggregation/role/:roleId'),
    __param(0, (0, common_1.Param)('roleId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TaskController.prototype, "getRoleAggregation", null);
exports.TaskController = TaskController = __decorate([
    (0, common_1.Controller)('tasks'),
    __metadata("design:paramtypes", [task_service_1.TaskService,
        task_aggregation_service_1.TaskAggregationService])
], TaskController);
//# sourceMappingURL=task.controller.js.map