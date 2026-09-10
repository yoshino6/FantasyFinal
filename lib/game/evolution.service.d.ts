import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { DerivedStats } from './types';
type EvolutionConnection = Pool | PoolConnection;
export type BodyPart = 'eye' | 'nerve' | 'skin' | 'chest' | 'bone' | 'organ';
export type InjectionCode = 'conservative' | 'aggressive' | 'harmonic' | 'perception' | 'symbiosis' | 'metamorphosis' | 'shaping';
export type EvolutionObservationType = 'behavior' | 'sample' | 'adaptation' | 'resonance' | 'containment';
export type SymbiosisTraitCode = 'shared_guard' | 'mana_circulation' | 'healing_resonance';
type MutationState = 'stable' | 'deviation' | 'rare' | 'paused' | 'archived';
type EvolutionBonus = Partial<Record<'hpPct' | 'mpPct' | 'physicalAttackPct' | 'magicAttackPct' | 'physicalDefensePct' | 'magicDefensePct' | 'accuracyPct' | 'evasionPct' | 'critRatePct' | 'critDamagePct' | 'critResistPct' | 'critDamageReductionPct' | 'tenacityPct' | 'tenacityPiercePct' | 'speedPct' | 'damageReductionPct' | 'hpRegenPct' | 'mpRegenPct' | 'healingBonusPct' | 'healingReceivedPct', number>> & Record<string, number>;
type ProfileRow = RowDataPacket & {
    character_id: number;
    unlocked_level: number;
    injection_count: number;
    evolution_scale: number;
    adaptation_pressure: number;
    stability: number;
    fixed_bonus_json: unknown;
    lineage_marks_json: unknown;
    active_lineage: string | null;
    final_traits_json: unknown;
    symbiosis_trait_code: SymbiosisTraitCode | null;
    daily_key: string | null;
    daily_claims: number;
};
type CharacterEvolutionRow = RowDataPacket & {
    id: number;
    name: string;
    level: number;
    experience: number;
    realm_stage: number;
    profession_code: string | null;
    evolution_stage: number;
};
type MutationRow = RowDataPacket & {
    id: number;
    body_part: BodyPart;
    mutation_code: string;
    mutation_name: string;
    mutation_state: MutationState;
    tier: number;
    source_injection: string;
    effect_json: unknown;
    description: string;
};
type EvolutionEventRow = RowDataPacket & {
    event_type: string;
    payload: unknown;
    created_at: string | Date;
};
export declare const bodyPartNames: Record<BodyPart, string>;
export declare const symbiosisTraits: Record<SymbiosisTraitCode, {
    name: string;
    partyText: string;
    soloText: string;
    partyBonus: EvolutionBonus;
    soloBonus: EvolutionBonus;
}>;
export declare const symbiosisTraitCodes: SymbiosisTraitCode[];
export declare const symbiosisTraitName: (code: string | null | undefined) => string;
export declare const evolutionItemName: (code: string) => string;
export declare const activateEvolutionProfile: (connection: EvolutionConnection, characterId: number) => Promise<[import("mysql2").QueryResult, import("mysql2").FieldPacket[]]>;
export declare const ensureEvolutionProfile: (connection: EvolutionConnection, character: Pick<CharacterEvolutionRow, "id" | "realm_stage" | "evolution_stage">, lock?: boolean) => Promise<ProfileRow>;
export declare const repairEvolutionProgress: (connection: EvolutionConnection, characterId: number) => Promise<{
    corrected: boolean;
    level: number;
    profile: ProfileRow | null;
}>;
export declare const evolutionInjectionMaterials: (level: number, code: InjectionCode) => {
    active: number;
    medium: number;
    catalyst: number;
};
export declare const evolutionStatBonuses: (connection: EvolutionConnection, characterId: number) => Promise<EvolutionBonus>;
export declare const applyEvolutionBaseStats: (stats: DerivedStats, bonus: EvolutionBonus) => DerivedStats;
export declare const injectEvolution: (qqUserId: string, code: InjectionCode, requestedPart?: BodyPart, requestedSymbiosisTrait?: SymbiosisTraitCode) => Promise<{
    characterId: number;
    name: string;
    code: InjectionCode;
    injectionName: string;
    fromLevel: number;
    toLevel: number;
    gainedSkillPoints: number;
    mutation: {
        outcome: string;
        code: string;
        name: string;
        part: BodyPart;
        state: "stable" | "deviation" | "rare";
        description: string;
        effect: EvolutionBonus;
    } | null;
    finalTraits: string[];
    symbiosisTrait: {
        name: string;
        partyText: string;
        soloText: string;
        partyBonus: EvolutionBonus;
        soloBonus: EvolutionBonus;
    } | null;
    pressure: number;
    stability: number;
}>;
export declare const evolutionObservationDashboard: (qqUserId: string) => Promise<{
    claimed: number;
    remaining: number;
    active: {
        definition: {
            name: string;
            objective: string;
            target: number;
            items: Record<string, number>;
        };
        rewards: string;
        constructor: {
            name: "RowDataPacket";
        };
        id: number;
        observation_type: EvolutionObservationType;
        status: "accepted" | "completed" | "claimed";
        progress: number;
        target_count: number;
        objective_text: string;
        reward_json: unknown;
        completed_at: Date | null;
    } | null;
    available: {
        rewards: string;
        name: string;
        objective: string;
        target: number;
        items: Record<string, number>;
        type: EvolutionObservationType;
    }[];
}>;
export declare const acceptEvolutionObservation: (qqUserId: string, type: EvolutionObservationType) => Promise<{
    rewards: string;
    name: string;
    objective: string;
    target: number;
    items: Record<string, number>;
    type: EvolutionObservationType;
}>;
export declare const advanceEvolutionObservationBattle: (connection: PoolConnection, characterId: number, context: {
    eliteOrBossDefeats: number;
    playerPartySize: number;
}) => Promise<{
    type: EvolutionObservationType;
    name: string;
    progress: number;
    target: number;
    completed: boolean;
} | null>;
export declare const advanceEvolutionObservationMining: (connection: PoolConnection, characterId: number) => Promise<{
    type: EvolutionObservationType;
    name: string;
    progress: number;
    target: number;
    completed: boolean;
} | null>;
export declare const claimEvolutionObservation: (qqUserId: string) => Promise<{
    name: string;
    items: Record<string, number>;
    remaining: number;
}>;
export declare const setMutationPaused: (qqUserId: string, mutationId: number, paused: boolean) => Promise<{
    characterId: number;
    name: string;
    paused: boolean;
}>;
export declare const stabilizeMutation: (qqUserId: string, mutationId: number) => Promise<{
    characterId: number;
    name: string;
    pressure: number;
    stability: number;
}>;
export declare const archiveMutation: (qqUserId: string, mutationId: number) => Promise<{
    characterId: number;
    name: string;
}>;
export declare const shapingDraft: (qqUserId: string) => Promise<{
    traits: MutationRow[];
    selectedIds: number[];
    required: number;
}>;
export declare const toggleShapingTrait: (qqUserId: string, mutationId: number) => Promise<{
    traits: MutationRow[];
    selectedIds: number[];
    required: number;
}>;
export declare const mutationDetail: (qqUserId: string, mutationId: number) => Promise<MutationRow>;
export declare const evolutionPanel: (qqUserId: string) => Promise<{
    character: CharacterEvolutionRow;
    profile: ProfileRow;
    mutations: MutationRow[];
    history: EvolutionEventRow[];
    materials: {
        code: string;
        quantity: number;
    }[];
    injections: {
        code: InjectionCode;
        quantity: number;
    }[];
    injectionNames: Record<InjectionCode, string>;
    bodyPartNames: Record<BodyPart, string>;
    available: InjectionCode[];
} | null>;
export declare const evolutionLabAvailable: (qqUserId: string) => Promise<boolean>;
export {};
