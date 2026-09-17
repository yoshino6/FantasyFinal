import type { PoolConnection } from 'mysql2/promise';
import { type MonsterCardDefinition } from '../config/monster-cards';
export type MonsterCardEligibleMember = {
    characterId: number;
    name: string;
    luck: number;
    dropBonus: number;
};
export type MonsterCardRollTarget = {
    spawnId: number;
    monsterCode: string;
    defeated: boolean;
    traits: unknown;
};
export type MonsterCardProbabilityInput = {
    baseProbability: number;
    members: readonly MonsterCardEligibleMember[];
    useLuck: boolean;
    traitBonus: number;
    elixirBonus: number;
    omniscientBonus: number;
    globalMultiplier: number;
};
export type MonsterCardProbability = {
    baseProbability: number;
    partyBonus: number;
    traitBonus: number;
    elixirBonus: number;
    omniscientBonus: number;
    weightedDropBonus: number;
    luckMultiplier: number;
    globalMultiplier: number;
    totalMultiplier: number;
    finalProbability: number;
    recipientWeights: {
        characterId: number;
        weight: number;
        share: number;
    }[];
};
export type MonsterCardRollDecision = {
    rollValue: number;
    dropped: boolean;
    recipientRoll: number | null;
    recipientCharacterId: number | null;
};
export type GrantedMonsterCard = {
    rollId: number;
    sessionId: string;
    recipientCharacterId: number;
    recipientName: string;
    itemId: number;
    name: string;
    itemType: string;
    codexId: string | null;
};
type Candidate = {
    card: MonsterCardDefinition;
    sourceBossCode: string | null;
    pursuitRank: string | null;
};
export declare const calculateMonsterCardProbability: (input: MonsterCardProbabilityInput) => MonsterCardProbability;
export declare const decideMonsterCardRoll: (probability: Pick<MonsterCardProbability, "finalProbability" | "recipientWeights">, random?: () => number) => MonsterCardRollDecision;
export declare const monsterCardCandidatesForTarget: (target: MonsterCardRollTarget) => Candidate[];
export type RecordMonsterCardRollsInput = {
    sessionId: string;
    targets: readonly MonsterCardRollTarget[];
    members: readonly MonsterCardEligibleMember[];
    useLuck: boolean;
    elixirBonus: number;
    omniscientBonus: number;
    globalMultiplier: number;
};
export declare const recordMonsterCardRolls: (connection: PoolConnection, input: RecordMonsterCardRollsInput, random?: () => number) => Promise<number>;
export declare const grantMonsterCardsForSession: (sessionId: string) => Promise<GrantedMonsterCard[]>;
export declare const recoverPendingMonsterCardGrants: (limit?: number) => Promise<GrantedMonsterCard[]>;
export {};
