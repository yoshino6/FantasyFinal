import type { PoolConnection } from 'mysql2/promise';
import { type TalentData } from './talent-data';
export type TalentView = {
    name: string;
    description: string;
    revision: number;
    text: string;
    jobs: {
        id: string;
        kind: string;
        remaining: number;
        detail?: string;
    }[];
    commands: string[];
    commandLabels?: Record<string, string>;
};
export declare const grantTalentProficiency: (connection: PoolConnection, id: number, profession: string, amount: number) => Promise<number>;
export declare const talentActionWithConnection: (connection: PoolConnection, user: string, revision?: number, action?: string, arg?: string, value?: string) => Promise<TalentView>;
export declare const talentAction: (user: string, revision?: number, action?: string, arg?: string, value?: string) => Promise<TalentView>;
export declare const addTalentJob: (data: TalentData, kind: string, seconds: number, payload: Record<string, any>) => `${string}-${string}-${string}-${string}-${string}`;
