import { regionalV2SkillProfiles } from './regional-boss-v2.config.js';

const regionalV2Codes = ['gruen_mountainheart', 'valk_forge_overseer'];
const isRegionalV2 = (code) => regionalV2Codes.includes(code);
const furnaceOrderNames = { light: '轻锤令', heavy: '重锻令', hold: '固炉令' };
const newRegionalState = (code) => ({
    version: 2, code, phase: 1, slot: 0, pressure: 20, heat: 40, warningAt: 0, unstableUntil: 0, unstableReset: 0, peeledTurn: 0, reliefs: 0,
    weight: {}, weightTarget: '', rubble: {}, orders: {}, previousOrders: {}, actions: {}, orderDue: 0, foreman: '', foremanCursor: 0, scars: {}, obeyed: {},
    cancelProcess: false, lastCancel: false, breachUntil: 0, fullFires: 0, lastFullFire: false, overloadAt: 0,
    revolt: false, revoltWon: false, revoltRetry: 0, recastUsed: false, chainMarked: [],
    collapseAt: 0, rockArmorActive: false, reflectionTurn: 0, reflectionTaken: {}, mechanismHealTurn: 0, mechanismHealed: 0,
    scorchAppliedTurn: {}, sealBlockedUntil: {}, coldRound: 0
});
const readRegionalState = (cooldowns) => {
    const value = cooldowns.regional_encounter_v2;
    return value?.version === 2 && isRegionalV2(value.code) ? value : undefined;
};
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const pressureChange = (action, weighted = false) => {
    const base = { attack: 6, damage_skill: 10, support_skill: -8, sustain: -8, defend: -18 }[action];
    return base + (weighted ? action === 'defend' ? -8 : base > 0 ? 4 : 0 : 0);
};
const obeysFurnaceOrder = (order, action) => order === 'light' ? action === 'attack'
    : order === 'heavy' ? action === 'damage_skill' || action === 'support_skill' : action === 'defend' || action === 'sustain';
const nextFurnaceOrder = (previous, canSkill, seed) => {
    const choices = ['light', 'heavy', 'hold'].filter(order => order !== previous && (canSkill || order !== 'heavy'));
    return choices[Math.abs(seed) % choices.length];
};
const regionalIncomingFactor = (state, turn) => state.code === 'gruen_mountainheart'
    ? (state.pressure < 30 ? .8 : state.pressure < 60 ? 1 : state.pressure < 85 ? 1.25 : state.phase === 3 ? 1.65 : 1.5)
        * (state.unstableUntil >= turn ? 1.25 : 1) * (state.peeledTurn === turn ? 1.1 : 1)
    : (state.heat < 30 ? 1.1 : 1) * (state.breachUntil >= turn ? 1.25 : 1);
const regionalOutgoingFactor = (state, fire) => state.code === 'gruen_mountainheart'
    ? state.pressure < 30 ? .9 : state.pressure < 60 ? 1 : state.pressure < 85 ? 1.15 : 1.3
    : state.heat < 30 ? .85 : state.revoltWon || !fire ? 1 : state.heat < 60 ? 1 : state.heat < 85 ? 1.2 : 1.35;
