import type { RowDataPacket } from 'mysql2/promise';
type FurnitureRow = RowDataPacket & {
    id: number;
    furniture_code: string;
    name: string;
    floor_no: number;
    grid_x: number;
    grid_y: number;
    grid_width: number;
    grid_height: number;
    rotation: number;
    layer_order: number;
};
export declare const homeFloorImage: (qqUserId: string, floor: number) => Promise<{
    image: NonSharedBuffer;
    floor: number;
    level: number;
    furniture: FurnitureRow[];
    cached: boolean;
}>;
export {};
