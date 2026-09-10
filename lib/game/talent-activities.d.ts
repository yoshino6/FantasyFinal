import type { PoolConnection } from 'mysql2/promise';
import { type TalentData } from './talent-data';
import type { TalentDefinition } from './talent.config';
export declare const talentNpcLinks: Record<string, string[]>;
export declare const talentActivityActions: string[];
export declare const talentActivity: (c: PoolConnection, actor: Record<string, any>, talent: TalentDefinition, data: TalentData, action: string, arg: string, value: string) => Promise<any>;
