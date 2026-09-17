import type { PoolConnection } from 'mysql2/promise';
export type MappedTravelArea = {
    region_id: number;
    danger_level: number;
    is_enabled: number;
    is_owner_only: number;
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
    min_z: number;
    max_z: number;
};
type Point = {
    x: number;
    y: number;
    z: number;
};
export declare const hasMappedTravelRoute: (areas: MappedTravelArea[], owned: ReadonlySet<number>, start: Point, target: Point, targetRegionId: number) => boolean;
export declare const assertMappedTravelRoute: (connection: PoolConnection, characterId: number, partyId: string | number | undefined, start: Point, target: Point, targetRegionId: number) => Promise<void>;
export {};
