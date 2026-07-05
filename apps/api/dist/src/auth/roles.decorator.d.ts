import { SystemRole } from '@hwms/shared';
export declare const ROLES_KEY = "roles";
export declare const Roles: (...roles: SystemRole[]) => import("@nestjs/common").CustomDecorator<string>;
