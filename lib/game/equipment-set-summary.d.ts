export declare const equipmentSetSummary: (items: readonly {
    slot: string;
    weapon_type?: string | null;
    effect_json: unknown;
}[]) => {
    title: string;
    effects: string[];
}[];
