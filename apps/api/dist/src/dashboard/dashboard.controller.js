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
exports.DashboardController = void 0;
const common_1 = require("@nestjs/common");
const dashboard_service_1 = require("./dashboard.service");
const roles_decorator_1 = require("../auth/roles.decorator");
const shared_1 = require("@hwms/shared");
let DashboardController = class DashboardController {
    dashboardService;
    constructor(dashboardService) {
        this.dashboardService = dashboardService;
    }
    async getTeamDashboard(req, team, dateFrom, dateTo) {
        const userId = req.user.id;
        return this.dashboardService.getTeamDashboard(userId, team, dateFrom, dateTo);
    }
    async getProgramDashboard() {
        return this.dashboardService.getProgramDashboard();
    }
};
exports.DashboardController = DashboardController;
__decorate([
    (0, common_1.Get)('team'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.CTO, shared_1.SystemRole.PM_ADMIN, shared_1.SystemRole.MANAGER),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('team')),
    __param(2, (0, common_1.Query)('dateFrom')),
    __param(3, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getTeamDashboard", null);
__decorate([
    (0, common_1.Get)('program'),
    (0, roles_decorator_1.Roles)(shared_1.SystemRole.SUPER_ADMIN, shared_1.SystemRole.CTO, shared_1.SystemRole.PM_ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getProgramDashboard", null);
exports.DashboardController = DashboardController = __decorate([
    (0, common_1.Controller)('dashboard'),
    __metadata("design:paramtypes", [dashboard_service_1.DashboardService])
], DashboardController);
//# sourceMappingURL=dashboard.controller.js.map