import { type WebRole } from './operation-journal.service';
export type PlayerFilters = {
    page?: unknown;
    keyword?: unknown;
    region?: unknown;
    activity?: unknown;
    status?: unknown;
};
export declare const adminDashboard: () => Promise<{
    system: import("./system-status.service").SystemStatusSnapshot;
    players: number;
    operationsToday: number;
    openAlerts: number;
}>;
export declare const adminPlayers: (filters?: PlayerFilters) => Promise<{
    page: number;
    total: number;
    totalPages: number;
    entries: {
        characterId: number;
        playerId: number;
        qqUserId: string;
        nickname: string | null;
        status: string;
        name: string;
        level: number;
        realmStage: number;
        copper: number;
        activity: string;
        region: {
            code: string;
            name: string;
        };
        updatedAt: Date;
    }[];
}>;
export declare const adminPlayerDetail: (characterId: number) => Promise<{
    character: {
        id: number;
        playerId: number;
        qqUserId: string;
        nickname: string | null;
        status: string;
        name: string;
        gender: string;
        level: number;
        experience: number;
        realmStage: number;
        skillPoints: number;
        copper: number;
        hp: {
            current: number;
            max: number;
        };
        mp: {
            current: number;
            max: number;
        };
        activity: string;
        profession: string | null;
        secondaryProfession: string | null;
        region: {
            code: string;
            name: string;
        };
        position: {
            x: number;
            y: number;
            z: number;
        };
        updatedAt: Date;
    };
    inventory: {
        code: string;
        name: string;
        quantity: number;
    }[];
    equipment: {
        slot: string;
        name: string;
        quality: number | null;
    }[];
    skills: {
        name: string;
        level: number;
        slot: number | null;
    }[];
    events: {
        id: number;
        type: string;
        payload: unknown;
        createdAt: Date;
    }[];
    travel: {
        type: string;
        arrivalAt: Date;
    } | null;
    combats: {
        id: string;
        state: string;
        lastActionAt: Date;
    }[];
}>;
export declare const adminWorldOverview: () => Promise<{
    regions: {
        code: string;
        name: string;
        dangerLevel: number;
        enabled: boolean;
        monsters: number;
        resources: number;
    }[];
    settings: {
        key: string;
        value: number;
    }[];
    active: {
        battles: number;
        travels: number;
        scenes: number;
    };
}>;
export declare const changeGlobalMultiplierFromWeb: (actor: {
    username: string;
    role: WebRole;
}, key: unknown, value: unknown, reason: unknown) => Promise<number>;
export declare const runWebPlayerAudit: (actor: {
    username: string;
    role: WebRole;
}, characterId: number, kind: unknown, reason: unknown) => Promise<{
    operationId: `${string}-${string}-${string}-${string}-${string}`;
    name: string;
    changed: boolean;
    fixed: string;
}>;
export declare const adminWebJournals: (page: unknown, keyword: unknown) => Promise<{
    page: number;
    total: number;
    totalPages: number;
    entries: {
        id: string;
        correlationId: string;
        actor: string;
        action: string;
        status: string;
        risk: string;
        reason: string;
        createdAt: Date;
        target: {
            kind: string;
            id: string | null;
        } | null;
    }[];
}>;
