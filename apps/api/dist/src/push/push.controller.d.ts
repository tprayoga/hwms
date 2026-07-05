import { PushService } from './push.service';
export declare class PushController {
    private readonly pushService;
    constructor(pushService: PushService);
    getPublicKey(): Promise<{
        publicKey: string;
    }>;
    subscribe(req: any, body: any, userAgent: string): Promise<{
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
    getNotifications(req: any): Promise<{
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
