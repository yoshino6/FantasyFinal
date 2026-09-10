import type { PoolConnection } from 'mysql2/promise';
export declare const talentBeginGather: (connection: PoolConnection, character: Record<string, any>, resourceId: number) => Promise<void>;
export declare const talentGatherReward: (connection: PoolConnection, character: Record<string, any>, itemId: number, base: number, kind: string) => Promise<number>;
type Point = {
    x: number;
    y: number;
    z: number;
    regionId: number;
};
export declare const talentMovementFactor: (connection: PoolConnection, character: Record<string, any>, destination: Point) => Promise<number>;
export declare const talentMovementArrived: (connection: PoolConnection, character: Record<string, any>, destination: Point, prepared: boolean) => Promise<void>;
export {};
