export type MonsterCraftMaterialKind = 'hair' | 'gel_skin' | 'bone' | 'shell' | 'scale';
export declare const materialValueMultiplierForLevel: (level: number) => number;
export declare const monsterCraftMaterialKinds: (name: string, monsterClass?: string) => readonly MonsterCraftMaterialKind[];
export declare const monsterCraftMaterialKind: (name: string) => MonsterCraftMaterialKind;
export declare const monsterCraftMaterialCode: (monsterCode: string, kind: MonsterCraftMaterialKind) => string;
export declare const beastCoreCode: () => string;
export declare const beastCoreName: () => string;
export declare const meatChunkCode: () => string;
export declare const meatChunkName: () => string;
export declare const monsterDropsMeat: (name: string) => boolean;
export declare const meatChunkQuantity: (monsterClass: "normal" | "large" | "elite" | "boss") => 1 | 2 | 3;
export declare const monsterCraftMaterialName: (monsterCode: string, monsterName: string, kind: MonsterCraftMaterialKind, materialIndex: number) => string;
export declare const purifiedCraftMaterialCode: (kind: MonsterCraftMaterialKind) => string;
export declare const purifiedCraftMaterialName: (kind: MonsterCraftMaterialKind) => string;
export declare const purifiedCraftMaterialDisplayName: (code: string) => string | undefined;
export declare const purifiedMaterialForArmor: (armorType: string) => string;
export declare const purifiedCraftMaterialValue: (code: string) => 0 | 20;
export declare const purifiedCraftOutputFor: (code: string) => string | undefined;
export declare const resolvedMonsterMaterialDropCode: (drop: Record<string, unknown>, _monsterLevel: number) => string;
export declare const allPurifiedCraftMaterials: () => {
    code: string;
    name: string;
    description: string;
}[];
export declare const allBeastCoreMaterials: () => {
    code: string;
    name: string;
    description: string;
}[];
export declare const allMeatChunkMaterials: () => {
    code: string;
    name: string;
    description: string;
}[];
