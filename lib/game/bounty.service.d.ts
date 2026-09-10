import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
type Connection = Pool | PoolConnection;
export declare const refreshBounties: (connection: Connection, _rollBossBounties?: boolean) => Promise<void>;
export declare const postBossBounty: (bossCode: string) => Promise<RowDataPacket & {
    id: number;
    title: string;
}>;
export declare const bountyBoard: (qqUserId: string, _requestedPage?: number, keyword?: string) => Promise<{
    bounties: {
        id: number;
        boardNo: number;
        title: string;
        targetName: string;
        requiredCount: number;
        copperReward: number;
        sourceSpawnId: number;
        location: {
            regionName: string;
            x: number;
            y: number;
            z: number;
        } | undefined;
        progress: number;
        status: "completed" | "claimed" | "accepted" | null;
    }[];
    activeCount: number;
    page: number;
    totalPages: number;
    total: number;
    keyword: string;
}>;
export declare const playerBounties: (qqUserId: string) => Promise<{
    id: number;
    title: string;
    targetName: string;
    requiredCount: number;
    copperReward: number;
    sourceSpawnId: number | undefined;
    location: {
        regionName: string;
        x: number;
        y: number;
        z: number;
    } | undefined;
    progress: number;
    status: "completed" | "claimed" | "accepted" | "invalid";
}[]>;
export declare const clearInvalidBounty: (qqUserId: string, bountyId: number) => Promise<void>;
export declare const abandonBounty: (qqUserId: string, bountyId: number) => Promise<{
    title: string;
}>;
export declare const abandonSecondaryQuest: (qqUserId: string, questCode: "blacksmith_apprentice" | "alchemist_apprentice" | "deconstructor_apprentice" | "omniscient_apprentice") => Promise<void>;
export declare const acceptBounty: (qqUserId: string, bountyId: number) => Promise<{
    title: string;
}>;
export declare const claimBounty: (qqUserId: string, bountyId: number) => Promise<{
    title: string;
    copper: number;
}>;
export declare const advanceBountyProgress: (connection: PoolConnection, characterId: number, targets: {
    spawnId: number;
    templateId: number;
}[]) => Promise<void>;
export {};
