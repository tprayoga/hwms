"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const feed_service_1 = require("./feed.service");
const team_resolver_service_1 = require("./team-resolver.service");
const prisma_service_1 = require("../prisma/prisma.service");
const tenant_storage_1 = require("../prisma/tenant-storage");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('Feed Service Integration & Team Resolution', () => {
    let prisma;
    let teamResolver;
    let feedService;
    let tenantId;
    let userId;
    (0, vitest_1.beforeAll)(async () => {
        prisma = new prisma_service_1.PrismaService();
        await prisma.onModuleInit();
        teamResolver = new team_resolver_service_1.TeamResolverService(prisma);
        feedService = new feed_service_1.FeedService(prisma, teamResolver);
        const tenant = await prisma.tenant.findUnique({ where: { slug: 'indotek' } });
        tenantId = tenant.id;
        const user = await prisma.user.findFirst({
            where: { email: 'superadmin@indotek.com' }
        });
        userId = user.id;
    });
    (0, vitest_1.it)('should resolve team based on department fallback if no active task assignments exist', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const resolved = await teamResolver.getTeamUserIds(userId, tenantId);
            (0, vitest_1.expect)(resolved).toBeDefined();
            (0, vitest_1.expect)(resolved.userIds).toContain(userId);
            (0, vitest_1.expect)(resolved.teamName).toContain('Departemen:');
        });
    });
    (0, vitest_1.it)('should generate a team feed containing today entries', async () => {
        await tenant_storage_1.tenantLocalStorage.run({ tenantId }, async () => {
            const feed = await feedService.getFeed(userId);
            (0, vitest_1.expect)(feed).toBeDefined();
            (0, vitest_1.expect)(feed.teamName).toBeDefined();
            (0, vitest_1.expect)(feed.date).toBeDefined();
            (0, vitest_1.expect)(Array.isArray(feed.entries)).toBe(true);
        });
    });
});
//# sourceMappingURL=feed.spec.js.map