export type MutationState = 'stable' | 'deviation' | 'rare';
export type MutationEffect = Record<string, number>;
export type MutationBlueprint = {
    code: string;
    name: string;
    part: 'eye' | 'nerve' | 'skin' | 'chest' | 'bone' | 'organ';
    state: MutationState;
    description: string;
    effect: MutationEffect;
    negativeEffect: MutationEffect;
};
export declare const mutationCatalog: MutationBlueprint[];
export declare const mutationByCode: Map<string, MutationBlueprint>;
export declare const dynamicDamageMutationCodes: Set<string>;
export declare const dynamicDamageReductionMutationCodes: Set<string>;
