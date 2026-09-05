import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
type Db = Pool | PoolConnection;
type Character = RowDataPacket & {
    id: number;
    player_id: number;
    name: string;
    copper_coins: number;
    current_region_id: number;
    pos_x: number;
    pos_y: number;
    pos_z: number;
    activity_status: string;
    region_code: string;
};
type Home = RowDataPacket & {
    id: number;
    character_id: number;
    home_name: string;
    town_region_id: number;
    plot_x: number;
    plot_y: number;
    plot_z: number;
    house_level: number;
    floor_count: number;
    status: string;
};
type Furniture = RowDataPacket & {
    id: number;
    furniture_code: string;
    name: string;
    description: string;
    effect_json: unknown;
    floor_no: number;
    slot_key: string;
    grid_x: number | null;
    grid_y: number | null;
    grid_width: number;
    grid_height: number;
    rotation: number;
};
type FurnitureDefinition = RowDataPacket & {
    code: string;
    name: string;
    description: string;
    effect_json: unknown;
    required_house_level: number;
    max_per_floor: number;
    floor_slot_cost: number;
    grid_width: number;
    grid_height: number;
    placement_rule: 'wall' | 'center' | 'corner' | 'wall_or_center';
    layer_order: number;
};
export declare const isInHome: (connection: Db, characterId: number) => Promise<boolean>;
export declare const homeRestRecoveryBonus: (connection: Db, characterId: number) => Promise<number>;
export declare const homeRestExperiencePerMinute: (connection: Db, characterId: number) => Promise<number>;
export declare const homePanel: (qqUserId: string) => Promise<{
    character: Character;
    home: null;
    inHome: boolean;
    furniture: Furniture[];
    effects: {};
    materials: Array<{
        code: string;
        name: string;
        quantity: number;
    }>;
} | {
    character: Character;
    home: Home;
    inHome: boolean;
    furniture: Furniture[];
    effects: Record<string, number>;
    materials: {
        code: string;
        name: string;
        quantity: number;
    }[];
}>;
export declare const purchaseHome: (qqUserId: string) => Promise<{
    plot: {
        x: number;
        y: number;
        z: number;
    };
    copper: 500;
}>;
export declare const enterHome: (qqUserId: string) => Promise<{
    home: Home;
    pursuit: {
        spawnId: number;
        text: string;
    } | null;
}>;
export declare const leaveHome: (qqUserId: string) => Promise<Home>;
export declare const renameHome: (qqUserId: string, input: string) => Promise<{
    name: string;
}>;
export declare const upgradeHome: (qqUserId: string) => Promise<{
    level: number;
    cost: {
        readonly copper: 800;
        readonly materials: {
            readonly home_wood: 30;
            readonly home_stone: 20;
        };
    } | {
        readonly copper: 2000;
        readonly materials: {
            readonly home_wood: 80;
            readonly home_stone: 50;
            readonly home_metal: 20;
        };
    };
}>;
export declare const expandHome: (qqUserId: string, floor: 2 | 3) => Promise<{
    floor: number;
    cost: {
        readonly copper: 1000;
        readonly materials: {
            readonly home_wood: 50;
            readonly home_stone: 30;
        };
    } | {
        readonly copper: 3000;
        readonly materials: {
            readonly home_wood: 120;
            readonly home_stone: 80;
            readonly home_metal: 30;
        };
    };
}>;
export declare const listFurniture: (qqUserId: string, floor?: number) => Promise<{
    home: Home;
    definitions: FurnitureDefinition[];
    installed: Furniture[];
    recipes: Map<string, {
        name: string;
        quantity: number;
    }[]>;
    ownedCounts: Map<string, number>;
    slots: number;
}>;
export declare const craftFurniture: (qqUserId: string, code: string, floor: number, _legacySlotKey?: string) => Promise<{
    id: number;
    name: string;
    floor: number;
    placement: import("./home-layout.service").FurniturePlacement;
}>;
export declare const removeFurniture: (qqUserId: string, furnitureId: number) => Promise<Furniture>;
export declare const listHomeShop: (qqUserId: string) => Promise<{
    copper: number;
    offers: {
        id: number;
        code: string;
        outputName: string;
        outputQuantity: number;
        inputName: string | null;
        inputQuantity: number;
        copperPrice: number;
    }[];
}>;
export declare const tradeHomeOffer: (qqUserId: string, offerId: number, quantity: number) => Promise<{
    name: string;
    quantity: number;
}>;
export type HomeStorageScope = 'backpack' | 'storage';
export type HomeStorageCategory = '装备' | '道具' | '材料';
export declare const homeStorageView: (qqUserId: string, scope: HomeStorageScope, category: HomeStorageCategory) => Promise<{
    capacity: number;
    usedWeight: number;
    stacked: {
        id: number;
        quantity: number;
        weight: number;
        constructor: {
            name: "RowDataPacket";
        };
        code: string;
        codex_id: string;
        name: string;
        item_category: string;
        description: string;
    }[];
    instances: {
        id: number;
        quality: number;
        durability: number;
        durability_max: number;
        constructor: {
            name: "RowDataPacket";
        };
        definition_codex_id: string;
        name: string;
        item_category: string;
        description: string;
    }[];
}>;
export declare const depositHomeStorage: (qqUserId: string, itemId: number, quantity: number) => Promise<{
    name: string;
    quantity: number;
    usedWeight: number;
    capacity: number;
}>;
export {};
