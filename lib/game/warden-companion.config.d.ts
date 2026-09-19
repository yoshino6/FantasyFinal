export type WardenCompanionDefinition = {
    code: string;
    skillCode: string;
    name: string;
    role: string;
    cooldown: number;
    statScale: {
        hp: number;
        physicalAttack: number;
        magicAttack: number;
        physicalDefense: number;
        magicDefense: number;
        accuracy: number;
        evasion: number;
        crit: number;
        speed: number;
    };
};
export declare const wardenCompanionDefinitions: WardenCompanionDefinition[];
export declare const wardenCompanionBySkill: (skillCode: string) => WardenCompanionDefinition | undefined;
export declare const wardenCompanionByCode: (code: string) => WardenCompanionDefinition | undefined;
export declare const wardenSpiritCode: (code: string) => string;
export declare const isWardenCompanionRow: (spiritCode: string) => boolean;
