import { talentCode } from './talent.config';
import { tenacityContest } from './combat-math';
import type { CombatRules, RuleUnit, RuleStatus } from './combat-rule-registry';

export type TalentAction = { serial: number; kind: string; single: boolean; damageType: string; ranged: boolean; extra: boolean; low: boolean; fire: boolean; prayer: boolean; core: boolean; hits: Record<string, number>; first: Record<string, boolean>; struck: Record<string, boolean> };
export type TalentBattleState = {
  clock: number; serial: number; action?: TalentAction; seen: string[]; hit: string[]; previousType?: string;
  chainRoot?: string; chain: number; attacks: number; normal: number; stacks: number; core: boolean;
  fireUsed?: boolean; fireUntil?: number; fireCost?: boolean; noAid?: boolean; poorBroken?: boolean;
  phase?: string; defend?: boolean; lastBasic?: { target: string; damage: number }; shadowedNormal?: number;
  stoneShield?: number; stoneGranted?: boolean; kills?: string[]; leech?: number;
  startedFull?: boolean; completed?: number; enemyHpLoss?: number;
  delayed: { target: string; amount: number; due: number; label: string }[];
  burns: { source: string; amount: number; ticks: number }[];
};
export const talentState = (unit: RuleUnit): TalentBattleState => unit.state.talent ??= {
  clock: 0, serial: 0, seen: [], hit: [], chain: 0, attacks: 0, normal: 0, stacks: 0, core: false, delayed: [], burns: []
};
export const hasTalent = (unit: Pick<RuleUnit,'companion'|'opening'>, id: string) => !unit.companion && unit.opening?.pve === true && unit.opening.divines.includes(talentCode(id) ?? '');
/** Expose the normal-action queue to ordinary cleansing without using global-turn DOT ticks. */
export const talentBurnEffects = (unit: RuleUnit, turn: number): RuleStatus[] => (unit.state.talent?.burns ?? []).filter(b=>b.ticks>0).map(b=>({code:'talent_suzaku_burn',value:b.amount,until:turn+b.ticks-1,source:b.source,debuff:true,stacks:1,data:'talentSuzaku'}));
export const talentOpeningShield = (unit: RuleUnit) => {
  const state = talentState(unit);
  if (hasTalent(unit, 'G02') && !state.stoneGranted) {
    state.stoneGranted = true;
    state.stoneShield = Math.floor(unit.hpMax * .5);
  }
};
const rootKey = (unit: RuleUnit) => String(unit.state.memory.talentRoot ?? unit.key);
const elemental = (element: string) => Boolean(element && !['无', '奥术', '物理', '真实'].includes(element));
export const fireActive = (unit: RuleUnit) => hasTalent(unit, 'H10') && talentState(unit).fireUntil !== undefined && talentState(unit).clock <= talentState(unit).fireUntil!;

export const talentSupport = (source: RuleUnit, target: RuleUnit) => {
  if (source.key !== target.key && source.side === target.side && hasTalent(target, 'H08')) talentState(target).noAid = false;
};
export const talentReceiveHealing = (source: RuleUnit, target: RuleUnit) => {
  talentSupport(source, target);
  return fireActive(target) ? 0 : hasTalent(target, 'H02') && source.key !== target.key ? .5 : 1;
};
export const talentSpellHealing = (source: RuleUnit, target = source) => {
  let factor = hasTalent(source, 'A02') ? 1.5 : hasTalent(source, 'F05') && source.key !== target.key ? 1.8 : 1;
  if (hasTalent(source, 'G04')) factor *= 1.2;
  if (hasTalent(source, 'H02') && talentState(source).action?.low) factor *= 2;
  if (hasTalent(source, 'H04') && talentState(source).action?.prayer) factor *= 3.5;
  if (hasTalent(source, 'G10') && talentState(source).phase === '星辉') factor *= 2;
  return factor;
};
export const talentManaFactor = (unit: Pick<RuleUnit,'companion'|'opening'>) => hasTalent(unit, 'A03') ? 2 / 3 : hasTalent(unit, 'G04') ? .8 : hasTalent(unit, 'H08') ? 1.25 : 1;

