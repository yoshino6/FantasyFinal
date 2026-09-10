import { type HiddenTicket } from './hidden-battle.service';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
type PvpCharacter = RowDataPacket & {
    id: number;
    game_id: number;
    name: string;
    current_region_id: number;
    pos_x: number;
    pos_y: number;
    pos_z: number;
    level: number;
    perception: number;
    perception_growth: number;
    hp_max: number;
    mp_max: number;
    current_hp: number;
    current_mp: number;
    physical_attack: number;
    magic_attack: number;
    physical_defense: number;
    magic_defense: number;
    accuracy: number;
    evasion: number;
    crit_rate_bp: number;
    crit_damage_bp: number;
    crit_resist_bp: number;
    crit_damage_reduction_bp: number;
    speed: number;
    secondary_profession_code: string | null;
    activity_status: string;
    detained_until: Date | null;
};
export type PvpAmbushDelivery = {
    scope: 'group' | 'c2c';
    targetId: string;
    botId?: string;
};
export declare const assertPvpDefeatUnprotected: (connection: PoolConnection, characterId: number) => Promise<void>;
export declare const takePvpDefeatNotice: (qqUserId: string) => Promise<{
    attackerName: string;
    notice: string;
    defeatedAt: Date;
} | null>;
export declare const completePvpDefeatProtection: (qqUserId: string) => Promise<void>;
type PvpAttackLogOutcome = 'hit' | 'miss' | 'defeat' | 'utility';
export declare const recordPvpAttack: (connection: PoolConnection, attacker: Pick<PvpCharacter, "id" | "name">, defender: Pick<PvpCharacter, "id" | "name">, actionName: string, damage: number, outcome: PvpAttackLogOutcome, lootText?: string | null) => Promise<void>;
export declare const createPvpBattleLog: (connection: PoolConnection, attacker: Pick<PvpCharacter, "id" | "name">, defender: Pick<PvpCharacter, "id" | "name">, battleType: string, id?: `${string}-${string}-${string}-${string}-${string}`) => Promise<`${string}-${string}-${string}-${string}-${string}`>;
export declare const finishPvpBattleLog: (connection: PoolConnection, id: string, outcome: "attacker_win" | "defender_win" | "draw" | "escaped", winner?: Pick<PvpCharacter, "id" | "name"> | null, lootText?: string | null) => Promise<void>;
export declare const pvpBattleHistory: (qqUserId: string, page?: number, filter?: "\u5168\u90E8" | "\u8FDB\u653B\u65B9" | "\u9632\u5B88\u65B9", keyword?: string) => Promise<{
    page: number;
    totalPages: number;
    total: number;
    entries: {
        attacker: string;
        defender: string;
        type: string;
        outcome: string;
        winner: string | null;
        loot: string | null;
        startedAt: Date;
        endedAt: Date | null;
    }[];
    filter: "全部" | "进攻方" | "防守方";
    keyword: string;
}>;
export declare const recordWarrantSighting: (connection: PoolConnection, characterId: number, regionId: number, x: number, y: number) => Promise<void>;
type RestitutionDetail = {
    id: string;
    itemCount: number;
    copper: number;
    debt: number;
};
export declare const recordPvpLootSale: (connection: PoolConnection, holderId: number, itemId: number, quantity: number, saleCopper: number) => Promise<void>;
export declare const collectCityDebts: (connection: PoolConnection, characterId: number, cityRegionId: number) => Promise<{
    collected: number;
    remaining: number;
}>;
export declare const settlePvpDefeat: (connection: PoolConnection, winnerId: number, loserId: number) => Promise<{
    captured: boolean;
    restitution: RestitutionDetail | undefined;
    text: string;
}>;
export declare const settleCityPursuitDefeat: (connection: PoolConnection, loserId: number, cityRegionId: number) => Promise<{
    text: string;
}>;
export declare const resolvePvpVictory: (connection: PoolConnection, winnerId: number, loserId: number) => Promise<{
    text: string;
    restitution?: undefined;
    lootText?: undefined;
} | {
    text: string;
    restitution: RestitutionDetail | undefined;
    lootText: string;
}>;
export declare const cityPvp: (qqUserId: string, targetGameId: number, confirmed?: boolean) => Promise<{
    needsConfirmation: boolean;
    target: string;
    text: string;
}>;
export declare const fieldPvp: (qqUserId: string, targetGameId: number) => Promise<{
    text: string;
}>;
export declare const startPvpBattle: (qqUserId: string, targetGameId: number, confirmed?: boolean) => Promise<{
    needsConfirmation: boolean;
    target: string;
}>;
export declare const startAmbushPvpBattle: (attackerCharacterId: number, defenderCharacterId: number, spawnId: number, delivery: PvpAmbushDelivery) => Promise<{
    target: string;
}>;
export declare const pvpBattleStatus: (qqUserId: string) => Promise<{
    sessionId: string;
    mode: string;
    selectedAllyId: number | null;
    canEnchant: boolean;
    enchantElement: string;
    characterId: number;
    turn: number;
    playerHp: number;
    playerHpMax: number;
    playerMp: number;
    playerMpMax: number;
    selectedTargetId: number;
    canAct: boolean;
    resource: {
        professionCode: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
        code: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
        name: "实验值" | "器鸣" | "灵感" | "筹策";
        current: number;
        max: number;
    } | null;
    skillSlots: number[];
    readySkillSlots: number[];
    advancedSkills: {
        id: number;
        code: string;
        name: string;
        ready: boolean;
    }[];
    itemSlots: number[];
    appraisal: {
        learned: boolean;
        rangeLevel: number;
        informationLevel: number;
    };
    members: {
        statusText: string;
        id: number;
        name: string;
        hp: number;
        hpMax: number;
        mp: number;
        mpMax: number;
        resource: {
            professionCode: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
            code: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
            name: "实验值" | "器鸣" | "灵感" | "筹策";
            current: number;
            max: number;
        } | null;
        defeated: boolean;
        pending: boolean;
        chanting: string | null;
        extraAction: boolean;
    }[];
    spirits: never[];
    deviceSlots: {
        skills: {
            ready: boolean;
            code: string;
            name: string;
            description: string;
            energyCost: number;
            cooldownTurns: number;
            targetScope: import("./device.service").DeviceTargetScope;
            power?: number;
            effect?: string;
            inventor?: import("./hidden-device-protocol").InventorCapability;
        }[];
        slot: number;
        instanceId: number;
        deviceCode: string;
        deviceName: string;
        currentEnergy: number;
        maxEnergy: number;
    }[];
    environment: null;
    targets: {
        statusText: string;
        id: number;
        name: string;
        level: number;
        hp: string | number;
        hpMax: string | number;
        mp: string | number;
        mpMax: string | number;
        defeated: boolean;
        identified: boolean;
    }[];
}>;
export declare const selectPvpBattleOption: (qqUserId: string, option: {
    element?: string;
    targetId?: number;
    side?: "member" | "target";
}) => Promise<{
    sessionId: string;
    mode: string;
    selectedAllyId: number | null;
    canEnchant: boolean;
    enchantElement: string;
    characterId: number;
    turn: number;
    playerHp: number;
    playerHpMax: number;
    playerMp: number;
    playerMpMax: number;
    selectedTargetId: number;
    canAct: boolean;
    resource: {
        professionCode: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
        code: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
        name: "实验值" | "器鸣" | "灵感" | "筹策";
        current: number;
        max: number;
    } | null;
    skillSlots: number[];
    readySkillSlots: number[];
    advancedSkills: {
        id: number;
        code: string;
        name: string;
        ready: boolean;
    }[];
    itemSlots: number[];
    appraisal: {
        learned: boolean;
        rangeLevel: number;
        informationLevel: number;
    };
    members: {
        statusText: string;
        id: number;
        name: string;
        hp: number;
        hpMax: number;
        mp: number;
        mpMax: number;
        resource: {
            professionCode: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
            code: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
            name: "实验值" | "器鸣" | "灵感" | "筹策";
            current: number;
            max: number;
        } | null;
        defeated: boolean;
        pending: boolean;
        chanting: string | null;
        extraAction: boolean;
    }[];
    spirits: never[];
    deviceSlots: {
        skills: {
            ready: boolean;
            code: string;
            name: string;
            description: string;
            energyCost: number;
            cooldownTurns: number;
            targetScope: import("./device.service").DeviceTargetScope;
            power?: number;
            effect?: string;
            inventor?: import("./hidden-device-protocol").InventorCapability;
        }[];
        slot: number;
        instanceId: number;
        deviceCode: string;
        deviceName: string;
        currentEnergy: number;
        maxEnergy: number;
    }[];
    environment: null;
    targets: {
        statusText: string;
        id: number;
        name: string;
        level: number;
        hp: string | number;
        hpMax: string | number;
        mp: string | number;
        mpMax: string | number;
        defeated: boolean;
        identified: boolean;
    }[];
}>;
export declare const continuePvpChant: (qqUserId: string) => Promise<{
    ended: boolean;
    log: string;
    settlement: string;
    requesterId: number;
    winnerId: null;
    winnerName: null;
    restitutionId?: undefined;
    ambushSpawnId?: undefined;
    ambushDelivery?: undefined;
} | {
    ended: boolean;
    log: string;
    settlement: string;
    restitutionId: string | undefined;
    requesterId: number;
    winnerId: number | null;
    winnerName: string | null;
    ambushSpawnId: number | undefined;
    ambushDelivery: {
        scope: "group" | "c2c";
        targetId: string;
        botId: string | undefined;
    } | undefined;
} | null>;
export declare const pvpCombatAction: (qqUserId: string, type: "attack" | "skill" | "item" | "escape" | "auto" | "device", slot?: number, deviceSkillCode?: string, targetKind?: "member" | "target", automaticChant?: boolean, skillId?: number, hiddenTicket?: HiddenTicket) => Promise<{
    ended: boolean;
    log: string;
    settlement: string;
    requesterId: number;
    winnerId: null;
    winnerName: null;
    restitutionId?: undefined;
    ambushSpawnId?: undefined;
    ambushDelivery?: undefined;
} | {
    ended: boolean;
    log: string;
    settlement: string;
    restitutionId: string | undefined;
    requesterId: number;
    winnerId: number | null;
    winnerName: string | null;
    ambushSpawnId: number | undefined;
    ambushDelivery: {
        scope: "group" | "c2c";
        targetId: string;
        botId: string | undefined;
    } | undefined;
}>;
export declare const restitutionDetail: (qqUserId: string, restitutionId: string) => Promise<{
    owner: string;
    name: string | null;
    quantity: number;
    held: number;
    sold: number;
    coins: number;
    sale: number;
    charged: number;
    debt: number;
}[]>;
export declare const cityWantedAlert: (qqUserId: string) => Promise<{
    warrantId: number;
    name: string;
    gameId: number;
    x: number;
    y: number;
    regionName: string;
} | null>;
export declare const townPassiveWantedAlert: (qqUserId: string) => Promise<{
    warrantId: number;
    name: string;
    gameId: number;
    x: number;
    y: number;
    regionName: string;
} | null>;
export declare const reserveWarrantEntryNotice: (warrantId: number, groupOpenId: string) => Promise<boolean>;
export declare const reservePassiveWarrantNotice: (warrantId: number, groupOpenId: string, recipientQqUserId: string) => Promise<boolean>;
export declare const playerPvpStatus: (qqUserId: string) => Promise<{
    wanted: boolean;
    detainedUntil: Date | null;
}>;
export declare const personalPvpPanel: (qqUserId: string) => Promise<{
    name: string;
    gameId: number;
    detainedUntil: Date | null;
    battleCount: number;
    warrants: {
        id: number;
        regionName: string;
        createdAt: Date;
        victims: number;
    }[];
}>;
export declare const personalPvpEnemies: (qqUserId: string) => Promise<{
    id: number;
    name: string;
    gameId: number;
    attacks: number;
    loot: string;
    warrantId: number | null;
    warrantCities: string | null;
}[]>;
export declare const warrantsFor: () => Promise<{
    id: number;
    name: string;
    gameId: number;
    regionName: string;
    x: number;
    y: number;
    exposed: boolean;
    copper: number;
    items: number;
}[]>;
export declare const townWarrantsFor: (qqUserId: string, filter?: "\u5DF2\u66B4\u9732" | "\u8FD1\u671F\u9732\u9762" | "\u65E0\u884C\u8E2A" | "\u5168\u90E8") => Promise<{
    regionName: string;
    warrants: {
        id: number;
        name: string;
        regionName: string;
        x: number;
        y: number;
        exposed: boolean;
        recent: boolean;
        stars: number;
        skulls: number;
        copper: number;
        items: string;
    }[];
}>;
export declare const exposedWarrantsFor: () => Promise<{
    id: number;
    name: string;
    gameId: number;
    regionName: string;
    x: number;
    y: number;
    exposed: boolean;
    copper: number;
    items: number;
}[]>;
export declare const addWarrantReward: (qqUserId: string, warrantId: number, itemId: number | null, quantity: number, copper: number) => Promise<{
    copper: number;
    quantity: number;
}>;
export {};
