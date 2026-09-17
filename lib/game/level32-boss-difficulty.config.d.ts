export declare const level32DifficultyBossCodes: readonly ["goblin_king", "gruen_mountainheart", "valk_forge_overseer", "threehead_mother", "necromancer_uz"];
export type Level32DifficultyBossCode = typeof level32DifficultyBossCodes[number];
export type Level32BossDifficultyCode = 'infernal' | 'abyssal' | 'crimson' | 'corrupted' | 'holy' | 'golden' | 'brilliant' | 'dreamlike';
export type Level32BossDifficultyStat = 'hp' | 'tenacity' | 'physicalAttack' | 'magicAttack' | 'physicalDefense' | 'magicDefense' | 'accuracy' | 'evasion' | 'speed' | 'critRate' | 'critDamage' | 'critResist' | 'critReduction';
export type Level32BossDifficultyTrait = {
    code: Level32BossDifficultyCode;
    name: string;
    referenceEquipment: '稀有' | '传说' | '史诗';
    role: '均衡' | '强攻' | '重防' | '机动';
    statMultiplier: number;
    statMultipliers: Record<Level32BossDifficultyStat, number>;
    experiencePct: number;
    dropPct: number;
};
export declare const level32BossDifficultyTraits: Record<Level32BossDifficultyCode, Level32BossDifficultyTrait>;
export declare const level32BossDifficultyTraitFor: (bossCode: string, difficultyCode: string) => Level32BossDifficultyTrait | undefined;
export declare const applyLevel32BossDifficultyTraits: <T extends {
    code: string;
}>(bossCode: string, traits: readonly T[]) => (Level32BossDifficultyTrait | T)[];
export declare const level32BossDifficultyCodeFromTraits: (bossCode: string, traits: unknown) => Level32BossDifficultyCode | undefined;
