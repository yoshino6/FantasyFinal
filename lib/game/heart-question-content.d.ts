import type { AttributeKey } from './types';
export type HeartOption = {
    text: string;
    favor: AttributeKey;
    repel: AttributeKey;
};
export type HeartCard = {
    code: string;
    title: string;
    prompt: string;
    options: HeartOption[];
};
export declare const heartCards: HeartCard[];
export declare const normalHeartCopy: string[];
export declare const greatHeartCopy: string[];
