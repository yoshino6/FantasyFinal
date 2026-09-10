import { Format } from 'alemonjs';
export declare const divineGroups: Record<string, readonly string[]>;
export declare const talentGroupIntroductions: Record<string, string>;
export declare const divineCatalog: (page?: number, keyword?: string, group?: string) => Format;
export declare const divineDetail: (input: string) => Format;
export declare const registrationScene: (stage: string, user: string) => Promise<Format>;
