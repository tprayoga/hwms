import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private readonly dashboardService;
    constructor(dashboardService: DashboardService);
    getTeamDashboard(req: any, team: string, dateFrom: string, dateTo: string): Promise<{
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
