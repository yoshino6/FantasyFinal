import type { RowDataPacket } from 'mysql2/promise';
export declare const damagedEquipment: (user: string) => Promise<RowDataPacket[]>;
export declare const useForgeRepairKit: (user: string, instanceId: number) => Promise<string>;
export declare const craftForgeRepairKit: (user: string) => Promise<void>;
