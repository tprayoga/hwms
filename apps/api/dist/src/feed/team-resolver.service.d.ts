import { PrismaService } from '../prisma/prisma.service';
export declare class TeamResolverService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getTeamUserIds(userId: string, tenantId: string): Promise<{
        userIds: string[];
        teamName: string;
    }>;
}
