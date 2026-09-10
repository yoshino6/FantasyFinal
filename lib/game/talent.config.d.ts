export declare const talentGroups: readonly ["战斗", "探索", "成长", "社交", "生产", "血脉", "体魄", "孤注", "奇异", "？？？"];
export type TalentGroup = typeof talentGroups[number];
export type TalentDefinition = {
    code: string;
    number: string;
    name: string;
    group: TalentGroup;
    summary: string;
    description: string;
    flavour: string;
    implemented: boolean;
};
export declare const talentDefinitions: readonly TalentDefinition[];
export declare const selectableTalents: TalentDefinition[];
export declare const talentByCode: Map<string, TalentDefinition>;
export declare const talentCode: (input: string) => string | undefined;