/** Called once per actual owner action, including a skipped normal action. Extra actions do not advance clocks. */
export const talentBeginAction = async (rules: CombatRules, unit: RuleUnit, extra = false) => {
  const state = talentState(unit);
  talentOpeningShield(unit);
  state.leech = 0;
  if (!extra) {
    state.clock++;
    unit.state.statuses=unit.state.statuses.filter(e=>e.data!=='talentDefend');
    if (hasTalent(unit, 'G10')) state.phase = state.phase ? state.phase === '星辉' ? '星隐' : '星辉' : String(unit.opening?.settings?.phase ?? '星辉');
    for (const pending of state.delayed.filter(p => p.due <= state.clock)) {
      const target = rules.units.find(u => u.key === pending.target && u.hp > 0);
      if (target && unit.hp > 0) await rules.take(target, pending.amount, 1, unit);
    }
    state.delayed = state.delayed.filter(p => p.due > state.clock);
    if (hasTalent(unit, 'I05') && state.normal > 0 && state.normal % 2 === 0 && state.shadowedNormal !== state.normal && state.lastBasic) {
      state.shadowedNormal = state.normal;
      const target = rules.units.find(u => u.key === state.lastBasic!.target && u.hp > 0);
      if (target) { await rules.take(target, Math.floor(state.lastBasic.damage * 1.5), 1, unit); rules.log.push(`　➥${unit.name}的影子代班。`); }
    }
    for (const burn of state.burns) {
      if (unit.hp <= 0) break;
      const owner = rules.units.find(u => u.key === burn.source);
      const factor = rules.elementFactor({ ...(owner ?? unit), mastery: {} }, unit, '火');
      if (rules.status(unit, 'time_guard')) rules.log.push(`　➥${unit.name}免疫朱雀灼烧。`);
      else {
        const before = unit.hp;
        await rules.takeUnlinked(unit, Math.floor(burn.amount * factor * (hasTalent(unit, 'G07') ? .35 : 1)), 1, owner);
        rules.log.push(`　&朱雀灼烧&${unit.name}持续损失 ${before-unit.hp} HP。`);
      }
      burn.ticks--;
    }
    state.burns = state.burns.filter(b => b.ticks > 0);
  }
  if (hasTalent(unit, 'H08')) {
    const aided = rules.units.some(u => u.key !== unit.key && u.side === unit.side && u.participating !== false);
    const outside = rules.effects(unit).some(e => !e.debuff && e.source && e.source !== unit.key);
    state.noAid = state.noAid !== false && !aided && !outside;
  }
  state.action = { serial: ++state.serial, kind: 'none', single: true, damageType: '', ranged: false, extra, low: unit.hp <= unit.hpMax * .3, fire: fireActive(unit), prayer: false, core: false, hits: {}, first: {}, struck: {} };
};

export const talentCommitAction = (unit: RuleUnit, kind: string, damageType = '', single = true, ranged = false, prayer = false) => {
  const state = talentState(unit); if (!state.action) return;
  Object.assign(state.action, { kind, damageType, single, ranged, prayer });
  if (kind === 'attack' || kind === 'skill') {
    state.attacks++;
    state.action.core = state.core; state.core = false;
  } else { state.chain = 0; state.chainRoot = undefined; }
};
export const talentCanPaySkill = (unit: RuleUnit, harmful: boolean) => !hasTalent(unit, 'H03') || !harmful || unit.hp > Math.max(1, Math.ceil(unit.hpMax * .08));
export const talentPaySkill = (unit: RuleUnit, harmful: boolean) => {
  if (!talentCanPaySkill(unit, harmful)) throw new Error('焚命者需要先支付8%最大HP，并保留至少1HP。');
  if (hasTalent(unit, 'H03') && harmful) unit.hp -= Math.max(1, Math.ceil(unit.hpMax * .08));
};
export const talentAttackAttempt = (source: RuleUnit, target: RuleUnit) => {
  const state = talentState(source), action = state.action;
  if (!action || !['attack', 'skill'].includes(action.kind) || source.side === target.side) return;
  const root = rootKey(target);
  if (!(root in action.first)) {
    action.first[root] = !state.seen.includes(root);
    if (!state.seen.includes(root)) state.seen.push(root);
    if (hasTalent(source, 'A07')) { state.chain = state.chainRoot === root ? Math.min(5, state.chain + 1) : 1; state.chainRoot = root; }
  }
};
export const talentDirectFactor = (source: RuleUnit, target: RuleUnit, magic: boolean, skill: boolean, _element: string) => {
  if (source.side === target.side) return 1;
  const state = talentState(source), action = state.action;
  if (!action || !['attack', 'skill'].includes(action.kind)) return 1;
  const root = rootKey(target); let f = 1;
  if (hasTalent(source, 'A01')) f *= 1.5;
  if (hasTalent(source, 'F07')) f *= 1.25 + .25 * Math.min(5, state.kills?.length ?? 0);
  if (hasTalent(source, 'A04')) f *= state.hit.includes(root) ? 1.25 : 3;
  if (hasTalent(source, 'A05')) f *= state.previousType && state.previousType !== action.damageType ? 1.6 : 1.1;
  if (hasTalent(source, 'A06') || hasTalent(source, 'G03')) f *= 1.25;
  if (hasTalent(source, 'A07')) f *= .9 + .2 * Math.max(1, state.chain);
  if (hasTalent(source, 'A08') && state.defend) f *= 3;
  if (hasTalent(source, 'A09') && action.ranged) f *= 1.65;
  if (hasTalent(source, 'F04') && ['斩击','刺击'].includes(action.damageType)) f *= 1.7;
  if (hasTalent(source, 'F09') && target.hp > target.hpMax / 2) f *= 2;
  if (hasTalent(source, 'G04') && magic) f *= 1.2;
  if (hasTalent(source, 'G10') && state.phase === '星辉') f *= 2;
  if (hasTalent(source, 'H01')) f *= 2.25;
  if (hasTalent(source, 'H02') && action.low) f *= 2;
  if (hasTalent(source, 'H03') && skill) f *= 2;
  if (hasTalent(source, 'H04') && action.prayer && magic) f *= 3;
  if (hasTalent(source, 'H05')) f *= action.first[root] ? action.single ? 5 : 1 : .75;
  if (hasTalent(source, 'H07') && source.opening?.accessories === 0 && !state.poorBroken) f *= 2;
  if (hasTalent(source, 'H08') && state.noAid) f *= 2.5;
  if (hasTalent(source, 'H10') && action.fire && !action.extra) f *= 3;
  if (hasTalent(source, 'I01')) f *= .9;
  if (hasTalent(source, 'D07') && source.opening?.settings?.peaceFailure && state.clock <= 2) f *= .5;
  return f;
};
export const talentIncomingFactor = (source: RuleUnit, target: RuleUnit, element: string) => {
  if (source.side === target.side || element === '真实') return 1;
  let f = 1;
  if (hasTalent(target, 'A06')) f *= 5 / 6;
  if (hasTalent(target, 'G07')) f *= .8;
  if (hasTalent(target, 'G08')) f *= .93 ** talentState(target).stacks;
  if (hasTalent(target, 'G09') && elemental(element)) f *= 5 / 6;
  if (hasTalent(target, 'G10') && talentState(target).phase === '星隐') f *= .5;
  return f;
};

