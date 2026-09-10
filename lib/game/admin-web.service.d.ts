import { type WebRole } from './operation-journal.service';
export type WebSession = {
    accountId: number;
    username: string;
    role: WebRole;
    csrfToken: string | null;
};
export declare const loginAdminWeb: (input: {
    username: unknown;
    password: unknown;
    ip: unknown;
}) => Promise<{
    token: string;
    csrfToken: string;
    session: {
        accountId: number;
        username: string;
        role: WebRole;
        csrfToken: string;
    };
}>;
export declare const sessionForAdminWeb: (token: string, csrfToken?: string | null) => Promise<WebSession | null>;
export declare const logoutAdminWeb: (token: string) => Promise<void>;
export declare const webAdminAccounts: (actor: WebSession) => Promise<{
    id: number;
    username: string;
    role: WebRole;
    enabled: boolean;
    forcePasswordChange: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
}[]>;
export declare const createWebAdminAccount: (actor: WebSession, input: {
    username: unknown;
    password: unknown;
    role: unknown;
}) => Promise<void>;
export declare const setWebAdminEnabled: (actor: WebSession, usernameValue: unknown, enabled: boolean) => Promise<void>;
