import { Request, Response } from 'express';
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(loginDto: {
        email: string;
        password?: string;
        passcode?: string;
    }, res: Response): Promise<{
        accessToken: string;
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
    refresh(req: Request, res: Response): Promise<{
        accessToken: string;
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
    logout(res: Response): Promise<{
        message: string;
    }>;
    me(req: Request): Promise<{
        id: any;
        email: any;
        fullName: any;
        nik: any;
        roles: any;
        timezone: any;
        checkinMode: any;
        department: {
            id: any;
            name: any;
        } | null;
        functionalRole: {
            id: any;
            name: any;
            code: any;
        } | null;
    }>;
    changePassword(req: Request, body: {
        oldPassword?: string;
        newPassword?: string;
    }): Promise<{
        message: string;
    }>;
    updateMe(req: Request, body: {
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
}
