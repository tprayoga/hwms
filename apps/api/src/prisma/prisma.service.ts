import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { tenantLocalStorage } from './tenant-storage';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient;
  public readonly client: any;

  constructor() {
    super();

    this.prisma = new PrismaClient({
      log: ['error', 'warn'],
    });

    const extendedClient = this.prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (model === 'Tenant' || model === 'AuditLog') {
              return query(args);
            }

            const context = tenantLocalStorage.getStore();
            const tenantId = context?.tenantId;
            const actorId = context?.actorId;

            const auditedModels = ['User', 'Location', 'Holiday', 'Department', 'Team', 'FunctionalRole'];
            const isAudited = auditedModels.includes(model);

            if (tenantId) {
              if (
                operation === 'findFirst' ||
                operation === 'findMany' ||
                operation === 'count' ||
                operation === 'aggregate' ||
                operation === 'groupBy'
              ) {
                args.where = args.where || {};
                args.where.tenant_id = tenantId;
              } else if (
                operation === 'update' ||
                operation === 'updateMany' ||
                operation === 'delete' ||
                operation === 'deleteMany'
              ) {
                args.where = args.where || {};
                args.where.tenant_id = tenantId;
              } else if (operation === 'create') {
                args.data = args.data || {};
                args.data.tenant_id = tenantId;
              } else if (operation === 'createMany') {
                if (Array.isArray(args.data)) {
                  args.data = args.data.map((item: any) => ({
                    ...item,
                    tenant_id: tenantId,
                  }));
                } else if (args.data) {
                  args.data.tenant_id = tenantId;
                }
              } else if (operation === 'upsert') {
                args.create = args.create || {};
                args.create.tenant_id = tenantId;
                args.update = args.update || {};
                args.update.tenant_id = tenantId;
                args.where = args.where || {};
                args.where.tenant_id = tenantId;
              }
            }

            let beforeData: any = null;
            if (isAudited && tenantId && operation === 'update') {
              try {
                const modelName = model.charAt(0).toLowerCase() + model.slice(1);
                beforeData = await (extendedClient as any)[modelName].findFirst({
                  where: args.where,
                });
              } catch (e) {
                // Ignore
              }
            }

            const result = await query(args);

            if (isAudited && tenantId && result) {
              const resObj = result as any;
              let action: string | null = null;
              let before_json: any = null;
              let after_json: any = null;
              let entityId: string | null = null;

              if (operation === 'create') {
                action = 'CREATE';
                after_json = resObj;
                entityId = resObj.id;
              } else if (operation === 'update') {
                action = 'UPDATE';
                before_json = beforeData;
                after_json = resObj;
                entityId = resObj.id;
              } else if (operation === 'delete') {
                action = 'DELETE';
                before_json = resObj;
                entityId = resObj.id;
              } else if (operation === 'createMany') {
                action = 'CREATE_MANY';
                after_json = args.data;
                entityId = tenantId;
              } else if (operation === 'updateMany') {
                action = 'UPDATE_MANY';
                before_json = args.where;
                after_json = args.data;
                entityId = tenantId;
              } else if (operation === 'deleteMany') {
                action = 'DELETE_MANY';
                before_json = args.where;
                entityId = tenantId;
              }

              if (action && entityId) {
                try {
                  await (extendedClient as any).auditLog.create({
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
                } catch (auditError) {
                  console.error('Failed to create audit log:', auditError);
                }
              }
            }

            if (tenantId && operation === 'findUnique' && result) {
              const resObj = result as any;
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
        // Forward to the extended client. Client methods (notably `$transaction`
        // and `$queryRaw`) resolve their engine via internal `this`, so they must
        // be bound to the extended client — otherwise they run with `this` set to
        // this Proxy, whose symbol lookups route to the base `super()` client
        // instance, producing a cross-instance "Transaction not found" error.
        const value = Reflect.get(target.client, prop);
        return typeof value === 'function' ? value.bind(target.client) : value;
      },
    });
  }

  get raw(): PrismaClient {
    return this.prisma;
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
