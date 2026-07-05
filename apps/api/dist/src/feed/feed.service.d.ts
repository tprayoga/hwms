import { PrismaService } from '../prisma/prisma.service';
import { TeamResolverService } from './team-resolver.service';
export declare class FeedService {
    private readonly prisma;
    private readonly teamResolver;
    constructor(prisma: PrismaService, teamResolver: TeamResolverService);
    private getTenantId;
    getFeed(userId: string, dateParam?: string, teamFilter?: string): Promise<{
        teamName: string;
        date: string;
        entries: any[];
    }>;
}
