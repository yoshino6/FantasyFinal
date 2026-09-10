import { type NegotiationFamily } from './monster-negotiation';
import { type Preference } from '../game/negotiation-rules';
export type DialogueKind = Preference | 'approach' | 'talk_failed' | 'success' | 'blocked' | 'protected' | 'left' | 'refused';
export declare const negotiationDialogue: (family: NegotiationFamily, ppm: number, kind: DialogueKind, subtype?: string, itemName?: string, lastKey?: string, random?: () => number) => {
    key: string;
    text: string;
};
