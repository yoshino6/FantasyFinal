export type LamplightHub = 'baina_town' | 'world_tree' | 'floating_leaf_town' | 'snowlamp_hollow' | 'frost_dragon_inn' | 'sleepwhale_market';
export type LamplightNode = {
    code: string;
    title: string;
    npc: string;
    intro: string;
    findings: [string, string];
    choices: [string, string, ...string[]];
    conclusion: string;
    minLevel: number;
    endLevel: number;
    copper: number;
    experienceShare: number;
    place: string;
    gate?: 'barrier' | 'goblin' | 'gratitude' | 'library' | 'research' | 'boss';
};
export type LamplightView = {
    title: string;
    npc: string;
    text: string;
    revision: number;
    buttons: {
        label: string;
        action?: string;
        command?: string;
    }[];
    complete?: boolean;
};
export type LamplightState = {
    character_id: number;
    origin_route: string;
    origin_branch: string;
    story_version: number;
    local_hub: LamplightHub;
    phase: 'private' | 'local' | 'join' | 'world' | 'completed';
    node_index: number;
    revision: number;
    flags_json: unknown;
    version: number;
};
