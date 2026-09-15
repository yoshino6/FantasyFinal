import type { PoolConnection } from 'mysql2/promise';
export declare const talentBeginGather: (connection: PoolConnection, character: Record<string, any>, resourceId: number) => Promise<void>;
export declare const talentGatherReward: (connection: PoolConnection, character: Record<string, any>, itemId: number, base: number, kind: string) => Promise<number>;
type Point = {
    x: number;
    y: number;
    z: number;
    regionId: number;
};
export type ScavengeDrop = {
    code: 'beast_bone' | 'beast_hide' | 'beast_tendon' | 'magic_wool' | 'blood_residue';
    name: string;
    quantity: number;
};
type ScavengeSource = 'move' | 'combat';
export declare const talentScavenge: (connection: PoolConnection, characterId: number, source: ScavengeSource, destination?: Point) => Promise<ScavengeDrop[]>;
export declare const talentMovementFactor: (connection: PoolConnection, character: Record<string, any>, destination: Point) => Promise<number>;
export declare const talentMovementArrived: (connection: PoolConnection, character: Record<string, any>, destination: Point, prepared: boolean) => Promise<ScavengeDrop[]>;
export {};
