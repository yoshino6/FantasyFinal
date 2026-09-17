import type { CombatRules, RuleUnit } from './combat-rule-registry';
import type { BossPhaseTransition } from './kingbeast.config';
import { regionalV2SkillProfiles } from './regional-boss-v2.config';

export const regionalV2Codes = ['gruen_mountainheart', 'valk_forge_overseer'] as const;
export type RegionalV2Code = typeof regionalV2Codes[number];
export const isRegionalV2 = (code: unknown): code is RegionalV2Code => regionalV2Codes.includes(code as RegionalV2Code);
export type RegionalAction = 'attack' | 'damage_skill' | 'support_skill' | 'sustain' | 'defend';
export type FurnaceOrder = 'light' | 'heavy' | 'hold';
export const furnaceOrderNames: Record<FurnaceOrder, string> = { light: '轻锤令', heavy: '重锻令', hold: '固炉令' };
export type RegionalState = {
  version: 2; code: RegionalV2Code; phase: number; slot: number; pressure: number; heat: number;
  warningAt: number; unstableUntil: number; unstableReset: number; peeledTurn: number; reliefs: number;
  weight: Record<string, number>; weightTarget: string; rubble: Record<string, number>;
  orders: Record<string, FurnaceOrder>; previousOrders: Record<string, FurnaceOrder>; actions: Record<string, RegionalAction>;
  orderDue: number; foreman: string; foremanCursor: number; scars: Record<string, number>; obeyed: Record<string, boolean>;
  cancelProcess: boolean; lastCancel: boolean; breachUntil: number; fullFires: number; lastFullFire: boolean;
  overloadAt: number; revolt: boolean; revoltWon: boolean; revoltRetry: number; recastUsed: boolean;
  chainMarked: string[];
};
export const newRegionalState = (code: RegionalV2Code): RegionalState => ({
  version: 2, code, phase: 1, slot: 0, pressure: 20, heat: 40, warningAt: 0, unstableUntil: 0, unstableReset: 0, peeledTurn: 0, reliefs: 0,
  weight: {}, weightTarget: '', rubble: {}, orders: {}, previousOrders: {}, actions: {}, orderDue: 0, foreman: '', foremanCursor: 0, scars: {}, obeyed: {},
  cancelProcess: false, lastCancel: false, breachUntil: 0, fullFires: 0, lastFullFire: false, overloadAt: 0,
  revolt: false, revoltWon: false, revoltRetry: 0, recastUsed: false, chainMarked: []
});
export const readRegionalState = (cooldowns: Record<string, unknown>): RegionalState | undefined => {
  const value = cooldowns.regional_encounter_v2 as RegionalState | undefined;
  return value?.version === 2 && isRegionalV2(value.code) ? value : undefined;
};
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export const pressureChange = (action: RegionalAction, weighted = false) => {
  const base = { attack: 6, damage_skill: 10, support_skill: -8, sustain: -8, defend: -18 }[action];
  return base + (weighted ? action === 'defend' ? -8 : base > 0 ? 4 : 0 : 0);
};
export const obeysFurnaceOrder = (order: FurnaceOrder, action: RegionalAction) => order === 'light' ? action === 'attack'
  : order === 'heavy' ? action === 'damage_skill' || action === 'support_skill' : action === 'defend' || action === 'sustain';
export const nextFurnaceOrder = (previous: FurnaceOrder | undefined, canSkill: boolean, seed: number): FurnaceOrder => {
  const choices = (['light', 'heavy', 'hold'] as FurnaceOrder[]).filter(order => order !== previous && (canSkill || order !== 'heavy'));
  return choices[Math.abs(seed) % choices.length]!;
};
export const regionalIncomingFactor = (state: RegionalState, turn: number) => state.code === 'gruen_mountainheart'
  ? (state.pressure < 30 ? .8 : state.pressure < 60 ? 1 : state.pressure < 85 ? 1.25 : state.phase === 3 ? 1.65 : 1.5)
    * (state.unstableUntil >= turn ? 1.25 : 1) * (state.peeledTurn === turn ? 1.1 : 1)
  : (state.heat < 30 ? 1.1 : 1) * (state.breachUntil >= turn ? 1.25 : 1);
