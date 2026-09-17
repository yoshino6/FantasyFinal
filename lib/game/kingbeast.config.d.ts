export type KingbeastUnit = {
    id?: number;
    current_hp?: number;
    hp_max?: number;
    is_defeated?: number | boolean;
    traits_json?: unknown;
    cooldowns?: unknown;
};
export type KingbeastDamageKind = 'physical' | 'magic' | 'untyped';
export type KingbeastPhaseTransitionCode = 'split' | 'castling' | 'enrage_king' | 'enrage_dragon';
export type BossPhaseTransition = {
    kind?: 'phase' | 'chant';
    code: string;
    title: string;
    description: string;
    dialogue: Array<{
        speaker: string;
        text: string;
    }>;
    effect: string;
};
export type KingbeastPhaseTransition = BossPhaseTransition & {
    code: KingbeastPhaseTransitionCode;
};
export declare const kingbeastPhaseTransition: (code: KingbeastPhaseTransitionCode) => KingbeastPhaseTransition;
export declare const kingbeastPhaseTransitionLog: (transition: KingbeastPhaseTransition) => string;
export declare const withoutKingbeastPhaseTransitionLogs: (logs: string[], transitionLogs: ReadonlySet<string>) => string[];
export declare const bossPhaseTransitionLogsAfterRound: (logs: string[], transitionLogs: ReadonlySet<string>, roundSuffix?: string) => string[];
export declare const kingbeastEncounter: (unit: KingbeastUnit) => Record<string, unknown> | undefined;
export declare const kingbeastUnitRole: (unit: KingbeastUnit) => string;
export declare const kingbeastGroupId: (unit: KingbeastUnit) => string;
export declare const kingbeastMapTargets: <T extends KingbeastUnit & {
    name: string;
}>(units: T[]) => T[];
export declare const isKingbeastPrimaryCore: (unit: KingbeastUnit) => boolean;
export declare const isLivingKingbeastUnit: (unit: KingbeastUnit) => boolean;
export declare const kingbeastCooldowns: (unit: KingbeastUnit) => Record<string, unknown>;
export declare const kingbeastFused: (units: KingbeastUnit[]) => boolean;
export declare const isHiddenFusedKing: (unit: KingbeastUnit, units: KingbeastUnit[]) => boolean;
export declare const kingbeastForcedSingleTarget: <T extends KingbeastUnit>(units: T[]) => T | undefined;
export declare const kingbeastSelectableTargets: <T extends KingbeastUnit>(units: T[]) => T[];
export declare const kingbeastSymbiosisActive: (units: KingbeastUnit[], groupId?: string) => boolean;
export declare const kingbeastCombatMultipliers: (unit: KingbeastUnit) => {
    attack: number;
    defense: number;
    accuracy: number;
    speed: number;
    tenacity: number;
};
export declare const kingbeastPassiveSummary: (unit: KingbeastUnit) => "" | "硬皮：受到的物理伤害-30%，受到的魔法伤害+30%" | "雷铸王袍：受到的魔法伤害-30%，受到的物理伤害+30%";
export declare const kingbeastPassiveDamageMultiplier: (unit: KingbeastUnit, damageKind: KingbeastDamageKind) => 1 | 1.3 | 0.7;
export declare const kingbeastCoreDamageMultiplier: (unit: KingbeastUnit, symbiosis: boolean, damageKind?: KingbeastDamageKind) => number;
export declare const kingbeastTransition: <T extends KingbeastUnit>(units: T[]) => {
    phaseRequired: boolean;
    split: boolean;
    castling: boolean;
    enrage: T | undefined;
};
export declare const kingbeastSummonDue: (turn: number, lastSummonTurn: number, livingCourtCount: number, bonusPhase?: boolean) => boolean;
export declare const kingbeastPanelSummary: (units: KingbeastUnit[], turn: number, lastSummonTurn: number) => string;
