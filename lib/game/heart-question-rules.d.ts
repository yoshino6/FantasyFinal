import { type Allocation, type AttributeKey } from './types';
export declare const calculateHeartGrowthChange: (before: Allocation, favor: AttributeKey, repel: AttributeKey, great: boolean) => {
    after: Allocation;
    target: number;
    gain: number;
    loss: number;
};
export declare const heartOffsetAfterChoice: (before: Allocation, favor: AttributeKey, repel: AttributeKey, gain: number, loss: number, levelAtChoice: number) => Allocation;