export const regionalOutgoingFactor = (state: RegionalState, fire: boolean) => state.code === 'gruen_mountainheart'
  ? state.pressure < 30 ? .9 : state.pressure < 60 ? 1 : state.pressure < 85 ? 1.15 : 1.3
  : state.heat < 30 ? .85 : state.revoltWon || !fire ? 1 : state.heat < 60 ? 1 : state.heat < 85 ? 1.2 : 1.35;
export const installRegionalV2Damage = (rules: CombatRules, battles: RegionalBossBattle[]) => {
  if (!battles.length) return;
  const byKey = new Map(battles.map(battle => [battle.boss.key, battle]));
  const previousLink = rules.hooks.linkDamage; const previousDirect = rules.hooks.directMultiplier;
  rules.hooks.linkDamage = async (unit, amount, apply, area, source, secondary) => {
    const battle = byKey.get(unit.key);
    const scaled = Math.floor(amount * (battle && source !== unit ? regionalIncomingFactor(battle.state, rules.turn) : 1));
    return previousLink ? previousLink(unit, scaled, apply, area, source, secondary) : apply(scaled);
  };
  rules.hooks.directMultiplier = (source, target, element, magic, single, type) => {
    const battle = byKey.get(source.key);
    const factor = battle ? regionalOutgoingFactor(battle.state, element === '火') * (source.bossEffects?.includes('mountainheart_resonance') && battle.state.pressure >= 60 ? 1.5 : 1) : 1;
    return factor * (previousDirect?.(source, target, element, magic, single, type) ?? 1);
  };
};
export const regionalStateSummary = (state: RegionalState, names: Record<string, string> = {}, turn = 0) => {
  if (state.code === 'valk_forge_overseer') return `炉温 ${state.heat}/${state.revoltWon ? 80 : 100}${state.overloadAt ? '｜封炉蓄势' : ''}\n${Object.keys(names).map(key => `${names[key]}：${state.orders[key] ? furnaceOrderNames[state.orders[key]!] : '待派令'}｜鞭痕${state.scars[key] ?? 0}${state.foreman === key ? '｜领班' : ''}`).join('\n')}`;
  const marks = Object.keys(names).flatMap(key => {
    const labels = [state.weight[key] && state.weight[key]! >= turn ? '承重点' : state.weightTarget === key ? '追震余痕' : '', state.rubble[key] ? `碎岩${state.rubble[key]}` : ''].filter(Boolean);
    return labels.length ? [`${names[key]}：${labels.join('｜')}`] : [];
  });
  return [`地脉压力 ${state.pressure}/100｜${state.pressure < 30 ? '沉静' : state.pressure < 60 ? '开裂' : state.pressure < 85 ? '断层' : '临界'}${state.warningAt ? '｜地脉震颤' : ''}`, ...marks].join('\n');
};

