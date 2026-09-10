export type NativeSkillBalance = {
    code: string;
    tier: string;
    mana: number;
    cooldown: number;
    power: number;
    chant: number;
    category?: string;
    name?: string;
    scope?: string;
    description?: string;
};
export declare const nativeSkillBalance: NativeSkillBalance[];
export declare const nativeSkillBalanceByCode: Map<string, NativeSkillBalance>;
export declare const balancedSkillDescription: (code: string, text: string) => string;
