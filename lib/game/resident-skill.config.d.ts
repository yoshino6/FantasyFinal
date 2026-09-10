export type ResidentSkill = {
    id: string;
    code: string;
    name: string;
    category: 'physical' | 'magic' | 'utility' | 'passive';
    tier: '基础' | '下位' | '中位';
    mana: number;
    cooldown: number;
    chant: number;
    scope: 'self' | 'ally' | 'enemy' | 'allies' | 'enemies';
    element: string;
    power: number;
    description: string;
    damageType: string;
    ranged: boolean;
};
export declare const residentSkills: readonly ResidentSkill[];
export declare const residentSkillByCode: (code: string) => ResidentSkill | undefined;
export declare const residentPassiveFamily: (code: string) => string | undefined;