export type RegionalOrderResult = { effective: string[]; rebels: string[]; threshold: number; success: boolean; totalRevolt: boolean; wounds: Array<{ key: string; fraction: number }> };
/** 按完整玩家轮结算；未实际行动者没有记录，不进入分母。 */
export const settleFurnaceOrders = (state: RegionalState): RegionalOrderResult => {
  const effective = Object.keys(state.orders).filter(key => state.actions[key]);
  const rebels: string[] = []; const wounds: RegionalOrderResult['wounds'] = [];
  state.obeyed = {};
  for (const key of effective) {
    const obeyed = obeysFurnaceOrder(state.orders[key]!, state.actions[key]!); state.obeyed[key] = obeyed;
    const foreman = key === state.foreman;
    state.scars[key] = clamp((state.scars[key] ?? 0) + (obeyed ? foreman ? -2 : -1 : 1), 0, 4);
    state.heat += obeyed ? foreman ? 13 : 8 : -12;
    if (!obeyed) { rebels.push(key); wounds.push({ key, fraction: .02 * state.scars[key]! * (foreman ? 1.5 : 1) }); }
  }
  // 同轮炉温净变化统一限幅，避免队员排序改变过载结果。
  state.heat = clamp(state.heat, 0, state.revoltWon ? 80 : 100);
  const threshold = state.revolt ? effective.length : Math.ceil(effective.length / 2);
  const votes = rebels.length + (!state.revolt && rebels.includes(state.foreman) ? 1 : 0);
  const success = effective.length > 0 && votes >= threshold;
  const totalRevolt = success && state.revolt;
  if (success) {
    state.heat = Math.max(0, state.heat - 15);
    const grantCancel = !state.lastCancel; state.cancelProcess ||= grantCancel; state.lastCancel = grantCancel;
    state.lastFullFire = false; state.overloadAt = 0;
    if (totalRevolt) { state.revoltWon = true; state.revolt = false; state.scars = {}; state.heat = Math.min(80, state.heat); }
  } else {
    state.lastCancel = false; state.lastFullFire = effective.length > 0 && rebels.length === 0;
    if (rebels.length) for (const key of rebels) wounds.push({ key, fraction: .06 });
  }
  state.orders = {}; state.actions = {}; state.orderDue = 0;
  return { effective, rebels, threshold, success, totalRevolt, wounds };
};

