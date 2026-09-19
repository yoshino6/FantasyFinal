import { calculateDerivedStats, virtualEquipmentStats } from './src/game/constants';
import { monsterGrowthAllocation } from './src/game/monster-growth';
import { level32BossDifficultyTraits } from './src/game/level32-boss-difficulty.config';

const templates: Record<string, { level: number; attrs: Record<string, number> }> = {
  gruen_mountainheart: { level: 32, attrs: { constitution: 96, spirit: 52, strength: 82, intelligence: 42, agility: 46, perception: 57, constitution_growth: 1.0, spirit_growth: .6, strength_growth: 1.0, intelligence_growth: .5, agility_growth: .5, perception_growth: .65 } },
  valk_forge_overseer: { level: 32, attrs: { constitution: 74, spirit: 70, strength: 70, intelligence: 105, agility: 64, perception: 72, constitution_growth: .8, spirit_growth: .9, strength_growth: .75, intelligence_growth: 1.15, agility_growth: .7, perception_growth: .85 } },
  threehead_mother: { level: 32, attrs: { constitution: 75, spirit: 88, strength: 56, intelligence: 95, agility: 90, perception: 92, constitution_growth: .75, spirit_growth: 1.0, strength_growth: .6, intelligence_growth: 1.05, agility_growth: 1.0, perception_growth: .9 } },
  necromancer_uz: { level: 32, attrs: { constitution: 68, spirit: 82, strength: 32, intelligence: 98, agility: 46, perception: 74, constitution_growth: 1.3, spirit_growth: 2.3, strength_growth: 1.0, intelligence_growth: 2.8, agility_growth: 1.4, perception_growth: 2.0 } },
  goblin_king: { level: 32, attrs: { constitution: 18, spirit: 34, strength: 12, intelligence: 38, agility: 17, perception: 22, constitution_growth: 1.3, spirit_growth: 2.4, strength_growth: .7, intelligence_growth: 2.6, agility_growth: 1.0, perception_growth: 1.6 } },
  habadragon: { level: 30, attrs: { constitution: 36, spirit: 8, strength: 35, intelligence: 6, agility: 24, perception: 18, constitution_growth: 2.7, spirit_growth: .3, strength_growth: 2.6, intelligence_growth: .4, agility_growth: 1.8, perception_growth: 1.2 } }
};

const calc = (code: string, difficulty?: string) => {
  const t = templates[code];
  const allocation = monsterGrowthAllocation({ ...t.attrs, code, template_code: code, growth_template_code: code, level: t.level });
  const base = calculateDerivedStats(allocation);
  const weaponRef = calculateDerivedStats(Object.fromEntries(['constitution', 'spirit', 'strength', 'intelligence', 'agility', 'perception'].map(key => [key, t.attrs[key] + t.attrs[`${key}_growth`] * (t.level - 1)])));
  const virtual = virtualEquipmentStats(t.level, 'boss', weaponRef.physicalAttack, weaponRef.magicAttack);
  const raw = {
    hpMax: base.hpMax + virtual.hpMax, mpMax: base.mpMax + virtual.mpMax,
    physicalAttack: base.physicalAttack + virtual.physicalAttack, magicAttack: base.magicAttack + virtual.magicAttack,
    physicalDefense: base.physicalDefense + virtual.physicalDefense, magicDefense: base.magicDefense + virtual.magicDefense,
    accuracy: base.accuracy + virtual.accuracy, evasion: base.evasion + virtual.evasion,
    crit: base.critRateBp + virtual.critRateBp, critResist: base.critResistBp + virtual.critResistBp,
    critDamage: base.critDamageBp + virtual.critDamageBp, critReduction: base.critDamageReductionBp + virtual.critDamageReductionBp,
    tenacity: base.tenacity + virtual.tenacity, tenacityPierce: base.tenacityPierce + virtual.tenacityPierce,
    speed: base.speed + virtual.speed
  };
  if (!difficulty) return raw;
  const trait = level32BossDifficultyTraits[difficulty as keyof typeof level32BossDifficultyTraits];
  // 与 monsterCombatStats 一致：有该属性词条时用它作最终倍率，否则回退 statMultiplier
  const multiplierFor = (stat?: string) => stat ? (trait.statMultipliers[stat as keyof typeof trait.statMultipliers] ?? trait.statMultiplier) : trait.statMultiplier;
  const pressure = Math.pow(1.1, Math.max(0, t.level - 30));
  const result = {
    hpMax: Math.floor(raw.hpMax * multiplierFor('hp')), mpMax: Math.floor(raw.mpMax * multiplierFor()),
    physicalAttack: Math.floor(raw.physicalAttack * multiplierFor('physicalAttack')), magicAttack: Math.floor(raw.magicAttack * multiplierFor('magicAttack')),
    physicalDefense: Math.floor(raw.physicalDefense * multiplierFor('physicalDefense')), magicDefense: Math.floor(raw.magicDefense * multiplierFor('magicDefense')),
    accuracy: Math.floor(raw.accuracy * multiplierFor('accuracy') * pressure), evasion: Math.floor(raw.evasion * multiplierFor('evasion') * pressure),
    crit: Math.floor(raw.crit * multiplierFor('critRate') * pressure), critResist: Math.floor(raw.critResist * multiplierFor('critResist') * pressure),
    critDamage: Math.floor(raw.critDamage * multiplierFor('critDamage') * pressure), critReduction: Math.floor(raw.critReduction * multiplierFor('critReduction') * pressure),
    tenacity: Math.floor(raw.tenacity * multiplierFor('tenacity') * pressure), tenacityPierce: Math.floor(raw.tenacityPierce * multiplierFor() * pressure),
    speed: Math.floor(raw.speed * multiplierFor('speed') * pressure)
  };
  return result;
};

for (const code of Object.keys(templates)) {
  const base = calc(code);
  console.log(`\n${code} 基础：`, base);
  if (code === 'habadragon') continue;
  for (const diff of ['infernal', 'abyssal', 'crimson', 'corrupted', 'holy', 'golden', 'brilliant', 'dreamlike']) {
    const s = calc(code, diff);
    console.log(`${diff}: HP ${s.hpMax} 攻 ${s.physicalAttack}/${s.magicAttack} 防 ${s.physicalDefense}/${s.magicDefense} 命 ${s.accuracy} 闪 ${s.evasion} 暴 ${s.crit} 暴伤 ${s.critDamage} 暴抗 ${s.critResist} 暴免 ${s.critReduction} 韧 ${s.tenacity} 速 ${s.speed}`);
  }
}
