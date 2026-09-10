import type { Pool, PoolConnection } from 'mysql2/promise';
export type InheritancePassiveProfile = {
    professionCode: string;
    mode: 'own' | 'study';
    values: number[];
};
export type InheritanceStudyView = {
    professionCode: string;
    ownProfessionCode: string | null;
    level: number;
    startedAt: Date | null;
    completedAt: Date | null;
    equipped: boolean;
    readyAt: Date | null;
};
export declare const inheritanceStudyView: (qqUserId: string, mentorCode: string) => Promise<InheritanceStudyView>;
export declare const beginInheritanceStudy: (qqUserId: string, sourceProfessionCode: string) => Promise<{
    profession: import("./advanced-profession.config").AdvancedProfession;
    readyAt: Date;
}>;
export declare const completeInheritanceStudy: (qqUserId: string, sourceProfessionCode: string) => Promise<{
    profession: import("./advanced-profession.config").AdvancedProfession;
    passive: import("./advanced-profession.config").InheritancePassiveDefinition;
}>;
export declare const equipInheritanceStudy: (qqUserId: string, sourceProfessionCode: string, equipped: boolean) => Promise<import("./advanced-profession.config").InheritancePassiveDefinition>;
export declare const inheritancePassivesFor: (connection: Pool | PoolConnection, characterIds: number[]) => Promise<Map<number, InheritancePassiveProfile[]>>;
