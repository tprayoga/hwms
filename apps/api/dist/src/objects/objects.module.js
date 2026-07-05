"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectsModule = void 0;
const common_1 = require("@nestjs/common");
const objects_controller_1 = require("./objects.controller");
const objects_service_1 = require("./objects.service");
const storage_module_1 = require("../storage/storage.module");
const attendance_module_1 = require("../attendance/attendance.module");
let ObjectsModule = class ObjectsModule {
};
exports.ObjectsModule = ObjectsModule;
exports.ObjectsModule = ObjectsModule = __decorate([
    (0, common_1.Module)({
        imports: [storage_module_1.StorageModule, attendance_module_1.AttendanceModule],
        controllers: [objects_controller_1.ObjectsController],
        providers: [objects_service_1.ObjectsService],
    })
], ObjectsModule);
//# sourceMappingURL=objects.module.js.map