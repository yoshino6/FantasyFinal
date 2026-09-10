export type SpiritDefinition = {
    code: string;
    skillCode: string;
    name: string;
    duration: number;
    role: string;
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
export declare const spiritSummonerPassiveDescription = "\u6BCF\u56DE\u5408\u989D\u5916\u6062\u590D 2% \u9B54\u529B\uFF1B\u7075\u4F4D\u4E0A\u9650\u4ECE 1 \u63D0\u5347\u81F3 3\u3002";
export declare const spiritDefinitions: SpiritDefinition[];
export declare const spiritDefinitionBySkill: (skillCode: string) => SpiritDefinition | undefined;
export declare const spiritSummonerActiveSkillCodes: string[];
