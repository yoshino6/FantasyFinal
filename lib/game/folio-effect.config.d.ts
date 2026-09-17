import type { FolioSkill } from './active-folio-skills.config';
export declare const folioBuffs: Record<string, [
    string,
    number,
    number
][]>;
export declare const folioDebuffs: Record<string, [
    string,
    number,
    number,
    number
]>;
export declare const folioEffectPreview: (skill: FolioSkill, factor: number) => string[];
