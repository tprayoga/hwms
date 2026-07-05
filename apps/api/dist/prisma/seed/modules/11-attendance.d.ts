import { PrismaClient } from '@prisma/client';
import type { SeedContext } from '../lib/context';
export declare function seedAttendance(prisma: PrismaClient, ctx: SeedContext): Promise<void>;
