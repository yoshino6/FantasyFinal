import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDerivedStats, virtualEquipmentStats } from '../src/game/constants';
import { resolveStrike } from '../src/game/combat-math';
import { applyLevel32BossDifficultyTraits, level32BossDifficultyCodeFromTraits, level32BossDifficultyTraitFor, level32BossDifficultyTraits, level32DifficultyBossCodes, type Level32BossDifficultyCode } from '../src/game/level32-boss-difficulty.config';
import { monsterGrowthAllocation } from '../src/game/monster-growth';
import { attributes, type Allocation, type DerivedStats } from '../src/game/types';

const profiles = {
  gruen_mountainheart: [96, 52, 82, 42, 46, 57, 1, .6, 1, .5, .5, .65],
  valk_forge_overseer: [74, 70, 70, 105, 64, 72, .8, .9, .75, 1.15, .7, .85],
  threehead_mother: [75, 88, 56, 95, 90, 92, .75, 1, .6, 1.05, 1, .9],
  necromancer_uz: [68, 82, 32, 98, 46, 74, 1.3, 2.3, 1, 2.8, 1.4, 2]
} as const;

const basePanel = (code: keyof typeof profiles) => {
  const profile = profiles[code];
  const row = Object.fromEntries([
    ...attributes.map((key, index) => [key, profile[index]]),
    ...attributes.map((key, index) => [`${key}_growth`, profile[index + attributes.length]])
  ]) as Allocation & Record<`${keyof Allocation}_growth`, number> & { level: number; code: string };
  row.level = 32; row.code = code;
  const grown = monsterGrowthAllocation(row);
  const body = calculateDerivedStats(grown);
  const weaponReference = calculateDerivedStats(Object.fromEntries(attributes.map((key, index) => [key, Math.floor(Number(profile[index]) + Number(profile[index + attributes.length]) * 31)])) as Allocation);
  const equipment = virtualEquipmentStats(32, 'boss', weaponReference.physicalAttack, weaponReference.magicAttack);
  return Object.fromEntries(Object.keys(body).map(key => [key, Math.floor(body[key as keyof DerivedStats] + equipment[key as keyof DerivedStats])])) as DerivedStats;
};

test('五只 Lv.32 Boss 独占新难度表，低等级 Boss 不受影响', () => {
  assert.deepEqual(level32DifficultyBossCodes, ['goblin_king', 'gruen_mountainheart', 'valk_forge_overseer', 'threehead_mother', 'necromancer_uz']);
  for (const code of level32DifficultyBossCodes) assert.equal(level32BossDifficultyTraitFor(code, 'dreamlike'), level32BossDifficultyTraits.dreamlike);
  assert.equal(level32BossDifficultyTraitFor('shadow_wolf_king', 'dreamlike'), undefined);
  assert.equal(level32BossDifficultyTraitFor('gruen_mountainheart', 'ordinary'), undefined);
  assert.equal(level32BossDifficultyCodeFromTraits('gruen_mountainheart', [{ code: 'dreamlike' }]), 'dreamlike');
  assert.equal(level32BossDifficultyCodeFromTraits('necromancer_uz', JSON.stringify([{ code: 'holy' }])), 'holy');
  assert.equal(level32BossDifficultyCodeFromTraits('shadow_wolf_king', [{ code: 'dreamlike' }]), undefined);
});

test('三组装备基准与八档双防、暴免、暴抗、韧性完整配置', () => {
  const groups: Array<[Level32BossDifficultyCode[], string]> = [
    [['infernal', 'abyssal'], '稀有'],
    [['crimson', 'corrupted', 'holy'], '传说'],
    [['golden', 'brilliant', 'dreamlike'], '史诗']
  ];
  for (const [codes, rarity] of groups) for (const code of codes) {
    const trait = level32BossDifficultyTraits[code];
    assert.equal(trait.referenceEquipment, rarity);
    assert.ok(trait.statMultiplier > 1, `${code}/base`);
    for (const key of ['physicalDefense', 'magicDefense', 'critResist', 'critReduction', 'tenacity'] as const) assert.ok(trait.statMultipliers[key] > 1, `${code}/${key}`);
  }
  assert.ok(level32BossDifficultyTraits.golden.statMultipliers.physicalDefense > level32BossDifficultyTraits.holy.statMultipliers.physicalDefense);
  assert.ok(level32BossDifficultyTraits.brilliant.statMultipliers.critResist > level32BossDifficultyTraits.golden.statMultipliers.critResist);
  assert.ok(level32BossDifficultyTraits.dreamlike.statMultipliers.critReduction > level32BossDifficultyTraits.brilliant.statMultipliers.critReduction);
});