/** HP loss is bounded before writing the unit or firing death/after-damage hooks. */
export const talentHpDamage = (unit: RuleUnit, damage: number) => {
  if (!hasTalent(unit, 'H10') || damage <= 0 || unit.hp <= 0) return damage;
  const state = talentState(unit);
  if (!state.fireUsed && unit.hp - damage <= unit.hpMax * .2) {
    state.fireUsed = true; state.fireUntil = state.clock + 2; state.fireCost = true;
  }
  return fireActive(unit) ? Math.min(damage, Math.max(0, unit.hp - 1)) : damage;
};
export const talentRecordEnemyDamage = (source: RuleUnit | undefined, target: RuleUnit, loss: number) => {
  if (source && source.side !== target.side && hasTalent(target, 'C06') && loss > 0)
    talentState(target).enemyHpLoss = (talentState(target).enemyHpLoss ?? 0) + loss;
};
export const talentAfterHit = async (rules: CombatRules, source: RuleUnit, target: RuleUnit, hpLoss: number, absorbed: number, element: string, extra: boolean, magic: boolean) => {
  talentRecordEnemyDamage(source, target, hpLoss);
  if (source.side === target.side || extra || hpLoss + absorbed <= 0) return;
  if (hasTalent(target, 'F03') && hpLoss > 0 && target.hp > 0 && source.hp > 0) {
    await rules.secondary(target, source, Math.floor(hpLoss * .5), '玄武反震');
  }
  if (hasTalent(target, 'G08')) talentState(target).stacks = Math.min(8, talentState(target).stacks + 1);
  if (hasTalent(target, 'G09') && elemental(element)) talentState(target).core = true;
  const state = talentState(source), action = state.action;
  if (!action || !['attack','skill'].includes(action.kind)) return;
  if(target.state.memory.talentPacified)return;
  const root = rootKey(target);
  if(hasTalent(source,'F04')&&root===target.key&&target.hp<=0&&Math.abs(target.level-source.level)<=5)source.state.memory.talentWeakness=1;
  // The two halves of an IOU use the same resolved amount; each meets the shield at its own due time.
  action.hits[target.key] = (action.hits[target.key] ?? 0) + Math.max(0, hpLoss + (hasTalent(source, 'I01') ? absorbed : 0));
  action.struck[root] = true;
  if (!action.extra && hasTalent(source, 'G01') && !magic && hpLoss > 0) state.leech = (state.leech ?? 0) + hpLoss * .5;
  if (hasTalent(source, 'F07') && !action.extra && hpLoss > 0 && target.hp <= 0 && root === target.key && Math.abs(target.level - source.level) <= 5) {
    const kills = state.kills ??= [];
    if (!kills.includes(root)) {
      kills.push(root);
      await rules.restore(source, source, source.hpMax * .25, 0, true, source.hpMax * .25);
      rules.log.push(`　➥${source.name}吞纳战意，直击倍率升至${(1.25 + .25 * Math.min(5, kills.length)).toFixed(2)}。`);
    }
  }
  if (hasTalent(source, 'F09') && root === target.key && target.hp <= 0 && !target.state.memory.talentPacified && Math.abs(target.level-source.level) <= 5 && rules.once(source, `talentDevour:${root}`,true) && rules.once(source, 'talentDevourRound')) await rules.restore(source, source, source.hpMax*.08, 0, true, source.hpMax*.08);
};
export const talentEndAction = async (rules: CombatRules, unit: RuleUnit) => {
  const state = talentState(unit), action = state.action; if (!action) return;
  const grouped = new Map<string, { target: RuleUnit; amount: number }>();
  for (const [key, amount] of Object.entries(action.hits)) {
    const target = rules.units.find(u => u.key === key); if (!target) continue;
    const root = rootKey(target), old = grouped.get(root);
    if (!old || amount > old.amount) grouped.set(root, { target: rules.units.find(u => u.key === root) ?? target, amount });
  }
  for (const { target, amount } of grouped.values()) {
    if (hasTalent(unit, 'F01') && target.hp > 0) {
      const ts = talentState(target), previous = ts.burns.find(b => b.source === unit.key);
      ts.burns = ts.burns.filter(b => b.source !== unit.key);
      const correction=tenacityContest(unit.pierce,target.tenacity*(1+rules.value(target,'tenacity')/100),unit.level-target.level,100).damageOverTimeMultiplier;
      if(amount>0||previous)ts.burns.push({ source: unit.key, amount: Math.max(previous?.amount ?? 0, amount*.025*correction), ticks: 2 });
    }
    if (hasTalent(unit, 'F06') && state.attacks % 3 === 0) state.delayed.push({ target: target.key, amount: Math.floor(amount*2.1), due: state.clock+1, label: '烛龙回响' });
    if (hasTalent(unit, 'I01')) state.delayed.push({ target: target.key, amount, due: state.clock+1, label: '因果欠条' });
    if (hasTalent(unit, 'G09') && action.core && target.hp > 0) await rules.take(target, Math.floor(amount*.4), 1, unit);
    if (hasTalent(unit, 'F10') && !action.extra && unit.hp > 0 && target.hp > 0 && amount > 0) await rules.secondary(unit, target, Math.floor(amount * .5), '应龙风压');
  }
  for (const root of Object.keys(action.struck)) if (!state.hit.includes(root)) state.hit.push(root);
  if (action.kind === 'attack' || action.kind === 'skill') { state.previousType = action.damageType; state.defend = false; }
  if (action.kind === 'defend') state.defend = true;
  if (!action.extra) {
    if (unit.hp > 0 && action.kind !== 'none') {
      state.completed = (state.completed ?? 0) + 1;
      if (hasTalent(unit, 'G01') && (state.leech ?? 0) > 0) await rules.restore(unit, unit, state.leech!, 0, true, Math.floor(unit.hpMax * .2));
      if (hasTalent(unit, 'G02')) state.stoneShield = Math.min(Math.floor(unit.hpMax * .5), (state.stoneShield ?? 0) + Math.floor(unit.hpMax * .05));
    }
    if(action.kind !== 'none') state.normal++;
    if (action.kind === 'attack') {
      const hit = [...grouped.values()][0]; state.lastBasic = hit ? { target: hit.target.key, damage: hit.amount } : undefined;
    }
    if (state.fireUntil !== undefined && state.clock >= state.fireUntil) talentFinishFire(unit);
    if(Number(unit.state.memory.talentBottleUntil??Infinity)<=state.clock){delete unit.state.memory.talentBottleShield;delete unit.state.memory.talentBottleUntil;}
  }
  state.action = undefined;
};
export const talentFinishFire = (unit: RuleUnit) => {
  const state = talentState(unit); delete state.fireUntil;
  if (state.fireCost && unit.hp > 0) unit.hp = Math.max(1, unit.hp - Math.floor(unit.hpMax*.1));
  state.fireCost = false;
};

/** Old native skills also write the shared row directly; deny healing in that path too. */
export const installTalentHealingGuard = (unit: RuleUnit, row: Record<string, any>) => {
  if (!hasTalent(unit,'H10')) return;
  let hp = Number(row.current_hp);
  Object.defineProperty(row,'current_hp',{enumerable:true,configurable:true,get:()=>hp,set:(next:number)=>{
    if (next > hp && fireActive(unit)) return;
    if(next>=1&&next<hp&&next<=unit.hpMax*.2&&!talentState(unit).fireUsed){const state=talentState(unit);state.fireUsed=true;state.fireUntil=state.clock+2;state.fireCost=true;}
    hp = Math.max(0,Math.floor(next));
  }});
};
