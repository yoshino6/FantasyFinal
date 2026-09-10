import type { LamplightNode } from './lamplight.types';
export type LamplightWork = {
    kind: 'maintenance' | 'rescue' | 'supplies' | 'records';
    object: string;
    steps: [string, string];
    receipts: [string, string];
    units: number;
    test: [string, string, string];
    answer: number;
};
export declare const lamplightWork: (node: LamplightNode) => LamplightWork;
export declare const lamplightWorkResult: (node: LamplightNode, work: LamplightWork, index: number, choice: string) => string;
