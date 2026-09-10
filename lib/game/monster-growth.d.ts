import { type Allocation } from './types';
export declare const monsterIdentityCode: (row: {
    code?: unknown;
    template_code?: unknown;
    growth_template_code?: unknown;
}) => string;
export declare const isResidentMonsterCode: (code: string) => boolean;
export declare const monsterGrowthCoefficient: (code: string, _referenceLevel?: number) => number;
export declare const monsterGrowthAllocation: (row: Allocation & Record<`${keyof Allocation}_growth`, number> & {
    level: number;
    code?: unknown;
    template_code?: unknown;
    growth_template_code?: unknown;
}, multiplier?: number) => Allocation;
