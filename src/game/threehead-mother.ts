import { tenacityContest } from './combat-math';
import { combatUnitLabel } from './combat-unit-label';
import type { CombatRules, RuleStatus, RuleUnit } from './combat-rule-registry';

export type ThreeheadRole = 'venom' | 'flame' | 'gale';

export const threeheadMotherTemplateCode = 'threehead_mother';
export const threeheadMotherRoles: ThreeheadRole[] = ['venom', 'flame', 'gale'];
export const threeheadMotherNames: Record<ThreeheadRole, string> = {
  venom: '三首蛇母·毒厄之首', flame: '三首蛇母·红莲之首', gale: '三首蛇母·狂风之首'
};
export const threeheadMotherElements: Record<ThreeheadRole, Record<string, number>> = {
  venom: { 水: 25, 火: -30, 土: 20, 木: 120, 风: 35, 冰: 10, 雷: 0, 光: -20, 暗: 70 },
  flame: { 水: -35, 火: 180, 土: 45, 木: 35, 风: 20, 冰: -25, 雷: 15, 光: 20, 暗: 35 },
  gale: { 水: 20, 火: 20, 土: -20, 木: 35, 风: 160, 冰: 10, 雷: -35, 光: 15, 暗: 25 }
};

const profile = {
  venom: { hp: .70, physicalAttack: 1, magicAttack: .95, physicalDefense: 1, magicDefense: 1.05, accuracy: 1, evasion: 1, speed: 1, crit: 1, critResist: 1, critDamage: 1, critReduction: 1, tenacity: 1, tenacityPierce: 1 },
  flame: { hp: .80, physicalAttack: 1.10, magicAttack: 1.10, physicalDefense: 1.05, magicDefense: .95, accuracy: 1.05, evasion: .95, speed: .95, crit: 1.10, critResist: .95, critDamage: 1.05, critReduction: .95, tenacity: 1, tenacityPierce: 1.05 },
  gale: { hp: .60, physicalAttack: .90, magicAttack: 1, physicalDefense: .90, magicDefense: 1.10, accuracy: 1, evasion: 1.10, speed: 1.10, crit: .95, critResist: 1.05, critDamage: .95, critReduction: 1.05, tenacity: 1.05, tenacityPierce: 1 }
} satisfies Record<ThreeheadRole, Record<string, number>>;

const cooldownRecord = (value: { cooldowns?: unknown }) => {
  let raw = value.cooldowns; if (typeof raw === 'string') try { raw = JSON.parse(raw); } catch { raw = {}; }
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
};

export const threeheadMotherRole = (value: { cooldowns?: unknown }): ThreeheadRole | undefined => {
  const cooldowns = cooldownRecord(value);
  const role = String(cooldowns.mother_head_role ?? '');
  return threeheadMotherRoles.includes(role as ThreeheadRole) ? role as ThreeheadRole : undefined;
};

export const threeheadMotherStats = <T extends Record<string, number>>(stats: T, role: ThreeheadRole): T => {
  const ratios = profile[role]; const next = { ...stats };
  for (const [key, ratio] of Object.entries(ratios)) if (key !== 'hp' && key in next) next[key as keyof T] = Math.max(1, Math.floor(Number(next[key as keyof T]) * ratio)) as T[keyof T];
  if ('hpMax' in next) next['hpMax' as keyof T] = Math.max(1, Math.floor(Number(next['hpMax' as keyof T]) * ratios.hp)) as T[keyof T];
  return next;
};

export const threeheadMotherBaseStats = <T extends Record<string, number>>(stats: T, role: ThreeheadRole): T => {
  const ratios = profile[role]; const next = { ...stats };
  for (const [key, ratio] of Object.entries(ratios)) if (key !== 'hp' && key in next) next[key as keyof T] = Math.max(1, Math.round(Number(next[key as keyof T]) / ratio)) as T[keyof T];
  if ('hpMax' in next) next['hpMax' as keyof T] = Math.max(1, Math.round(Number(next['hpMax' as keyof T]) / ratios.hp)) as T[keyof T];
  return next;
};

export const threeheadMotherStoredStats = (value: { cooldowns?: unknown }) => {
  const stats = cooldownRecord(value).mother_head_stats;
  if (!stats || typeof stats !== 'object') return undefined;
  const record = stats as Record<string, unknown>; const keys = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'crit', 'critResist', 'critDamage', 'critReduction', 'tenacity', 'tenacityPierce', 'speed', 'perception'];
  if (!keys.every(key => Number.isFinite(Number(record[key])))) return undefined;
  return Object.fromEntries(keys.map(key => [key, Math.max(0, Math.floor(Number(record[key])))])) as Record<string, number>;
};

