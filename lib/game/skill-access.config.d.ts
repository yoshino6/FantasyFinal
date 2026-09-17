export declare const guildSkillCodes: string[];
export declare const retiredBookshopSkillCodes: string[];
export declare const bookshopSkillCodes: string[];
export declare const libraryFreeSkillCodes: string[];
export declare const tierLearningCost: (tier: string, fallback: number) => number;
export declare const guildContributionPrice: (copperBasis: number) => number;
export declare const guildContributionReward: (copperReward: number) => number;
export declare const guildContributionSalePrice: (copperBasis: number) => number;
export declare const guildSkillBookContributionPrice: (tier: string, code: string) => number | null;
