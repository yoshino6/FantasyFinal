/** PvE 与 PvP 共用的基础命中、暴击与直击伤害结算。 */
export const opposedChance = (offense: number, defense: number) => {
  const x = Math.max(1, Number(offense)); const y = Math.max(1, Number(defense));
  return x / (x + y);
};

// 仅用于直击与技能本体伤害；持续伤害、治疗、减伤等效果不经过这项随机波动。
export const directDamageVariance = (damage: number) => Math.max(1, Math.floor(damage * (.9 + Math.random() * .2)));

export const resolveStrike = (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number, forceHit = false, forceCrit = false, minimumHitRatePct = 0, actualHitRatePct = 0) => {
  const hitChance = Math.min(1, Math.max(Math.max(opposedChance(accuracy, evasion), Math.max(0, Math.min(100, minimumHitRatePct)) / 100) + actualHitRatePct / 100, 0));
  if (!forceHit && Math.random() >= hitChance) return { hit: false, crit: false, damage: 0 };
  let damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, defense))));
  const critical = forceCrit || Math.random() < opposedChance(crit, critResist);
  if (critical) damage = Math.max(1, Math.floor(damage * (1 + opposedChance(critDamage, critReduction))));
  return { hit: true, crit: critical, damage };
};
