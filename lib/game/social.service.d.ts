import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export declare const isFriendRelation: (connection: PoolConnection, leftId: number, rightId: number) => Promise<boolean>;
export declare const sendFriendRequest: (qqUserId: string, targetGameId: number) => Promise<{
    targetName: string;
}>;
export declare const friendRequests: (qqUserId: string) => Promise<(RowDataPacket & {
    id: number;
    requester_character_id: number;
    name: string;
    game_id: number;
    created_at: Date;
    expires_at: Date;
})[]>;
export declare const acceptFriendRequest: (qqUserId: string, requestId: number) => Promise<{
    name: string;
}>;
export declare const rejectFriendRequest: (qqUserId: string, requestId: number) => Promise<boolean>;
export declare const friendList: (qqUserId: string) => Promise<{
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    } | {
        value: number;
        nextMin: null;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
    constructor: {
        name: "RowDataPacket";
    };
    status: "friend" | "oath";
    affinity: number;
    daily_interactions: number;
    daily_gifts: number;
    name: string;
    game_id: number;
    other_id: number;
}[]>;
export declare const friendDetail: (qqUserId: string, targetGameId: number) => Promise<{
    name: string;
    gameId: number;
    level: number;
    rank: string;
    profession: string;
    secondaryProfession: string;
    secondaryLevel: number | null;
    skills: {
        name: string;
        level: number;
        category: string;
    }[];
}>;
export declare const recordFriendInteraction: (connection: PoolConnection, actorId: number, targetId: number) => Promise<{
    changed: boolean;
    affinity: number;
    dailyInteractions: number;
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
} | null>;
export declare const interactFriend: (qqUserId: string, targetGameId: number) => Promise<{
    targetName: string;
    changed: boolean;
    affinity: number;
    dailyInteractions: number;
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
}>;
export declare const giveAffinityGift: (qqUserId: string, targetGameId: number, item: string | number) => Promise<{
    targetName: string;
    itemName: string;
    affinity: number;
    gain: number;
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
    dailyGifts: number;
}>;
export declare const oathStatus: (qqUserId: string) => Promise<{
    affinity: number;
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
    constructor: {
        name: "RowDataPacket";
    };
    id: number;
    status: string;
    name: string;
    game_id: number;
    ceremony_at: Date | null;
} | null>;
export declare const requestOath: (qqUserId: string, targetGameId: number) => Promise<{
    targetName: string;
}>;
export declare const oathRequests: (qqUserId: string) => Promise<{
    affinity: number;
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
    constructor: {
        name: "RowDataPacket";
    };
    id: number;
    name: string;
    game_id: number;
    expires_at: Date;
}[]>;
export declare const rejectOath: (qqUserId: string, requestId: number) => Promise<boolean>;
export declare const acceptOath: (qqUserId: string, requestId: number) => Promise<{
    partnerName: string;
    affinity: number;
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
}>;
export declare const startOathCeremony: (qqUserId: string) => Promise<{
    actorName: string;
    partnerName: string;
    affinity: number;
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
}>;
export declare const recordOathMemory: (qqUserId: string) => Promise<{
    partnerName: string;
    affinity: number;
    stage: {
        value: number;
        nextMin: number;
        toNext: number;
        min: number;
        max: number | null;
        title: string;
        description: string;
    };
}>;
export declare const requestOathRelease: (qqUserId: string) => Promise<{
    partnerName: string;
}>;
export declare const acceptOathRelease: (qqUserId: string, requestId: number) => Promise<{
    partnerName: string;
}>;
export declare const rejectOathRelease: (qqUserId: string, requestId: number) => Promise<{
    partnerName: string;
}>;
export declare const oathReleaseRequests: (qqUserId: string) => Promise<(RowDataPacket & {
    id: number;
    name: string;
    game_id: number;
    expires_at: Date;
})[]>;
