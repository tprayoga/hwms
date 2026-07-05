import { AsyncLocalStorage } from 'async_hooks';
export interface TenantContext {
    tenantId: string;
    actorId?: string;
}
export declare const tenantLocalStorage: AsyncLocalStorage<TenantContext>;
