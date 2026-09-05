import { tenacityContest, opposedChance } from './combat-math.js';
import { nativeSkillBalanceByCode } from './combat-skill-balance.config.js';
import { residentScalablePassives } from './passive-specialization.js';
import { canDispelCombatEffect } from './combat-dispel-policy.js';
import { specializeEffectValue } from './skill-specialization.js';
import { residentSkills, residentSkillByCode } from './resident-skill.config.js';

const emptyRuleState = () => ({ statuses: [], memory: {} });
const readRuleState = (value) => {
    if (!value || typeof value !== 'object')
        return emptyRuleState();
    const state = value;
    return { ...state, statuses: Array.isArray(state.statuses) ? state.statuses : [], memory: state.memory ?? {} };
};
const hard = ['sleep', 'petrify', 'charm', 'fear'];
const isSkillCooldown = (code) => Boolean(residentSkillByCode(code) || nativeSkillBalanceByCode.has(code));
const controls = [...hard, 'confusion', 'blind', 'silence'];
const names = { poison: '中毒', burn: '灼烧', bleed: '流血', bleeding: '流血', sleep: '沉睡', petrify: '石化', charm: '魅惑', fear: '恐惧', confusion: '混乱', blind: '目盲', silence: '沉默', slow: '迟缓', exposed: '易伤', armor_shatter: '破甲', magic_shatter: '降魔防', enchant: '三相附锋', mirror: '法镜', shield: '生命护盾', nightmare: '梦魇' };
const opposite = { attack: 'attack_down', attack_down: 'attack', magic: 'magic_down', magic_down: 'magic', defense: 'armor_shatter', armor_shatter: 'defense', magic_defense: 'magic_shatter', magic_shatter: 'magic_defense', speed: 'slow', slow: 'speed', accuracy: 'accuracy_down', accuracy_down: 'accuracy', reduction: 'exposed', exposed: 'reduction' };
Object.assign(names, { speed: '疾行', accuracy: '精准', accuracy_down: '失准', reduction: '减伤', physical_reduction: '物理减伤', magic_reduction: '魔法减伤', defense: '护甲', magic_defense: '魔防', attack: '物攻强化', magic: '魔攻强化', attack_down: '物攻衰减', magic_down: '魔攻衰减', mana_discount: '法潮节流', mana_tax: '施法负担', next_damage: '蓄势', damage: '增伤', conductive: '导电', refraction: '折光', expand: '万象扩散', extra_lock: '时隙锁定', extra_block: '行动封锁', forge: '临锻回火', roots: '根系共鸣', echo: '援护回响', command: '协同号令', flank: '双锋夹角', beat: '共鸣节拍', taunted: '嘲讽', phase: '相位假身', false_shadow: '灯下假影', transfer: '借伤誓约', feign: '绝境佯死', aim: '猎人量距', blade_line: '咒刃引线', swap_magic: '低项魔攻', swap_physical: '高项物攻', shadow_mark: '影缝标记', indexed: '识破增益', false_compass: '谎言罗盘', blind_resist: '抗目盲', ember_screen: '余火护幕', iron_gate: '铁门半开', crit_bonus: '同仇刻印', fire_vulnerable: '畏火' });
const displayedRuleName = (state, code, actual, turn, ownView) => {
    const illusion = ownView ? state.statuses.find(e => e.code === 'false_compass' && e.until >= turn) : undefined;
    if (illusion?.data?.startsWith(`${code}|`))
        return illusion.data.split('|')[1] + '？';
    return actual;
};
const ruleStatusSummary = (state, turn, ownView = true) => state.statuses.filter(e => e.until >= turn && !['false_compass', 'iron_gate', 'ember_screen'].includes(e.code)).map(e => `${displayedRuleName(state, e.code, names[e.code] ?? e.code, turn, ownView)}${e.stacks > 1 ? `×${e.stacks}` : ''}(${Math.max(1, e.until - turn + 1)})`).join('、');
const visibleResidentBuff = (state, skillCode, turn) => {
    const buffBySkill = { resident_a01: 'expand', resident_a02: 'enchant', resident_a06: 'refraction', resident_f01: 'mirror', resident_f02: 'physical_reduction', resident_f03: 'shield', resident_h01: 'command', resident_k01: 'forge', resident_k05: 'aim', resident_l01: 'nightmare', resident_l02: 'false_shadow', resident_m05: 'roots' };
    const wanted = buffBySkill[skillCode];
    if (!wanted)
        return false;
    return state.statuses.some(e => e.until >= turn && displayedRuleName(state, e.code, names[e.code] ?? e.code, turn, true).replace('？', '') === names[wanted]);
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const maskRuleBattleLog = (lines, hiddenNames, ownNames) => {
    let hiddenActor = false;
    return lines.map(line => line.split('\n').map(part => {
        const mentionsHidden = hiddenNames.some(name => name && part.includes(name)) || part.includes('信息被雾遮蔽');
        if (/^(➤|【)/.test(part))
            hiddenActor = mentionsHidden;
        if (mentionsHidden || hiddenActor && !ownNames.some(name => name && part.includes(name)))
            return /^(➤|【)/.test(part) ? '➤【信息被雾遮蔽】开始行动。' : '　➥信息被雾遮蔽。';
        return part;
    }).join('\n'));
};
const ruleManaCost = (state, passives, base, turn) => {
    const value = (code) => state.statuses.filter(e => e.code === code && e.until >= turn).reduce((sum, e) => sum + e.value * e.stacks, 0);
    const overload = passives.includes('resident_d02') ? 1 : state.memory.copy === 'D02' && Number(state.memory.copyUntil) >= turn ? .4 : 0;
    let factor = (1 + overload * .5 + value('mana_tax') / 100) * (1 - value('mana_discount') / 100);
    if (state.memory.focus === turn)
        factor *= .8;
    return Math.max(0, Math.ceil(base * Math.max(.1, factor) - 1e-9));
};
class CombatRules {
    units;
    turn;
    log;
    hooks;
    weather;
    sparLevelBand;
    random;
    expansionScale = 1;
    constructor(units, turn, log, hooks, weather = '', sparLevelBand, random = Math.random) {
        this.units = units;
        this.turn = turn;
        this.log = log;
        this.hooks = hooks;
        this.weather = weather;
        this.sparLevelBand = sparLevelBand;
        this.random = random;
    }
    allies(unit) { return this.units.filter(other => other.side === unit.side && other.hp > 0); }
    enemies(unit) { return this.units.filter(other => other.side !== unit.side && other.hp > 0); }
    pick(items) { return items[Math.floor(this.random() * items.length)]; }
    lowest(items) { return [...items].sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax || a.key.localeCompare(b.key))[0]; }
    status(unit, code) { return this.effects(unit).find(effect => effect.code === code); }
    effects(unit) { return [...unit.state.statuses.filter(effect => effect.until >= this.turn), ...this.hooks.legacyEffects(unit)]; }
    value(unit, code) { return this.effects(unit).filter(effect => effect.code === code).reduce((n, effect) => n + effect.value * effect.stacks, 0); }
    passive(unit, id) {
        const code = `resident_${id.toLowerCase()}`;
        if (unit.passives.includes(code))
            return residentScalablePassives.has(code) ? Math.max(1, Math.min(1.15, unit.passiveSpecializations?.[code] ?? 1)) : 1;
        return unit.state.memory.copy === id && Number(unit.state.memory.copyUntil) >= this.turn ? .4 : 0;
    }
    once(unit, key, battle = false) {
        const stamp = battle ? -1 : this.turn;
        if (unit.state.memory[key] === stamp)
            return false;
        unit.state.memory[key] = stamp;
        return true;
    }
    add(unit, code, value, duration, source, debuff = false, data) {
        const current = unit.state.statuses.find(effect => effect.code === code);
        const effect = { code, value: current ? Math.max(current.value, value) : value, until: Math.max(this.turn, this.turn + duration - (unit.state.memory.actedTurn === this.turn ? 0 : 1)), source: source.key, debuff, stacks: current?.stacks ?? 1, data };
        unit.state.statuses = unit.state.statuses.filter(item => item.code !== code);
        unit.state.statuses.push(effect);
        return effect;
    }
    async remove(unit, predicate, limit = Infinity) {
        const removed = this.effects(unit).filter(predicate).slice(0, limit);
        for (const effect of removed) {
            if (effect.legacyId)
                await this.hooks.removeLegacy(effect.legacyId);
            else
                unit.state.statuses = unit.state.statuses.filter(item => item !== effect);
        }
        return removed;
    }
    sameEffect(a, b) { return a === b || Boolean(a.legacyId && a.legacyId === b.legacyId); }
    async removeEffect(unit, effect) { return this.remove(unit, candidate => this.sameEffect(candidate, effect)); }
    async removeLayers(unit, predicate, layers = 1) {
        const selected = this.effects(unit).filter(predicate);
        for (const effect of selected) {
            if (effect.stacks <= layers)
                await this.removeEffect(unit, effect);
            else {
                effect.stacks -= layers;
                if (effect.legacyId)
                    await this.hooks.updateLegacy?.(effect);
            }
        }
        return selected;
    }
    shieldValue(unit) { return this.value(unit, 'shield') + this.value(unit, 'life_shield'); }
    async drainShield(unit, amount) {
        let remaining = Math.max(0, amount);
        for (const effect of this.effects(unit).filter(e => ['shield', 'life_shield'].includes(e.code))) {
            const removed = Math.min(effect.value, remaining);
            effect.value -= removed;
            remaining -= removed;
            if (effect.value <= 0)
                await this.removeEffect(unit, effect);
            else if (effect.legacyId)
                await this.hooks.updateLegacy?.(effect);
            if (remaining <= 0)
                break;
        }
        return amount - remaining;
    }
    async consume(unit, code) { const effect = this.status(unit, code); if (effect)
        await this.removeEffect(unit, effect); return effect; }
    async control(source, target, code, chance, duration) {
        if (target.boss && code === 'charm')
            return false;
        if (target.boss && code === 'fear') {
            this.add(target, 'slow', 20, 1, source, true);
            return true;
        }
        let pierce = source.pierce;
        if (this.passive(source, 'B08') && this.effects(target).some(effect => controls.includes(effect.code)) && this.once(source, 'listen'))
            pierce += 12;
        if (this.passive(source, 'J07') && this.sparLevelBand && source.level >= this.sparLevelBand[0] && source.level <= this.sparLevelBand[1] && this.once(source, 'traveller', true))
            chance += 8;
        const resistance = code === 'blind' ? this.value(target, 'blind_resist') : 0;
        const probability = tenacityContest(pierce, target.tenacity, source.level - target.level, chance).controlChance * (this.expansionScale < 1 ? .5 : 1) * (target.boss ? .4 : 1) * (1 - resistance / 100);
        if (this.random() >= probability) {
            this.log.push(`　➥【${target.name}】抵抗了${names[code] ?? code}。`);
            return false;
        }
        if (hard.includes(code) && this.effects(target).some(effect => hard.includes(effect.code) && !canDispelCombatEffect(effect.code, 'ordinary', Boolean(effect.mechanism))))
            return false;
        if (hard.includes(code))
            await this.remove(target, effect => hard.includes(effect.code));
        if (code === 'confusion' || code === 'charm')
            await this.remove(target, effect => effect.code === 'confusion' || effect.code === 'charm');
        this.add(target, code, 1, target.boss && ['sleep', 'petrify', 'confusion'].includes(code) ? 1 : duration, source, true);
        if (hard.includes(code) && this.passive(target, 'B07') && Number(target.state.memory.painAwake ?? 0) < 2) {
            target.state.memory.painAwake = Number(target.state.memory.painAwake ?? 0) + 1;
            this.add(target, 'reduction', 20 * this.passive(target, 'B07'), 1, target);
        }
        this.log.push(`　➥【${target.name}】陷入${names[code]}。`);
        return true;
    }
    async beforeAction(unit) {
        if (unit.hp > 0 && this.once(unit, 'ruleDot'))
            for (const effect of unit.state.statuses.filter(e => e.until >= this.turn && ['poison', 'burn', 'bleed', 'bleeding'].includes(e.code))) {
                const percent = unit.boss ? Math.min(1.5, effect.value * effect.stacks) : effect.value * effect.stacks;
                const damage = Math.max(1, Math.floor(unit.hpMax * percent / 100));
                const absorbed = await this.take(unit, damage);
                this.log.push(`　&${names[effect.code] ?? effect.code}&【${unit.name}】持续损失 ${damage - absorbed} HP。`);
            }
        if (unit.hp <= 0)
            return false;
        const mirror = this.status(unit, 'mirror');
        if (mirror && mirror.until <= this.turn)
            await this.consume(unit, 'mirror');
        unit.state.memory.actedTurn = this.turn;
        if (this.status(unit, 'fear')) {
            if (!this.status(unit, 'fear')?.mechanism)
                await this.consume(unit, 'fear');
            this.log.push(`➤【${unit.name}】因恐惧跳过行动。`);
            return false;
        }
        const locked = ['sleep', 'petrify'].find(code => this.status(unit, code));
        if (locked) {
            this.log.push(`➤【${unit.name}】处于${names[locked]}，无法行动。`);
            return false;
        }
        return true;
    }
    redirect(source, target, harmful) {
        if (!harmful)
            return target;
        const taunter = this.units.find(unit => unit.key === this.status(source, 'taunted')?.source && unit.hp > 0);
        if (this.status(source, 'charm') || (this.status(source, 'confusion') && this.random() < .5)) {
            const next = this.pick(this.status(source, 'charm') ? this.allies(source).filter(unit => unit.key !== source.key) : this.allies(source)) ?? source;
            this.log.push(`　&目标失序&【${source.name}】转而攻击【${next.name}】。`);
            return next;
        }
        return taunter ?? target;
    }
    speed(unit) { return unit.speed * (1 + (this.value(unit, 'speed') - this.value(unit, 'slow')) / 100); }
    manaCost(unit, base) {
        return ruleManaCost(unit.state, unit.passives, base, this.turn);
    }
    async paid(unit, amount, skill) {
        await this.consume(unit, 'mana_discount');
        await this.consume(unit, 'mana_tax');
        delete unit.state.memory.focus;
        if (amount >= 40 && this.passive(unit, 'D07') && this.once(unit, 'warmth'))
            await this.restore(unit, unit, 0, Math.min(unit.mpMax * .06, amount * .4));
        if (skill.cooldown >= 3 && this.passive(unit, 'C07') && this.once(unit, 'delayClock', true)) {
            this.add(unit, 'reduction', 12 * this.passive(unit, 'C07'), 1, unit);
            this.add(unit, 'speed', 10 * this.passive(unit, 'C07'), 1, unit);
        }
        if (skill.category === 'utility' && this.passive(unit, 'K07') && this.once(unit, 'tool', true)) {
            this.add(unit, 'reduction', 10 * this.passive(unit, 'K07'), 1, unit);
            this.add(unit, 'accuracy', 10 * this.passive(unit, 'K07'), 1, unit);
        }
        unit.state.memory.previousCastTurn = unit.state.memory.castTurn ?? 0;
        unit.state.memory.castTurn = this.turn;
    }
    healingMultiplier(source, target, equipment = true) {
        let healing = (equipment ? (1 + Number(source.modifiers?.healingBonusPct ?? 0) / 100) * (1 + Number(target.modifiers?.healingReceivedPct ?? 0) / 100) : 1) * (1 + (this.allies(target).length === 1 ? this.passive(target, 'H08') * .2 : 0));
        if (source.mp / source.mpMax < .25)
            healing *= 1 - this.passive(source, 'D08') * .25;
        if (target.hp / target.hpMax < .25)
            healing *= 1 - this.passive(target, 'I08') * .2;
        return healing;
    }
    async restore(source, target, hp, mp = 0, echo = false) {
        if (target.hp <= 0)
            return;
        let healing = this.healingMultiplier(source, target);
        if (hp > 0 && this.status(source, 'beat')) {
            healing *= 1 + this.value(source, 'beat') / 100;
            await this.consume(source, 'beat');
        }
        if (!echo)
            healing *= source.castSpecialization?.supportFactor ?? 1;
        const oldHp = target.hp;
        const oldMp = target.mp;
        target.hp = Math.min(target.hpMax, target.hp + Math.max(0, Math.floor(hp * healing)));
        target.mp = Math.min(target.mpMax, target.mp + Math.max(0, Math.floor(mp)));
        if (target.hp !== oldHp || target.mp !== oldMp) {
            this.log.push(`　➥【${target.name}】恢复 ${target.hp - oldHp} HP、${target.mp - oldMp} MP。`);
            if (!echo)
                await this.rootEcho(source);
        }
    }
    async rootEcho(source) {
        const owner = this.allies(source).find(unit => this.status(unit, 'roots'));
        if (!owner)
            return;
        const memory = this.units.find(unit => unit.side === source.side).state.memory;
        if (memory.rootTurn !== this.turn) {
            memory.rootTurn = this.turn;
            memory.rootCount = 0;
        }
        if (Number(memory.rootCount) >= 3)
            return;
        memory.rootCount = Number(memory.rootCount) + 1;
        const lowest = this.lowest(this.allies(owner));
        if (lowest)
            await this.restore(owner, lowest, lowest.hpMax * .03, 0, true);
    }
    async shield(source, target, amount, duration) {
        if (this.status(source, 'beat')) {
            amount *= 1 + this.value(source, 'beat') / 100;
            await this.consume(source, 'beat');
        }
        amount *= source.castSpecialization?.supportFactor ?? 1;
        this.add(target, 'shield', Math.min(target.hpMax, amount), duration, source);
        await this.rootEcho(source);
    }
    supportSnapshot(unit) { return { hp: unit.hp, mp: unit.mp, effects: this.effects(unit).map(e => ({ ...e })) }; }
    async echoSupport(source, original, before) {
        if (!this.status(source, 'echo'))
            return;
        const recipient = this.lowest(this.allies(source).filter(unit => unit.key !== original.key));
        if (!recipient)
            return;
        const safe = ['enchant', 'refraction', 'shield', 'life_shield', 'reduction', 'barrier', 'physical_reduction', 'magic_reduction', 'defense', 'magic_defense', 'speed', 'sprint', 'accuracy', 'precision', 'mana_discount', 'next_damage', 'forge', 'transfer'];
        const gains = this.effects(original).filter(e => !e.debuff && safe.includes(e.code) && !before.effects.some(old => old.code === e.code && old.value >= e.value && old.until >= e.until));
        const hp = Math.max(0, original.hp - before.hp);
        const mp = 0;
        if (!hp && !mp && !gains.length)
            return;
        await this.consume(source, 'echo');
        recipient.hp = Math.min(recipient.hpMax, recipient.hp + Math.floor(hp / 2));
        recipient.mp = Math.min(recipient.mpMax, recipient.mp + Math.floor(mp / 2));
        for (const effect of gains)
            this.add(recipient, effect.code === 'life_shield' ? 'shield' : effect.code, effect.value * .5, Math.max(1, effect.until - this.turn + 1), source, false, effect.data);
        this.log.push(`　&援护回响&【${recipient.name}】获得本次支援的 50% 数值效果。`);
        await this.rootEcho(source);
    }
    async dispel(source, target, debuff, count = Infinity, filter = () => true, authority = 'ordinary') {
        const candidates = this.effects(target).filter(effect => effect.debuff === debuff && filter(effect) && canDispelCombatEffect(effect.code, authority, Boolean(effect.mechanism)));
        const index = !debuff ? this.status(target, 'indexed') : undefined;
        const selected = [];
        if (index?.data) {
            const marked = candidates.find(e => e.code === index.data);
            if (marked)
                selected.push(marked);
        }
        while (selected.length < count) {
            const next = this.pick(candidates.filter(e => !selected.includes(e)));
            if (!next)
                break;
            selected.push(next);
        }
        const removed = await this.remove(target, effect => selected.some(candidate => this.sameEffect(effect, candidate)));
        if (index && removed.length)
            await this.consume(target, 'indexed');
        if (removed.length) {
            this.log.push(`　&${debuff ? '净化' : '驱散'}&【${target.name}】：${removed.map(effect => names[effect.code] ?? effect.code).join('、')}。`);
            if (this.passive(source, 'E08') && this.once(source, 'cleanEmber'))
                this.add(source, 'next_damage', 12 * this.passive(source, 'E08'), 1, source);
            if (this.passive(source, 'K08') && this.once(source, 'spare') && this.random() < .35)
                this.reduceCooldown(source, true);
        }
        return removed;
    }
    reduceCooldown(unit, utility = false) {
        const keys = Object.keys(unit.cooldowns).filter(code => isSkillCooldown(code) && Number(unit.cooldowns[code]) > 0 && (!utility || residentSkillByCode(code)?.category === 'utility' || nativeSkillBalanceByCode.get(code)?.power === 0));
        const key = this.pick(keys);
        if (key)
            unit.cooldowns[key] = Math.max(0, Number(unit.cooldowns[key]) - 1);
    }
    elementFactor(source, target, element) {
        if (!element || element === '无' || element === '奥术')
            return 1;
        let resistance = Number(target.resistance[element] ?? 0);
        if (['风', '雷', '火'].includes(element) && target.hp / target.hpMax < .25)
            resistance += this.passive(target, 'I08') * 15;
        if (element === '火')
            resistance -= this.value(target, 'fire_vulnerable');
        return clamp(1 + (Number(source.mastery[element] ?? 0) - resistance) / 100, .1, 3);
    }
    async secondary(source, target, damage, label, element = '无') {
        if (target.hp <= 0 || damage <= 0)
            return;
        const dealt = Math.max(1, Math.floor(damage * this.elementFactor(source, target, element)));
        await this.take(target, dealt);
        this.log.push(`　&${label}&【${target.name}】受到 ${dealt} 点${element === '无' ? '' : element}伤害。`);
    }
    async take(target, damage) {
        damage = Math.max(0, damage);
        const aliveBefore = target.hp > 0;
        const shield = this.status(target, 'shield');
        const absorbed = Math.min(shield?.value ?? 0, damage);
        if (shield) {
            shield.value -= absorbed;
            if (shield.value <= 0)
                await this.consume(target, 'shield');
        }
        const legacyAbsorbed = await this.hooks.absorb(target, Math.max(0, damage - absorbed));
        target.hp = Math.max(0, target.hp - Math.max(0, damage - absorbed - legacyAbsorbed));
        if (aliveBefore && target.hp <= 0 && this.status(target, 'feign')) {
            target.hp = 1;
            await this.consume(target, 'feign');
            this.add(target, 'blind', 1, 1, target, true);
        }
        if (target.hp <= 0 && this.passive(target, 'M07') && this.allies(target).length && this.once(target, 'lastTorch', true)) {
            for (const ally of this.allies(target)) {
                this.add(ally, 'reduction', 20 * this.passive(target, 'M07'), 1, target);
                this.add(ally, 'damage', 15 * this.passive(target, 'M07'), 1, target);
            }
        }
        if (shield && !this.status(target, 'shield') && this.status(target, 'ember_screen')) {
            await this.consume(target, 'ember_screen');
            for (const enemy of this.enemies(target))
                await this.secondary(target, enemy, (target.magic * .55) ** 2 / (target.magic * .55 + enemy.magicDefense), '余火护幕', '火');
        }
        if (shield && !this.status(target, 'shield') && this.passive(target, 'K08') && this.once(target, 'spare') && this.random() < .35)
            this.reduceCooldown(target, true);
        return absorbed + legacyAbsorbed;
    }
    async incoming(source, target, raw, element, magic, skill, single = true, legacyResolved = false) {
        const modifier = (unit, key) => Number(unit.modifiers?.[key] ?? 0);
        const sourceBonus = legacyResolved && source.side === 'member' ? 0 : modifier(source, 'damageBonusPct') + (magic ? modifier(source, 'magicDamagePct') : 0) + (skill ? modifier(source, magic ? 'magicSkillDamagePct' : 'physicalSkillDamagePct') + (element === '光' ? modifier(source, 'lightSkillBonusPct') : 0) : 0);
        let bonus = sourceBonus + this.value(source, 'damage') + (skill ? this.passive(source, 'D02') * 25 + this.value(source, 'next_damage') : 0) + this.passive(source, 'I01') * (1 - source.hp / source.hpMax) * 25;
        if (skill && this.passive(source, 'A08') && new Set(this.effects(target).filter(e => ['burn', 'poison', 'conductive', 'frost', 'wet'].includes(e.code) || e.code.startsWith('element_mark_')).map(e => e.code)).size >= 2)
            bonus += 12 * this.passive(source, 'A08');
        if (this.status(target, 'conductive') && ['风', '雷'].includes(element)) {
            bonus += 20;
            await this.consume(target, 'conductive');
        }
        if (this.status(target, 'fear') && element === '火')
            bonus += 12;
        const taunt = this.status(target, 'taunted');
        if (taunt && taunt.source !== source.key && this.once(source, `flag${target.key}`))
            bonus += 10;
        if (skill && this.passive(source, 'C08') && this.speed(source) < this.speed(target) && this.once(source, 'rearDamage'))
            bonus += 10 * this.passive(source, 'C08');
        if (skill && this.passive(source, 'G07'))
            bonus += Math.min(2, Number(source.state.memory.weaponStacks ?? 0)) * 8 * this.passive(source, 'G07');
        if (skill && !magic && this.status(source, 'forge')) {
            bonus += this.value(source, 'forge');
            await this.consume(source, 'forge');
            source.state.memory.forgeReflect = this.turn;
        }
        if (skill)
            await this.consume(source, 'next_damage');
        if (this.status(target, 'flank') && target.state.memory.lastHitTurn === this.turn && target.state.memory.lastHitter !== source.key && Number(target.state.memory.flankHits ?? 0) < 2) {
            bonus += 15;
            target.state.memory.flankHits = Number(target.state.memory.flankHits ?? 0) + 1;
        }
        let reduction = this.value(target, 'reduction') + (magic ? this.value(target, 'magic_reduction') : this.value(target, 'physical_reduction')) + (!legacyResolved || target.side !== 'member' ? modifier(target, 'damageReductionPct') : 0);
        reduction += Math.min(12, this.effects(target).filter(e => e.debuff && !hard.includes(e.code)).length * 3) * this.passive(target, 'E07');
        if (magic && target.mp / target.mpMax < .25)
            reduction += 18 * this.passive(target, 'D08');
        if (this.allies(target).length === 1)
            reduction += 15 * this.passive(target, 'H08');
        if (this.status(target, 'blind') && this.passive(target, 'L07') && this.once(target, 'blur'))
            reduction += 20 * this.passive(target, 'L07');
        if (this.passive(target, 'F08') && this.turn > 2 && this.turn - Number(target.state.memory.lastDamage ?? 0) >= 2)
            reduction += 25 * this.passive(target, 'F08');
        const phase = await this.consume(target, 'phase');
        if (phase) {
            reduction += 60;
            if (raw * .6 > target.hpMax * .1)
                await this.restore(target, target, 0, target.mpMax * .1);
        }
        if (single && await this.consume(target, 'false_shadow'))
            reduction += 45;
        const refraction = element && element !== '无' && element !== '奥术' ? await this.consume(target, 'refraction') : undefined;
        if (refraction) {
            reduction += refraction.value;
            const weakness = Object.entries(source.resistance).sort((a, b) => a[1] - b[1])[0]?.[0] ?? '奥术';
            await this.secondary(target, source, raw * .2 * refraction.value / 35, '折光反噬', weakness);
        }
        const exposed = legacyResolved ? target.state.statuses.filter(e => e.code === 'exposed' && e.until >= this.turn).reduce((n, e) => n + e.value * e.stacks, 0) : this.value(target, 'exposed');
        let dealt = Math.floor(raw * (1 + clamp(bonus, -80, 150) / 100) * (1 + exposed / 100) * (1 - clamp(reduction, 0, 80) / 100));
        if (magic && await this.consume(target, 'mirror'))
            await this.secondary(target, source, raw * .75 * (source.state.memory.forgeReflect === this.turn ? 1.25 : 1), '法镜返照');
        if (this.status(target, 'sleep') && !this.status(target, 'sleep')?.mechanism)
            await this.consume(target, 'sleep');
        const stone = this.status(target, 'petrify');
        const petrify = stone && !stone.mechanism ? await this.consume(target, 'petrify') : undefined;
        if (petrify) {
            dealt += Math.min(target.hpMax * (target.boss ? .01 : .04), Math.max(source.attack, source.magic) * 1.5);
            const caster = this.units.find(unit => unit.key === petrify.source);
            if (caster)
                await this.restore(caster, caster, 0, Math.min(caster.mpMax * .15, (residentSkillByCode('B02')?.mana ?? 294) * .3));
        }
        const transfer = single ? await this.consume(target, 'transfer') : undefined;
        const guardian = this.units.find(unit => unit.key === transfer?.source && unit.hp > 0 && unit.key !== target.key);
        if (transfer && guardian) {
            const amount = dealt * transfer.value / 100;
            dealt -= amount;
            await this.secondary(source, guardian, amount * (1 - clamp(this.value(guardian, 'reduction'), 0, 80) / 100), '分担伤害');
        }
        if (!magic && this.status(target, 'iron_gate'))
            this.add(source, 'slow', 20, 1, target, true);
        target.state.memory.lastDamage = this.turn;
        if (this.passive(target, 'I07') && this.once(target, 'painFocus'))
            target.state.memory.focus = this.turn;
        return Math.max(0, Math.floor(dealt));
    }
    async afterHit(source, target, damage, element, skill, absorbed = 0, extra = false) {
        if (this.sparLevelBand && target.side === 'target' && damage > 0 && this.elementFactor(source, target, element) > 1)
            source.state.memory.sparWeakness = 1;
        if (absorbed && this.passive(target, 'F07') && this.once(target, `shard${source.key}`)) {
            this.add(source, 'armor_shatter', 8 * this.passive(target, 'F07'), 1, target, true);
            this.add(source, 'magic_shatter', 8 * this.passive(target, 'F07'), 1, target, true);
        }
        target.state.memory.lastHitTurn = this.turn;
        target.state.memory.lastHitter = source.key;
        const enchant = this.status(source, 'enchant');
        if (enchant && !extra && damage > 0 && this.once(source, 'enchantHit')) {
            await this.secondary(source, target, damage * enchant.value / 100, '三相附锋', enchant.data ?? '风');
        }
        if (skill && element !== '无' && element !== '奥术') {
            if (this.passive(source, 'A07') && source.state.memory.previousElement && source.state.memory.previousElement !== element && this.once(source, 'elementMp'))
                await this.restore(source, source, 0, source.mpMax * .03);
            source.state.memory.lastElement = element;
            source.state.memory.lastElementTurn = this.turn;
            if (this.passive(source, 'J08') && this.weatherElement(String(source.state.memory.weather ?? this.weather)) === element && this.once(source, 'weatherMp', true))
                await this.restore(source, source, 0, source.mpMax * .04);
        }
        if (skill)
            source.state.memory.weaponStacks = 0;
        if (skill && !extra && this.status(source, 'command'))
            for (const ally of this.allies(source).filter(unit => unit.key !== source.key && unit.state.memory.followup !== this.turn).slice(0, 2)) {
                if (!this.once(ally, 'followup') || target.hp <= 0)
                    continue;
                await this.secondary(ally, target, (ally.attack * .4) ** 2 / (ally.attack * .4 + target.defense), '协同追击');
            }
    }
    weatherElement(weather = this.weather) {
        return /雷/.test(weather) ? '雷' : /雪|冰|极光/.test(weather) ? '冰' : /高温|灰雨|火|炎|晴/.test(weather) ? '火' : /风/.test(weather) ? '风' : /雾|雨|湿|水|河|潮/.test(weather) ? '水' : '';
    }
    async attackSetup(source, target, magic, skill, ranged = magic) {
        let forceHit = false;
        let powerFactor = 1;
        let hitBonus = Number(source.modifiers?.actualHitRatePct ?? 0) / 100;
        if (skill && this.passive(source, 'G07')) {
            const kind = magic ? 'magic' : 'physical';
            const previous = source.state.memory.weaponKind;
            if (previous && previous !== kind)
                source.state.memory.weaponStacks = Math.min(2, Number(source.state.memory.weaponStacks ?? 0) + 1);
            source.state.memory.weaponKind = kind;
        }
        if (skill && this.passive(source, 'C08') && this.speed(source) < this.speed(target) && this.once(source, 'rearHit'))
            hitBonus += .15 * this.passive(source, 'C08');
        if (this.status(target, 'flank') && target.state.memory.lastHitTurn === this.turn && target.state.memory.lastHitter !== source.key && Number(target.state.memory.flankHits ?? 0) < 2)
            hitBonus += .1;
        if (this.status(target, 'shadow_mark')?.source === source.key && ['blind', 'silence', 'nightmare'].some(code => this.status(target, code)))
            hitBonus += .2;
        if (skill && ranged && await this.consume(source, 'aim')) {
            forceHit = true;
            if (target.hp === target.hpMax)
                powerFactor *= 1.18;
        }
        if (skill && !magic && !ranged && await this.consume(source, 'blade_line')) {
            forceHit = true;
            powerFactor *= .9;
        }
        if (this.passive(source, 'L08') && (target.appraisal ?? 0) < 3 && this.once(source, 'paradox', true))
            forceHit = true;
        if (this.passive(source, 'H07') && target.state.memory.lastHitTurn === this.turn && target.state.memory.lastHitter !== source.key)
            this.add(source, 'crit_bonus', Math.min(15 * this.passive(source, 'H07'), this.value(source, 'crit_bonus') + 5 * this.passive(source, 'H07')), 0, source);
        return { forceHit, powerFactor, hitBonus, hitFactor: this.status(source, 'blind') ? .5 : 1 };
    }
    async missed(source, target) {
        if (this.status(target, 'false_shadow'))
            await this.control(target, source, 'blind', 100, 1);
    }
    async strike(source, original, power, element, magic, extra = false, forceHit = false, secondaryScale = 1, options = {}) {
        const isSkill = options.skill !== false;
        const target = options.redirected ? original : this.redirect(source, original, true);
        if (target.hp <= 0)
            return false;
        let attack = magic ? source.magic : source.attack;
        if (this.passive(source, 'G01'))
            attack = Math.max(source.magic, source.attack);
        const swap = isSkill && this.status(source, magic ? 'swap_magic' : 'swap_physical');
        if (swap) {
            attack = magic ? Math.min(source.magic, source.attack) : Math.max(source.magic, source.attack);
            await this.consume(source, swap.code);
        }
        if (this.passive(source, 'G08') && !source.weaponsDifferent)
            attack *= 1 + .05 * this.passive(source, 'G08');
        attack *= 1 + (this.value(source, magic ? 'magic' : 'attack') - this.value(source, magic ? 'magic_down' : 'attack_down') + this.value(source, 'battle_cry') + this.value(source, 'power_surge')) / 100;
        const defense = (magic ? target.magicDefense : target.defense) * (1 - clamp(this.value(target, magic ? 'magic_shatter' : 'armor_shatter') + (!magic ? this.value(target, 'vulnerability') : 0), 0, 80) / 100) * (1 + this.value(target, magic ? 'magic_defense' : 'defense') / 100);
        const setup = await this.attackSetup(source, target, magic, isSkill, options.ranged ?? magic);
        let hit = opposedChance(source.accuracy * (1 + (this.value(source, 'accuracy') + this.value(source, 'precision') - this.value(source, 'accuracy_down') - this.value(source, 'imbalance')) / 100 + (source.weaponsDifferent ? .08 * this.passive(source, 'G08') : 0)), target.evasion * (1 + (target.weaponsDifferent ? .08 * this.passive(target, 'G08') : 0)) * (1 - Math.min(90, this.value(target, 'bind') + this.value(target, 'evasion_down')) / 100));
        hit = (hit + setup.hitBonus - Number(options.hitPenalty ?? 0) / 100) * setup.hitFactor;
        if (!(forceHit || setup.forceHit) && this.random() >= clamp(hit, Number(source.modifiers?.minimumHitRatePct ?? 1) / 100, 1)) {
            this.log.push(`　➥【${target.name}】闪避了攻击。`);
            await this.missed(source, target);
            return false;
        }
        const critical = this.random() < opposedChance(source.crit * (1 + this.value(source, 'crit_bonus') / 100), target.critResist);
        attack *= power / 100 * (isSkill && !options.specializedPower ? source.castSpecialization?.powerFactor ?? 1 : 1);
        const single = options.single !== false;
        const raw = attack * attack / (attack + Math.max(1, defense)) * (critical ? 1 + opposedChance(source.critDamage, target.critReduction) : 1) * (.9 + this.random() * .2) * this.elementFactor(source, target, element) * secondaryScale * setup.powerFactor * (this.hooks.directMultiplier?.(source, target, element, magic, single, options.damageType ?? '打击') ?? 1);
        const dealt = await this.incoming(source, target, raw * this.expansionScale * (isSkill ? source.castSpecialization?.damageFactor ?? 1 : 1), element, magic, isSkill, single);
        const absorbed = await this.take(target, dealt);
        this.log.push(`　➥${critical ? '[暴击]' : ''}【${target.name}】受到 ${dealt} 点${magic ? (element === '无' ? '奥术' : element) : '物理'}伤害${absorbed ? `（护盾吸收 ${absorbed}）` : ''}。`);
        await this.afterHit(source, target, dealt - absorbed, element, isSkill, absorbed, extra);
        return true;
    }
    async cast(source, target, skill, paid, elementChoice = '风', extra = false) {
        const id = skill.id;
        const friends = this.allies(source);
        const enemies = this.enemies(source);
        const others = friends.filter(friend => friend.key !== source.key);
        const defaultAlly = skill.id === 'D01' ? [...others].sort((a, b) => a.mp / a.mpMax - b.mp / b.mpMax)[0] : ['C06', 'F04', 'I04', 'H03'].includes(skill.id) ? this.lowest(others) : source;
        const ally = target.side === source.side && target.hp > 0 ? target : defaultAlly ?? source;
        const originalFoe = target.side !== source.side && target.hp > 0 ? target : enemies[0];
        const redirected = skill.scope === 'enemy' && ['physical', 'magic'].includes(skill.category);
        const foe = originalFoe && redirected ? this.redirect(source, originalFoe, true) : originalFoe;
        const supportBefore = !extra && skill.scope === 'ally' ? this.supportSnapshot(ally) : undefined;
        this.log.push(`➤【${source.name}】释放技能「${skill.name}」`);
        const buff = (code, value, duration, recipient = source) => this.add(recipient, code, specializeEffectValue(code, value, source.castSpecialization?.effectFactor), duration, source);
        const debuff = (code, value, duration, recipient = foe) => { if (recipient)
            this.add(recipient, code, specializeEffectValue(code, value, source.castSpecialization?.effectFactor), duration, source, true); };
        const expanded = !extra && skill.scope === 'enemy' && ['physical', 'magic'].includes(skill.category) && await this.consume(source, 'expand');
        const attack = async (power = skill.power, element = skill.element) => {
            if (!foe)
                return false;
            return this.strike(source, foe, power, element, skill.category === 'magic', extra, false, 1, { redirected, single: !expanded, damageType: skill.damageType, ranged: skill.ranged });
        };
        switch (id) {
            case 'A01':
                buff('expand', 1, 3);
                break;
            case 'A02':
                this.add(ally, 'enchant', 50, 3, source, false, ['风', '雷', '火'].includes(elementChoice) ? elementChoice : '风');
                break;
            case 'A03':
                await attack(105 + (foe && ['slow', 'blind', 'fear'].some(code => this.status(foe, code)) ? 25 : 0));
                break;
            case 'A04':
                if (await attack())
                    debuff('conductive', 20, 2);
                break;
            case 'A05':
                if (foe && await attack()) {
                    const effects = await this.removeLayers(foe, e => !e.mechanism && ['burn', 'poison'].includes(e.code), 1);
                    if (effects.length)
                        await this.secondary(source, foe, Math.min(foe.hpMax * (foe.boss ? .015 : .03), source.magic * 1.5), '炽痕引爆', '火');
                }
                break;
            case 'A06':
                buff('refraction', 35, 2, ally);
                break;
            case 'B01':
                if (foe)
                    await this.control(source, foe, this.pick(['confusion', 'sleep', 'blind']), 65, 3);
                break;
            case 'B02':
                if (foe)
                    await this.control(source, foe, 'petrify', 55, 3);
                break;
            case 'B03':
                if (foe && !await this.control(source, foe, 'charm', 60, 2))
                    await this.control(source, foe, 'blind', 100, 2);
                break;
            case 'B04':
                if (foe && await attack())
                    await this.control(source, foe, 'fear', 55, 1);
                break;
            case 'B05':
                if (foe && await attack())
                    await this.control(source, foe, 'silence', 70, 3);
                break;
            case 'B06':
                if (foe && await attack()) {
                    if (this.status(foe, 'blind'))
                        debuff('slow', 20, 2);
                    else
                        await this.control(source, foe, 'blind', 100, 3);
                }
                break;
            case 'C01':
                if (!extra && !this.status(ally, 'extra_lock') && !this.status(ally, 'extra_block')) {
                    buff('extra_lock', 1, 3, ally);
                    this.hooks.extraAction(ally);
                }
                else
                    this.log.push('　➥目标暂时不能获得额外行动。');
                break;
            case 'C02':
                buff('speed', 35, 1);
                this.reduceCooldown(source);
                break;
            case 'C03': {
                const count = enemies.filter(unit => this.status(unit, 'slow')).length;
                for (const enemy of enemies)
                    debuff('slow', 18, 2, enemy);
                await this.restore(source, source, 0, source.mpMax * Math.min(.12, count * .04));
                break;
            }
            case 'C04':
            case 'M01': {
                const keys = Object.keys(source.cooldowns).filter(code => code !== skill.code && isSkillCooldown(code) && Number(source.cooldowns[code]) >= (id === 'M01' ? 3 : 1) && !['resident_c01', 'resident_c04', 'resident_m01'].includes(code)).sort((a, b) => Number(source.cooldowns[b]) - Number(source.cooldowns[a]));
                const key = keys[0];
                if (key) {
                    source.cooldowns[key] = 0;
                    if (id === 'C04')
                        source.state.memory.debtSkill = key;
                }
                if (id === 'M01') {
                    debuff('slow', 30, 1, source);
                    debuff('exposed', 15, 1, source);
                }
                break;
            }
            case 'C05': {
                const setup = foe?.state.memory.lastHitTurn === this.turn && foe?.state.memory.lastHitter !== source.key;
                if (await attack() && setup) {
                    buff('speed', 15, 1);
                    debuff('slow', 10, 1);
                }
                break;
            }
            case 'C06': {
                const previous = source.selected;
                source.selected = ally.selected;
                ally.selected = previous;
                await this.hooks.swapThreat(source, ally);
                buff('reduction', 10, 1);
                buff('reduction', 10, 1, ally);
                break;
            }
            case 'D01':
                if (ally.key !== source.key)
                    await this.restore(source, ally, 0, Number(source.state.memory.manaTransfer ?? paid));
                delete source.state.memory.manaTransfer;
                break;
            case 'D03':
                if (foe)
                    await this.strike(source, foe, source.mp / source.mpMax < .3 ? 135 : 100, '无', true, extra, false, 1, { redirected, hitPenalty: source.mp / source.mpMax < .3 ? 10 : 0 });
                break;
            case 'D04':
                source.mp -= Math.floor(source.mp * .2);
                buff('mana_discount', 35, 2, ally);
                buff('next_damage', 12, 2, ally);
                break;
            case 'D05': {
                const cost = Math.max(1, Math.ceil(source.hpMax * .1));
                if (source.hp <= cost) {
                    this.log.push('　➥生命不足，无法以血换魔。');
                    break;
                }
                source.hp -= cost;
                await this.restore(source, source, 0, source.mpMax * .25);
                buff('extra_block', 1, 0);
                break;
            }
            case 'D06':
                if (foe && (await this.dispel(source, foe, false, 1, e => ['mana_regen', 'mana_regeneration', 'mana_discount', 'next_damage', 'enchant'].includes(e.code))).length)
                    debuff('mana_tax', 30, 3);
                break;
            case 'E01':
                if (foe) {
                    const effects = await this.dispel(source, foe, true);
                    await attack(90 + Math.min(4, effects.reduce((sum, e) => sum + e.stacks, 0)) * 30);
                }
                break;
            case 'E02': {
                if (foe)
                    await this.dispel(source, foe, false);
                const pool = ['blind', 'slow', 'exposed', 'armor_shatter', 'magic_shatter', 'accuracy_down', 'attack_down', 'magic_down'];
                for (let i = 0; i < 5; i++) {
                    const code = this.pick(pool);
                    pool.splice(pool.indexOf(code), 1);
                    debuff(code, code === 'blind' ? 1 : 10, 1, source);
                }
                break;
            }
            case 'E03':
                if (foe) {
                    const effect = (await this.dispel(source, source, true, 1))[0];
                    if (effect) {
                        if (controls.includes(effect.code))
                            await this.control(source, foe, effect.code, 100, Math.min(3, effect.until - this.turn));
                        else
                            this.add(foe, effect.code, effect.value, Math.min(3, Math.max(1, effect.until - this.turn) + (this.status(foe, effect.code) ? 1 : 0)), source, true);
                    }
                }
                break;
            case 'E04':
                if (foe && await attack() && (await this.dispel(source, foe, false, 1)).length)
                    buff('reduction', 10, 1);
                break;
            case 'E05': {
                const effects = await this.dispel(source, ally, true, Infinity, e => ['burn', 'poison', 'bleed', 'bleeding'].includes(e.code));
                await this.restore(source, ally, ally.hpMax * Math.min(.12, effects.reduce((n, e) => n + e.stacks, 0) * .03));
                break;
            }
            case 'E06':
                if (foe && await attack()) {
                    const effect = this.pick(this.effects(foe).filter(e => !e.mechanism && e.debuff && ['poison', 'burn', 'bleed', 'bleeding', 'armor_shatter', 'magic_shatter'].includes(e.code)));
                    if (effect) {
                        await this.removeEffect(foe, effect);
                        const next = this.add(foe, effect.code, effect.value, Math.min(3, effect.until - this.turn + 1), source, true);
                        next.stacks = Math.min(3, effect.stacks + 1);
                    }
                }
                break;
            case 'F01':
                buff('mirror', 75, 3, ally);
                break;
            case 'F02':
                buff('physical_reduction', 24, 3, ally);
                buff('iron_gate', 1, 3, ally);
                break;
            case 'F03':
                await this.shield(source, ally, ally.hpMax * .14, 3);
                buff('ember_screen', 1, 3, ally);
                break;
            case 'F04':
                buff('transfer', 30, 2, ally);
                buff('reduction', 15, 2);
                break;
            case 'F05':
                buff('phase', 60, 3, ally);
                break;
            case 'F06':
                if (foe && await attack()) {
                    const shield = this.shieldValue(source);
                    if (shield) {
                        const amount = await this.drainShield(source, shield * .2);
                        await this.secondary(source, foe, amount, '反冲铆钉');
                    }
                }
                break;
            case 'G02':
                buff('swap_physical', 1, 2);
                buff('swap_magic', 1, 2);
                break;
            case 'G03':
                if (foe && await attack())
                    await this.secondary(source, foe, Math.min(source.attack, source.magic) * .25, '铸脉余光');
                break;
            case 'G04':
                if (await attack())
                    buff('blade_line', 1, 3);
                break;
            case 'G05': {
                source.state.memory.heavy = source.state.memory.heavy ? 0 : 1;
                await this.remove(source, e => e.data === 'stance' && e.source === source.key);
                const effects = source.state.memory.heavy ? [['speed', 25, false], ['armor_shatter', 12, true], ['magic_shatter', 12, true]] : [['defense', 18, false], ['magic_defense', 18, false], ['slow', 20, true]];
                for (const [code, value, harmful] of effects)
                    this.add(source, code, specializeEffectValue(code, value, source.castSpecialization?.effectFactor), 3, source, harmful, 'stance');
                break;
            }
            case 'G06':
                if (foe) {
                    await this.drainShield(foe, this.shieldValue(foe) * .3);
                    await attack();
                }
                break;
            case 'H01':
                if (!extra)
                    buff('command', 1, 3);
                break;
            case 'H02':
                debuff('flank', 15, 2);
                break;
            case 'H03': {
                const low = target.side === source.side ? ally : this.lowest(friends);
                const high = [...friends].filter(friend => friend !== low).sort((a, b) => b.hp / b.hpMax - a.hp / a.hpMax)[0];
                if (low && high && low !== high)
                    this.add(low, 'transfer', 25, 2, high);
                break;
            }
            case 'H04':
                await this.dispel(source, ally, true, Infinity, e => ['slow', 'blind'].includes(e.code));
                buff('speed', 18, 2, ally);
                break;
            case 'H05':
                for (const friend of friends)
                    buff('beat', 20, 3, friend);
                break;
            case 'H06':
                for (const enemy of enemies)
                    debuff('taunted', 1, 2, enemy);
                buff('reduction', 20, 2);
                break;
            case 'I02':
                if (this.expansionScale === 1)
                    source.hp = Math.max(1, source.hp - Math.floor(source.hp * .1));
                await attack(source.hp / source.hpMax < .35 ? 160 : 135);
                break;
            case 'I03':
                if (source.hp / source.hpMax < .4) {
                    await this.dispel(source, source, true, 1);
                    await this.restore(source, source, 0, source.mpMax * .12);
                }
                else
                    await this.restore(source, source, 0, source.mpMax * .06);
                break;
            case 'I04': {
                const recipient = ally.key !== source.key ? ally : this.lowest(friends.filter(unit => unit.key !== source.key));
                if (recipient) {
                    const cost = Math.max(1, Math.ceil(source.hp * .15));
                    if (source.hp <= cost) {
                        this.log.push('　➥生命不足，无法转移生命。');
                        break;
                    }
                    source.hp -= cost;
                    await this.restore(source, recipient, source.hpMax * .18);
                }
                break;
            }
            case 'I05':
                await attack(foe && foe.hp / foe.hpMax < .3 ? 145 : 100);
                break;
            case 'I06':
                if (this.once(source, 'feignUsed', true))
                    buff('feign', 1, 2);
                break;
            case 'J01':
                for (const friend of /雾|雨|湿/.test(this.weather) ? friends : [source]) {
                    buff('accuracy', 15, 2, friend);
                    buff('blind_resist', 30, 2, friend);
                }
                break;
            case 'J02':
                if (/高温|灰雨|火|炎/.test(this.weather))
                    await attack(125);
                else {
                    await attack(90);
                    debuff('fire_vulnerable', 10, 1, source);
                }
                break;
            case 'J03':
                for (const enemy of /风|山|崖/.test(this.weather) ? enemies : foe ? [foe] : [])
                    debuff('slow', 15, 1, enemy);
                break;
            case 'J04':
                if (/雷/.test(this.weather)) {
                    if (await attack(110))
                        debuff('taunted', 1, 1);
                }
                else
                    debuff('conductive', 20, 2);
                break;
            case 'J05':
                for (const friend of /水|湿|河|潮/.test(this.weather) ? friends : [ally]) {
                    buff('reduction', 12, 2, friend);
                    await this.dispel(source, friend, true, 1, e => e.code === 'slow');
                }
                break;
            case 'J06':
                for (const enemy of /雪|冰|极光/.test(this.weather) ? enemies : foe ? [foe] : []) {
                    if (this.status(enemy, 'blind'))
                        await this.dispel(source, enemy, false, 1);
                    else
                        await this.control(source, enemy, 'blind', 100, 1);
                }
                break;
            case 'K01':
                buff('forge', 20, 3, ally);
                break;
            case 'K02':
                await this.restore(source, ally, ally.hpMax * .15, Math.min(ally.mpMax * .08, paid * .6));
                await this.dispel(source, ally, true, 1, e => ['poison', 'burn'].includes(e.code));
                break;
            case 'K03':
                if (foe && await attack())
                    await this.dispel(source, foe, false, 1, e => ['shield', 'life_shield', 'barrier', 'enchant'].includes(e.code));
                break;
            case 'K04':
                if (foe) {
                    const effect = this.effects(foe).find(e => !e.debuff);
                    const cooling = Object.entries(foe.cooldowns).filter(([code, value]) => isSkillCooldown(code) && Number(value) > 0).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
                    this.add(foe, 'indexed', 1, 2, source, true, effect?.code);
                    this.log.push(`　&索引&${this.status(foe, 'nightmare') ? '信息被雾遮蔽' : `${effect ? names[effect.code] ?? effect.code : '无增益'}；最长冷却：${cooling ? `${residentSkillByCode(cooling[0])?.name ?? cooling[0]}（${cooling[1]}）` : '无'}`}。`);
                }
                break;
            case 'K05':
                buff('aim', 1, 3);
                break;
            case 'K06':
                if ((await this.dispel(source, ally, true, 1, e => ['sleep', 'fear', 'confusion'].includes(e.code))).length) {
                    buff('speed', 20, 2, ally);
                    buff('extra_block', 1, 0, ally);
                }
                break;
            case 'L01': break;
            case 'L02':
                buff('false_shadow', 45, 3);
                break;
            case 'L03':
                await attack(foe && (this.status(source, 'nightmare') || (foe.appraisal ?? 0) < 3) ? 120 : 85);
                break;
            case 'L04':
                if (foe) {
                    if (foe.state.cast) {
                        foe.mp = Math.min(foe.mpMax, foe.mp + Math.floor(foe.state.cast.paid / 2));
                        delete foe.state.cast;
                        this.log.push(`　&打断&【${foe.name}】的吟唱中断，返还一半已支付 MP。`);
                    }
                    await this.control(source, foe, 'silence', 60, 2);
                }
                break;
            case 'L05':
                if (foe) {
                    debuff('accuracy_down', 10, 2);
                    const effect = this.pick(this.effects(foe).filter(e => !e.debuff));
                    if (effect)
                        this.add(foe, 'false_compass', 1, 2, source, true, effect.code + '|' + this.pick(['法镜', '临锻回火', '生命护盾', '三相附锋'].filter(name => name !== names[effect.code])));
                }
                break;
            case 'L06':
                if (await attack())
                    debuff('shadow_mark', 20, 2);
                break;
            case 'M02':
                for (const friend of friends)
                    buff('echo', 50, 3, friend);
                break;
            case 'M03':
                if (foe)
                    await attack(155 + Math.min(3, this.effects(foe).filter(e => !e.debuff).length) * 15 + Math.min(3, this.effects(foe).filter(e => e.debuff).length) * 10);
                break;
            case 'M04': {
                const effects = this.effects(source).filter(e => !e.mechanism && Boolean(opposite[e.code]));
                const selected = [...effects.filter(e => e.debuff).slice(0, 3), ...effects.filter(e => !e.debuff).slice(0, 3)];
                await this.remove(source, e => selected.some(selectedEffect => this.sameEffect(e, selectedEffect)));
                for (const effect of selected)
                    this.add(source, opposite[effect.code], effect.value, Math.max(1, effect.until - this.turn + 1), source, !effect.debuff);
                break;
            }
            case 'M05':
                buff('roots', 1, 3);
                break;
            case 'M06':
                if (foe) {
                    const removed = await this.remove(foe, e => !e.mechanism && e.debuff && ['poison', 'burn', 'bleed', 'bleeding', 'armor_shatter', 'magic_shatter'].includes(e.code));
                    const scale = 1 + Math.min(.9, removed.reduce((n, e) => n + e.stacks, 0) * .18);
                    await this.strike(source, foe, 135, '暗', true, extra, false, scale, { redirected });
                }
                break;
            default: throw new Error(`未注册主动规则：${id}`);
        }
        if (expanded) {
            const previousScale = this.expansionScale;
            try {
                this.expansionScale = .65;
                for (const other of enemies.filter(unit => unit.key !== foe?.key && unit.hp > 0))
                    await this.cast(source, other, skill, 0, elementChoice, true);
            }
            finally {
                this.expansionScale = previousScale;
            }
        }
        if (supportBefore)
            await this.echoSupport(source, ally, supportBefore);
    }
    addMechanism(source, target, code, value, key, debuff = true) {
        const effect = this.add(target, code, value, Number.MAX_SAFE_INTEGER - this.turn, source, debuff);
        effect.mechanism = key;
        if (code === 'nightmare')
            target.state.memory.nightmareMechanism = key;
        return effect;
    }
    async releaseMechanism(key) {
        for (const unit of this.units) {
            if (unit.state.memory.nightmareMechanism === key) {
                unit.state.memory.nightmareBroken = 1;
                await this.remove(unit, e => e.code === 'nightmare');
            }
            await this.remove(unit, e => e.mechanism === key);
        }
    }
    start() {
        for (const unit of this.units) {
            if (this.passive(unit, 'L01') && !unit.state.memory.nightmareBroken && !this.status(unit, 'nightmare'))
                this.add(unit, 'nightmare', 1, Number.MAX_SAFE_INTEGER - this.turn, unit);
            unit.state.memory.weather ??= this.weather;
            if (this.status(unit, 'nightmare'))
                unit.state.memory.hiddenLogTurn = this.turn;
            if (Number(unit.state.memory.lastElementTurn ?? 0) === this.turn - 1)
                unit.state.memory.previousElement = unit.state.memory.lastElement ?? '';
            else if (Number(unit.state.memory.lastElementTurn ?? 0) < this.turn - 1)
                delete unit.state.memory.previousElement;
            if (this.passive(unit, 'M08') && this.once(unit, 'calculation', true)) {
                const safe = ['D02', 'D08', 'E07', 'H08', 'I01', 'I08'];
                const id = this.pick(safe.filter(id => !this.passive(unit, id)));
                if (id) {
                    unit.state.memory.copy = id;
                    unit.state.memory.copyUntil = this.turn + 1;
                    this.log.push(`&无界演算&【${unit.name}】演算「${residentSkillByCode(id)?.name}」的40%数值，持续2回合。`);
                }
            }
        }
    }
    end() {
        for (const unit of this.units) {
            const nightmare = unit.state.statuses.find(e => e.code === 'nightmare' && e.until === this.turn);
            unit.state.statuses = unit.state.statuses.filter(e => e.until > this.turn);
            if (nightmare)
                this.add(unit, 'blind', 1, 1, unit, true);
            unit.state.memory.flankHits = 0;
        }
    }
}
const registeredResidentActives = residentSkills.filter(skill => skill.category !== 'passive').map(skill => skill.id);

export { CombatRules, displayedRuleName, emptyRuleState, maskRuleBattleLog, readRuleState, registeredResidentActives, ruleManaCost, ruleStatusSummary, visibleResidentBuff };
