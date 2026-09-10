import type { PoolConnection } from 'mysql2/promise';
export type TalentDrop = {
    code: string;
    chance: number;
    probability: number;
    scale?: number;
    group?: string;
    min: number;
    max: number;
};
export declare const rollTalentDropPack: (table: TalentDrop[], multiplier?: number, random?: () => number) => {
    code: string;
    quantity: number;
}[];
export declare const talentDropPack: (c: PoolConnection, id: number, table: TalentDrop[], eventKey: string, boss: boolean) => Promise<{
    code: string;
    quantity: number;
}[]>;
