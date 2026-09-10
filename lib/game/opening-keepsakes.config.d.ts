export type KeepsakeService = 'record' | 'lesson' | 'repair' | 'meal' | 'rest' | 'travel' | 'map' | 'aqua';
export type KeepsakeDefinition = {
    code: string;
    branch: string;
    npc: string;
    desk: string;
    kind: KeepsakeService;
    dialogue: string;
    result: string;
    home: string;
    destination?: string;
    repairKind?: 'weapon';
};
export declare const keepsakeDefinitions: KeepsakeDefinition[];
export declare const keepsakeByCode: (code: string) => KeepsakeDefinition | undefined;
