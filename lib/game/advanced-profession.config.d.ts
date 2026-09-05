export type AdvancedProfession = {
    code: string;
    name: string;
    baseProfession: '战士' | '法师' | '盗贼' | '牧师';
    mentor: {
        code: string;
        name: string;
        title: string;
        x: number;
        y: number;
    };
    role: string;
    passive: {
        code: string;
        name: string;
        description: string;
        effect: Record<string, number>;
    };
    first: {
        title: string;
        story: string;
        targetCodes: string[];
        targetText: string;
        requiredKills: number;
    };
    second: {
        title: string;
        story: string;
        targetCodes: string[];
        targetText: string;
        requiredKills: number;
        materialCount: number;
    };
    trial: {
        code: string;
        name: string;
        description: string;
        skillCodes: string[];
        stats: [number, number, number, number, number, number];
    };
};
export declare const worldTreeAdvancedProfessions: AdvancedProfession[];
export declare const renameAdvancedMentorText: (text: string) => string;
export declare const advancedProfessionByCode: (code: string) => AdvancedProfession | undefined;
export declare const advancedProfessionByMentor: (code: string) => AdvancedProfession | undefined;
export declare const isCachedAdvancedPassiveKey: (key: string) => boolean;
export declare const cachedAdvancedPassiveEffectFor: (professionCode: string | null | undefined) => Record<string, number>;
export declare const hasBattleOnlyAdvancedPassiveEffect: (professionCode: string | null | undefined) => boolean;
export declare const advancedProfessionActiveSkillCodes: Record<string, string[]>;
export declare const activeSkillCodesForAdvancedProfession: (professionCode: string) => string[];
export declare const advancedProfessionPassiveCodes: Set<string>;
export declare const isAdvancedProfessionSkillCode: (code: string) => boolean;
export declare const isCachedAdvancedPassiveEffect: (skillCode: string, effectKey: string) => boolean;
export type InheritancePassiveDefinition = {
    professionCode: string;
    name: string;
    ownDescription: string;
    studyDescription: string;
    own: number[];
    study: number[];
};
export declare const inheritancePassiveDefinitions: Record<string, InheritancePassiveDefinition>;
export declare const inheritancePassiveFor: (professionCode: string) => InheritancePassiveDefinition;
