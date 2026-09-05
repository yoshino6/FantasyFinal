export declare const grantOwnerLegendaryTestEquipment: (qqUserId: string) => Promise<{
    level: number;
    count: number;
    names: string[];
}>;
export declare const dismantleOwnerLegendaryTestEquipment: (qqUserId: string) => Promise<{
    restored: number;
    dismantled: number;
}>;
