export declare const achievementThresholds: Record<string, number>;
export declare const achievementThreshold: (id: string) => number;
export declare const achievementAttributeKeys: Record<string, string>;
export declare const completionPercent: (completed: number, population: number) => string;
export declare const achievementById: Map<string, {
    id: string;
    name: string;
    description: string;
    rarity: string;
    attribute: string;
    condition: string;
    scope: string;
    dependency: string;
    category: string;
}>;
