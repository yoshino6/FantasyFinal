import { type RegionalAction, type RegionalState } from './regional-boss-v2';
export type RegionalAutoAction = {
    type: 'attack' | 'defend';
} | {
    type: 'skill';
    skillId: number;
} | {
    type: 'item';
    itemId: number;
};
export type RegionalAutoMember = {
    key: string;
    hp: number;
    hpMax: number;
    shield: number;
    controlled: boolean;
    automatic: boolean;
    preferred: RegionalAutoAction;
    skill?: {
        id: number;
        damaging: boolean;
    };
    preferredDamaging?: boolean;
    committed?: RegionalAction;
};
export declare const regionalActionKind: (action: {
    type: string;
}, damaging?: boolean) => RegionalAction;
export declare const planRegionalAuto: (state: RegionalState, members: RegionalAutoMember[], turn: number) => Map<string, RegionalAutoAction>;
