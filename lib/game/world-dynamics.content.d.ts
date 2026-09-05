export type DynamicEncounterChoice = {
    code: string;
    label: string;
    text: string;
    copper?: number;
    flag?: string;
    worldline?: string;
    stage?: number;
    nextNode?: string;
    rewardCode?: string;
    rewardChance?: number;
};
export type DynamicEncounterNode = {
    text: string;
    choices: DynamicEncounterChoice[];
};
export type DynamicEncounterDefinition = {
    opening?: string;
    choices?: DynamicEncounterChoice[];
    nodes?: Record<string, DynamicEncounterNode>;
    publicScene?: boolean;
    relatedSiteCodes?: string[];
    relatedNpcCodes?: string[];
};
export type DynamicEncounterTemplate = {
    code: string;
    title: string;
    regions: string[];
    weather: string[];
    minExposure: number;
    weight: number;
    definition: DynamicEncounterDefinition;
};
export declare const taskPanelObjectiveForSiteCommission: (objectiveText: string, targetName: string) => string;
export type WorldSiteAccess = 'public' | 'private';
export type DynamicWorldBuilding = {
    code: string;
    name: string;
    siteType: string;
    description: string;
    access: WorldSiteAccess;
};
export type DynamicWorldNpc = {
    code: string;
    title: string;
    name: string;
    role: string;
    description: string;
    status: string;
    homeIndex: number;
};
export type DynamicWorldRegion = {
    code: string;
    name: string;
    worldline: string;
    weather: string[];
    relicCode: string;
    relicName: string;
    relicDescription: string;
    atmosphere: string;
    buildings: DynamicWorldBuilding[];
    npcs: DynamicWorldNpc[];
    bossCode?: string;
};
export declare const dynamicNpcDisplayName: (npc: Pick<DynamicWorldNpc, "title" | "name">) => string;
export declare const dynamicWorldRegions: DynamicWorldRegion[];
export declare const generatedDynamicEncounterTemplates: DynamicEncounterTemplate[];
export declare const auditDynamicEncounterContent: () => {
    regionCount: number;
    templateCount: number;
    missingRegions: string[];
    duplicateTitles: string[];
    thinEntries: string[];
};
