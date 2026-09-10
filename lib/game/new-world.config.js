import { forgedPrimaryStats } from './constants.js';
import { advancedProfessionByCode } from './advanced-profession.config.js';

const newWorldLevels = [1, 10, 20, 30];
const newWorldItems = {
    1: [['novice_hp_potion_large', 100], ['novice_mp_potion_large', 100], ['major_experience_elixir', 10], ['major_luck_elixir', 10]],
    30: [['sun_gold', 3], ['moon_silver', 10], ['star_copper', 20], ['meteor_iron', 50]]
};
const journeyElixirs = [
    { code: 'medium_experience_elixir', name: '经验秘药（中）', effect: { experienceBonusPct: 50, battleCount: 10 } },
    { code: 'medium_luck_elixir', name: '幸运秘药（中）', effect: { partyDropBonusPct: 50, battleCount: 10 } },
    { code: 'major_experience_elixir', name: '经验秘药（大）', effect: { experienceBonusPct: 100, battleCount: 10 } },
    { code: 'major_luck_elixir', name: '幸运秘药（大）', effect: { partyDropBonusPct: 100, battleCount: 10 } }
];
const armor = [
    ['shoulder', '头肩'], ['upper', '上装'], ['waist', '腰部'], ['lower', '下装'], ['feet', '脚部']
];
const weapons = { longsword: '长剑', shield: '盾牌', dagger: '匕首', fistblade: '拳刃', staff: '法杖', spellbook: '法书', orb: '法球' };
const professionWeapons = {
    warrior: ['longsword', 'shield'], rogue: ['dagger', 'fistblade'], mage: ['staff', 'spellbook'], priest: ['spellbook', 'orb']
};
const newWorldWeaponProfile = (base, advanced) => {
    const family = advancedProfessionByCode(advanced ?? '')?.baseProfession;
    const code = family ? ({ 战士: 'warrior', 盗贼: 'rogue', 法师: 'mage', 牧师: 'priest' }[family]) : base;
    return professionWeapons[code ?? ''];
};
const newWorldEquipment = [10, 20].flatMap(level => {
    const rarity = level === 10 ? '普通' : '优秀';
    return [
        ...armor.map(([code, category]) => ({ code, category, subtype: '轻甲', name: `轻甲·${category}` })),
        ...Object.entries(weapons).map(([code, subtype]) => ({ code, category: subtype === '盾牌' ? '副手' : '武器', subtype, name: subtype }))
    ].map(item => ({
        code: `new_world_${item.code}_${level}`, name: `旅途·${item.name}·${level}级`, level, rarity,
        category: item.category, subtype: item.subtype,
        effect: { ...forgedPrimaryStats(item.category, item.subtype, level, rarity), balanceVersion: 3 }
    }));
});
const newWorldEquipmentCodes = (level, base, advanced) => {
    const profile = newWorldWeaponProfile(base, advanced);
    if (!profile)
        throw new Error('请先选择职业，再领取新世界装备礼包。');
    return [...armor.map(([code]) => code), ...profile].map(code => `new_world_${code}_${level}`);
};
const newWorldRewardText = {
    1: '功能性药水一套',
    10: 'Lv.10 普通套装',
    20: 'Lv.20 优秀套装',
    30: '稀有锻材一套'
};

export { journeyElixirs, newWorldEquipment, newWorldEquipmentCodes, newWorldItems, newWorldLevels, newWorldRewardText, newWorldWeaponProfile };
