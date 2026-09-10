export declare const itemEffect: (item: {
    code: string;
    effect_json?: unknown;
}) => Record<string, any>;
export type ItemUsePolicy = {
    kind: 'direct' | 'workflow' | 'combat' | 'passive' | 'unsupported';
    reason: string;
    command?: string;
    autoEnter?: boolean;
};
export declare const combatItemEffect: (effect: Record<string, any>, pvp?: boolean) => boolean;
export declare const itemUsePolicy: (item: {
    id: number;
    code: string;
    item_type?: string;
    effect_json?: unknown;
}) => ItemUsePolicy;