const installRegionalV2Damage = (rules, battles) => {
    if (!battles.length)
        return;
    const byKey = new Map(battles.map(battle => [battle.boss.key, battle]));
    const previousLink = rules.hooks.linkDamage;
    const previousDirect = rules.hooks.directMultiplier;
    const previousStrike = rules.hooks.strikeResolved;
    const previousHealing = rules.hooks.healingMultiplier;
    rules.hooks.linkDamage = async (unit, amount, apply, area, source, secondary) => {
        const battle = byKey.get(unit.key);
        const scaled = Math.floor(amount * (battle && source !== unit ? regionalIncomingFactor(battle.state, rules.turn) : 1));
        return previousLink ? previousLink(unit, scaled, apply, area, source, secondary) : apply(scaled);
    };
    rules.hooks.directMultiplier = (source, target, element, magic, single, type) => {
        const battle = byKey.get(source.key);
        const factor = battle ? regionalOutgoingFactor(battle.state, element === '火') : 1;
        return factor * (previousDirect?.(source, target, element, magic, single, type) ?? 1);
    };
    rules.hooks.strikeResolved = async (source, target, damage, detail) => {
        await previousStrike?.(source, target, damage, detail);
        const battle = byKey.get(target.key);
        if (battle && source.side === 'member' && !detail?.extra)
            await battle.reflectDirect(source, detail?.actualHpDamage ?? 0);
    };
    rules.hooks.healingMultiplier = (source, target) => (previousHealing?.(source, target) ?? 1) * regionalHealingFactor(rules, target);
};
const regionalHealingFactor = (rules, target) => {
    if (rules.status(target, 'valk_heal_seal'))
        return 0;
    return 1 - Math.min(75, 25 * (rules.status(target, 'valk_scorch')?.stacks ?? 0)) / 100;
};
const regionalStateSummary = (state, names = {}, turn = 0) => {
    if (state.code === 'valk_forge_overseer')
        return `炉温 ${state.heat}/${state.revoltWon ? 80 : 100}${state.overloadAt ? '｜封炉蓄势' : ''}\n${Object.keys(names).map(key => `${names[key]}：${state.orders[key] ? furnaceOrderNames[state.orders[key]] : '待派令'}｜鞭痕${state.scars[key] ?? 0}${state.foreman === key ? '｜领班' : ''}`).join('\n')}`;
    const marks = Object.keys(names).flatMap(key => {
        const labels = [state.weight[key] && state.weight[key] >= turn ? '承重点' : state.weightTarget === key ? '追震余痕' : '', state.rubble[key] ? `碎岩${state.rubble[key]}` : ''].filter(Boolean);
        return labels.length ? [`${names[key]}：${labels.join('｜')}`] : [];
    });
    return [`地脉压力 ${state.pressure}/100｜${state.pressure < 30 ? '沉静' : state.pressure < 60 ? '开裂' : state.pressure < 85 ? '断层' : '临界'}${state.warningAt ? '｜地脉震颤' : ''}${state.rockArmorActive ? '｜岩甲逆震' : ''}${state.collapseAt ? '｜山崩锁定' : ''}`, ...marks].join('\n');
};
const settleFurnaceOrders = (state) => {
    const effective = Object.keys(state.orders).filter(key => state.actions[key]);
    const rebels = [];
    const wounds = [];
    state.obeyed = {};
    for (const key of effective) {
        const obeyed = obeysFurnaceOrder(state.orders[key], state.actions[key]);
        state.obeyed[key] = obeyed;
        const foreman = key === state.foreman;
        state.scars[key] = clamp((state.scars[key] ?? 0) + (obeyed ? foreman ? -2 : -1 : 1), 0, 4);
        state.heat += obeyed ? foreman ? 13 : 8 : -12;
        if (!obeyed) {
            rebels.push(key);
            wounds.push({ key, fraction: .02 * state.scars[key] * (foreman ? 1.5 : 1) });
        }
    }
    state.heat = clamp(state.heat, 0, state.revoltWon ? 80 : 100);
    const threshold = state.revolt ? effective.length : Math.ceil(effective.length / 2);
    const votes = rebels.length + (!state.revolt && rebels.includes(state.foreman) ? 1 : 0);
    const success = effective.length > 0 && votes >= threshold;
    const totalRevolt = success && state.revolt;
    if (success) {
        state.heat = Math.max(0, state.heat - 15);
        const grantCancel = !state.lastCancel;
        state.cancelProcess ||= grantCancel;
        state.lastCancel = grantCancel;
        state.lastFullFire = false;
        state.overloadAt = 0;
        if (totalRevolt) {
            state.revoltWon = true;
            state.revolt = false;
            state.scars = {};
            state.heat = Math.min(80, state.heat);
        }
    }
    else {
        state.lastCancel = false;
        state.lastFullFire = effective.length > 0 && rebels.length === 0;
        if (rebels.length)
            for (const key of rebels)
                wounds.push({ key, fraction: .06 });
    }
    state.orders = {};
    state.actions = {};
    state.orderDue = 0;
    return { effective, rebels, threshold, success, totalRevolt, wounds };
};
class RegionalBossBattle {
    rules;
    boss;
    announce;
    canSkill;
    rescue;
    state;
    constructor(rules, boss, code, announce, canSkill = async (unit) => unit.mp > 0, rescue = async () => { }) {
        this.rules = rules;
        this.boss = boss;
        this.announce = announce;
        this.canSkill = canSkill;
        this.rescue = rescue;
        this.state = readRegionalState(boss.cooldowns) ?? newRegionalState(code);
        Object.assign(this.state, {
            collapseAt: this.state.collapseAt ?? 0, rockArmorActive: this.state.rockArmorActive ?? false,
            reflectionTurn: this.state.reflectionTurn ?? 0, reflectionTaken: this.state.reflectionTaken ?? {},
            mechanismHealTurn: this.state.mechanismHealTurn ?? 0, mechanismHealed: this.state.mechanismHealed ?? 0,
            scorchAppliedTurn: this.state.scorchAppliedTurn ?? {}, sealBlockedUntil: this.state.sealBlockedUntil ?? {}, coldRound: this.state.coldRound ?? 0
        });
        boss.cooldowns.regional_encounter_v2 = this.state;
    }
    players() { return this.rules.units.filter(unit => unit.side === 'member' && unit.key.startsWith('member:') && unit.hp > 0); }
    beginRound() {
        const s = this.state;
        if (s.unstableReset && this.rules.turn > s.unstableUntil) {
            s.pressure = s.unstableReset;
            s.unstableReset = 0;
        }
        if (s.code === 'valk_forge_overseer') {
            const duration = this.boss.bossEffects?.includes('everburning_embers') ? 3 : 2;
            for (const unit of this.players()) {
                const pendingScorch = unit.state.statuses.find(effect => effect.code === 'valk_scorch_pending' && effect.until >= this.rules.turn);
                if (pendingScorch) {
                    unit.state.statuses = unit.state.statuses.filter(effect => effect !== pendingScorch);
                    const active = unit.state.statuses.find(effect => effect.code === 'valk_scorch' && effect.until >= this.rules.turn);
                    if (active) {
                        active.stacks = Math.min(3, active.stacks + 1);
                        active.until = Math.max(active.until, this.rules.turn + duration - 1);
                    }
                    else
                        unit.state.statuses.push({ code: 'valk_scorch', value: 25, until: this.rules.turn + duration - 1, source: this.boss.key, debuff: true, stacks: 1 });
                }
                const pendingSeal = unit.state.statuses.find(effect => effect.code === 'valk_heal_seal_pending' && effect.until >= this.rules.turn);
                if (pendingSeal) {
                    unit.state.statuses = unit.state.statuses.filter(effect => effect !== pendingSeal);
                    unit.state.statuses = unit.state.statuses.filter(effect => effect.code !== 'valk_heal_seal');
                    unit.state.statuses.push({ code: 'valk_heal_seal', value: 100, until: this.rules.turn, source: this.boss.key, debuff: true, stacks: 1 });
                    s.sealBlockedUntil[unit.key] = this.rules.turn + 1;
                }
            }
            s.coldRound = s.heat < 30 ? this.rules.turn : 0;
        }
    }
    event(code, title, description, kind = 'chant') {
        this.announce({ code, title, description, kind, dialogue: [], effect: '' });
    }
    async mechanism(unit, fraction, title) {
        if (unit.hp <= 0)
            return;
        const before = unit.hp;
        await this.rules.takeHit(unit, Math.floor(unit.hpMax * fraction), 1, false, this.boss, true);
        await this.rescue(unit);
        this.rules.log.push(`　&${title}&${unit.name}损失 ${Math.max(0, before - unit.hp)} HP(${before}→${unit.hp})`);
    }
    async healBoss(fraction, title, capped = true) {
        if (this.boss.hp <= 0 || fraction <= 0)
            return 0;
        const s = this.state;
        if (s.mechanismHealTurn !== this.rules.turn) {
            s.mechanismHealTurn = this.rules.turn;
            s.mechanismHealed = 0;
        }
        const capFraction = this.boss.bossEffects?.some(code => ['leyline_recast', 'soul_chain_forging'].includes(code)) ? .15 : .10;
        const cap = capped ? Math.floor(this.boss.hpMax * capFraction) : Infinity;
        const antiheal = 1 - Math.min(100, this.rules.value(this.boss, 'advanced_healing_cut')) / 100;
        const proposed = Math.floor(this.boss.hpMax * fraction * antiheal * this.rules.healingMultiplier(this.boss, this.boss, false));
        const restored = Math.min(this.boss.hpMax - this.boss.hp, Math.max(0, cap - s.mechanismHealed), Math.max(0, proposed));
        if (!restored)
            return 0;
        const before = this.boss.hp;
        this.boss.hp += restored;
        if (capped)
            s.mechanismHealed += restored;
        this.rules.log.push(`　&${title}&${this.boss.name}恢复 ${restored} HP(${before}→${this.boss.hp})`);
        return restored;
    }
    async reflectDirect(source, actualHpDamage) {
        const s = this.state;
        if (s.code !== 'gruen_mountainheart' || !s.rockArmorActive || s.pressure < 60 || this.boss.hp <= 0 || source.hp <= 0 || actualHpDamage <= 0)
            return;
        if (s.reflectionTurn !== this.rules.turn) {
            s.reflectionTurn = this.rules.turn;
            s.reflectionTaken = {};
        }
        const exclusive = this.boss.bossEffects?.includes('mountainheart_resonance');
        const rate = s.pressure >= 85 ? exclusive ? .45 : .35 : exclusive ? .30 : .20;
        const cap = Math.floor(source.hpMax * (exclusive ? .20 : .15));
        const amount = Math.min(Math.floor(actualHpDamage * rate), Math.max(0, cap - (s.reflectionTaken[source.key] ?? 0)));
        if (amount <= 0)
            return;
        const before = source.hp;
        await this.rules.takeHit(source, amount, 1, false, this.boss, true);
        await this.rescue(source);
        const loss = Math.max(0, before - source.hp);
        s.reflectionTaken[source.key] = (s.reflectionTaken[source.key] ?? 0) + amount;
        this.rules.log.push(`　&逆震岩甲&${source.name}承受 ${loss} 点反震伤害(${before}→${source.hp})`);
    }
    addScorch(unit) {
        const s = this.state;
        if (unit.hp <= 0 || s.scorchAppliedTurn[unit.key] === this.rules.turn)
            return;
        const active = this.rules.status(unit, 'valk_scorch');
        const pending = this.rules.status(unit, 'valk_scorch_pending');
        if ((active?.stacks ?? 0) + (pending?.stacks ?? 0) >= 3)
            return;
        s.scorchAppliedTurn[unit.key] = this.rules.turn;
        unit.state.statuses = unit.state.statuses.filter(effect => effect.code !== 'valk_scorch_pending');
        unit.state.statuses.push({ code: 'valk_scorch_pending', value: 25, until: this.rules.turn + 1, source: this.boss.key, debuff: true, stacks: 1 });
        this.rules.log.push(`　&灼封伤口&${unit.name}的伤口被炉火封住，下轮受到的治疗将降低。`);
    }
    addHealSeal(unit) {
        const s = this.state;
        const activation = this.rules.turn + 1;
        if (unit.hp <= 0 || activation <= (s.sealBlockedUntil[unit.key] ?? 0) || this.rules.status(unit, 'valk_heal_seal') || this.rules.status(unit, 'valk_heal_seal_pending'))
            return;
        unit.state.statuses.push({ code: 'valk_heal_seal_pending', value: 100, until: activation, source: this.boss.key, debuff: true, stacks: 1 });
    }
    async clearValkPressure(all = false) {
        for (const unit of this.rules.units.filter(unit => unit.side === 'member')) {
            if (all)
                await this.rules.remove(unit, effect => ['valk_scorch', 'valk_scorch_pending', 'valk_heal_seal', 'valk_heal_seal_pending'].includes(effect.code));
            else {
                const active = this.rules.status(unit, 'valk_scorch');
                if (active)
                    await this.rules.removeLayers(unit, effect => effect === active, 1);
                else
                    await this.rules.remove(unit, effect => effect.code === 'valk_scorch_pending', 1);
                await this.rules.remove(unit, effect => ['valk_heal_seal', 'valk_heal_seal_pending'].includes(effect.code));
            }
        }
    }
    async strike(targets, power, name, element = '土', magic = false, factor = 1) {
        const profile = regionalV2SkillProfiles[name];
        const hits = new Set();
        this.rules.log.push(`➤【${this.boss.name}】释放「${name}」`);
        await this.rules.areaDamage(targets, async (target) => {
            if (target.hp <= 0)
                return;
            const hit = await this.rules.strike(this.boss, target, profile?.power ?? power, element, magic, false, false, 1, {
                skill: name !== '停炉后的挥锤', single: (profile?.ratio ?? 1) === 1 && targets.length === 1, finalMultiplier: factor * (profile?.ratio ?? 1),
                penetration: this.boss.bossEffects?.includes('mountainheart_resonance') && this.state.pressure >= 60 ? 25 : 0
            });
            if (hit)
                hits.add(target.key);
            await this.rescue(target);
        });
        return hits;
    }
    async changePressure(delta) {
        const s = this.state;
        const old = s.pressure;
        s.pressure = clamp(old + delta, s.phase === 3 ? 15 : 0);
        if (s.phase >= 2 && s.pressure >= 60)
            s.peeledTurn = this.rules.turn;
        if (old < 85 && s.pressure >= 85)
            this.event('gruen_critical', '山麓下沉', '山体裂隙完全张开，脚下的山麓正在下沉。');
        if (s.pressure < 60)
            s.rockArmorActive = false;
        if (s.pressure >= 100 && !s.collapseAt) {
            s.collapseAt = this.rules.turn + 1;
            this.event('gruen_collapse_locked', '失控山崩·锁定', '整片山麓已经脱离山体。下一轮若不能将地脉压回断层之下，山崩将彻底倾覆。');
        }
    }
    async playerAction(unit, action) {
        if (this.boss.hp <= 0)
            return;
        const s = this.state;
        if (s.code === 'gruen_mountainheart') {
            if (action === 'defend')
                s.rubble[unit.key] = Math.max(0, (s.rubble[unit.key] ?? 0) - 1);
            await this.changePressure(pressureChange(action, (s.weight[unit.key] ?? 0) >= this.rules.turn));
        }
        else if (s.orders[unit.key] && s.orderDue <= this.rules.turn && !s.actions[unit.key])
            s.actions[unit.key] = action;
    }
    async issueOrders(revolt = false) {
        const s = this.state;
        const players = this.players();
        s.orders = {};
        s.actions = {};
        s.orderDue = this.rules.turn + 1;
        s.revolt = revolt;
        for (const unit of players) {
            const order = revolt ? 'hold' : nextFurnaceOrder(s.previousOrders[unit.key], await this.canSkill(unit), this.rules.turn + Number(unit.key.split(':')[1]));
            s.orders[unit.key] = order;
            s.previousOrders[unit.key] = order;
        }
        s.foreman = s.phase >= 2 && players.length ? players[s.foremanCursor++ % players.length].key : '';
        this.event(revolt ? 'valk_revolt_orders' : 'valk_orders', revolt ? '禁攻令' : '监工派令', `${revolt ? '瓦尔克焊死炉门，厉声喝令全员固炉！' : '瓦尔克敲响监工钟。'}\n${players.map(unit => `${unit.name}：${furnaceOrderNames[s.orders[unit.key]]}${s.foreman === unit.key ? '（领班）' : ''}`).join('\n')}`);
    }
    async settleOrders() {
        const s = this.state;
        if (!s.orderDue || s.orderDue > this.rules.turn)
            return;
        const wasRevolt = s.revolt;
        const result = settleFurnaceOrders(s);
        for (const wound of result.wounds) {
            const unit = this.rules.units.find(unit => unit.key === wound.key);
            if (unit)
                await this.mechanism(unit, wound.fraction, '监工鞭痕');
        }
        if (result.success) {
            s.breachUntil = this.rules.turn + 1;
            this.rules.log.push('&集体停炉&违令者彼此响应，传动轴开始停转，瓦尔克露出破绽！');
            await this.clearValkPressure(result.totalRevolt);
            if (result.totalRevolt) {
                this.boss.defense *= .8;
                this.boss.magicDefense *= .8;
                this.event('valk_revolt_won', '炉门崩毁', '炉门在众人的反抗中轰然倒塌，鞭痕上的火光尽数熄灭。', 'phase');
            }
        }
        else if (result.rebels.length) {
            this.rules.log.push('&孤立违令&没有足够同伴响应，违令者遭到监工单独惩戒。');
            if (!s.revoltWon)
                await this.healBoss(wasRevolt ? this.boss.bossEffects?.includes('soul_chain_forging') ? .15 : .10 : this.boss.bossEffects?.includes('soul_chain_forging') ? .08 : .06, '炉心汲养');
        }
        else if (!s.revoltWon && result.effective.length && s.fullFires < 2) {
            s.fullFires++;
            await this.healBoss(.03, '满额开炉', false);
        }
        if (wasRevolt && !result.success) {
            s.revolt = false;
            s.revoltRetry = this.rules.turn + 2;
        }
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
        const s = this.state;
        if (this.boss.hp <= 0)
            return;
        if (s.code === 'valk_forge_overseer') {
            await this.settleOrders();
            if (s.coldRound === this.rules.turn && s.heat < 30) {
                const pressured = this.rules.units.some(unit => unit.side === 'member' && unit.state.statuses.some(effect => effect.until >= this.rules.turn && ['valk_scorch', 'valk_scorch_pending', 'valk_heal_seal', 'valk_heal_seal_pending'].includes(effect.code)));
                await this.clearValkPressure(true);
                if (pressured)
                    this.rules.log.push('&冷炉止血&持续低温使队伍身上的灼封与封脉尽数消退。');
            }
        }
        else if (s.pressure >= 60 && !s.rockArmorActive) {
            s.rockArmorActive = true;
            this.event('gruen_rock_armor', '逆震岩甲', '岩层沿格鲁恩的双臂反向闭合，所有正面冲击都将沿山脊倒灌。');
        }
        if (s.unstableReset && this.rules.turn >= s.unstableUntil) {
            s.pressure = s.unstableReset;
            s.unstableReset = 0;
        }
        const ratio = this.boss.hp / this.boss.hpMax;
        const phase = s.code === 'gruen_mountainheart' ? ratio <= .35 ? 3 : ratio <= .70 ? 2 : 1 : ratio <= .30 ? 3 : ratio <= .65 ? 2 : 1;
        if (phase > s.phase) {
            s.phase = phase;
            if (s.code === 'gruen_mountainheart' && phase === 3) {
                s.pressure = Math.max(15, s.pressure);
                s.slot = Math.max(0, s.slot - 1);
            }
            this.event(`${s.code}_phase_${phase}`, s.code === 'gruen_mountainheart' ? phase === 3 ? '山心裸露' : '断层裸露' : phase === 3 ? '总罢工' : '强制加班', s.code === 'gruen_mountainheart' ? '巨大的岩层从格鲁恩身上剥落，裸露的山心震动着整片山麓。' : '瓦尔克扯断炉旁的铁索，将烧红的监工钟狠狠砸响。', 'phase');
            if (s.code === 'valk_forge_overseer' && phase === 3)
                await this.issueOrders(true);
        }
        if (s.code === 'valk_forge_overseer' && s.revoltRetry && this.rules.turn >= s.revoltRetry && !s.revoltWon) {
            s.revoltRetry = 0;
            await this.issueOrders(true);
        }
    }
    async bossTurn(victim) {
        const s = this.state;
        if (this.boss.hp <= 0)
            return;
        if (s.code === 'gruen_mountainheart')
            return this.gruenTurn(victim);
        await this.settleOrders();
        if (s.overloadAt && this.rules.turn >= s.overloadAt) {
            await this.strike(this.players(), 115, '封炉清算', '火', true);
            for (const unit of this.players())
                s.scars[unit.key] = Math.min(4, (s.scars[unit.key] ?? 0) + 1);
            for (const unit of this.players())
                this.addHealSeal(unit);
            await this.healBoss(this.boss.bossEffects?.includes('soul_chain_forging') ? .15 : .10, '炉心汲养');
            this.event('valk_heal_seal', '焦灼封脉', '白热炉气钻入所有伤口；下一轮，任何生命恢复都会被彻底封死。');
            s.heat = this.boss.bossEffects?.includes('everburning_embers') ? 75 : 55;
            s.overloadAt = 0;
            return;
        }
        if (s.orderDue > this.rules.turn)
            return;
        const slot = s.slot++ % 3;
        if (slot === 0) {
            await this.issueOrders();
            return;
        }
        const players = this.players();
        const highestScar = [...players].sort((a, b) => (s.scars[b.key] ?? 0) - (s.scars[a.key] ?? 0) || a.key.localeCompare(b.key))[0] ?? victim;
        const inspected = players.find(unit => s.phase >= 2 && unit.key === s.foreman) ?? highestScar;
        const inspectionTarget = s.obeyed[inspected.key] ? victim : inspected;
        if (slot === 1) {
            const target = inspectionTarget;
            await this.strike([target], 105, '赤铁抽检', '无', false, 1 + .12 * (s.scars[target.key] ?? 0));
        }
        else if (s.cancelProcess) {
            s.cancelProcess = false;
            await this.strike([victim], 65, '停炉后的挥锤', '无');
        }
        else if (s.heat < 30) {
            await this.strike([victim], 105, '冷砧回火', '无');
            this.rules.add(this.boss, 'defense', 15, 1, this.boss);
            this.rules.add(this.boss, 'magic_defense', 15, 1, this.boss);
        }
        else if (s.heat < 60) {
            await this.strike(players, 75, '赤铁横锻', '无');
            this.rules.add(victim, 'armor_shatter', 10, 2, this.boss, true);
        }
        else if (s.heat < 85) {
            const hits = await this.strike(players, 80, '炉渣喷流', '火', true);
            for (const unit of players.filter(unit => hits.has(unit.key)))
                this.addScorch(unit);
        }
        else {
            const hits = await this.strike([highestScar], 115, '白热裁决', '火', true);
            if (hits.has(highestScar.key))
                this.addScorch(highestScar);
            await this.strike(players.filter(unit => unit !== highestScar), 115, '白热溅射', '火', true, .55);
        }
        s.heat += 10;
        await this.checkOverload();
    }
    async gruenTurn(victim) {
        const s = this.state;
        if (s.collapseAt && this.rules.turn >= s.collapseAt) {
            s.collapseAt = 0;
            if (s.pressure < 85) {
                this.rules.log.push('&山崩止息&地脉被压回断层之下，锁定的山体重新咬合。');
            }
            else {
                this.rules.log.push('&失控山崩&山麓彻底倾覆，崩塌沿裂谷席卷全场！');
                for (const unit of this.players()) {
                    await this.mechanism(unit, .35, '失控山崩');
                    if (unit.hp > 0) {
                        this.rules.add(unit, 'slow', 25, s.phase === 3 ? 2 : 1, this.boss, true);
                        this.rules.add(unit, 'exposed', 15, s.phase === 3 ? 2 : 1, this.boss, true);
                    }
                }
                if (this.boss.hp > 0)
                    await this.healBoss(this.boss.bossEffects?.includes('leyline_recast') ? .15 : .10, '地脉回流');
                s.pressure = 35;
                s.rockArmorActive = false;
            }
            s.weightTarget = '';
            s.slot = 0;
            return;
        }
        if (s.warningAt) {
            if (this.rules.turn < s.warningAt)
                return;
            s.warningAt = 0;
            if (s.pressure < 30) {
                s.unstableUntil = this.rules.turn + 1;
                s.unstableReset = s.phase >= 2 ? 25 : 20;
                s.pressure = 20;
                this.rules.log.push('&逆脉卸力&崩震沿裂隙倒灌，格鲁恩的岩层短暂失稳！');
                if (s.phase === 3 && s.reliefs < 2) {
                    s.reliefs++;
                    await this.mechanism(this.boss, .03, '山心崩裂');
                }
            }
            else {
                const pressure = s.pressure;
                await this.strike(this.players(), pressure < 60 ? 75 : pressure < 85 ? 100 : 115, pressure < 60 ? '山心崩震' : pressure < 85 ? '断层崩震' : '万壑倾覆');
                for (const unit of this.players()) {
                    if (pressure >= 60 && pressure < 85 && s.weightTarget === unit.key)
                        await this.strike([unit], 45, '承重点追震');
                    if ((s.rubble[unit.key] ?? 0) >= 2) {
                        s.rubble[unit.key] = 0;
                        await this.strike([unit], 45, '碎岩追震');
                    }
                    if (pressure >= 85)
                        this.rules.add(unit, 'bind', 25, 1, this.boss, true);
                }
                if (this.boss.hp > 0 && pressure >= 60)
                    await this.healBoss(this.boss.bossEffects?.includes('leyline_recast') ? pressure >= 85 ? .15 : .08 : pressure >= 85 ? .10 : .06, '地脉回流');
                s.pressure = pressure < 60 ? 25 : pressure < 85 ? 30 : 35;
                s.rockArmorActive = false;
            }
            s.weightTarget = '';
            s.slot = 0;
            return;
        }
        const slot = s.slot++;
        if (s.phase < 3 && slot === 0) {
            const hits = await this.strike([victim], 105, '山脊测重');
            if (hits.has(victim.key) && victim.hp > 0) {
                s.weight[victim.key] = this.rules.turn + 2;
                s.weightTarget = victim.key;
                if (s.phase >= 2)
                    s.rubble[victim.key] = Math.min(2, (s.rubble[victim.key] ?? 0) + 1);
            }
        }
        else if (slot === (s.phase < 3 ? 1 : 0)) {
            await this.strike(this.players(), 75, '断层推进', '土', false, 1 + Math.min(.3, Math.floor(Math.max(0, s.pressure - 30) / 10) * .05));
        }
        else {
            s.warningAt = this.rules.turn + 1;
            this.event('gruen_warning', '地脉预震', '格鲁恩将双臂压入山心，脚下传来沉重的闷响。下一次行动，山心崩震即将爆发。');
        }
    }
}

export { RegionalBossBattle, furnaceOrderNames, installRegionalV2Damage, isRegionalV2, newRegionalState, nextFurnaceOrder, obeysFurnaceOrder, pressureChange, readRegionalState, regionalHealingFactor, regionalIncomingFactor, regionalOutgoingFactor, regionalStateSummary, regionalV2Codes, settleFurnaceOrders };
