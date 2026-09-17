export type BossRandomEffectTrait = {
    code: 'boss_random_effect';
    name: '';
    version: 1;
    common: string[];
    exclusive: string[];
};
export type BossRandomEffectDefinition = {
    code: string;
    name: string;
    summary: string;
};
export declare const bossCommonEffects: BossRandomEffectDefinition[];
export declare const bossExclusiveEffects: Record<string, BossRandomEffectDefinition[]>;
export declare const bossRandomEffectTrait: (bossCode: string, difficultyCode: string, random?: () => number) => BossRandomEffectTrait | undefined;
export declare const replaceBossRandomEffectTrait: <T extends {
    code?: string;
}>(traits: T[], effect?: BossRandomEffectTrait) => Array<T | BossRandomEffectTrait>;
export declare const rerollBossRandomEffectTrait: <T extends {
    code?: string;
}>(traits: T[], bossCode: string, difficultyCode: string, random?: () => number) => (BossRandomEffectTrait | T)[];
export declare const readBossRandomEffect: (traits: unknown) => BossRandomEffectTrait | undefined;
export declare const bossRandomEffectDefinitions: (trait?: BossRandomEffectTrait) => BossRandomEffectDefinition[];
export declare const hasBossRandomEffect: (traits: unknown, code: string) => boolean;
