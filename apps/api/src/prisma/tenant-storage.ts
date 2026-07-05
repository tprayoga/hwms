import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  actorId?: string;
}

export const tenantLocalStorage = new AsyncLocalStorage<TenantContext>();