test('八档双攻、双防、命闪、暴击与暴伤使用平缓校准值，其他属性总倍率保持不变', () => {
  const expected = {
    infernal: { hp: 8, attack: 1.45, defense: 1.65, accuracy: 1.60, evasion: 1.55, critRate: 1.40, critDamage: 1.40, general: 1.60 },
    abyssal: { hp: 12, attack: 1.55, defense: 1.80, accuracy: 1.80, evasion: 1.70, critRate: 1.50, critDamage: 1.50, general: 1.85 },
    crimson: { hp: 14, attack: 2.00, defense: 2.05, accuracy: 2.25, evasion: 2.00, critRate: 1.90, critDamage: 2.00, general: 2.50 },
    corrupted: { hp: 25, attack: 1.65, defense: 2.45, accuracy: 2.10, evasion: 2.00, critRate: 1.55, critDamage: 1.55, general: 2.15 },
    holy: { hp: 20, attack: 1.70, defense: 2.20, accuracy: 2.25, evasion: 2.55, critRate: 1.60, critDamage: 1.60, general: 2.25 },
    golden: { hp: 24, attack: 1.85, defense: 2.60, accuracy: 2.55, evasion: 2.60, critRate: 1.70, critDamage: 1.70, general: 2.70 },
    brilliant: { hp: 30, attack: 2.00, defense: 3.10, accuracy: 3.00, evasion: 3.15, critRate: 1.85, critDamage: 1.85, general: 3.10 },
    dreamlike: { hp: 38, attack: 2.15, defense: 3.60, accuracy: 3.40, evasion: 3.50, critRate: 2.00, critDamage: 2.00, general: 3.60 }
  } satisfies Record<Level32BossDifficultyCode, { hp: number; attack: number; defense: number; accuracy: number; evasion: number; critRate: number; critDamage: number; general: number }>;

  for (const [code, values] of Object.entries(expected) as Array<[Level32BossDifficultyCode, typeof expected[Level32BossDifficultyCode]]>) {
    const trait = level32BossDifficultyTraits[code];
    assert.equal(trait.statMultipliers.hp, values.hp, `${code}/hp`);
    assert.equal(trait.statMultipliers.physicalAttack, values.attack, `${code}/physicalAttack`);
    assert.equal(trait.statMultipliers.magicAttack, values.attack, `${code}/magicAttack`);
    assert.equal(trait.statMultipliers.physicalDefense, values.defense, `${code}/physicalDefense`);
    assert.equal(trait.statMultipliers.magicDefense, values.defense, `${code}/magicDefense`);
    assert.equal(trait.statMultipliers.accuracy, values.accuracy, `${code}/accuracy`);
    assert.equal(trait.statMultipliers.evasion, values.evasion, `${code}/evasion`);
    assert.equal(trait.statMultipliers.critRate, values.critRate, `${code}/critRate`);
    assert.equal(trait.statMultipliers.critDamage, values.critDamage, `${code}/critDamage`);
    assert.equal(trait.statMultiplier, values.general, `${code}/general`);
  }
});

test('八档经验与掉落奖励随难度提高', () => {
  const expected: Record<Level32BossDifficultyCode, [number, number]> = {
    infernal: [70, 200], abyssal: [110, 300], crimson: [170, 500], corrupted: [180, 500],
    holy: [190, 500], golden: [280, 900], brilliant: [450, 1400], dreamlike: [900, 1900]
  };
  for (const [code, [experiencePct, dropPct]] of Object.entries(expected) as Array<[Level32BossDifficultyCode, [number, number]]>) {
    assert.equal(level32BossDifficultyTraits[code].experiencePct, experiencePct, `${code}/experiencePct`);
    assert.equal(level32BossDifficultyTraits[code].dropPct, dropPct, `${code}/dropPct`);
  }
  const staleDreamlike = [{ code: 'dreamlike', name: '梦幻的', experiencePct: 600, dropPct: 600 }];
  assert.equal(applyLevel32BossDifficultyTraits('necromancer_uz', staleDreamlike)[0]?.experiencePct, 900);
  assert.equal(applyLevel32BossDifficultyTraits('necromancer_uz', staleDreamlike)[0]?.dropPct, 1900);
  assert.equal(applyLevel32BossDifficultyTraits('shadow_wolf_king', staleDreamlike)[0], staleDreamlike[0]);
});

test('梦幻档四个固定模板保留适中双防与高双抗，1800攻击强制暴击核心伤害不会回到旧表水平', () => {
  const dream = level32BossDifficultyTraits.dreamlike.statMultipliers;
  for (const code of Object.keys(profiles) as Array<keyof typeof profiles>) {
    const base = basePanel(code);
    const hp = Math.floor(base.hpMax * dream.hp);
    const defense = Math.floor(base.physicalDefense * dream.physicalDefense);
    const magicDefense = Math.floor(base.magicDefense * dream.magicDefense);
    const critResist = Math.floor(base.critResistBp * dream.critResist);
    const critReduction = Math.floor(base.critDamageReductionBp * dream.critReduction);
    assert.ok(hp >= 140_000, `${code}/hp=${hp}`);
    assert.ok(defense >= 2_800, `${code}/defense=${defense}`);
    assert.ok(magicDefense >= 2_400, `${code}/magicDefense=${magicDefense}`);
    assert.ok(critResist >= 8_500, `${code}/critResist=${critResist}`);
    assert.ok(critReduction >= 8_700, `${code}/critReduction=${critReduction}`);

    // 215% 夜刃终结技、40% 防御穿透、2500 暴伤的强制暴击核心；外围职业/装备最终倍率另算。
    const newStrike = resolveStrike(1800 * 2.15, defense * .6, 1, 1, 1, 1, 2500, critReduction, true, true).damage;
    const oldStrike = resolveStrike(1800 * 2.15, base.physicalDefense * 2 * .6, 1, 1, 1, 1, 2500, base.critDamageReductionBp * 2, true, true).damage;
    assert.ok(newStrike < oldStrike * .75, `${code}: ${newStrike}/${oldStrike}`);
  }
});
