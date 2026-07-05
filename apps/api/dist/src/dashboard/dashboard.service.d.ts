import { PrismaService } from '../prisma/prisma.service';
import { TeamResolverService } from '../feed/team-resolver.service';
export declare class DashboardService {
    private readonly prisma;
    private readonly teamResolver;
    constructor(prisma: PrismaService, teamResolver: TeamResolverService);
    private getTenantId;
    getTeamDashboard(userId: string, teamFilter: string, dateFromStr: string, dateToStr: string): Promise<{
        teamName: string;
        attendanceList: {
            user: any;
            date: any;
            workStatus: any;
            checkinTime: any;
            checkoutTime: any;
            tasksCount: any;
            flags: {
                late: any;
                auto: any;
                offline: any;
                noEvidence: boolean;
                geofence_ok: boolean;
            };
        }[];
        blockerAging: {
            id: string;
            taskCode: string;
            taskTitle: string;
            description: string;
            reporterName: string;
            createdAt: Date;
            daysOpen: number;
        }[];
        anomaliesCount: number;
    }>;
    getProgramDashboard(): Promise<{
        metrics: {
            totalHadir: number;
            wfhCount: number;
            wfoCount: number;
            onsiteCount: number;
            openBlockersCount: number;
            anomaliesCount: number;
        };
        sprintMetrics: {
            id: string;
            name: string;
            projectName: string;
            startDate: Date;
            endDate: Date;
            progress: number;
            rag: string;
            tasksCount: number;
        }[];
        roleMetrics: {
            code: string;
            name: string;
            progress: number;
            rag: string;
        }[];
        statusDistribution: {
            status: import("@prisma/client").$Enums.TaskStatus;
            count: number;
        }[];
    }>;
}
