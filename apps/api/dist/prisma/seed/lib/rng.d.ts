export declare function mulberry32(seed: number): () => number;
export declare const DEFAULT_SEED = 1213680979;
export interface Rng {
    next(): number;
    int(min: number, max: number): number;
    pick<T>(arr: readonly T[]): T;
    chance(p: number): boolean;
}
export declare function resolveSeed(): number;
export declare function createRng(seed?: number): Rng;
