export type AdvancedResourceDefinition = {
    professionCode: string;
    code: string;
    name: string;
    summary: string;
};
export type AdvancedSkillResourceRequirement = {
    professionCode: string;
    amount: number;
    label?: string;
};
export declare const advancedResourceDefinitions: Record<string, AdvancedResourceDefinition>;
export declare const advancedSkillResourceRequirements: Record<string, AdvancedSkillResourceRequirement>;
export declare const advancedSkillDescriptions: Record<string, string>;
export declare const advancedResourceForProfession: (professionCode: string | null | undefined) => AdvancedResourceDefinition | undefined;
export declare const advancedResourceRequirementForSkill: (skillCode: string) => AdvancedSkillResourceRequirement;
