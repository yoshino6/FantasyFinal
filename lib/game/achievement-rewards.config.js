const achievementBoxes = {
    odd_box: { name: '奇异道具匣', description: '打开后等概率获得返照琉璃、折光护符或惊雷封匣。' },
    rare_box: { name: '奇珍道具匣', description: '可开出专属强力道具；秩序碎片×1/×2/×3的概率为15%/4%/1%。' },
    collector_box: { name: '珍藏道具匣', description: '可开出专属珍藏级强力道具；秩序碎片×1/×2/×3/×4/×5的概率为30%/15%/3%/1%/1%。' }
};
const achievementRewardItems = [
    { key: 'rare_glass', name: '返照琉璃', description: '恢复本人50%最大HP与30%最大MP。', rarity: '稀有', itemType: 'consumable', category: '回复', effect: { healPct: 50, restoreMpPct: 30, personalOnly: true } },
    { key: 'rare_charm', name: '折光护符', description: '在战斗中获得50%最大HP的生命护盾，持续2次本人正常行动。', rarity: '稀有', itemType: 'consumable', category: '符咒', effect: { target: 'self', status: { code: 'life_shield', value: 50, turns: 2 }, personalOnly: true } },
    { key: 'rare_thunder', name: '惊雷封匣', description: '在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性2.5倍为基础威力的雷属性直击。', rarity: '稀有', itemType: 'consumable', category: '投掷物', effect: { target: 'enemy', throwable: { damageScale: 2.5, element: '雷' }, trueHit: true, noCrit: true, personalOnly: true } },
    { key: 'rebirth_ember', name: '回生火种', description: '战败倒下后使用，复活并恢复40%最大HP与20%最大MP。', rarity: '传说', itemType: 'consumable', category: '回复', effect: { revivePct: 40, reviveMpPct: 20, personalOnly: true } },
    { key: 'astral_dew', name: '星界圣露', description: '将本人的HP与MP完全恢复。', rarity: '传说', itemType: 'consumable', category: '回复', effect: { healPct: 100, restoreMpPct: 100, personalOnly: true } },
    { key: 'skybreak_seal', name: '破界雷印', description: '在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性4倍为基础威力的雷属性直击。', rarity: '传说', itemType: 'consumable', category: '投掷物', effect: { target: 'enemy', throwable: { damageScale: 4, element: '雷' }, trueHit: true, noCrit: true, personalOnly: true } },
    { key: 'worldtree_aegis', name: '世界树护符', description: '在战斗中获得75%最大HP的生命护盾，持续3次本人正常行动。', rarity: '传说', itemType: 'consumable', category: '符咒', effect: { target: 'self', status: { code: 'life_shield', value: 75, turns: 3 }, personalOnly: true } },
    { key: 'order_fragment', name: '秩序碎片', description: '后期合成伪神器的核心材料。', rarity: '史诗', itemType: 'material', category: '神材', effect: { personalOnly: true, artifactMaterial: 'order_fragment' } },
    { key: 'immortal_plume', name: '不灭星羽', description: '战败倒下后使用，复活并完全恢复HP与MP。', rarity: '史诗', itemType: 'consumable', category: '回复', effect: { revivePct: 100, reviveMpPct: 100, personalOnly: true } },
    { key: 'allspirit_elixir', name: '万灵圣露', description: '将本人的HP与MP完全恢复。', rarity: '史诗', itemType: 'consumable', category: '回复', effect: { healPct: 100, restoreMpPct: 100, personalOnly: true } },
    { key: 'heavenly_decree', name: '天罚敕令', description: '在战斗中对一个敌人造成必中且不可暴击的、以较高攻击属性6倍为基础威力的光属性直击。', rarity: '史诗', itemType: 'consumable', category: '投掷物', effect: { target: 'enemy', throwable: { damageScale: 6, element: '光' }, trueHit: true, noCrit: true, personalOnly: true } },
    { key: 'eternal_aegis', name: '永恒护壁', description: '在战斗中获得100%最大HP的生命护盾，持续5次本人正常行动。', rarity: '史诗', itemType: 'consumable', category: '符咒', effect: { target: 'self', status: { code: 'life_shield', value: 100, turns: 5 }, personalOnly: true } }
];
const achievementRewardItemByKey = new Map(achievementRewardItems.map(item => [item.key, item]));
const achievementRareItems = achievementRewardItems.slice(0, 3);
const achievementBoxLoot = {
    odd_box: [{ key: 'rare_glass', weight: 1 }, { key: 'rare_charm', weight: 1 }, { key: 'rare_thunder', weight: 1 }],
    rare_box: [
        { key: 'rebirth_ember', weight: 250 }, { key: 'astral_dew', weight: 220 }, { key: 'skybreak_seal', weight: 180 }, { key: 'worldtree_aegis', weight: 150 },
        { key: 'order_fragment', weight: 150, quantity: 1 }, { key: 'order_fragment', weight: 40, quantity: 2 }, { key: 'order_fragment', weight: 10, quantity: 3 }
    ],
    collector_box: [
        { key: 'immortal_plume', weight: 15 }, { key: 'allspirit_elixir', weight: 15 }, { key: 'heavenly_decree', weight: 10 }, { key: 'eternal_aegis', weight: 10 },
        { key: 'order_fragment', weight: 30, quantity: 1 }, { key: 'order_fragment', weight: 15, quantity: 2 }, { key: 'order_fragment', weight: 3, quantity: 3 },
        { key: 'order_fragment', weight: 1, quantity: 4 }, { key: 'order_fragment', weight: 1, quantity: 5 }
    ]
};
const achievementBoxRewardForRarity = (rarity) => {
    if (rarity === '普通')
        return { key: 'odd_box', quantity: 1 };
    if (rarity === '优秀')
        return { key: 'odd_box', quantity: 2 };
    if (rarity === '精良')
        return { key: 'odd_box', quantity: 3 };
    if (rarity === '稀有')
        return { key: 'rare_box', quantity: 1 };
    if (rarity === '传说')
        return { key: 'rare_box', quantity: 2 };
    if (rarity === '史诗')
        return { key: 'collector_box', quantity: 1 };
    throw new Error(`未知成就稀有度：${rarity}`);
};

export { achievementBoxLoot, achievementBoxRewardForRarity, achievementBoxes, achievementRareItems, achievementRewardItemByKey, achievementRewardItems };
