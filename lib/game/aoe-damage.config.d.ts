export type AoeDamageProfile = {
    power: number;
    secondaryPower?: number;
    reason: string;
};
export declare const aoeDamageProfiles: Record<string, AoeDamageProfile>;
export declare const aoeSkillPower: (code: string | undefined, originalPower: number, secondary?: boolean) => number;
export declare const aoeDescription: (code: string, text: string) => string;
