import { Format } from 'alemonjs';
export declare const worldSiteFormat: (qqUserId: string, siteCode: string, notices?: string[]) => Promise<Format>;
export declare const worldSiteActionHandler: () => Promise<void>;
export declare const acceptWorldSiteCommissionHandler: () => Promise<void>;
export declare const claimWorldSiteCommissionHandler: () => Promise<void>;
export declare const worldSiteKnockHandler: () => Promise<void>;
