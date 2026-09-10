export type WorldArea = {
    region_id: number;
    danger_level: number;
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
export declare const pointBelongsToRegion: (areas: WorldArea[], regionId: number, point: Point) => boolean;
export declare const validWorldSitePoint: <T extends Point>(areas: WorldArea[], regionId: number, preferred: T) => T;
export {};
