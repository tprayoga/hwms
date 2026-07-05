interface UpsertDelegate<T> {
    upsert(args: {
        where: any;
        create: any;
        update: any;
    }): Promise<T>;
}
interface FindCreateDelegate<T> {
    findFirst(args: {
        where: any;
    }): Promise<T | null>;
    create(args: {
        data: any;
    }): Promise<T>;
}
export declare function upsertBy<T>(delegate: UpsertDelegate<T>, where: any, create: any, update?: any): Promise<T>;
export declare function findOrCreate<T>(delegate: FindCreateDelegate<T>, where: any, create: any): Promise<T>;
export interface ModuleLogger {
    step(msg: string): void;
    count(key: string, by?: number): void;
    finish(): void;
}
export declare function createLogger(moduleName: string): ModuleLogger;
export {};