export const threeheadMotherHeadName = (value: { cooldowns?: unknown; name?: string }) => {
  const role = threeheadMotherRole(value); return role ? threeheadMotherNames[role] : String(value.name ?? '三首雾沼蛇母');
};

export const threeheadMotherPanelSummary = (target: { cooldowns?: unknown; current_hp?: number; hp_max?: number }, all: Array<{ cooldowns?: unknown; is_defeated?: number }>) => {
  const cooldowns = cooldownRecord(target);
  const alive = all.filter(item => threeheadMotherRole(item) && !item.is_defeated).length; const next = Number(cooldowns.mother_slot ?? 0) % 4 + 1;
  const unlocked = Number(target.current_hp ?? 0) / Math.max(1, Number(target.hp_max ?? 1)) <= .5;
  const share = alive >= 3 ? '单体50/25/25，群攻各承受50%' : alive === 2 ? '单体70/30，群攻各承受70%' : '独首35%减伤；每3次实际行动引爆DOT';
  const disaster = Number(cooldowns.mother_disaster_ready_turn ?? 0) > 0 ? `｜灾劫焚风蓄势至第${Number(cooldowns.mother_disaster_ready_turn)}回合，击杀参与蛇首可中断` : '';
  return `庞大身躯：实际闪避修正-50%，实际命中修正+50%｜血肉并痛：${share}｜下次技能槽${next}${next === 4 ? (unlocked ? '（变招已解锁）' : '（使用锁定替代技）') : ''}${disaster}`;
};

const dotCodes = ['mother_poison', 'mother_burn', 'mother_wind_erosion'] as const;
type MotherDot = typeof dotCodes[number];
const dotName: Record<MotherDot, string> = { mother_poison: '中毒', mother_burn: '灼烧', mother_wind_erosion: '风蚀' };

export const addThreeheadDot = (rules: CombatRules, source: RuleUnit, target: RuleUnit, code: MotherDot, stacks: number) => {
  const existing = rules.status(target, code); const effect = rules.add(target, code, code === 'mother_poison' ? 6 : code === 'mother_burn' ? 3 : 100, 3, source, true, existing?.data ?? JSON.stringify({ appliedTurn: rules.turn }));
  effect.until = Math.max(effect.until, rules.turn + 3);
  effect.stacks = Math.min(5, (existing?.stacks ?? 0) + Math.max(1, stacks));
  return effect;
};

const abnormalLands = (rules: CombatRules, source: RuleUnit, target: RuleUnit, baseChance: number) => {
  const chance = tenacityContest(source.pierce, target.tenacity * (1 + rules.value(target, 'tenacity') / 100), source.level - target.level, baseChance).controlChance;
  return rules.random() < chance;
};

export const tryAddThreeheadDot = (rules: CombatRules, source: RuleUnit, target: RuleUnit, code: MotherDot, stacks: number, baseChance = 100) => {
  if (!abnormalLands(rules, source, target, baseChance)) { rules.log.push(`　➥${combatUnitLabel(target)}抵抗了${dotName[code]}。`); return false; }
  addThreeheadDot(rules, source, target, code, stacks); return true;
};

export const increaseThreeheadDots = (rules: CombatRules, target: RuleUnit, amount = 1) => {
  for (const code of dotCodes) { const effect = rules.status(target, code); if (effect) effect.stacks = Math.min(5, effect.stacks + amount); }
};

