export type WorldSurfaceRegion = {
    code: string;
    name: string;
    description: string;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    danger: number;
    terrain: {
        code: string;
        name: string;
        description: string;
        priority: number;
        tags: string[];
    };
};
export type WorldSurfaceMonster = {
    code: string;
    name: string;
    regionCode: string;
    level: number;
    monsterClass: 'normal' | 'large' | 'elite' | 'boss';
    skillCodes: string[];
    materialCode: string;
    weakness: string;
    resistance: string;
    element?: string;
};
export declare const worldSurfaceRegions: WorldSurfaceRegion[];
export declare const worldSurfaceMonsters: WorldSurfaceMonster[];
export declare const worldSurfaceMaterials: readonly [readonly ["root_heart", "根心", "草原守根与根冠公羊的生命核心，适合制作木系药剂和护具辅材。"], readonly ["river_shell", "河壳", "晨露河水冲刷出的坚硬外壳，带着稳定的水元素。"], readonly ["tide_shell", "潮壳", "砾风石滩的潮池生物留下的半透明硬壳。"], readonly ["ridge_core", "岩脊核心", "山麓岩兽体内凝成的土元素核心。"], readonly ["fire_crystal", "炉心赤晶", "沿熔岩岩脉生长的赤色晶矿，可作为高温锻造结合剂。"], readonly ["marsh_heart", "雾沼心", "湿地生物吸收雾藻后形成的药性结晶。"], readonly ["star_mud_core", "星泥核心", "沉星沼泽的星泥浓缩而成，带有暗水魔力。"], readonly ["frost_crystal", "霜晶", "霜冠高原的冰元素结晶。"], readonly ["thunder_core", "鸣雷石", "雷鸣断崖的导雷矿石。"], readonly ["eclipse_core", "月蚀核心", "月蚀遗迹光暗交汇处形成的稀有核心。"]];
export declare const lockedWorldSurfaceRegionCodes: Set<string>;
