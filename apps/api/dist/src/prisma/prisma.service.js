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
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const tenant_storage_1 = require("./tenant-storage");
let PrismaService = class PrismaService extends client_1.PrismaClient {
    prisma;
    client;
    constructor() {
        super();
        this.prisma = new client_1.PrismaClient({
            log: ['error', 'warn'],
        });
        const extendedClient = this.prisma.$extends({
            query: {
                $allModels: {
                    async $allOperations({ model, operation, args, query }) {
                        if (model === 'Tenant' || model === 'AuditLog') {
                            return query(args);
                        }
                        const context = tenant_storage_1.tenantLocalStorage.getStore();
                        const tenantId = context?.tenantId;
                        const actorId = context?.actorId;
                        const auditedModels = ['User', 'Location', 'Holiday', 'Department', 'Team', 'FunctionalRole'];
                        const isAudited = auditedModels.includes(model);
                        if (tenantId) {
                            if (operation === 'findFirst' ||
                                operation === 'findMany' ||
                                operation === 'count' ||
                                operation === 'aggregate' ||
                                operation === 'groupBy') {
                                args.where = args.where || {};
                                args.where.tenant_id = tenantId;
                            }
                            else if (operation === 'update' ||
                                operation === 'updateMany' ||
                                operation === 'delete' ||
                                operation === 'deleteMany') {
                                args.where = args.where || {};
                                args.where.tenant_id = tenantId;
                            }
                            else if (operation === 'create') {
                                args.data = args.data || {};
                                args.data.tenant_id = tenantId;
                            }
                            else if (operation === 'createMany') {
                                if (Array.isArray(args.data)) {
                                    args.data = args.data.map((item) => ({
                                        ...item,
                                        tenant_id: tenantId,
                                    }));
                                }
                                else if (args.data) {
                                    args.data.tenant_id = tenantId;
                                }
                            }
                            else if (operation === 'upsert') {
                                args.create = args.create || {};
                                args.create.tenant_id = tenantId;
                                args.update = args.update || {};
                                args.update.tenant_id = tenantId;
                                args.where = args.where || {};
                                args.where.tenant_id = tenantId;
                            }
                        }
                        let beforeData = null;
                        if (isAudited && tenantId && operation === 'update') {
                            try {
                                const modelName = model.charAt(0).toLowerCase() + model.slice(1);
                                beforeData = await extendedClient[modelName].findFirst({
                                    where: args.where,
                                });
                            }
                            catch (e) {
                            }
                        }
                        const result = await query(args);
                        if (isAudited && tenantId && result) {
                            const resObj = result;
                            let action = null;
                            let before_json = null;
                            let after_json = null;
                            let entityId = null;
                            if (operation === 'create') {
                                action = 'CREATE';
                                after_json = resObj;
                                entityId = resObj.id;
                            }
                            else if (operation === 'update') {
                                action = 'UPDATE';
                                before_json = beforeData;
                                after_json = resObj;
                                entityId = resObj.id;
                            }
                            else if (operation === 'delete') {
                                action = 'DELETE';
                                before_json = resObj;
                                entityId = resObj.id;
                            }
                            else if (operation === 'createMany') {
                                action = 'CREATE_MANY';
                                after_json = args.data;
                                entityId = tenantId;
                            }
                            else if (operation === 'updateMany') {
                                action = 'UPDATE_MANY';
                                before_json = args.where;
                                after_json = args.data;
                                entityId = tenantId;
                            }
                            else if (operation === 'deleteMany') {
                                action = 'DELETE_MANY';
                                before_json = args.where;
                                entityId = tenantId;
                            }
                            if (action && entityId) {
                                try {
                                    await extendedClient.auditLog.create({
                                        data: {
                                            tenant_id: tenantId,
                                            actor_id: actorId || null,
                                            entity: model,
                                            entity_id: entityId,
                                            action,
                                            before_json: before_json ? JSON.parse(JSON.stringify(before_json)) : null,
                                            after_json: after_json ? JSON.parse(JSON.stringify(after_json)) : null,
                                        },
                                    });
                                }
                                catch (auditError) {
                                    console.error('Failed to create audit log:', auditError);
                                }
                            }
                        }
                        if (tenantId && operation === 'findUnique' && result) {
                            const resObj = result;
                            if (resObj.tenant_id && resObj.tenant_id !== tenantId) {
                                return null;
                            }
                        }
                        return result;
                    },
                },
            },
        });
        this.client = extendedClient;
        const localKeys = ['onModuleInit', 'onModuleDestroy', 'client', 'prisma', 'raw'];
        return new Proxy(this, {
            get(target, prop, receiver) {
                if (typeof prop === 'string' && localKeys.includes(prop)) {
                    return Reflect.get(target, prop, receiver);
                }
                if (typeof prop === 'symbol' || prop === 'then') {
                    return Reflect.get(target, prop, receiver);
                }
                if (!target.client) {
                    return Reflect.get(target, prop, receiver);
                }
                const value = Reflect.get(target.client, prop);
                return typeof value === 'function' ? value.bind(target.client) : value;
            },
        });
    }
    get raw() {
        return this.prisma;
    }
    async onModuleInit() {
        await this.prisma.$connect();
    }
    async onModuleDestroy() {
        await this.prisma.$disconnect();
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map