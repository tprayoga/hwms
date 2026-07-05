import type { PrismaClient } from '@prisma/client';
import type { Rng } from './rng';
export interface SeedContext {
    rng: Rng;
    anchor: Date;
    refs: Record<string, any>;
}
export type SeedProfile = 'core' | 'full';
export interface SeedModule {
    name: string;
    profiles: SeedProfile[];
    run: (prisma: PrismaClient, ctx: SeedContext) => Promise<void>;
}