export const settleThreeheadDots = async (rules: CombatRules, targets: RuleUnit[], immediate = false) => {
  for (const target of targets.filter(unit => unit.hp > 0)) {
    const effects = Object.fromEntries(dotCodes.map(code => [code, rules.status(target, code)])) as Record<MotherDot, RuleStatus | undefined>;
    const active = Object.values(effects).filter(Boolean);
    const legacyDots = rules.effects(target).filter(effect => ['poison', 'burn', 'bleed', 'bleeding'].includes(effect.code));
    if (!active.length && (!immediate || !legacyDots.length)) continue;
    const eligible = (effect?: RuleStatus) => immediate || Boolean(effect && Number(JSON.parse(effect.data || '{}').appliedTurn ?? 0) < rules.turn);
    if (!immediate && !active.some(eligible)) continue;
    const hp = target.hp, hpMax = target.hpMax; const wind = eligible(effects.mother_wind_erosion) ? effects.mother_wind_erosion?.stacks ?? 0 : 0; const factor = 1 + wind;
    const burn = Math.floor(hpMax * .03 * (eligible(effects.mother_burn) ? effects.mother_burn?.stacks ?? 0 : 0) * factor);
    const poison = Math.floor(Math.max(0, hpMax - hp) * .06 * (eligible(effects.mother_poison) ? effects.mother_poison?.stacks ?? 0 : 0) * factor);
    // 旧状态管线会自行结算常规 DOT；自然跳伤这里只补足风蚀额外倍数，立即结算则完整复制本次 DOT。
    const legacyDotBase = Math.floor(legacyDots.reduce((sum, effect) => sum + hpMax * effect.value * effect.stacks / 100, 0));
    const legacyDot = immediate ? legacyDotBase * factor : legacyDotBase * wind;
    const damage = Math.max(0, burn + poison + legacyDot); if (!damage) continue;
    const owner = rules.units.find(unit => unit.key === (effects.mother_burn ?? effects.mother_poison)?.source);
    const result = await rules.takeHit(target, damage, 1, true, owner, true);
    rules.log.push(`　&持续灾蚀&${combatUnitLabel(target)}受到 ${result.damage} 点伤害（蛇母灼烧${burn}、蛇母中毒${poison}、其他DOT补算${legacyDot}、风蚀倍率×${factor}；不消耗层数）。`);
  }
};

const reductionFactor = (rules: CombatRules, head: RuleUnit, solo: boolean) => 1 - Math.min(80, (rules.status(head, 'mother_wind_barrier') ? 25 : 0) + (solo ? 35 : 0)) / 100;

/** 三首共享受击规则。secondary 为持续/反射/机制伤害，只吃减伤而不触发血肉分摊。 */
export const installThreeheadMotherDamage = (rules: CombatRules) => {
  const previousLink = rules.hooks.linkDamage; const previousArea = rules.hooks.areaDamage; const previousAfter = rules.hooks.afterDamage;
  let areaAliveSnapshot: number | undefined;
  const heads = () => rules.units.filter(unit => unit.side === 'target' && threeheadMotherRole(unit));
  for (const head of heads()) head.modifiers = { ...(head.modifiers ?? {}), actualHitRatePct: 50, actualEvasionRatePct: -50 };
  rules.hooks.areaDamage = async (targets, hit) => {
    const old = areaAliveSnapshot; areaAliveSnapshot = heads().filter(unit => unit.hp > 0).length;
    try { if (previousArea) await previousArea(targets, hit); else for (const target of targets) await hit(target); } finally { areaAliveSnapshot = old; }
  };
  rules.hooks.linkDamage = async (unit, damage, apply, areaHit, source, secondary) => {
    if (!threeheadMotherRole(unit)) return previousLink ? previousLink(unit, damage, apply, areaHit, source, secondary) : apply(damage);
    const living = heads().filter(head => head.hp > 0); const count = areaAliveSnapshot ?? living.length; const solo = count <= 1;
    const reduced = Math.max(0, Math.floor(damage * reductionFactor(rules, unit, solo)));
    if (secondary || solo) return apply(reduced);
    if (areaHit) return apply(Math.floor(reduced * (count >= 3 ? .50 : .70)));
    const primaryRate = count >= 3 ? .50 : .70; const others = living.filter(head => head.key !== unit.key); const sharedTotal = reduced * (1 - primaryRate); const each = others.length ? sharedTotal / others.length : 0;
    for (const other of others) {
      const share = Math.floor(each); const before = other.hp; const absorbed = await rules.takeUnlinked(other, share, 1, source);
      rules.log.push(`　&血肉并痛&${combatUnitLabel(other)}分担 ${share} 点伤害（实际扣除${before - other.hp}，护盾吸收${absorbed}）。`);
    }
    return apply(Math.floor(reduced * primaryRate));
  };
  rules.hooks.afterDamage = async (unit, damage, shieldBroken, originalShield, source) => {
    await previousAfter?.(unit, damage, shieldBroken, originalShield, source);
    if (source?.side !== 'member' || source.hp <= 0 || !threeheadMotherRole(unit) || heads().filter(head => head.hp > 0).length !== 1) return;
    const action = Number(source.state.memory.achievementAction ?? 0); const stamp = `${rules.turn}:${action}`;
    if (source.state.memory.motherSoloRecoil === stamp) return; source.state.memory.motherSoloRecoil = stamp;
    for (const code of dotCodes) addThreeheadDot(rules, unit, source, code, 1);
    rules.log.push(`　&血脉同源&${combatUnitLabel(source)}因攻击独存蛇首，获得中毒、灼烧、风蚀各1层。`);
  };
};

