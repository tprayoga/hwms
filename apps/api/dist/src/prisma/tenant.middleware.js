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
exports.TenantMiddleware = void 0;
const common_1 = require("@nestjs/common");
const tenant_storage_1 = require("./tenant-storage");
const prisma_service_1 = require("./prisma.service");
let TenantMiddleware = class TenantMiddleware {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async use(req, res, next) {
        let tenantId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const payloadBase64 = token.split('.')[1];
                const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
                const payload = JSON.parse(payloadJson);
                if (payload && payload.tenantId) {
                    tenantId = payload.tenantId;
                }
            }
            catch (err) {
            }
        }
        if (!tenantId) {
            const defaultTenant = await this.prisma.tenant.findUnique({
                where: { slug: 'indotek' },
            });
            if (defaultTenant) {
                tenantId = defaultTenant.id;
            }
        }
        if (tenantId) {
            tenant_storage_1.tenantLocalStorage.run({ tenantId }, () => {
                next();
            });
        }
        else {
            next();
        }
    }
};
exports.TenantMiddleware = TenantMiddleware;
exports.TenantMiddleware = TenantMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TenantMiddleware);
//# sourceMappingURL=tenant.middleware.js.map