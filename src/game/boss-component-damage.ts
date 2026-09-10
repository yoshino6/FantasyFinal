import type { CombatRules, RuleUnit } from './combat-rule-registry';

type AreaDamage = {
  multipliers: Map<string, number>;
  reductions: Map<string, number>;
  candidates: Map<string, number>;
};

/** 部位传伤不是新的一次命中，不重复计算防御、暴击、易伤，也不触发攻击者追击。 */
export const installBossComponentDamage = (rules: CombatRules, bodyByPart: Map<string, string>) => {
  let area: AreaDamage | undefined;
  const unitFor = (key: string) => rules.units.find(unit => unit.key === key);
  const bodies = new Set(bodyByPart.values());
  const multiplier = (body: RuleUnit) => Math.pow(.7, [...bodyByPart].filter(([part, parent]) => parent === body.key && Number(unitFor(part)?.hp ?? 0) > 0).length);
  const reduction = (body: RuleUnit) => (1 - Math.max(0, Math.min(80, rules.value(body, 'barrier'))) / 100)
    * (1 - Math.max(0, Math.min(80, rules.value(body, 'reduction') + Number(body.modifiers?.damageReductionPct ?? 0))) / 100);
  const transmit = async (body: RuleUnit, damage: number) => {
    if (body.hp <= 0 || damage <= 0) return;
    const before = body.hp;
    const absorbed = await rules.takeUnlinked(body, damage);
    rules.log.push(`　&部位传伤&【${body.name}】受到 ${damage} 点伤害${absorbed ? `（护盾吸收 ${absorbed}）` : ''}（${before}→${body.hp}）。`);
  };
  rules.hooks.bodyMultiplier = body => area?.multipliers.get(body.key) ?? multiplier(body);
  rules.hooks.linkDamage = async (target, damage, apply, areaHit) => {
    const batch = areaHit ? area : undefined;
    if (batch && bodies.has(target.key)) {
      const linked = batch.candidates.get(target.key) ?? 0;
      batch.candidates.delete(target.key);
      if (linked > 0) rules.log.push(`　&群攻合算&【${target.name}】直击 ${damage}／部位传伤 ${linked}，取较高值一次。`);
      return apply(Math.max(damage, linked));
    }
    const body = unitFor(bodyByPart.get(target.key) ?? '');
    // 击破这一击仍使用受击前的存活部位数；同次群攻固定使用开招快照。
    const factor = body ? (batch?.multipliers.get(body.key) ?? multiplier(body)) * (batch?.reductions.get(body.key) ?? reduction(body)) : 0;
    const before = target.hp;
    const result = await apply(damage);
    if (!body || body.hp <= 0) return result;
    const linked = Math.max(0, Math.floor(Math.max(0, before - target.hp) * factor + 1e-9));
    if (batch) batch.candidates.set(body.key, Math.max(batch.candidates.get(body.key) ?? 0, linked));
    else await transmit(body, linked);
    return result;
  };
  rules.hooks.areaDamage = async (targets, hit) => {
    const previous = area;
    const batch: AreaDamage = { multipliers: new Map(), reductions: new Map(), candidates: new Map() };
    for (const key of bodies) {
      const body = unitFor(key);
      if (body) { batch.multipliers.set(key, multiplier(body)); batch.reductions.set(key, reduction(body)); }
    }
    area = batch;
    try {
      // 本体最后命中：先收齐部位候选，再结算唯一的一次本体护盾、扣血与命中效果。
      const ordered = [...new Map(targets.map(target => [target.key, target])).values()].sort((a, b) => Number(bodies.has(a.key)) - Number(bodies.has(b.key)));
      for (const target of ordered) if (target.hp > 0 && target.participating !== false) await hit(target);
      // 未选中本体／本体闪避也不能丢掉已经命中部位的传伤。
      for (const [key, damage] of batch.candidates) {
        const body = unitFor(key); if (body) await transmit(body, damage);
      }
    } finally { area = previous; }
  };
};
