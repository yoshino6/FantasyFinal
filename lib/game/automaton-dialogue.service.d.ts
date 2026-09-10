import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { AutomatonState } from './automaton';
export declare const prepareAutomatonQuote: (connection: PoolConnection, id: number, state: AutomatonState, event: string, key: string, facts?: Set<string>, allowCustom?: boolean) => Promise<{
    id: number;
    text: string;
    quoteId: string;
} | null>;
export declare const greetAutomaton: (user: string, id: number, key: string, _privateOutput: boolean) => Promise<{
    quote: {
        id: number;
        text: string;
        quoteId: string;
    } | null;
    name: string;
    note: string;
}>;
export declare const reserveDailyAutomaton: (user: string, _privateOutput: boolean) => Promise<{
    characterId: number;
    day: string;
    name: string;
    id: number;
    text: string;
    quoteId: string;
} | null>;
export declare const finishDailyAutomaton: (quote: {
    id: number;
    characterId: number;
    day: string;
}, success: boolean) => Promise<void>;
export declare const acknowledgeAutomatonQuote: (id: number) => Promise<void>;
export declare const rateAutomatonQuote: (user: string, id: number, quoteId: number, like: boolean) => Promise<void>;
export declare const rememberAutomatonQuote: (user: string, id: number, quoteId: number) => Promise<void>;
export declare const automatonMemories: (user: string, id: number) => Promise<RowDataPacket[]>;
export declare const forgetAutomatonMemory: (user: string, id: number, memoryId: number) => Promise<void>;
export declare const acknowledgeAutomatonBattleText: (user: string, text: string) => Promise<void>;
export declare const quoteForAutomatonMutation: (user: string, token: string, _privateOutput: boolean) => Promise<{
    name: string;
    petId: number;
    token: string;
    characterId: number;
    id: number;
    text: string;
    quoteId: string;
} | null>;
export declare const finishAutomatonMutationQuote: (quote: {
    id: number;
    token: string;
    characterId: number;
}, success: boolean) => Promise<void>;
