import { type AutomatonVector } from './automaton-growth';
import { type AutomatonPersonality } from './automaton-personality';
export type AutomatonFeedChunk = {
    code: string;
    xp: number;
};
export type AutomatonLevel = {
    level: number;
    contributions: AutomatonFeedChunk[];
    vector: AutomatonVector;
    gain: number[];
    counts: number[];
    skills: string[];
};
export type AutomatonState = {
    version: 3;
    growthBalanceVersion?: number;
    seed: string;
    name: string;
    personality: AutomatonPersonality;
    level: number;
    stats: number[];
    hp: number;
    mp: number;
    levels: AutomatonLevel[];
    progress: AutomatonFeedChunk[];
    reserve: AutomatonFeedChunk[];
    learned: string[];
    equipped: string[];
    pendingSpecial: number;
    intimacy: number;
    ownerAddress: string;
    selfAddress: string;
    publicQuotes: boolean;
    greeting: boolean;
    guard: boolean;
    participation?: '参战' | '陪伴';
    appearance?: string;
    archived?: boolean;
    named?: boolean;
    renameDay?: string;
    renameCount?: number;
    lastInteractionAt?: string;
    origin?: {
        kind: 'crafted' | 'opening';
        code?: string;
    };
    portrait?: {
        key: string;
        width: number;
        height: number;
        url?: string;
    };
    strategy: '性格' | '进攻' | '守护' | '节能';
    customQuotes: Record<string, string[]>;
    preferences: Record<string, number>;
};
export declare const createAutomaton: (seed: string) => AutomatonState;
export declare const autoEquipAutomaton: (state: AutomatonState) => void;
export declare const feedDefinition: (code: string) => import("./automaton-feeds").AutomatonFeed;
export declare const materialVector: (chunks: AutomatonFeedChunk[]) => AutomatonVector;
export declare const migrateAutomatonGrowth: (original: AutomatonState) => AutomatonState;
export declare const cultivateAutomaton: (original: AutomatonState, bottles: {
    code: string;
    count: number;
}[], cap: number, stopAt?: number) => AutomatonState;
export declare const respecAutomaton: (original: AutomatonState, levels: number[], replacement: AutomatonFeedChunk[]) => {
    state: AutomatonState;
    required: number;
    fee: number;
};
export declare const automatonPanel: (state: AutomatonState) => {
    [k: string]: number;
};
export declare const effectiveAutomatonState: (original: AutomatonState, ownerCap: number) => AutomatonState;
