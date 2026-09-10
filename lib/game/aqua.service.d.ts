import type { PoolConnection } from 'mysql2/promise';
import type { CombatRules, RuleUnit } from './combat-rule-registry';
export type AquaView = {
    title: string;
    text: string;
    revision: number;
    choices: {
        code: string;
        label: string;
    }[];
};
export declare const aquaPermitLevel: (battles: number) => number;
export declare const aquaSupport: (c: PoolConnection, rules: CombatRules, owner: RuleUnit, actionKey: string) => Promise<void>;
export declare const advanceAquaPermit: (c: PoolConnection, id: number) => Promise<void>;
export declare const aquaView: (user: string) => Promise<AquaView>;
export declare const aquaAction: (user: string, revision: number, action: string) => Promise<AquaView>;
