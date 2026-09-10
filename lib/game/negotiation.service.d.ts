import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { negotiationInventoryPage } from './negotiation-item-policy';
import { type NegotiationState } from './negotiation-rules';
export type NegotiationCommand = {
    type: 'view' | 'talk' | 'gift' | 'leave' | 'fight';
    sessionId?: string;
    revision?: number;
    itemId?: number;
    quantity?: number;
    page?: number;
    keyword?: string;
};
export declare class NegotiationCombatError extends Error {
    constructor();
}
export type NegotiationDrop = {
    code: string;
    chance: number;
    min: number;
    max: number;
    value: number;
    fixed?: boolean;
    group?: string;
    traitBonus?: number;
};
export type NegotiationContext = {
    actorId: number;
    leaderId: number;
    memberIds: number[];
    target: {
        id: number;
        code: string;
        name: string;
    };
    battleId?: string;
    drops: NegotiationDrop[];
    capacity: number;
    completionText?: string;
};
type Session = RowDataPacket & {
    id: string;
    spawn_id: number;
    owner_id: number;
    battle_id: string | null;
    state: string;
    revision: number;
    members_json: unknown;
    stamina_json: unknown;
    last_text: string;
    last_key: string;
    expires_at: Date;
};
export type NegotiationView = {
    kind: 'ongoing';
    actorId: number;
    sessionId: string;
    revision: number;
    spawnId: number;
    name: string;
    mood: string;
    goodwill: number;
    protection: number;
    text: string;
    completionText?: string;
    inventory: ReturnType<typeof negotiationInventoryPage>;
};
export type NegotiationResult = NegotiationView | {
    kind: 'success' | 'combat_started' | 'combat_resumed' | 'closed';
    spawnId: number;
    text: string;
};
export type NegotiationHooks = {
    random?: () => number;
    activate: (sessionId: string) => Promise<Record<string, boolean>>;
    fight: (eligibility: Record<string, boolean>, sessionId: string, failed: boolean) => Promise<string>;
    settle: (state: NegotiationState, eligibility: Record<string, boolean>, drops: NegotiationDrop[], sessionId: string) => Promise<string>;
};
export declare const readNegotiationReplay: (connection: PoolConnection, actorId: number, command: NegotiationCommand) => Promise<NegotiationResult | undefined>;
export declare const assertNoNegotiation: (connection: Pick<PoolConnection, "execute">, characterId: number) => Promise<void>;
export declare const assertMonsterNotNegotiating: (connection: PoolConnection, spawnIds: number[]) => Promise<void>;
export declare const closeNegotiationSession: (connection: PoolConnection, sessionId: string, state?: string) => Promise<void>;
export declare const readNegotiationView: (connection: PoolConnection, ctx: NegotiationContext, session: Session, state: NegotiationState, command: NegotiationCommand) => Promise<NegotiationView>;
export declare const runNegotiation: (connection: PoolConnection, ctx: NegotiationContext, command: NegotiationCommand, hooks: NegotiationHooks) => Promise<NegotiationResult>;
export {};
