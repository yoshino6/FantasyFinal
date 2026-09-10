import { type AutomatonVector } from './automaton-growth';
export type AutomatonPersonality = ReturnType<typeof createAutomatonPersonality>;
export declare const compatibleAutomatonTraits: (ids: string[]) => boolean;
export declare const createAutomatonPersonality: (seed: string) => {
    version: number;
    coreId: string;
    coreName: string;
    traits: {
        id: string;
        name: string;
        ordinal: number;
        birthWeight: number;
    }[];
    scores: {
        [k: string]: number;
    };
    aligned: string[];
    vector: AutomatonVector;
    ownerAddress: string;
    selfAddress: string;
    selfCareHp: number;
    ownerCareHp: number;
    interceptChance: number;
    sacrifice: boolean;
};
export declare const drawAutomatonSkill: (seed: string, key: string, personality: AutomatonPersonality, learned: string[], special?: boolean, first?: boolean) => string | null;
export declare const automatonSkillSlots: (level: number) => {
    A: number;
    Psv: number;
    SP: number;
    ULT: number;
};
export declare const validateAutomatonLoadout: (level: number, learned: string[], equipped: string[]) => void;
