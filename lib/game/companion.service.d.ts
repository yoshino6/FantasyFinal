import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { RuleUnit, CombatRules } from './combat-rule-registry';
export declare const companionSpecialties: (code: string) => string[];
export declare const activeCompanionSpecialty: (c: Pick<PoolConnection, "execute">, id: number, specialty: string) => Promise<boolean>;
export declare const companionChance: (kind: string, moodRatio: number, capacity: number, divine?: boolean) => number;
export declare const companionStats: (level: number) => {
    hp: number;
    attack: number;
    defense: number;
};
export declare const grantGoldenRabbit: (connection: PoolConnection, id: number) => Promise<void>;
export declare const grantWindbirdChick: (connection: PoolConnection, id: number) => Promise<string>;
export declare const openingFeedRabbit: (connection: PoolConnection, id: number) => Promise<void>;
export declare const offerNegotiatedCompanion: (connection: PoolConnection, id: number, spawnId: number, moodPpm: number, capacity: number, random?: () => number) => Promise<"" | "\n\n对方没有立刻离开，似乎愿意继续同行。已为交涉发起者保留邀请，可在 /随从 选择接纳或婉拒。">;
export declare const companionPanel: (user: string) => Promise<{
    companions: RowDataPacket[];
    invitation: RowDataPacket;
}>;
export declare const acceptCompanion: (user: string, accept: boolean) => Promise<"对方接受了你的邀请，在名册中有了自己的位置。" | "你向对方道别。它回头望了一眼，走回熟悉的土地。">;
export declare const companionAction: (user: string, companionId: number, action: string, value?: string) => Promise<string>;
export declare const grantCompanionExperience: (connection: PoolConnection, id: number, baseExperience: number) => Promise<void>;
export declare const companionFind: (c: PoolConnection, id: number, random?: () => number) => Promise<string>;
export declare const companionSupport: (c: PoolConnection, rules: CombatRules, owner: RuleUnit, actionKey: string) => Promise<void>;
export declare const companionAreaHit: (c: PoolConnection, rules: CombatRules, owner: RuleUnit, attacker: RuleUnit, magic: boolean) => Promise<void>;
