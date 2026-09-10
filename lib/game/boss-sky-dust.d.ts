export declare const bossSkyDustSlots: (level: number) => number;
export declare const bossSkyDustDrops: <T extends {
    code?: string;
}>(drops: T[], target: {
    level: number;
    monster_class?: string;
    traits_json?: unknown;
}) => (T | {
    code: string;
    chance: number;
    quantity: number;
})[];
