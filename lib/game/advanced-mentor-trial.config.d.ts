import type { Allocation, DerivedStats } from './types';
import type { AdvancedProfession, InheritancePassiveDefinition } from './advanced-profession.config';
type EvolutionBonus = Record<string, number>;
export type AdvancedMentorTrialBuild = {
    version: 2;
    professionCode: string;
    equipment: {
        level: 30;
        rarity: '传说';
        quality: 100;
        weapon: string;
        offhand: string;
        armor: string;
        secondaryAffixes: string[];
        mastery: string[];
    };
    evolution: Array<{
        name: string;
        effect: EvolutionBonus;
    }>;
    trainedAttributes: Allocation;
    stats: DerivedStats;
    passive: {
        name: string;
        effect: Record<string, number>;
    };
    inheritance: {
        name: string;
        values: number[];
    } | null;
    resource: {
        code: string;
        name: string;
    } | null;
    rotation: string[];
    lowHealthSkill?: string;
};
export declare const advancedMentorTrialBuild: (profession: AdvancedProfession, inheritance?: InheritancePassiveDefinition) => AdvancedMentorTrialBuild;
export declare const advancedMentorTrialTraits: (build: AdvancedMentorTrialBuild) => ({
    code: string;
    name: string;
    evolution: {
        name: string;
        effect: EvolutionBonus;
    };
} | {
    code: string;
    name: string;
    profession_code: string;
    build: AdvancedMentorTrialBuild;
    equipment?: undefined;
} | {
    code: string;
    name: string;
    equipment: {
        level: 30;
        rarity: "\u4F20\u8BF4";
        quality: 100;
        weapon: string;
        offhand: string;
        armor: string;
        secondaryAffixes: string[];
        mastery: string[];
    };
    profession_code?: undefined;
    build?: undefined;
})[];
export {};
