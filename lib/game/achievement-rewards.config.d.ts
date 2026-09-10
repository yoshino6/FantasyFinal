export type AchievementBoxKey = 'odd_box' | 'rare_box' | 'collector_box';
export type AchievementRewardItem = {
    key: string;
    name: string;
    description: string;
    rarity: '稀有' | '传说' | '史诗';
    itemType: 'consumable' | 'material';
    category: string;
    effect: Record<string, unknown>;
};
export declare const achievementBoxes: {
    readonly odd_box: {
        readonly name: "奇异道具匣";
        readonly description: "打开后等概率获得返照琉璃、折光护符或惊雷封匣。";
    };
    readonly rare_box: {
        readonly name: "奇珍道具匣";
        readonly description: "可开出专属强力道具；秩序碎片×1/×2/×3的概率为15%/4%/1%。";
    };
    readonly collector_box: {
        readonly name: "珍藏道具匣";
        readonly description: "可开出专属珍藏级强力道具；秩序碎片×1/×2/×3/×4/×5的概率为30%/15%/3%/1%/1%。";
    };
};
export declare const achievementRewardItems: readonly [{
    readonly key: "rare_glass";
    readonly name: "返照琉璃";
    readonly description: "恢复本人50%最大HP与30%最大MP。";
    readonly rarity: "稀有";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly healPct: 50;
        readonly restoreMpPct: 30;
        readonly personalOnly: true;
    };
}, {
    readonly key: "rare_charm";
    readonly name: "折光护符";
    readonly description: "在战斗中获得50%最大HP的生命护盾，持续2次本人正常行动。";
    readonly rarity: "稀有";
    readonly itemType: "consumable";
    readonly category: "符咒";
    readonly effect: {
        readonly target: "self";
        readonly status: {
            readonly code: "life_shield";
            readonly value: 50;
            readonly turns: 2;
        };
        readonly personalOnly: true;
    };
}, {
    readonly key: "rare_thunder";
    readonly name: "惊雷封匣";
    readonly description: "在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性2.5倍为基础威力的雷属性直击。";
    readonly rarity: "稀有";
    readonly itemType: "consumable";
    readonly category: "投掷物";
    readonly effect: {
        readonly target: "enemy";
        readonly throwable: {
            readonly damageScale: 2.5;
            readonly element: "雷";
        };
        readonly trueHit: true;
        readonly noCrit: true;
        readonly personalOnly: true;
    };
}, {
    readonly key: "rebirth_ember";
    readonly name: "回生火种";
    readonly description: "战败倒下后使用，复活并恢复40%最大HP与20%最大MP。";
    readonly rarity: "传说";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly revivePct: 40;
        readonly reviveMpPct: 20;
        readonly personalOnly: true;
    };
}, {
    readonly key: "astral_dew";
    readonly name: "星界圣露";
    readonly description: "将本人的HP与MP完全恢复。";
    readonly rarity: "传说";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly healPct: 100;
        readonly restoreMpPct: 100;
        readonly personalOnly: true;
    };
}, {
    readonly key: "skybreak_seal";
    readonly name: "破界雷印";
    readonly description: "在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性4倍为基础威力的雷属性直击。";
    readonly rarity: "传说";
    readonly itemType: "consumable";
    readonly category: "投掷物";
    readonly effect: {
        readonly target: "enemy";
        readonly throwable: {
            readonly damageScale: 4;
            readonly element: "雷";
        };
        readonly trueHit: true;
        readonly noCrit: true;
        readonly personalOnly: true;
    };
}, {
    readonly key: "worldtree_aegis";
    readonly name: "世界树护符";
    readonly description: "在战斗中获得75%最大HP的生命护盾，持续3次本人正常行动。";
    readonly rarity: "传说";
    readonly itemType: "consumable";
    readonly category: "符咒";
    readonly effect: {
        readonly target: "self";
        readonly status: {
            readonly code: "life_shield";
            readonly value: 75;
            readonly turns: 3;
        };
        readonly personalOnly: true;
    };
}, {
    readonly key: "order_fragment";
    readonly name: "秩序碎片";
    readonly description: "后期合成伪神器的核心材料。";
    readonly rarity: "史诗";
    readonly itemType: "material";
    readonly category: "神材";
    readonly effect: {
        readonly personalOnly: true;
        readonly artifactMaterial: "order_fragment";
    };
}, {
    readonly key: "immortal_plume";
    readonly name: "不灭星羽";
    readonly description: "战败倒下后使用，复活并完全恢复HP与MP。";
    readonly rarity: "史诗";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly revivePct: 100;
        readonly reviveMpPct: 100;
        readonly personalOnly: true;
    };
}, {
    readonly key: "allspirit_elixir";
    readonly name: "万灵圣露";
    readonly description: "将本人的HP与MP完全恢复。";
    readonly rarity: "史诗";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly healPct: 100;
        readonly restoreMpPct: 100;
        readonly personalOnly: true;
    };
}, {
    readonly key: "heavenly_decree";
    readonly name: "天罚敕令";
    readonly description: "在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性6倍为基础威力的光属性直击。";
    readonly rarity: "史诗";
    readonly itemType: "consumable";
    readonly category: "投掷物";
    readonly effect: {
        readonly target: "enemy";
        readonly throwable: {
            readonly damageScale: 6;
            readonly element: "光";
        };
        readonly trueHit: true;
        readonly noCrit: true;
        readonly personalOnly: true;
    };
}, {
    readonly key: "eternal_aegis";
    readonly name: "永恒护壁";
    readonly description: "在战斗中获得100%最大HP的生命护盾，持续5次本人正常行动。";
    readonly rarity: "史诗";
    readonly itemType: "consumable";
    readonly category: "符咒";
    readonly effect: {
        readonly target: "self";
        readonly status: {
            readonly code: "life_shield";
            readonly value: 100;
            readonly turns: 5;
        };
        readonly personalOnly: true;
    };
}];
export declare const achievementRewardItemByKey: Map<string, AchievementRewardItem>;
export declare const achievementRareItems: ({
    readonly key: "rare_glass";
    readonly name: "返照琉璃";
    readonly description: "恢复本人50%最大HP与30%最大MP。";
    readonly rarity: "稀有";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly healPct: 50;
        readonly restoreMpPct: 30;
        readonly personalOnly: true;
    };
} | {
    readonly key: "rare_charm";
    readonly name: "折光护符";
    readonly description: "在战斗中获得50%最大HP的生命护盾，持续2次本人正常行动。";
    readonly rarity: "稀有";
    readonly itemType: "consumable";
    readonly category: "符咒";
    readonly effect: {
        readonly target: "self";
        readonly status: {
            readonly code: "life_shield";
            readonly value: 50;
            readonly turns: 2;
        };
        readonly personalOnly: true;
    };
} | {
    readonly key: "rare_thunder";
    readonly name: "惊雷封匣";
    readonly description: "在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性2.5倍为基础威力的雷属性直击。";
    readonly rarity: "稀有";
    readonly itemType: "consumable";
    readonly category: "投掷物";
    readonly effect: {
        readonly target: "enemy";
        readonly throwable: {
            readonly damageScale: 2.5;
            readonly element: "雷";
        };
        readonly trueHit: true;
        readonly noCrit: true;
        readonly personalOnly: true;
    };
} | {
    readonly key: "rebirth_ember";
    readonly name: "回生火种";
    readonly description: "战败倒下后使用，复活并恢复40%最大HP与20%最大MP。";
    readonly rarity: "传说";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly revivePct: 40;
        readonly reviveMpPct: 20;
        readonly personalOnly: true;
    };
} | {
    readonly key: "astral_dew";
    readonly name: "星界圣露";
    readonly description: "将本人的HP与MP完全恢复。";
    readonly rarity: "传说";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly healPct: 100;
        readonly restoreMpPct: 100;
        readonly personalOnly: true;
    };
} | {
    readonly key: "skybreak_seal";
    readonly name: "破界雷印";
    readonly description: "在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性4倍为基础威力的雷属性直击。";
    readonly rarity: "传说";
    readonly itemType: "consumable";
    readonly category: "投掷物";
    readonly effect: {
        readonly target: "enemy";
        readonly throwable: {
            readonly damageScale: 4;
            readonly element: "雷";
        };
        readonly trueHit: true;
        readonly noCrit: true;
        readonly personalOnly: true;
    };
} | {
    readonly key: "worldtree_aegis";
    readonly name: "世界树护符";
    readonly description: "在战斗中获得75%最大HP的生命护盾，持续3次本人正常行动。";
    readonly rarity: "传说";
    readonly itemType: "consumable";
    readonly category: "符咒";
    readonly effect: {
        readonly target: "self";
        readonly status: {
            readonly code: "life_shield";
            readonly value: 75;
            readonly turns: 3;
        };
        readonly personalOnly: true;
    };
} | {
    readonly key: "order_fragment";
    readonly name: "秩序碎片";
    readonly description: "后期合成伪神器的核心材料。";
    readonly rarity: "史诗";
    readonly itemType: "material";
    readonly category: "神材";
    readonly effect: {
        readonly personalOnly: true;
        readonly artifactMaterial: "order_fragment";
    };
} | {
    readonly key: "immortal_plume";
    readonly name: "不灭星羽";
    readonly description: "战败倒下后使用，复活并完全恢复HP与MP。";
    readonly rarity: "史诗";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly revivePct: 100;
        readonly reviveMpPct: 100;
        readonly personalOnly: true;
    };
} | {
    readonly key: "allspirit_elixir";
    readonly name: "万灵圣露";
    readonly description: "将本人的HP与MP完全恢复。";
    readonly rarity: "史诗";
    readonly itemType: "consumable";
    readonly category: "回复";
    readonly effect: {
        readonly healPct: 100;
        readonly restoreMpPct: 100;
        readonly personalOnly: true;
    };
} | {
    readonly key: "heavenly_decree";
    readonly name: "天罚敕令";
    readonly description: "在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性6倍为基础威力的光属性直击。";
    readonly rarity: "史诗";
    readonly itemType: "consumable";
    readonly category: "投掷物";
    readonly effect: {
        readonly target: "enemy";
        readonly throwable: {
            readonly damageScale: 6;
            readonly element: "光";
        };
        readonly trueHit: true;
        readonly noCrit: true;
        readonly personalOnly: true;
    };
} | {
    readonly key: "eternal_aegis";
    readonly name: "永恒护壁";
    readonly description: "在战斗中获得100%最大HP的生命护盾，持续5次本人正常行动。";
    readonly rarity: "史诗";
    readonly itemType: "consumable";
    readonly category: "符咒";
    readonly effect: {
        readonly target: "self";
        readonly status: {
            readonly code: "life_shield";
            readonly value: 100;
            readonly turns: 5;
        };
        readonly personalOnly: true;
    };
})[];
type Loot = {
    key: string;
    weight: number;
    quantity?: number;
};
export declare const achievementBoxLoot: Record<AchievementBoxKey, readonly Loot[]>;
export declare const achievementBoxRewardForRarity: (rarity: string) => {
    key: AchievementBoxKey;
    quantity: number;
};
export {};