const attack = async (rules: CombatRules, source: RuleUnit, targets: RuleUnit[], power: number, element: string, magic: boolean, single: boolean, onHit?: (target: RuleUnit) => void) => {
  const hit = async (target: RuleUnit) => { const landed = await rules.strike(source, target, power, element, magic, false, false, 1, { skill: true, single }); if (landed) { onHit?.(target); if (rules.allies(source).filter(unit => threeheadMotherRole(unit)).length === 1) for (const code of dotCodes) addThreeheadDot(rules, source, target, code, 1); } };
  if (single) await hit(targets[0]); else await rules.areaDamage(targets, hit);
};

const activateSolo = async (rules: CombatRules, head: RuleUnit) => {
  if (Number(head.cooldowns.mother_solo_active ?? 0)) return;
  head.cooldowns.mother_solo_active = 1; head.cooldowns.mother_slot = 0; head.cooldowns.mother_solo_actions = 0;
  await rules.remove(head, effect => effect.debuff);
  rules.log.push(`&独劫焚身·血脉同源&【${head.name}】清除普通控制与减益，进入独首狂暴：全伤害减免35%。`);
};

export const prepareThreeheadMotherTurn = async (rules: CombatRules, head: RuleUnit) => {
  if (!threeheadMotherRole(head)) return;
  const living = rules.units.filter(unit => unit.side === 'target' && threeheadMotherRole(unit) && unit.hp > 0);
  if (living.length === 1) await activateSolo(rules, head);
};

