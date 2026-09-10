import { Format } from 'alemonjs';
export declare const hiddenCombatFormat: (user: string, code: string, revision?: number, operation?: string, value?: string) => Promise<Format>;
export declare const hiddenCombatHandler: () => Promise<void>;
export declare const hiddenLoadoutHandler: () => Promise<void>;
export declare const hiddenAutoSaveHandler: () => Promise<void>;
