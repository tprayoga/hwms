import { FeedService } from './feed.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class FeedController {
    private readonly feedService;
    private readonly prisma;
    constructor(feedService: FeedService, prisma: PrismaService);
    getFeed(req: any, date?: string, team?: string): Promise<{
        teamName: string;
        date: string;
        entries: any[];
    }>;
    resolveBlocker(blockerId: string, req: any): Promise<{
        message: string;
        blocker: {
            id: string;
            tenant_id: string;
            created_at: Date;
            updated_at: Date;
            deleted_at: Date | null;
            task_id: string;
            reported_by: string;
            description: string;
            mentioned_user_ids: string[];
            status: import("@prisma/client").$Enums.BlockerStatus;
            opened_at: Date;
            resolved_at: Date | null;
            resolved_by: string | null;
        };
    }>;
}
