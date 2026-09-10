import type { AutomatonState } from './automaton';
export declare const dialogueHash: (text: string) => string;
export declare const escapeAutomatonText: (text: string) => string;
export declare const automatonInteractionText: (name: string, text: string) => string;
export declare const automatonBattleInteractionText: (line: string) => string;
export declare const renderAutomatonQuote: (template: string, state: AutomatonState, owner?: string, enemy?: string) => string | null;
export declare const chooseAutomatonQuote: (state: AutomatonState, event: string, key: string, used: Set<string>, facts?: Set<string>, allowCustom?: boolean, owner?: string, enemy?: string) => {
    id: string;
    text: string;
    hash: string;
} | null;
