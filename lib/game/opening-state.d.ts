import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export { chooseWeighted } from './opening-route-draw';
export type OpeningConnection = Pick<PoolConnection, 'execute'>;
export declare const assertOpeningFree: (connection: OpeningConnection, characterId: number) => Promise<void>;
export declare const openingWorldFor: (connection: OpeningConnection, lock?: boolean) => Promise<RowDataPacket>;
export declare const openingSafeHubs: (connection: OpeningConnection, lock?: boolean) => Promise<RowDataPacket[]>;
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
