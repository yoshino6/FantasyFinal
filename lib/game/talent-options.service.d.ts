import type { PoolConnection } from 'mysql2/promise';
import type { TalentData } from './talent-data';
export type TalentOption = {
    label: string;
    command: string;
};
export declare const talentOptions: (c: PoolConnection, actor: Record<string, any>, data: TalentData, action: string, state?: string) => Promise<{
    options: TalentOption[];
    text: string;
}>;
