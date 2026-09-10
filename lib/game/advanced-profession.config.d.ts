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
export declare const registeredAdvancedProfessionByCode: (code: string) => AdvancedProfession | {
    code: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
    name: "魔学者" | "御器师" | "发明家" | "执奕者";
    role: "十二粒子调配、风险与大成功" | "器阵组合、攻守与多器合击" | "异械驱动、供能与能力协同" | "公开信息、保护预案与行动次序";
    mentor: {
        code: "blacksmith" | "alchemy_sweetshop" | "oddworkshop" | "bookshop";
        name: "晴儿" | "小北" | "唯薇安" | "洛文·赫斯特";
    };
    passive: {
        code: string;
        name: "奇釜实验" | "百器共鸣" | "异械主脑" | "全局视野";
        description: "十二粒子调配、风险与大成功" | "器阵组合、攻守与多器合击" | "异械驱动、供能与能力协同" | "公开信息、保护预案与行动次序";
        effect: Record<string, number>;
    };
} | undefined;
export declare const isCachedAdvancedPassiveKey: (key: string) => boolean;
export declare const cachedAdvancedPassiveEffectFor: (professionCode: string | null | undefined) => Record<string, number>;
export declare const hasBattleOnlyAdvancedPassiveEffect: (professionCode: string | null | undefined) => boolean;
export declare const advancedProfessionActiveSkillCodes: Record<string, string[]>;
export declare const activeSkillCodesForAdvancedProfession: (professionCode: string) => string[];
export declare const advancedProfessionPassiveCodes: Set<string>;
export declare const advancedInheritanceSkillCode: (professionCode: string) => string;
export declare const advancedProfessionInheritanceCodes: Set<string>;
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
export declare const advancedBoundSkillDefinitions: {
    professionCode: string;
    code: string;
    name: string;
    kind: string;
    description: string;
    effect: Record<string, number>;
}[];
