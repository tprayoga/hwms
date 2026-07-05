import { FeedService } from './feed.service';
import { TeamResolverService } from './team-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { tenantLocalStorage } from '../prisma/tenant-storage';
import { describe, beforeAll, it, expect } from 'vitest';

describe('Feed Service Integration & Team Resolution', () => {
  let prisma: PrismaService;
  let teamResolver: TeamResolverService;
  let feedService: FeedService;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    teamResolver = new TeamResolverService(prisma);
    feedService = new FeedService(prisma, teamResolver);

    // Retrieve default seed tenant and user
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
    tenantId = tenant!.id;

    const user = await prisma.user.findFirst({
      where: { email: 'superadmin@indotek.com' }
    });
    userId = user!.id;
  });

  it('should resolve team based on department fallback if no active task assignments exist', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const resolved = await teamResolver.getTeamUserIds(userId, tenantId);
      
      expect(resolved).toBeDefined();
      expect(resolved.userIds).toContain(userId);
      // Since seed data assigns superadmin to Management department, it should fallback to department members
      expect(resolved.teamName).toContain('Departemen:');
    });
  });

  it('should generate a team feed containing today entries', async () => {
    await tenantLocalStorage.run({ tenantId }, async () => {
      const feed = await feedService.getFeed(userId);
      
      expect(feed).toBeDefined();
      expect(feed.teamName).toBeDefined();
      expect(feed.date).toBeDefined();
      expect(Array.isArray(feed.entries)).toBe(true);
    });
  });
});
