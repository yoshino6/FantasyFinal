import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
type DungeonCell = RowDataPacket & {
    id: number;
    dungeon_id: number;
    cell_type: string;
    trap_type: string | null;
    landmark_text: string | null;
    chest_quality: '青铜' | '白银' | '黄金' | null;
    chest_opened: number;
    pos_x: number;
    pos_y: number;
    pos_z: number;
};
export declare const refreshDungeons: (connection: Pool | PoolConnection, options?: {
    refreshMonsters?: boolean;
}) => Promise<void>;
export declare const dungeonEvents: () => Promise<{
    id: number;
    state: "active" | "cleared";
    entrances: {
        x: number;
        y: number;
    }[];
    floors: {
        z: number;
        explorers: number;
        cleared: boolean;
    }[];
}[]>;
export declare const dungeonEntranceAt: (connection: Pool | PoolConnection, regionId: number, x: number, y: number) => Promise<{
    id: number;
    name: string;
    description: string;
} | null>;
export declare const dungeonCellAt: (connection: Pool | PoolConnection, regionId: number, x: number, y: number, z: number) => Promise<DungeonCell>;
export declare const rebuildDungeons: () => Promise<{
    moved: number;
    dungeonId: number;
}>;
export declare const dungeonTrackingHint: (qqUserId: string) => Promise<string | null>;
export declare const enterDungeon: (qqUserId: string, dungeonId: number) => Promise<{
    dungeonId: number;
    x: number;
    y: number;
    z: number;
}>;
export declare const dungeonArrivalEvent: (connection: PoolConnection, characterId: number) => Promise<{
    kind: "chest";
    cellId: number;
    text: string;
} | {
    kind: "down";
    text: string;
    cellId?: undefined;
} | {
    kind: "up";
    text: string;
    cellId?: undefined;
} | {
    kind: "leave";
    text: string;
    cellId?: undefined;
} | {
    kind: "landmark";
    text: string;
    cellId?: undefined;
} | {
    kind: "trap";
    text: string;
    cellId?: undefined;
} | null>;
export declare const openDungeonChest: (qqUserId: string, cellId: number) => Promise<{
    quality: "青铜" | "白银" | "黄金";
    copper: number;
    silver: number;
    gold: number;
    name: string;
    quantity: number;
    blueprintName: string | undefined;
}>;
export declare const changeDungeonFloor: (qqUserId: string, direction: "down" | "up" | "leave" | "escape") => Promise<{
    action: "leave";
    x: number;
    y: number;
    z: number;
    usedTeleporter: boolean;
} | {
    action: "down" | "up";
    x: number;
    y: number;
    z: number;
    usedTeleporter?: undefined;
}>;
export declare const dungeonPlayersInRange: (connection: Pool | PoolConnection, characterId: number, regionIdValue: number, x: number, y: number, z: number, range: number) => Promise<{
    gameId: number;
    name: string;
    x: number;
    y: number;
    wanted: boolean;
    inHome: boolean;
    isFriend: boolean;
}[]>;
export declare const dungeonPvP: (qqUserId: string, targetGameId: number) => Promise<{
    text: string;
}>;
export declare const interactDungeonPlayer: (qqUserId: string, targetGameId: number) => Promise<{
    name: string;
    isFriend: boolean;
    text: string;
}>;
export declare const closeDungeonForBossSpawns: (connection: PoolConnection, spawnIds: number[]) => Promise<boolean>;
export {};
