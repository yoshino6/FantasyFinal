import type { Pool } from 'mysql2/promise';
export type AppSession = {
    appUserId: string;
    displayName: string;
    qqUserId: string;
    playerId: number;
    characterId: number | null;
};
export declare const createAppUser: (displayName: string) => Promise<{
    appUserId: string;
    token: string;
    qqUserId: string;
}>;
export declare const issueBindingCode: (qqUserId: string) => Promise<string>;
export declare const bindAppUser: (appUserIdValue: string, code: string) => Promise<{
    qqUserId: string;
    characterId: number | null;
}>;
export declare const sessionForApp: (token: string) => Promise<AppSession | null>;
export declare const appSessionQqUser: (session: AppSession, pool?: Pool) => Promise<string>;
export declare const appUserIdentity: (appUserIdValue: string) => Promise<{
    qqUserId: string;
    playerId: number | null;
    characterId: number | null;
}>;
export declare const revokeAppBinding: (appUserIdValue: string) => Promise<void>;
export declare const appCommandContext: (appUserIdValue: string) => Promise<{
    qqUserId: string;
}>;
