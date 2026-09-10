export type PatrolKind = 'clue' | 'observe' | 'rescue' | 'sample' | 'escort';
export type PatrolLocation = {
    regionId: number;
    name: string;
    x: number;
    y: number;
    z: number;
};
export type PatrolContext = {
    npcCode: string;
    revision: number;
    kind: PatrolKind;
    origin: PatrolLocation;
    target: PatrolLocation;
    rewarded: boolean;
};
export declare const patrolKindNames: Record<PatrolKind, string>;
export declare const patrolKindFor: (routeIndex: number, revision: number, npcIndex: number) => PatrolKind;
export declare const patrolObjective: (patrol: PatrolContext, node: string) => {
    text: string;
    location: PatrolLocation;
};
export declare const patrolPositionMatches: (player: {
    region_id: number;
    pos_x: number;
    pos_y: number;
    pos_z: number;
}, location: PatrolLocation) => boolean;
export declare const buildPatrolEncounter: (npcCode: string, kind: PatrolKind, targetName: string, affinity?: number, stage?: number, variant?: number, copper?: number) => {
    title: string;
    reason: string;
    opening: string;
    definition: {
        relatedNpcCodes: string[];
        relatedSiteCodes: string[];
        nodes: Record<string, import("./world-dynamics.content").DynamicEncounterNode>;
    };
};
