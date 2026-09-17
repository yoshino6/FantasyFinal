import type { ResidentSkill } from './resident-skill.config';
export type FolioSkill = ResidentSkill & {
    learnLevel: number;
    targetCount: number;
    parts: number[];
    shop: string;
    price: number;
};
export declare const folioSkills: readonly FolioSkill[];
export declare const folioSkillByCode: (code: string) => FolioSkill | undefined;
export declare const folioHasGrowth: (code: string) => boolean;
