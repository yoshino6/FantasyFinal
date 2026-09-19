/** PvE 与 PvP 共用的基础命中、暴击与直击伤害结算。 */
export const opposedChance = (offense: number, defense: number) => {
  const x = Math.max(0, Number(offense)); const y = Math.max(1, Number(defense));
  return 1 - Math.pow(.5, x / y);
};

/** 暴击时的额外伤害倍率；总暴击倍率为 1 + 本值，并随暴伤/暴抗渐近至 3 倍。 */
export const opposedCritBonus = (critDamage: number, critReduction: number) => {
  const x = Math.max(0, Number(critDamage)); const y = Math.max(1, Number(critReduction));
  return 2 * (1 - Math.pow(.5, x / y));
};

export type StrikeCorrections = { hitCorrectionPct?: number; evasionCorrectionPct?: number; critRateCorrectionPct?: number; critAvoidanceCorrectionPct?: number; critDamageCorrectionPct?: number; actualHitRatePct?: number; actualCritRatePct?: number };
export type StrikeCorrectionSource = StrikeCorrections & { armorSet?: StrikeCorrections | null; cardEffects?: StrikeCorrections | null; modifiers?: StrikeCorrections | null };
const correctionRate = (value = 0) => Math.max(0,Math.min(100,value))/100;
const combineCorrectionPct = (...values: Array<number | undefined>) => (1-values.reduce<number>((remaining,value)=>remaining*(1-correctionRate(value)),1))*100;
/** 对抗概率先结算其余修正，再补足未命中部分，最后由防守方削减命中率。 */
export const correctedHitChance = (chance: number, correction: StrikeCorrections = {}) => {
  const base = Math.max(0,Math.min(1,chance));
  return (base+(1-base)*correctionRate(correction.hitCorrectionPct))*(1-correctionRate(correction.evasionCorrectionPct));
};
/** 实际命中先进入基础对抗概率，再经过原命中倍率/最低命中，最后才结算命中与闪避修正。 */
export const resolvedHitChance = (chance: number, actualHitRatePct = 0, hitMultiplier = 1, minimumHitRatePct = 0, correction: StrikeCorrections = {}) => {
  const actual = Number(actualHitRatePct) + Number(correction.actualHitRatePct ?? 0);
  const multiplied = (Number(chance) + actual / 100) * Math.max(0, Number(hitMultiplier));
  const minimum = Math.max(0, Math.min(100, Number(minimumHitRatePct))) / 100;
  return correctedHitChance(Math.min(1, Math.max(multiplied, minimum)), correction);
};
/** 暴击率正向修正补足未暴击部分；抗暴率修正再按当前被暴击概率向下修正。 */
export const correctedCritChance = (chance: number, correction: StrikeCorrections = {}) => {
  const base = Math.max(0,Math.min(1,chance+Math.max(0,Number(correction.actualCritRatePct??0))/100));
  return (base+(1-base)*correctionRate(correction.critRateCorrectionPct))*(1-correctionRate(correction.critAvoidanceCorrectionPct));
};
export const correctedCritBonus = (bonus: number, correction: StrikeCorrections = {}) => bonus*(1-correctionRate(correction.critDamageCorrectionPct));
export const strikeCorrections = (source?: StrikeCorrectionSource, target?: StrikeCorrectionSource): StrikeCorrections => ({
  hitCorrectionPct:combineCorrectionPct(source?.armorSet?.hitCorrectionPct,source?.hitCorrectionPct,source?.modifiers?.hitCorrectionPct,source?.cardEffects?.hitCorrectionPct),
  evasionCorrectionPct:combineCorrectionPct(target?.armorSet?.evasionCorrectionPct,target?.evasionCorrectionPct,target?.modifiers?.evasionCorrectionPct,target?.cardEffects?.evasionCorrectionPct),
  critRateCorrectionPct:combineCorrectionPct(source?.armorSet?.critRateCorrectionPct,source?.critRateCorrectionPct,source?.modifiers?.critRateCorrectionPct,source?.cardEffects?.critRateCorrectionPct),
  critAvoidanceCorrectionPct:combineCorrectionPct(target?.armorSet?.critAvoidanceCorrectionPct,target?.critAvoidanceCorrectionPct,target?.modifiers?.critAvoidanceCorrectionPct,target?.cardEffects?.critAvoidanceCorrectionPct),
  critDamageCorrectionPct:combineCorrectionPct(target?.armorSet?.critDamageCorrectionPct,target?.critDamageCorrectionPct,target?.modifiers?.critDamageCorrectionPct,target?.cardEffects?.critDamageCorrectionPct),
  actualHitRatePct:Number(source?.armorSet?.actualHitRatePct??0)+Number(source?.actualHitRatePct??0)+Math.min(12,Math.max(0,Number(source?.cardEffects?.actualHitRatePct??0))),
  actualCritRatePct:Number(source?.armorSet?.actualCritRatePct??0)+Number(source?.actualCritRatePct??0)+Math.min(12,Math.max(0,Number(source?.cardEffects?.actualCritRatePct??0)))
});

/** 首领承受控制时的命中系数，技能与药剂共用。 */
export const bossControlChanceMultiplier = .4;
/** 技能负面状态按破韧与韧性对抗；命中、暴击只参与直击结算。等级差参数仅为兼容旧调用保留，不再参与计算。 */
export const tenacityContest = (tenacityPierce: number, targetTenacity: number, _levelDifference: number, baseChancePct: number, positiveCorrectionPct = 0) => {
  const pierce = Math.max(0, Number(tenacityPierce));
  const tenacity = Math.max(0, Number(targetTenacity));
  // 同级破韧等于韧性时 K=1；更高破韧不再提高本次状态效果。
  const opposedCoefficient = Math.min(1, 2 * pierce / Math.max(1, pierce + tenacity));
  const coefficient = opposedCoefficient + (1 - opposedCoefficient) * correctionRate(positiveCorrectionPct);
  return {
    coefficient,
    harmfulMultiplier: .5 + coefficient * .5,
    damageOverTimeMultiplier: Math.min(1, coefficient),
    controlChance: Math.min(1, Number(baseChancePct) / 100 * coefficient)
  };
};

// 仅用于直击与技能本体伤害；持续伤害、治疗、减伤等效果不经过这项随机波动。
export const directDamageVariance = (damage: number) => Math.max(1, Math.floor(damage * (.9 + Math.random() * .2)));

export const resolveStrike = (attack: number, defense: number, accuracy: number, evasion: number, crit: number, critResist: number, critDamage: number, critReduction: number, forceHit = false, forceCrit = false, minimumHitRatePct = 0, actualHitRatePct = 0, hitMultiplier = 1, correction: StrikeCorrections = {}) => {
  const hitChance = resolvedHitChance(opposedChance(accuracy, evasion), actualHitRatePct, hitMultiplier, minimumHitRatePct, correction);
  if (!forceHit && Math.random() >= hitChance) return { hit: false, crit: false, damage: 0 };
  let damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, defense))));
  const critical = forceCrit || Math.random() < correctedCritChance(opposedChance(crit, critResist),correction);
  if (critical) damage = Math.max(1, Math.floor(damage * (1 + correctedCritBonus(opposedCritBonus(critDamage, critReduction),correction))));
  return { hit: true, crit: critical, damage };
};
