import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
type HomeFurnitureDefinition = RowDataPacket & {
    code: string;
    grid_width: number;
    grid_height: number;
    placement_rule: 'wall' | 'center' | 'corner' | 'wall_or_center';
};
export type HomeRoom = {
    columns: number;
    rows: number;
    canvasPixels: number;
    floorLeft: number;
    floorTop: number;
    floorRight: number;
    floorBottom: number;
    cellWidth: number;
    cellHeight: number;
};
export type FurniturePlacement = {
    x: number;
    y: number;
    rotation: 0 | 90 | 180 | 270;
    width: number;
    height: number;
};
export declare const roomForHouseLevel: (houseLevel: number) => HomeRoom;
export declare const furnitureDimensions: (width: number, height: number, rotation: number) => {
    width: number;
    height: number;
};
export declare const findFurniturePlacement: (connection: PoolConnection, homeId: number, floor: number, houseLevel: number, definition: HomeFurnitureDefinition) => Promise<FurniturePlacement>;
export declare const occupyFurnitureCells: (connection: PoolConnection, homeId: number, floor: number, furnitureId: number, placement: FurniturePlacement) => Promise<void>;
export declare const backfillHomeFloorLayout: (connection: PoolConnection, homeId: number, floor: number, houseLevel: number) => Promise<void>;
export {};
