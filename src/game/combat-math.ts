/** PvE 与 PvP 共用的基础命中、暴击与直击伤害结算。 */
export const opposedChance = (offense: number, defense: number) => {
  const x = Math.max(1, Number(offense)); const y = Math.max(1, Number(defense));
  return x / (x + y);
};

/** 首领承受控制时的命中系数，技能与药剂共用。 */
export const bossControlChanceMultiplier = .4;
/** 技能负面状态按破韧与韧性对抗；命中、暴击只参与直击结算。 */
export const tenacityContest = (tenacityPierce: number, targetTenacity: number, levelDifference: number, baseChancePct: number) => {
  const pierce = Math.max(0, Number(tenacityPierce));
  const tenacity = Math.max(0, Number(targetTenacity));
  // 同级破韧等于韧性时 K=1；更高破韧不再提高本次状态效果。
  const coefficient = Math.min(1, 2 * pierce / Math.max(1, pierce + tenacity));
  const levelMultiplier = levelDifference >= 0 ? Math.pow(1.1, levelDifference) : Math.pow(.9, -levelDifference);
  return {
    coefficient,
    harmfulMultiplier: .5 + coefficient * .5,
    damageOverTimeMultiplier: Math.min(1, coefficient * levelMultiplier),
    controlChance: Math.min(1, Number(baseChancePct) / 100 * coefficient * levelMultiplier)
  };
};

// 仅用于直击与技能本体伤害；持续伤害、治疗、减伤等效果不经过这项随机波动。
export const directDamageVariance = (damage: number) => Math.max(1, Math.floor(damage * (.9 + Math.random() * .2)));

export const resolveStrike = (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number, forceHit = false, forceCrit = false, minimumHitRatePct = 0, actualHitRatePct = 0, hitMultiplier = 1) => {
  const hitChance = Math.min(1, Math.max((opposedChance(accuracy, evasion) + actualHitRatePct / 100) * Math.max(0, hitMultiplier), Math.max(0, Math.min(100, minimumHitRatePct)) / 100));
  if (!forceHit && Math.random() >= hitChance) return { hit: false, crit: false, damage: 0 };
  let damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, defense))));
  const critical = forceCrit || Math.random() < opposedChance(crit, critResist);
  if (critical) damage = Math.max(1, Math.floor(damage * (1 + opposedChance(critDamage, critReduction))));
  return { hit: true, crit: critical, damage };
};
