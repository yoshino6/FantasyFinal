import type { OpeningConnection } from './opening-state';
export declare const guildMapRisk: (maxLevel: number | null) => "待勘测" | "低危" | "中危" | "高危";
export declare const guildMapContributionPrice: (risk: string) => 1000 | 200 | 10000 | null;
export declare const guildMapCatalog: (connection: OpeningConnection) => Promise<{
    id: number | null;
    code: string | null;
    name: string;
    regionCode: string;
    regionName: string;
    description: string;
    codexId: string | null;
    minLevel: number | null;
    maxLevel: number | null;
    bossLevel: number | null;
    risk: string;
    safeTown: boolean;
    canExchange: boolean;
}[]>;
export declare const ensureRegistrationMapExchange: (connection: OpeningConnection, characterId: number) => Promise<void>;
