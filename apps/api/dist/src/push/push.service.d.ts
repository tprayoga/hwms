import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
export declare class PushService implements OnModuleInit {
    private readonly prisma;
    private readonly logger;
    private vapidKeys;
    private subject;
    constructor(prisma: PrismaService);
    private getTenantId;
    onModuleInit(): Promise<void>;
    getPublicKey(): string;
    saveSubscription(userId: string, subscription: any, userAgent?: string): Promise<{
        id: string;
        tenant_id: string;
        user_id: string;
        endpoint: string;
        keys_json: import("@prisma/client/runtime/library").JsonValue;
        user_agent: string | null;
        created_at: Date;
        updated_at: Date;
        deleted_at: Date | null;
    }>;
    unsubscribe(endpoint: string): Promise<void>;
    sendPushNotification(userId: string, payload: {
        title: string;
        body: string;
        url?: string;
    }): Promise<void>;
    getNotifications(userId: string): Promise<{
        id: string;
        tenant_id: string;
        user_id: string;
        created_at: Date;
        updated_at: Date;
        deleted_at: Date | null;
        kind: import("@prisma/client").$Enums.NotificationKind;
        payload_json: import("@prisma/client/runtime/library").JsonValue;
        read_at: Date | null;
    }[]>;
}
