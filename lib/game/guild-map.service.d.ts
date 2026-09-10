import type { OpeningConnection } from './opening-state';
import { type OpeningHubCode } from './opening-world.config';
export declare const guildMapRegions: Record<OpeningHubCode, readonly string[]>;
export declare const guildMapRisk: (maxLevel: number | null) => "待勘测" | "低危" | "中危" | "高危";
export declare const guildMapCatalog: (connection: OpeningConnection, hub: OpeningHubCode) => Promise<{
    id: number | null;
    code: string | null;
    name: string;
    regionCode: string;
    regionName: string;
    description: string;
    codexId: string | null;
    minLevel: number | null;
    maxLevel: number | null;
    risk: string;
    safeTown: boolean;
    canExchange: boolean;
}[]>;