/** 只使用会话 cooldowns，不写人物或世界状态；各大回合重新绑定。 */
export class RegionalBossBattle {
  readonly state: RegionalState;
  constructor(readonly rules: CombatRules, readonly boss: RuleUnit, code: RegionalV2Code,
    readonly announce: (event: BossPhaseTransition) => void,
    readonly canSkill: (unit: RuleUnit) => Promise<boolean> = async unit => unit.mp > 0,
    readonly rescue: (unit: RuleUnit) => Promise<void> = async () => {}) {
    this.state = readRegionalState(boss.cooldowns) ?? newRegionalState(code);
    boss.cooldowns.regional_encounter_v2 = this.state;
  }
  players() { return this.rules.units.filter(unit => unit.side === 'member' && unit.key.startsWith('member:') && unit.hp > 0); }
  beginRound() {
    const s = this.state;
    if (s.unstableReset && this.rules.turn > s.unstableUntil) { s.pressure = s.unstableReset; s.unstableReset = 0; }
  }
  event(code: string, title: string, description: string, kind: 'phase' | 'chant' = 'chant') {
    this.announce({ code, title, description, kind, dialogue: [], effect: '' });
  }
  async mechanism(unit: RuleUnit, fraction: number, title: string) {
    if (unit.hp <= 0) return;
    const before = unit.hp; await this.rules.takeHit(unit, Math.floor(unit.hpMax * fraction), 1, false, this.boss, true);
    await this.rescue(unit); this.rules.log.push(`　&${title}&${unit.name}损失 ${Math.max(0, before - unit.hp)} HP(${before}→${unit.hp})`);
  }
  async strike(targets: RuleUnit[], power: number, name: string, element = '土', magic = false, factor = 1) {
    const profile = regionalV2SkillProfiles[name];
    const hits = new Set<string>();
    this.rules.log.push(`➤【${this.boss.name}】释放「${name}」`);
    await this.rules.areaDamage(targets, async target => {
      if (target.hp <= 0) return;
      const hit = await this.rules.strike(this.boss, target, profile?.power ?? power, element, magic, false, false, 1, {
        skill: name !== '停炉后的挥锤', single: (profile?.ratio ?? 1) === 1 && targets.length === 1, finalMultiplier: factor * (profile?.ratio ?? 1),
        penetration: this.boss.bossEffects?.includes('mountainheart_resonance') && this.state.pressure >= 60 ? 25 : 0
      });
      if (hit) hits.add(target.key);
      await this.rescue(target);
    });
    return hits;
  }
  async changePressure(delta: number) {
    const s = this.state; const old = s.pressure; s.pressure = clamp(old + delta, s.phase === 3 ? 15 : 0);
    if (s.phase >= 2 && s.pressure >= 60) s.peeledTurn = this.rules.turn;
    if (old < 85 && s.pressure >= 85) this.event('gruen_critical', '山麓下沉', '山体裂隙完全张开，脚下的山麓正在下沉。');
    if (s.pressure < 100) return;
    this.rules.log.push('&失控山崩&山体在格鲁恩行动前提前崩塌！');
    for (const unit of this.players()) {
      await this.rules.remove(unit, effect => ['shield', 'life_shield'].includes(effect.code) && !effect.mechanism);
      await this.mechanism(unit, .35, '失控山崩');
      if (unit.hp > 0) { this.rules.add(unit, 'slow', 25, s.phase === 3 ? 2 : 1, this.boss, true); this.rules.add(unit, 'exposed', 15, s.phase === 3 ? 2 : 1, this.boss, true); }
    }
    s.pressure = 35;
  }
  async playerAction(unit: RuleUnit, action: RegionalAction) {
    if (this.boss.hp <= 0) return;
    const s = this.state;
    if (s.code === 'gruen_mountainheart') {
      if (action === 'defend') s.rubble[unit.key] = Math.max(0, (s.rubble[unit.key] ?? 0) - 1);
      await this.changePressure(pressureChange(action, (s.weight[unit.key] ?? 0) >= this.rules.turn));
    } else if (s.orders[unit.key] && s.orderDue <= this.rules.turn && !s.actions[unit.key]) s.actions[unit.key] = action;
  }
  async issueOrders(revolt = false) {
    const s = this.state; const players = this.players();
    s.orders = {}; s.actions = {}; s.orderDue = this.rules.turn + 1; s.revolt = revolt;
    for (const unit of players) {
      const order = revolt ? 'hold' : nextFurnaceOrder(s.previousOrders[unit.key], await this.canSkill(unit), this.rules.turn + Number(unit.key.split(':')[1]));
      s.orders[unit.key] = order; s.previousOrders[unit.key] = order;
    }
    s.foreman = s.phase >= 2 && players.length ? players[s.foremanCursor++ % players.length]!.key : '';
    this.event(revolt ? 'valk_revolt_orders' : 'valk_orders', revolt ? '禁攻令' : '监工派令',
      `${revolt ? '瓦尔克焊死炉门，厉声喝令全员固炉！' : '瓦尔克敲响监工钟。'}\n${players.map(unit => `${unit.name}：${furnaceOrderNames[s.orders[unit.key]!]}${s.foreman === unit.key ? '（领班）' : ''}`).join('\n')}`);
  }
  async settleOrders() {
    const s = this.state; if (!s.orderDue || s.orderDue > this.rules.turn) return;
    const wasRevolt = s.revolt; const result = settleFurnaceOrders(s);
    for (const wound of result.wounds) { const unit = this.rules.units.find(unit => unit.key === wound.key); if (unit) await this.mechanism(unit, wound.fraction, '监工鞭痕'); }
    if (result.success) {
      s.breachUntil = this.rules.turn + 1;
      this.rules.log.push('&集体停炉&违令者彼此响应，传动轴开始停转，瓦尔克露出破绽！');
      if (result.totalRevolt) { this.boss.defense *= .8; this.boss.magicDefense *= .8; this.event('valk_revolt_won', '炉门崩毁', '炉门在众人的反抗中轰然倒塌，鞭痕上的火光尽数熄灭。', 'phase'); }
    } else if (result.rebels.length) this.rules.log.push('&孤立违令&没有足够同伴响应，违令者遭到监工单独惩戒。');
    else if (result.effective.length && s.fullFires < 2) { s.fullFires++; this.boss.hp = Math.min(this.boss.hpMax, this.boss.hp + Math.floor(this.boss.hpMax * .03)); this.rules.log.push('&满额开炉&炉火为瓦尔克重新锻合伤口。'); }
    if (wasRevolt && !result.success) { s.revolt = false; s.revoltRetry = this.rules.turn + 2; }
    await this.checkOverload();
  }
  async checkOverload() {
    const s = this.state;
    s.heat = clamp(s.heat, 0, s.revoltWon ? 80 : 100);
    if (s.heat === 100 && !s.overloadAt) {
      s.overloadAt = this.rules.turn + 1;
      this.event('valk_overload', '封炉清算·蓄势', '熔炉已经过载，瓦尔克封闭炉口，白热的光芒正从门缝中透出。');
      await this.issueOrders(s.revolt);
    }
  }
  async endRound() {
    const s = this.state; if (this.boss.hp <= 0) return;
    if (s.code === 'valk_forge_overseer') await this.settleOrders();
    if (s.unstableReset && this.rules.turn >= s.unstableUntil) { s.pressure = s.unstableReset; s.unstableReset = 0; }
    const ratio = this.boss.hp / this.boss.hpMax;
    const phase = s.code === 'gruen_mountainheart' ? ratio <= .35 ? 3 : ratio <= .70 ? 2 : 1 : ratio <= .30 ? 3 : ratio <= .65 ? 2 : 1;
    if (phase > s.phase) {
      s.phase = phase;
      if (s.code === 'gruen_mountainheart' && phase === 3) { s.pressure = Math.max(15, s.pressure); s.slot = Math.max(0, s.slot - 1); }
      this.event(`${s.code}_phase_${phase}`, s.code === 'gruen_mountainheart' ? phase === 3 ? '山心裸露' : '断层裸露' : phase === 3 ? '总罢工' : '强制加班',
        s.code === 'gruen_mountainheart' ? '巨大的岩层从格鲁恩身上剥落，裸露的山心震动着整片山麓。' : '瓦尔克扯断炉旁的铁索，将烧红的监工钟狠狠砸响。', 'phase');
      if (s.code === 'valk_forge_overseer' && phase === 3) await this.issueOrders(true);
    }
    if (s.code === 'valk_forge_overseer' && s.revoltRetry && this.rules.turn >= s.revoltRetry && !s.revoltWon) { s.revoltRetry = 0; await this.issueOrders(true); }
  }
  async bossTurn(victim: RuleUnit) {
    const s = this.state; if (this.boss.hp <= 0) return;
    if (s.code === 'gruen_mountainheart') return this.gruenTurn(victim);
    await this.settleOrders();
    if (s.overloadAt && this.rules.turn >= s.overloadAt) {
      await this.strike(this.players(), 115, '封炉清算', '火', true);
      for (const unit of this.players()) s.scars[unit.key] = Math.min(4, (s.scars[unit.key] ?? 0) + 1);
      if (this.boss.bossEffects?.includes('everburning_embers')) for (const unit of this.players()) this.rules.add(unit, 'burn', 5, 3, this.boss, true);
      s.heat = this.boss.bossEffects?.includes('everburning_embers') ? 75 : 55; s.overloadAt = 0; return;
    }
    if (s.orderDue > this.rules.turn) return; // 本轮刚启动清算，完整响应窗口内不抢先攻击。
    const slot = s.slot++ % 3;
    if (slot === 0) { await this.issueOrders(); return; }
    const players = this.players();
    const highestScar = [...players].sort((a, b) => (s.scars[b.key] ?? 0) - (s.scars[a.key] ?? 0) || a.key.localeCompare(b.key))[0] ?? victim;
    const inspected = players.find(unit => s.phase >= 2 && unit.key === s.foreman) ?? highestScar;
    const inspectionTarget = s.obeyed[inspected.key] ? victim : inspected;
    if (slot === 1) {
      const target = inspectionTarget;
      await this.strike([target], 105, '赤铁抽检', '无', false, 1 + .12 * (s.scars[target.key] ?? 0));
    } else if (s.cancelProcess) { s.cancelProcess = false; await this.strike([victim], 65, '停炉后的挥锤', '无'); }
    else if (s.heat < 30) { await this.strike([victim], 105, '冷砧回火', '无'); this.rules.add(this.boss, 'defense', 15, 1, this.boss); this.rules.add(this.boss, 'magic_defense', 15, 1, this.boss); }
    else if (s.heat < 60) { await this.strike(players, 75, '赤铁横锻', '无'); this.rules.add(victim, 'armor_shatter', 10, 2, this.boss, true); }
    else if (s.heat < 85) { await this.strike(players, 80, '炉渣喷流', '火', true); for (const unit of this.players()) this.rules.add(unit, 'burn', 3, 2, this.boss, true); }
    else {
      await this.strike([highestScar], 115, '白热裁决', '火', true);
      await this.strike(players.filter(unit => unit !== highestScar), 115, '白热溅射', '火', true, .55);
    }
    if (this.boss.bossEffects?.includes('soul_chain_forging') && slot === 1) {
      // 新连锻不再引用旧部位：抽检后只对其余违令者追加少量鞭痕伤害。
      for (const unit of this.players().filter(unit => s.obeyed[unit.key] === false && (s.scars[unit.key] ?? 0) > 0 && unit !== inspectionTarget)) await this.mechanism(unit, .04, '拘魂连锻');
    }
    s.heat += 10; await this.checkOverload();
  }
  async gruenTurn(victim: RuleUnit) {
    const s = this.state;
    if (s.warningAt) {
      if (this.rules.turn < s.warningAt) return;
      s.warningAt = 0;
      if (s.pressure < 30) {
        s.unstableUntil = this.rules.turn + 1; s.unstableReset = s.phase >= 2 ? 25 : 20; s.pressure = 20;
        this.rules.log.push('&逆脉卸力&崩震沿裂隙倒灌，格鲁恩的岩层短暂失稳！');
        if (s.phase === 3 && s.reliefs < 2) { s.reliefs++; await this.mechanism(this.boss, .03, '山心崩裂'); }
        if (this.boss.bossEffects?.includes('leyline_recast') && !s.recastUsed) { s.recastUsed = true; this.rules.add(this.boss, 'shield', this.boss.hpMax * .20, 2, this.boss); this.rules.log.push('&地脉复铸&崩落的岩层重新聚合，覆盖住裸露的山心。'); }
      } else {
        const pressure = s.pressure;
        await this.strike(this.players(), pressure < 60 ? 75 : pressure < 85 ? 100 : 115, pressure < 60 ? '山心崩震' : pressure < 85 ? '断层崩震' : '万壑倾覆');
        for (const unit of this.players()) {
          if (pressure >= 60 && pressure < 85 && s.weightTarget === unit.key) await this.strike([unit], 45, '承重点追震');
          if ((s.rubble[unit.key] ?? 0) >= 2) { s.rubble[unit.key] = 0; await this.strike([unit], 45, '碎岩追震'); }
          if (pressure >= 85) this.rules.add(unit, 'bind', 25, 1, this.boss, true);
        }
        s.pressure = pressure < 60 ? 25 : pressure < 85 ? 30 : 35;
      }
      s.weightTarget = ''; s.slot = 0; return;
    }
    const slot = s.slot++;
    if (s.phase < 3 && slot === 0) {
      const hits = await this.strike([victim], 105, '山脊测重');
      if (hits.has(victim.key) && victim.hp > 0) { s.weight[victim.key] = this.rules.turn + 2; s.weightTarget = victim.key; if (s.phase >= 2) s.rubble[victim.key] = Math.min(2, (s.rubble[victim.key] ?? 0) + 1); }
    } else if (slot === (s.phase < 3 ? 1 : 0)) {
      await this.strike(this.players(), 75, '断层推进', '土', false, 1 + Math.min(.3, Math.floor(Math.max(0, s.pressure - 30) / 10) * .05));
    } else {
      s.warningAt = this.rules.turn + 1;
      this.event('gruen_warning', '地脉预震', '格鲁恩将双臂压入山心，脚下传来沉重的闷响。下一次行动，山心崩震即将爆发。');
    }
  }
}
