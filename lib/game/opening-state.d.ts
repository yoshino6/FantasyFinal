import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export { chooseWeighted } from './opening-route-draw';
import { type WorldArea } from './world-site-geometry';
export type OpeningConnection = Pick<PoolConnection, 'execute'>;
export declare const assertOpeningFree: (connection: OpeningConnection, characterId: number) => Promise<void>;
export declare const openingWorldFor: (connection: OpeningConnection, lock?: boolean) => Promise<RowDataPacket>;
export declare const openingSafeHubs: (connection: OpeningConnection, lock?: boolean) => Promise<RowDataPacket[]>;
export declare const availableOpeningSpawns: (connection: OpeningConnection) => Promise<{
    candidates: {
        region: RowDataPacket;
        configuration: {
            readonly tier: 1;
        } | {
            readonly tier: 1;
        };
        routes: import("./opening.types").OpeningRoute[];
        point: {
            x: number;
            y: number;
            z: number;
        };
    }[];
    areas: (RowDataPacket & WorldArea)[];
    enabled: Set<string>;
}>;
export declare const openingSpawnPoint: (candidate: Awaited<ReturnType<typeof availableOpeningSpawns>>["candidates"][number], areas: WorldArea[], random?: () => number) => {
    x: number;
    y: number;
    z: number;
};
export declare const chooseOpeningSpawn: (connection: PoolConnection, random?: () => number) => Promise<{
    x: number;
    y: number;
    z: number;
    region: RowDataPacket;
    route: {
        destination: string;
        code: string;
        version: number;
        title: string;
        region: string;
        moveEntry: string;
        huntEntry: string;
        entryMergedIntoFirstPage?: boolean;
        pages: import("./opening.types").OpeningPage[];
        choices: import("./opening.types").OpeningChoice[];
        arrival: import("./opening.types").OpeningPage[];
        person?: {
            name: string;
            description: string;
        };
        lessonText?: string;
    };
}>;
