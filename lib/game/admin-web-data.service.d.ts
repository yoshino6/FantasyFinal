import type { RowDataPacket } from 'mysql2/promise';
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
export declare const adminSearchSuggestions: (kind: unknown, keyword: unknown, offsetValue?: unknown) => Promise<{
    entries: (RowDataPacket & {
        label: string;
        value: string;
        detail: string;
    })[];
    hasMore: boolean;
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
export declare const adminGameOperations: (page: unknown, keyword: unknown) => Promise<{
    page: number;
    totalPages: number;
    total: number;
    filter: "人员" | "操作" | "时间" | undefined;
    value: string;
    keyword: string;
    entries: {
        id: number;
        operatorQqUserId: string;
        operatorName: string;
        actionType: string;
        actionText: string;
        targetQqUserId: string | null;
        createdAt: Date;
    }[];
}>;
export declare const adminMails: (keyword: unknown) => Promise<{
    id: number;
    characterId: number;
    characterName: string;
    qqUserId: string;
    title: string;
    content: string;
    receivedAt: Date;
    claimedAt: Date | null;
    deletedAt: Date | null;
    attachments: string;
}[]>;
export declare const sendWebMail: (actor: {
    username: string;
    role: WebRole;
}, body: Record<string, unknown>) => Promise<{
    recipients: number;
    operationId: `${string}-${string}-${string}-${string}-${string}`;
    scope: string;
    attachment: {
        name: string;
        quantity: number;
    } | null;
}>;
export declare const adminWorldEvents: (keyword: unknown) => Promise<{
    scenes: {
        id: string;
        title: string;
        regionName: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
        discoverer: string;
        status: string;
        openedAt: Date;
        expiresAt: Date;
        resolvedAt: Date | null;
        participants: number;
        weather: string;
    }[];
    encounters: {
        id: string;
        title: string;
        regionName: string;
        characterName: string;
        status: string;
        openedAt: Date;
        expiresAt: Date;
        resolvedAt: Date | null;
        weather: string;
    }[];
    ledger: {
        type: string;
        outcome: string;
        actorName: string | null;
        regionName: string | null;
        createdAt: Date;
        subject: string;
        position: {
            x: number;
            y: number;
            z: number;
        } | null;
    }[];
}>;
export declare const adminPatrolEntities: (keyword: unknown) => Promise<{
    name: string;
    regionName: string;
    status: string;
    position: {
        x: number;
        y: number;
        z: number;
    } | null;
    currentPoint: string;
    homeSite: string;
    sceneId: string | null;
    revision: number;
    lastActionAt: Date;
    nextActionAt: Date;
}[]>;
