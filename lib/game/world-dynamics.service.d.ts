import type { Pool, PoolConnection } from 'mysql2/promise';
import { type DynamicEncounterChoice, type WorldSiteAccess } from './world-dynamics.content';
import { patrolObjective, type PatrolContext } from './patrol-encounters';
type Db = Pool | PoolConnection;
type WeatherPhase = 'forming' | 'steady' | 'easing';
type WeatherModifiers = {
    memberSpeedPct: number;
    targetSpeedPct: number;
    hint: string;
    elementBonuses: Record<string, number>;
    shelteredCharacterIds?: number[];
};
export type WeatherEffectChannel = 'direct' | 'throwable' | 'spirit' | 'damage_over_time' | 'healing';
export declare const weatherEffectAudit: Record<WeatherEffectChannel, {
    inheritsElement: boolean;
    note: string;
}>;
export declare const weatherElementMultiplier: (modifiers: Pick<WeatherModifiers, "elementBonuses" | "shelteredCharacterIds"> | null | undefined, element: string, channel?: WeatherEffectChannel, shelteredCharacterId?: number) => number;
type EncounterChoice = DynamicEncounterChoice;
type Encounter = {
    id: string;
    title: string;
    opening: string;
    choices: EncounterChoice[];
    expiresAt: Date;
    weatherName: string;
    regionName: string;
    nodeCode: string;
    patrol?: PatrolContext;
    objective?: ReturnType<typeof patrolObjective>;
};
export declare const initializeDynamicWorldSystem: (pool?: Pool) => Promise<void>;
export declare const weatherForPlayer: (qqUserId: string) => Promise<{
    name: string;
    description: string;
    modifiers: WeatherModifiers;
    regionId: number;
    regionCode: string;
    regionName: string;
    climateCode: string;
    weatherCode: string;
    intensity: number;
    phase: WeatherPhase;
    anomalyCode: string | null;
    revision: number;
    transitionDueAt: Date;
    causeCode: string;
}>;
type WorldSiteAction = 'commission' | 'forecast' | 'exchange' | 'clues' | 'shelter';
export declare const worldSiteView: (qqUserId: string, siteCode: string) => Promise<{
    code: string;
    name: string;
    regionName: string;
    description: string;
    access: WorldSiteAccess;
    capability: WorldSiteAction;
    actionLabel: string;
    dailyLimit: number;
    attendant: {
        role: string;
        description: string;
        constructor: {
            name: "RowDataPacket";
        };
        code: string;
        name: string;
    } | null;
}>;
export declare const worldSiteKnock: (qqUserId: string, siteCode: string) => Promise<{
    answered: true;
    site: {
        code: string;
        name: string;
        regionName: string;
        description: string;
        access: WorldSiteAccess;
        capability: WorldSiteAction;
        actionLabel: string;
        dailyLimit: number;
        attendant: {
            role: string;
            description: string;
            constructor: {
                name: "RowDataPacket";
            };
            code: string;
            name: string;
        } | null;
    };
    text?: undefined;
} | {
    answered: false;
    site: {
        code: string;
        name: string;
        regionName: string;
        description: string;
        access: WorldSiteAccess;
        capability: WorldSiteAction;
        actionLabel: string;
        dailyLimit: number;
        attendant: {
            role: string;
            description: string;
            constructor: {
                name: "RowDataPacket";
            };
            code: string;
            name: string;
        } | null;
    };
    text: string;
}>;
export declare const worldSiteForAttendant: (qqUserId: string, npcCode: string) => Promise<{
    siteCode: string;
    attendantName: string;
    capability: WorldSiteAction;
} | null>;
export declare const commissionSiteForAttendant: (qqUserId: string, npcCode: string) => Promise<{
    siteCode: string;
    attendantName: string;
    capability: WorldSiteAction;
} | null>;
export declare const acceptWorldSiteCommissionFromAttendant: (qqUserId: string, siteCode: string, npcCode: string) => Promise<{
    siteName: string;
    action: WorldSiteAction;
    usage: {
        used: number;
        remaining: number;
    };
    text: string;
    reward: number;
    materialName: string;
    clues: string[];
    shelterUntil: Date | null;
    commission: CommissionBriefing | null;
}>;
type CommissionBriefing = {
    issuerName: string;
    title: string;
    briefing: string;
    objective: string;
    targetName: string;
    reward: number;
};
export declare const playerWorldSiteCommissions: (qqUserId: string) => Promise<{
    id: number;
    title: string;
    objectiveText: string;
    rewardCopper: number;
    status: "completed" | "accepted" | "claimed";
    targetName: string;
    location: {
        regionName: string;
        x: number;
        y: number;
        z: number;
    };
}[]>;
export declare const completeWorldSiteCommissionsAtSite: (qqUserId: string, siteCode: string) => Promise<string[]>;
export declare const claimWorldSiteCommission: (qqUserId: string, commissionId: number) => Promise<{
    title: string;
    copper: number;
}>;
export declare const submitWorldSiteCommission: (qqUserId: string, commissionId: number) => Promise<string>;
export declare const useWorldSite: (qqUserId: string, siteCode: string, action: WorldSiteAction) => Promise<{
    siteName: string;
    action: WorldSiteAction;
    usage: {
        used: number;
        remaining: number;
    };
    text: string;
    reward: number;
    materialName: string;
    clues: string[];
    shelterUntil: Date | null;
    commission: CommissionBriefing | null;
}>;
export declare const snapshotCombatEnvironment: (connection: PoolConnection, sessionId: string, regionId: number, characterIds?: number[]) => Promise<{
    regionId: number;
    weatherCode: string;
    intensity: number;
    anomalyCode: string | null;
    modifiers: WeatherModifiers;
}>;
export declare const combatEnvironmentFor: (connection: Db, sessionId: string) => Promise<{
    regionId: number;
    weatherCode: string;
    intensity: number;
    anomalyCode: string | null;
    name: string;
    hint: string;
    modifiers: WeatherModifiers;
} | null>;
export declare const recordExplorationMovement: (qqUserId: string) => Promise<{
    exposure: number;
    changed: boolean;
}>;
export declare const currentDynamicEncounter: (qqUserId: string) => Promise<Encounter | null>;
export declare const patrolEncounterPreview: (qqUserId: string, npcCode: string) => Promise<{
    revision: number;
    text: string;
    responding: boolean;
} | null>;
export declare const startPatrolEncounter: (qqUserId: string, npcCode: string, revision: number) => Promise<Encounter>;
export declare const offerDynamicEncounter: (qqUserId: string) => Promise<Encounter | null>;
export declare const nearbyDynamicScenes: (qqUserId: string) => Promise<{
    id: string;
    title: string;
    discovererName: string;
    expiresAt: Date;
    participantCount: number;
    distance: number;
}[]>;
export declare const joinDynamicScene: (qqUserId: string, sceneId: string) => Promise<{
    role: string;
    alreadyJoined: boolean;
}>;
type SceneContribution = 'escort' | 'decode' | 'supply';
export declare const contributeDynamicScene: (qqUserId: string, sceneId: string, contribution: SceneContribution) => Promise<{
    contribution: SceneContribution;
    alreadyContributed: boolean;
    text: string;
}>;
export declare const resolveDynamicEncounter: (qqUserId: string, choiceCode: string, requestedId?: string) => Promise<{
    choice: {
        code: string;
        label: string;
        text: string;
        copper?: number;
        flag?: string;
        worldline?: string;
        stage?: number;
        nextNode?: string;
        rewardCode?: string;
        rewardChance?: number;
    };
    worldline: string;
    completed: boolean;
    reward: null;
    sharedWitnesses: number;
    worldlineResult: null;
    id: string;
    title: string;
    opening: string;
    choices: EncounterChoice[];
    expiresAt: Date;
    weatherName: string;
    regionName: string;
    nodeCode: string;
    patrol?: PatrolContext;
    objective?: ReturnType<typeof patrolObjective>;
} | {
    choice: {
        copper: number;
        flag: string;
        worldline: string;
        stage: number;
        code: string;
        label: string;
        text: string;
        nextNode?: string;
        rewardCode?: string;
        rewardChance?: number;
    };
    worldline: string;
    completed: boolean;
    reward: {
        name: string;
        duplicate: boolean;
    } | null;
    sharedWitnesses: number;
    worldlineResult: {
        stage: number;
        siteState: string;
        bossReady: boolean;
    } | null;
    id: string;
    title: string;
    opening: string;
    choices: EncounterChoice[];
    expiresAt: Date;
    weatherName: string;
    regionName: string;
    nodeCode: string;
    patrol?: PatrolContext;
    objective?: ReturnType<typeof patrolObjective>;
}>;
export declare const advanceDynamicNpcs: () => Promise<number>;
export declare const worldAdminSnapshot: () => Promise<{
    weather: {
        regionCode: string;
        regionName: string;
        name: string;
        intensity: number;
        transitionDueAt: Date;
    }[];
    worldlines: {
        code: string;
        stage: number;
        state: Record<string, unknown>;
    }[];
    npcs: {
        code: string;
        name: string;
        regionName: string;
        status: string;
        revision: number;
        position: {
            x: number;
            y: number;
            z: number;
        };
        state: Record<string, unknown>;
    }[];
    sites: {
        code: string;
        name: string;
        regionName: string;
        siteType: string;
        state: Record<string, unknown>;
    }[];
    bossGates: {
        worldline: string;
        bossCode: string;
        bossName: string;
        state: string;
        stageRequired: number;
    }[];
    activeEncounters: number;
    activeScenes: number;
    templateCount: number;
    ledgerToday: number;
}>;
export declare const worldContentPreview: (code?: string) => Promise<{
    code: string;
    title: string;
    enabled: boolean;
    weight: number;
    regions: string[];
    weather: string[];
    errors: string[];
    valid: boolean;
}[]>;
export declare const setWorldContentEnabled: (code: string, enabled: boolean) => Promise<void>;
export declare const setWorldContentWeight: (code: string, weight: number) => Promise<void>;
export declare const worldLedger: (limit?: number) => Promise<{
    id: number;
    eventType: string;
    outcome: string;
    sourceKey: string;
    actorName: string | null;
    regionName: string | null;
    payload: Record<string, unknown>;
    createdAt: Date;
}[]>;
export declare const settleDynamicWorld: () => Promise<{
    transitions: number;
    patrols: number;
    bossActivations: number;
}>;
export {};
