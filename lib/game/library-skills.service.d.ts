import type { PoolConnection } from 'mysql2/promise';
export declare const librarySkillCatalog: (qqUserId: string) => Promise<{
    id: number;
    code: string;
    name: string;
    tier: string;
    category: string;
    description: string;
    learned: boolean;
    discovered: boolean;
}[]>;
export declare const discoverLibrarySkillInTransaction: (connection: PoolConnection, qqUserId: string, skillId: number) => Promise<{
    name: string;
    learningCost: number;
}>;
export declare const discoverLibrarySkill: (qqUserId: string, skillId: number) => Promise<{
    name: string;
    learningCost: number;
}>;
