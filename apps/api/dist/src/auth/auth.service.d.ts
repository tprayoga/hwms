import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    validateUser(email: string, pass: string): Promise<any>;
    login(user: any): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: any;
            email: any;
            fullName: any;
            nik: any;
            roles: any;
            timezone: any;
            checkinMode: any;
        };
    }>;
    changePassword(userId: string, oldPassword: string, newPassword: string): Promise<{
        message: string;
    }>;
    updateProfile(userId: string, body: {
        fullName?: string;
        timezone?: string;
    }): Promise<{
        id: string;
        email: string;
        fullName: string;
        nik: string;
        roles: import("@prisma/client").$Enums.SystemRole[];
        timezone: string;
        checkinMode: import("@prisma/client").$Enums.CheckinMode;
    }>;
    refresh(token: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: any;
            email: any;
            fullName: any;
            nik: any;
            roles: any;
            timezone: any;
            checkinMode: any;
        };
    }>;
}