export const executeThreeheadMotherTurn = async (rules: CombatRules, head: RuleUnit, defaultVictim: RuleUnit) => {
  const role = threeheadMotherRole(head); if (!role) return false;
  const living = rules.units.filter(unit => unit.side === 'target' && threeheadMotherRole(unit) && unit.hp > 0); const enemies = rules.enemies(head);
  if (living.length === 1) await activateSolo(rules, head);
  const leader = [...living].sort((a, b) => a.key.localeCompare(b.key))[0]; const shared = living.map(unit => unit.cooldowns);
  const ready = shared.find(cooldowns => Number(cooldowns.mother_disaster_ready_turn ?? 0) > 0);
  if (head === leader && ready) {
    const participants = String(ready.mother_disaster_participants ?? '').split(',').filter(Boolean);
    if (participants.some(key => !living.some(unit => unit.key === key))) {
      for (const cooldowns of shared) { cooldowns.mother_disaster_ready_turn = 0; cooldowns.mother_disaster_interrupted = 1; }
      rules.log.push('&灾劫中断&参与共鸣的蛇首已经死亡，「灾劫焚风」永久失效。');
    } else if (rules.turn >= Number(ready.mother_disaster_ready_turn)) {
      rules.log.push(`➤【三首蛇母】共同释放「灾劫焚风」`);
      await attack(rules, head, enemies, 100, '风', true, false, target => {
        if (living.some(unit => threeheadMotherRole(unit) === 'venom')) addThreeheadDot(rules, head, target, 'mother_poison', 3);
        if (living.some(unit => threeheadMotherRole(unit) === 'flame')) addThreeheadDot(rules, head, target, 'mother_burn', 3);
        if (living.some(unit => threeheadMotherRole(unit) === 'gale')) addThreeheadDot(rules, head, target, 'mother_wind_erosion', 3);
      });
      for (const cooldowns of shared) { cooldowns.mother_disaster_ready_turn = 0; cooldowns.mother_disaster_cast_turn = rules.turn; }
      return true;
    }
  }
  if (Number(head.cooldowns.mother_disaster_cast_turn ?? 0) === rules.turn) return true;
  if (!ready && living.length >= 2 && !shared.some(cooldowns => Number(cooldowns.mother_disaster_used ?? 0)) && living.some(unit => unit.hp / unit.hpMax <= .20)) {
    const participants = living.map(unit => unit.key).join(',');
    for (const cooldowns of shared) { cooldowns.mother_disaster_used = 1; cooldowns.mother_disaster_ready_turn = rules.turn + 2; cooldowns.mother_disaster_participants = participants; }
    rules.log.push('&灾劫预兆&三首开始共鸣；玩家拥有一整轮行动窗口。期间击杀任意参与蛇首可永久中断「灾劫焚风」。');
  }
  const slot = Number(head.cooldowns.mother_slot ?? 0) % 4 + 1; head.cooldowns.mother_slot = slot;
  const unlocked = head.hp / head.hpMax <= .50; const marked = enemies.find(unit => Number(unit.state.memory.motherVenomMarkTurn ?? 0) === rules.turn) ?? defaultVictim;
  const title = (name: string) => rules.log.push(`➤【${head.name}】释放技能「${name}」`);
  if (role === 'venom') {
    if (slot === 1) { title('瘟疫吐息'); await attack(rules, head, enemies, 75, '木', true, false, target => { tryAddThreeheadDot(rules, head, target, 'mother_poison', 1, 35); }); }
    else if (slot === 2) { title('腐毒獠牙'); await attack(rules, head, [defaultVictim], 130, '木', false, true, target => { addThreeheadDot(rules, head, target, 'mother_poison', 3); target.state.memory.motherVenomMarkTurn = rules.turn; }); }
    else if (slot === 3) { title('腐败菌群'); for (const target of enemies) { rules.add(target, 'armor_shatter', 20, 3, head, true); rules.add(target, 'magic_shatter', 20, 3, head, true); tryAddThreeheadDot(rules, head, target, 'mother_poison', 1, 100); } rules.log.push('　&腐败菌群&无命中判定；全体双防-20%，中毒仍需通过韧性对抗。'); }
    else if (unlocked) { title('催眠吐息'); for (const target of enemies) await rules.control(head, target, 'sleep', 35, 1, false); }
    else { title('毒首撕咬'); await attack(rules, head, [defaultVictim], 115, '木', false, true); }
  } else if (role === 'flame') {
    if (slot === 1) { title('炎息洪流'); await attack(rules, head, enemies, 80, '火', true, false, target => { tryAddThreeheadDot(rules, head, target, 'mother_burn', 1, 35); }); }
    else if (slot === 2) { title('烈炎噬咬'); await attack(rules, head, [marked], 140, '火', false, true, target => { addThreeheadDot(rules, head, target, 'mother_burn', 3); }); }
    else if (slot === 3) { title('炎怒嘶吼'); rules.add(head, 'attack', 25, 3, head); rules.add(head, 'magic', 25, 3, head); }
    else if (unlocked) { title('烈焰风暴'); await attack(rules, head, enemies, 100, '火', true, false, target => addThreeheadDot(rules, head, target, 'mother_burn', 2)); }
    else { title('红莲撕咬'); await attack(rules, head, [defaultVictim], 120, '火', false, true); }
  } else {
    if (slot === 1) { title('风之障壁'); for (const ally of living) rules.add(ally, 'mother_wind_barrier', 25, 3, head); }
    else if (slot === 2) { title('狂岚呼啸'); await attack(rules, head, enemies, 65, '风', true, false); await settleThreeheadDots(rules, enemies, true); }
    else if (slot === 3) { title('裂空风涡'); await attack(rules, head, enemies, 70, '风', true, false, target => increaseThreeheadDots(rules, target, 1)); }
    else if (unlocked) { title('卷蚀罡风'); await attack(rules, head, enemies, 95, '风', true, false, target => addThreeheadDot(rules, head, target, 'mother_wind_erosion', 2)); }
    else { title('裂空风涡'); await attack(rules, head, enemies, 70, '风', true, false, target => increaseThreeheadDots(rules, target, 1)); }
  }
  if (living.length === 1) {
    head.cooldowns.mother_solo_actions = Number(head.cooldowns.mother_solo_actions ?? 0) + 1;
    if (Number(head.cooldowns.mother_solo_actions) % 3 === 0) { rules.log.push('&独劫引爆&独存蛇首完成第三次实际行动，引爆全体负面状态。'); await settleThreeheadDots(rules, enemies, true); }
  }
  return true;
};

export const reorderThreeheadMotherTurns = <T extends { kind: string; id: number }>(turns: T[], units: RuleUnit[]) => {
  const indexes = turns.map((turn, index) => ({ turn, index })).filter(entry => entry.turn.kind === 'target' && threeheadMotherRole(units.find(unit => unit.key === `target:${entry.turn.id}`) ?? {} as RuleUnit)).map(entry => entry.index);
  if (indexes.length < 2) return;
  const heads = indexes.map(index => turns[index]); const venom = units.find(unit => threeheadMotherRole(unit) === 'venom' && unit.hp > 0);
  const sleepLast = Boolean(venom && venom.hp / venom.hpMax <= .5 && Number(venom.cooldowns.mother_slot ?? 0) % 4 + 1 === 4);
  const order: ThreeheadRole[] = sleepLast ? ['flame', 'gale', 'venom'] : ['venom', 'flame', 'gale'];
  heads.sort((a, b) => order.indexOf(threeheadMotherRole(units.find(unit => unit.key === `target:${a.id}`)!)!) - order.indexOf(threeheadMotherRole(units.find(unit => unit.key === `target:${b.id}`)!)!));
  indexes.forEach((index, position) => { turns[index] = heads[position]; });
};
