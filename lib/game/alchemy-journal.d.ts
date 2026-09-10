export declare const alchemyRuleVersion = "alchemy-v2-20260906";
export type AlchemyIngredient = {
    id: number;
    code: string;
    name: string;
    quantity: number;
    role: string;
    level?: number;
    effect?: unknown;
};
export type AlchemyBatch = {
    success: boolean;
    great?: boolean;
    consumed?: AlchemyIngredient[];
    outputs: AlchemyIngredient[];
};
export type AlchemySnapshot = {
    kind: string;
    source: string;
    ingredients: AlchemyIngredient[];
    level: number;
    craftsmanship: number;
    version: string;
    cost?: number;
    conditions?: string;
};
export type AlchemyStatistics = {
    settlements: number;
    batches: number;
    successes: number;
    outcomes: Record<string, number>;
    quantities: Record<string, {
        min: number;
        max: number;
        total: number;
    }>;
    qualities: Record<string, number>;
};
export declare const alchemyCombinationKey: (items: readonly Pick<AlchemyIngredient, "id">[]) => string;
export declare const alchemyFingerprint: (value: unknown) => string;
export declare const alchemyBaseCode: (code: string) => string;
export declare const alchemyGroupKey: (snapshot: AlchemySnapshot) => string;
export declare const emptyAlchemyStatistics: () => AlchemyStatistics;
export declare const updateAlchemyStatistics: (previous: AlchemyStatistics, batches: readonly AlchemyBatch[]) => AlchemyStatistics;
export declare const alchemyStability: (stats: AlchemyStatistics) => {
    outcome: string;
    count: number;
    stable: boolean;
};
export declare const validAlchemyCombination: (ids: readonly number[], available: ReadonlyMap<number, number>) => boolean;
export type AlchemySearch = {
    cursor: number;
    selected: number | null;
    eligible: number;
};
export declare const scanAlchemyCombinations: (ids: readonly number[], available: ReadonlyMap<number, number>, tried: ReadonlySet<string>, previous?: AlchemySearch, budget?: number, random?: () => number) => {
    state: {
        cursor: number;
        selected: number | null;
        eligible: number;
    };
    done: boolean;
    combination: number[] | null;
};
