import type { AchievementFact } from './achievement-events';
export declare const achievementRegionalMaterials: string[];
export declare const forgeAchievementFacts: (signature: string, inputs: {
    code: string;
    category: string;
    quantity: number;
}[]) => AchievementFact[];
export declare const alchemyUtilityOutput: (effect: Record<string, any>) => boolean;
