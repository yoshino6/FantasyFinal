import type { AutomatonVector as Vec } from './automaton-growth';
export type AutomatonFeed = {
    code: string;
    name: string;
    vector: Vec;
    main: Record<string, number>;
    aux: Record<string, number>;
};
export declare const automatonFeeds: AutomatonFeed[];
