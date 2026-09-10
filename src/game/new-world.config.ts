import { forgedPrimaryStats } from './constants';
import { advancedProfessionByCode } from './advanced-profession.config';

export const newWorldLevels = [1, 10, 20, 30] as const;
export type NewWorldLevel = (typeof newWorldLevels)[number];
export const newWorldItems: Partial<Record<NewWorldLevel, readonly (readonly [string, number])[]>> = {
  1: [['novice_hp_potion_large', 100], ['novice_mp_potion_large', 100], ['major_experience_elixir', 10], ['major_luck_elixir', 10]],
  30: [['sun_gold', 3], ['moon_silver', 10], ['star_copper', 20], ['meteor_iron', 50]]
};

export const journeyElixirs = [
  { code: 'medium_experience_elixir', name: '经验秘药（中）', effect: { experienceBonusPct: 50, battleCount: 10 } },
  { code: 'medium_luck_elixir', name: '幸运秘药（中）', effect: { partyDropBonusPct: 50, battleCount: 10 } },
  { code: 'major_experience_elixir', name: '经验秘药（大）', effect: { experienceBonusPct: 100, battleCount: 10 } },
  { code: 'major_luck_elixir', name: '幸运秘药（大）', effect: { partyDropBonusPct: 100, battleCount: 10 } }
];

const armor = [
  ['shoulder', '头肩'], ['upper', '上装'], ['waist', '腰部'], ['lower', '下装'], ['feet', '脚部']
] as const;
const weapons = { longsword: '长剑', shield: '盾牌', dagger: '匕首', fistblade: '拳刃', staff: '法杖', spellbook: '法书', orb: '法球' };
const professionWeapons: Record<string, readonly string[]> = {
  warrior: ['longsword', 'shield'], rogue: ['dagger', 'fistblade'], mage: ['staff', 'spellbook'], priest: ['spellbook', 'orb']
};
export const newWorldWeaponProfile = (base: string | null, advanced?: string | null) => {
  const family = advancedProfessionByCode(advanced ?? '')?.baseProfession;
  const code = family ? ({ 战士: 'warrior', 盗贼: 'rogue', 法师: 'mage', 牧师: 'priest' }[family]) : base;
  return professionWeapons[code ?? ''];
};
export const newWorldEquipment = [10, 20].flatMap(level => {
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
export const newWorldEquipmentCodes = (level: number, base: string | null, advanced?: string | null) => {
  const profile = newWorldWeaponProfile(base, advanced);
  if (!profile) throw new Error('请先选择职业，再领取新世界装备礼包。');
  return [...armor.map(([code]) => code), ...profile].map(code => `new_world_${code}_${level}`);
};
export const newWorldRewardText: Record<NewWorldLevel, string> = {
  1: '功能性药水一套',
  10: 'Lv.10 普通套装',
  20: 'Lv.20 优秀套装',
  30: '稀有锻材一套'
};
