import { talentCanPaySkill, talentPaySkill, talentCommitAction } from './talent-combat.js';
import { correctedHitChance, strikeCorrections } from './combat-math.js';
import { hiddenSkill } from './hidden-profession.config.js';
import { hiddenMix, rollHiddenMix } from './hidden-particles.js';
import { inventorCapability, inventorProjection } from './hidden-device-protocol.js';
import { specializeTime, specializeEffectValue } from './skill-specialization.js';
import { hiddenState, gainHiddenResource, hiddenResourceShortage, hiddenActionKey } from './hidden-combat-state.js';

class HiddenBattleError extends Error {
}
const hiddenDamageSource = (r, source, target, direct = false) => incoming.set(r, { source, target, direct });
const metadata = (effect) => { try {
    return JSON.parse(effect?.data ?? '{}');
}
catch {
    return {};
} };
const actor = new WeakMap();
const reward = (r, owner, amount) => { const state = hiddenState(owner), consumed = state.consumes; if (actor.get(r) !== owner)
    state.consumes = false; const gain = gainHiddenResource(owner, r.turn, amount); state.consumes = consumed; return gain; };
const incoming = new WeakMap();
const hiddenNames = { hidden_freeze: '冻结', hidden_stun: '眩晕', hidden_heal_down: '愈合抑制', hidden_mark: '落子定势', hidden_echo: '合围窗口', hidden_plan: '条件预案', hidden_guard: '守势', hidden_outgoing: '压制', hidden_once: '扩散掩护', hidden_light: '净光', hidden_evade: '闪避预备' };
const effect = (r, u, code, value, duration, source, debuff = false, data = {}) => {
    const previous = r.status(u, code);
    if (data.accident && previous && previous.source !== source.key && previous.value >= value)
        return previous;
    if (['hidden_mark', 'hidden_plan', 'hidden_echo'].includes(code))
        u.state.statuses = u.state.statuses.filter(e => e.code !== code);
    const result = r.add(u, code, value, duration, source, debuff, JSON.stringify(data));
    result.until = r.turn + duration;
    return result;
};
const hiddenShield = (r, source, target, amount, duration = 2, data = {}) => {
    if (target.hp <= 0)
        return 0;
    const old = r.status(target, 'shield'), available = Math.max(0, target.hpMax - r.value(target, 'life_shield'));
    const value = Math.min(available, Math.floor(amount));
    if (value <= (old?.value ?? 0))
        return 0;
    effect(r, target, 'shield', value, duration, source, false, { hidden: true, ...data });
    r.log.push(`　➥【${target.name}】获得 ${value} 点护盾。`);
    return value - (old?.value ?? 0);
};
const inherit = (r, u) => {
    const state = hiddenState(u);
    if (state.inheritance)
        return;
    state.inheritance = true;
    hiddenShield(r, u, u, .04 * u.hpMax);
};
const locked = (r, u) => r.effects(u).some(e => ['sleep', 'petrify', 'charm', 'fear', 'alchemy_stun', 'hidden_stun', 'hidden_freeze'].includes(e.code));
const readySource = (r, key) => r.units.find(u => u.key === key && u.hp > 0 && u.participating !== false && !locked(r, u));
const priority = (units, first) => first ? [first, ...units.filter(u => u !== first)] : units;
const hiddenHealingFactor = (r, u) => 1 - Math.min(90, r.value(u, 'hidden_heal_down')) / 100;
const hiddenDeviceSnapshot = (r) => r.units.map(u => ({ key: u.key, side: u.side, hp: u.hp, effects: JSON.stringify(r.effects(u).map(e => [e.code, e.value, e.stacks]).sort()) }));
const hiddenNativeDevice = (r, source, skill, before) => {
    const state = hiddenState(source), capability = inventorCapability(skill);
    if (state.profession !== 'inventor' || !capability)
        return;
    const effective = r.units.some(u => { const old = before.find(b => b.key === u.key); return old && (u.side === source.side ? u.hp > old.hp : u.hp < old.hp) || old && JSON.stringify(r.effects(u).map(e => [e.code, e.value, e.stacks]).sort()) !== old.effects; });
    if (effective) {
        gainHiddenResource(source, r.turn, 20 + (state.lastCapability && state.lastCapability !== capability.primary ? 10 : 0));
        state.lastCapability = capability.primary;
    }
};
const hiddenBeforeAction = async (r, u) => {
    actor.set(r, u);
    incoming.delete(r);
    const state = hiddenState(u);
    state.action++;
    delete state.active;
    delete state.consumes;
    for (const target of r.units) {
        const plan = r.status(target, 'hidden_plan'), data = metadata(plan);
        if (!plan || data.mode !== 'interrupt' || target !== u || !u.state.cast)
            continue;
        const owner = readySource(r, plan.source);
        if (owner)
            await interrupt(r, owner, target, plan);
    }
};
const interrupt = async (r, source, target, plan) => {
    const cast = target.state.cast;
    if (!cast)
        return;
    const stamp = `${cast.code}/${cast.releaseTurn}`;
    if (target.state.memory.hiddenInterrupt === stamp) {
        await r.removeEffect(target, plan);
        return;
    }
    target.state.memory.hiddenInterrupt = stamp;
    await r.removeEffect(target, plan);
    const immune = r.effects(target).some(e => e.mechanism && ['silence', 'petrify', 'sleep'].includes(e.code));
    if (!immune && r.random() < .5 * (target.boss ? .4 : 1)) {
        delete target.state.cast;
        reward(r, source, 20);
        inherit(r, source);
        r.log.push(`　➥【${source.name}】截断了【${target.name}】的吟唱。`);
    }
    else
        r.log.push(`　➥【${target.name}】顶住截断，继续吟唱。`);
};
const hiddenIncoming = async (r, source, target, amount, direct = true, magic = false) => {
    incoming.set(r, { source, target, direct });
    for (const status of r.effects(target).filter(e => metadata(e).untilHit))
        await r.removeEffect(target, status);
    if (source.side === target.side)
        return amount;
    const key = hiddenActionKey(source, r.turn);
    if (direct) {
        for (const code of ['hidden_once', 'hidden_evade']) {
            if (code === 'hidden_evade' && magic)
                continue;
            const shield = r.status(target, code);
            if (shield) {
                amount *= 1 - shield.value / 100;
                await r.removeEffect(target, shield);
            }
        }
        const out = r.status(source, 'hidden_outgoing');
        if (out) {
            const data = metadata(out);
            if (data.allActions || !data.action || data.action === key) {
                data.action = key;
                out.data = JSON.stringify(data);
                amount *= 1 - out.value / 100;
            }
            else
                await r.removeEffect(source, out);
        }
        const plan = r.status(target, 'hidden_plan');
        if (plan && metadata(plan).mode === 'guard') {
            const owner = readySource(r, plan.source);
            if (owner) {
                effect(r, target, 'hidden_guard', plan.value, 1, owner, false, { action: key });
                await r.removeEffect(target, plan);
                reward(r, owner, 20);
                inherit(r, owner);
            }
        }
        const guard = r.status(target, 'hidden_guard');
        if (guard && metadata(guard).action === key)
            amount *= 1 - guard.value / 100;
        const mark = r.status(target, 'hidden_mark'), data = metadata(mark);
        const owner = mark && readySource(r, mark.source);
        if (mark && owner && owner.side === source.side && data.created !== key && (data.charges > 0 || data.action === key)) {
            if (data.action !== key) {
                data.action = key;
                data.spent = 0;
                data.charges--;
            }
            const added = Math.max(0, Math.min(amount * mark.value / 100, data.cap - data.spent));
            amount += added;
            data.spent += added;
            if (added > 0 && !data.rewarded) {
                data.rewarded = true;
                if (source !== owner || !hiddenState(source).consumes)
                    reward(r, owner, 10);
            }
            mark.data = JSON.stringify(data);
        }
    }
    return Math.max(0, Math.floor(amount));
};
const hiddenBeforeDamage = async (r, target, damage) => {
    const context = incoming.get(r);
    incoming.delete(r);
    const source = context?.target === target ? context.source : actor.get(r);
    const plan = r.status(target, 'hidden_plan');
    if (plan && metadata(plan).mode === 'rescue' && source && source.side !== target.side && damage > 0 && target.hp - damage <= target.hpMax * .4) {
        const owner = readySource(r, plan.source);
        if (owner) {
            await r.removeEffect(target, plan);
            const gained = hiddenShield(r, owner, target, target.hpMax * plan.value / 100);
            const absorbed = await r.drainShield(target, damage);
            damage -= absorbed;
            if (gained > 0 || absorbed > 0) {
                reward(r, owner, 20);
                inherit(r, owner);
            }
        }
    }
    return damage;
};
const hiddenAbsorbed = async (r, target, shield, amount) => {
    const context = incoming.get(r), data = metadata(shield);
    if (!shield || amount <= 0 || context?.target !== target || context.source.side === target.side)
        return;
    const source = r.units.find(u => u.key === shield.source && u.hp > 0);
    if (!source)
        return;
    if (data.guard && !data.triggered && r.once(source, 'hiddenGuardIncome')) {
        const consumed = hiddenState(source).consumes;
        hiddenState(source).consumes = false;
        gainHiddenResource(source, r.turn, 20);
        hiddenState(source).consumes = consumed;
        data.triggered = true;
    }
    if (data.earth && !data.triggered && context.direct) {
        await r.restore(source, target, Math.min(amount * .5, Number(data.earth)), 0, true);
        data.triggered = true;
    }
    shield.data = JSON.stringify(data);
};
const hiddenAfterHit = async (r, source, target, skill, extra) => {
    if (extra || source.side === target.side)
        return;
    if (!skill && r.once(source, 'hiddenBasic'))
        gainHiddenResource(source, r.turn, 10);
    const key = hiddenActionKey(source, r.turn);
    for (const enemy of priority(r.enemies(source), target)) {
        const window = r.status(enemy, 'hidden_echo'), data = metadata(window);
        const owner = window && readySource(r, window.source);
        if (!window || !owner || owner.side !== source.side || data.created === key || !data.charges || data.used?.[source.key] === r.turn || enemy !== target)
            continue;
        if (!r.once(source, 'hiddenEchoAction' + key))
            return;
        data.used ??= {};
        data.used[source.key] = r.turn;
        data.charges--;
        window.data = JSON.stringify(data);
        if (r.random() < correctedHitChance(data.accuracy / Math.max(1, data.accuracy + enemy.evasion), strikeCorrections(owner, enemy))) {
            const x = data.attack * .7, defense = data.magic ? enemy.magicDefense : enemy.defense;
            await r.secondary(owner, enemy, x * x / (x + Math.max(1, defense)) * data.scale, '合围追击', data.magic ? '奥术' : '无', false);
        }
        else
            r.log.push(`　➥【${enemy.name}】避开了合围追击。`);
        break;
    }
};
const hiddenEndTurn = async (r) => {
    for (const source of r.units) {
        const state = hiddenState(source), due = state.ticks.filter(t => t.turn <= r.turn);
        state.ticks = state.ticks.filter(t => t.turn > r.turn);
        for (const tick of due) {
            const target = r.units.find(u => u.key === tick.target && u.hp > 0);
            if (!target)
                continue;
            if (tick.kind === 'damage') {
                incoming.set(r, { source, target, direct: false });
                const absorbed = await r.take(target, Math.floor(tick.amount), 1, source);
                r.log.push(`　➥${tick.label}使【${target.name}】损失 ${Math.max(0, Math.floor(tick.amount) - absorbed)} HP。`);
            }
            else if (tick.kind === 'shield')
                hiddenShield(r, source, target, tick.amount);
            else {
                const low = target.hp < target.hpMax * .4;
                await r.restore(source, target, Math.min(tick.amount, (tick.healLimit ?? Infinity) / Math.max(.01, r.healingMultiplier(source, target))), 0, true, tick.healLimit);
                if (low && target.hp >= target.hpMax * .4 && tick.growthShield && r.once(target, 'hiddenGrowth:' + tick.source, true))
                    hiddenShield(r, source, target, tick.growthShield);
            }
        }
        if (state.catalyst && state.catalyst.until <= r.turn)
            delete state.catalyst;
        for (const target of r.units)
            await r.remove(target, e => ['hidden_plan', 'hidden_mark', 'hidden_echo'].includes(e.code) && e.source === source.key && (source.hp <= 0 || source.participating === false));
    }
};
const hiddenReorder = (r, queue, unit, bonus = false) => {
    if (bonus)
        return queue;
    for (const source of r.units) {
        const state = hiddenState(source), order = state.order;
        if (!order || order.turn > r.turn)
            continue;
        delete state.order;
        const from = queue.findIndex(entry => unit(entry).key === order.target && unit(entry).hp > 0);
        const to = from < 0 ? -1 : Math.max(0, Math.min(queue.length - 1, from + order.delta));
        if (from < 0 || from === to) {
            gainHiddenResource(source, r.turn, 30, true);
            r.log.push(`　➥调度未改变行动位置，向【${source.name}】返还30筹策。`);
        }
        else {
            const [entry] = queue.splice(from, 1);
            queue.splice(to, 0, entry);
            r.log.push(`　➥【${unit(entry).name}】按调度改变行动位置。`);
        }
    }
    return queue;
};
const executeHiddenCombat = async (r, u, code, choice, ctx) => {
    const definition = hiddenSkill(code);
    if (!definition)
        return false;
    choice = { ...choice };
    if (choice.target === 'lowest')
        choice.target = r.lowest(r.allies(u))?.key;
    if (choice.target === 'self')
        choice.target = u.key;
    if (choice.target === 'current')
        choice.target = undefined;
    const state = hiddenState(u);
    if (state.profession !== definition.profession)
        throw new HiddenBattleError('当前职业不能使用这项隐藏二转技能。');
    if (u.hp <= 0 || locked(r, u) || r.status(u, 'silence'))
        throw new HiddenBattleError('当前状态不能施放技能。');
    if (Number(u.cooldowns[code] ?? 0) > 0)
        throw new HiddenBattleError('技能尚在冷却。');
    const enemy = r.enemies(u).find(t => t.key === choice.target) ?? r.enemies(u).find(t => t.key === u.selected) ?? r.enemies(u)[0];
    const ally = r.allies(u).find(t => t.key === choice.target) ?? u;
    const spec = u.castSpecialization, fixed = ['hidden_overclock', 'hidden_transfer', 'hidden_debug'].includes(code), support = fixed ? 1 : spec?.supportFactor ?? 1, potency = fixed ? 1 : spec?.effectFactor ?? 1;
    let mix = code === 'hidden_mix' || code === 'hidden_kettle' ? hiddenMix(choice.particles ?? [], 'success', code === 'hidden_kettle') : undefined;
    let mana = r.manaCost(u, Math.ceil((mix?.mana ?? definition.mana) * (spec?.manaFactor ?? 1))), cooldown = mix?.cooldown ?? definition.cooldown;
    cooldown = Math.max(0, specializeTime(cooldown, spec?.timeChange ?? 0));
    if (u.mp < mana)
        throw new HiddenBattleError(`MP不足，需要${mana}。`);
    const shortage = hiddenResourceShortage(code, u.cooldowns);
    if (shortage)
        throw new HiddenBattleError(shortage);
    if (choice.target && !r.units.some(t => t.key === choice.target && t.hp > 0 && t.participating !== false))
        throw new HiddenBattleError('选定目标已经失效，请重新选择。');
    let weapons = (choice.weapons ?? ctx.weapons.slice(0, 1).map(w => w.id)).map(id => ctx.weapons.find(w => w.id === id));
    if (definition.profession === 'weapon_master' && code !== 'hidden_weapon_guard' && (!enemy || !weapons.length || weapons.length > 3 || weapons.some(w => !w) || new Set(weapons.map(w => w?.id)).size !== weapons.length))
        throw new HiddenBattleError('请选择器阵内1～3件不同武器及存活敌人。');
    if (code === 'hidden_weapon_strike' && weapons.length !== 1)
        throw new HiddenBattleError('御击只能选择一件武器。');
    if (['hidden_mark', 'hidden_finale'].includes(code) && !enemy)
        throw new HiddenBattleError('没有存活敌人。');
    if (code === 'hidden_catalyst' && !['stable', 'excite'].includes(choice.mode ?? ''))
        throw new HiddenBattleError('请选择稳定或激发。');
    if (code === 'hidden_plan' && !['guard', 'rescue', 'interrupt'].includes(choice.mode ?? ''))
        throw new HiddenBattleError('请选择守势、接应或截断。');
    if (code === 'hidden_plan' && r.units.some(t => r.effects(t).some(e => e.code === 'hidden_plan' && e.source === u.key)))
        throw new HiddenBattleError('你已有尚未触发的预案。');
    if (code === 'hidden_plan' && r.status(choice.mode === 'interrupt' ? enemy ?? u : ally, 'hidden_plan'))
        throw new HiddenBattleError('目标已有一项待命预案。');
    if (code === 'hidden_plan' && choice.mode === 'interrupt' && !enemy)
        throw new HiddenBattleError('截断需要一名存活敌人。');
    const chosenTarget = r.units.find(t => t.key === choice.target);
    if (chosenTarget && (code === 'hidden_weapon_guard' || code === 'hidden_order' && choice.mode === 'advance' || code === 'hidden_plan' && choice.mode !== 'interrupt') && chosenTarget.side !== u.side)
        throw new HiddenBattleError('该模式需要选择友方。');
    if (chosenTarget && (code === 'hidden_order' && choice.mode === 'delay' || code === 'hidden_plan' && choice.mode === 'interrupt') && chosenTarget.side === u.side)
        throw new HiddenBattleError('该模式需要选择敌方。');
    const orderTarget = choice.mode === 'delay' ? enemy : ally;
    if (code === 'hidden_order') {
        if (!['advance', 'delay'].includes(choice.mode ?? '') || !orderTarget || choice.mode === 'delay' && orderTarget.boss)
            throw new HiddenBattleError('请选择提位友方或延后普通敌人。');
        if (r.units.some(t => { const o = hiddenState(t).order; return o && o.turn === r.turn + 1 && (o.side === u.side || o.target === orderTarget.key); }))
            throw new HiddenBattleError('下轮已有同阵营调度或目标冲突。');
    }
    const selected = (choice.devices ?? []).map(selection => {
        const device = ctx.devices.find(d => d.id === selection.id), skill = device?.skills.find(s => s.code === selection.skill), capability = skill && inventorCapability(skill);
        return { device, skill, capability };
    });
    const donor = ctx.devices.find(d => d.id === choice.donor);
    if (definition.profession === 'inventor') {
        if (state.driverTurn === r.turn)
            throw new HiddenBattleError('本轮已驱动异械，额外行动不能再次驱动。');
        const count = code === 'hidden_synergy' ? 2 : 1;
        if (selected.length !== count || new Set(selected.map(s => s.device?.code)).size !== count || selected.some(s => !s.device || !s.skill || !s.capability))
            throw new HiddenBattleError('请选择符合能力协议的异械与原生模式。');
        for (const { device, skill } of selected) {
            const reduction = code === 'hidden_debug' ? 2 : 0;
            if (Number(u.cooldowns[`device_${device.id}_${skill.code}`] ?? 0) > reduction)
                throw new HiddenBattleError('异械原生模式仍在冷却。');
            const bonus = ['hidden_debug', 'hidden_transfer'].includes(code) ? Math.min(30, device.max - device.energy) : 0;
            if (device.energy + bonus < skill.energyCost)
                throw new HiddenBattleError('异械能量不足，不能启动。');
        }
        if (code === 'hidden_debug' && choice.donor && !donor)
            throw new HiddenBattleError('追加维护的异械不在主脑中。');
        if (code === 'hidden_transfer') {
            const receiver = selected[0];
            if (!donor || donor.id === receiver.device.id || donor.energy < 40 || receiver.device.max - receiver.device.energy < 30 || receiver.device.energy >= receiver.skill.energyCost || (receiver.capability.energyType ?? 'standard') !== (inventorCapability(donor.skills[0])?.energyType ?? 'standard'))
                throw new HiddenBattleError('转供需要兼容供体40能量，且接收者当前不足、补30后能立即启动。');
        }
    }
    const harmful = mix ? mix.branches.some(branch => branch.damage > 0) : definition.power > 0;
    if (!talentCanPaySkill(u, harmful))
        throw new HiddenBattleError('焚命者需要支付8%最大HP并保留1HP。');
    if (mix)
        await ctx.payParticles([...mix.particles]);
    talentPaySkill(u, harmful);
    talentCommitAction(u, harmful ? 'skill' : 'support', definition.profession === 'weapon_master' ? '斩击' : '奥术', mix ? mix.targets === 1 : code !== 'hidden_weapon_finale', definition.profession !== 'weapon_master');
    u.mp -= mana;
    state.resource -= definition.resource;
    state.active = code;
    state.consumes = definition.resource > 0;
    await r.paid(u, mana, { category: definition.profession === 'weapon_master' ? 'physical' : definition.power ? 'magic' : 'utility', cooldown });
    u.cooldowns[code] = cooldown + 1;
    r.log.push(`➤【${u.name}】施放「${definition.name}」 · MP −${mana}${definition.resource ? ` · 专属资源 −${definition.resource}` : ''}`);
    if (mix) {
        const outcome = rollHiddenMix(mix.particles.length, state.catalyst?.mode, code === 'hidden_kettle', r.random);
        delete state.catalyst;
        mix = hiddenMix(mix.particles, outcome, code === 'hidden_kettle');
        await executeMix(r, u, mix, ally, enemy);
        gainHiddenResource(u, r.turn, 25 + (state.lastPrimary && state.lastPrimary !== mix.primary ? 10 : 0));
        state.lastPrimary = mix.primary;
        if (code === 'hidden_kettle')
            u.cooldowns.hidden_mix = Math.max(2, Number(u.cooldowns.hidden_mix ?? 0));
    }
    else if (code === 'hidden_catalyst')
        state.catalyst = { mode: choice.mode, until: r.turn + 2 };
    else if (code === 'hidden_neutralize') {
        for (const friend of r.allies(u)) {
            const removed = await r.remove(friend, e => e.debuff && e.source === u.key && metadata(e).accident === true, 1);
            if (removed.length) {
                r.log.push(`　➥中和了【${friend.name}】的一项调配事故。`);
                inherit(r, u);
            }
            else
                hiddenShield(r, u, friend, .06 * friend.hpMax * support);
        }
    }
    else if (code === 'hidden_weapon_guard')
        hiddenShield(r, u, ally, Math.min(.2 * ally.hpMax, (.08 * ally.hpMax + .3 * (u.defense + u.magicDefense)) * support), 2, { guard: true });
    else if (definition.profession === 'weapon_master') {
        const chosen = weapons, aoe = code === 'hidden_weapon_finale';
        const power = code === 'hidden_weapon_strike' ? 125 : aoe ? [0, 145, 95, 75][chosen.length] : [0, 165, 110, 90][chosen.length];
        let effective = false;
        const seenTypes = new Set();
        for (let index = 0; index < chosen.length; index++) {
            const weapon = chosen[index], firstType = !seenTypes.has(weapon.type), magic = ['法杖', '法书', '魔导书', '法球', 'staff', 'book', 'orb'].includes(weapon.type), a = magic ? u.magic : u.attack, b = magic ? weapon.magic : weapon.attack;
            seenTypes.add(weapon.type);
            const ratio = (.8 * a + .2 * Math.min(b, a)) / Math.max(1, a);
            const targets = aoe ? r.enemies(u) : [enemy?.hp ? enemy : r.enemies(u)[0]].filter(Boolean);
            for (const target of targets) {
                const traitAllowed = firstType && (!aoe || index === 0 && target === targets[0]);
                const hit = await r.strike(u, target, power * ratio, weapon.element, magic, index > 0, false, 1, { skill: true, single: !aoe, hitPenalty: traitAllowed && ['匕首', 'dagger'].includes(weapon.type) ? -10 : 0, finalMultiplier: traitAllowed && ['法杖', 'staff'].includes(weapon.type) ? 1.05 : 1 });
                effective ||= hit;
                if (hit && traitAllowed)
                    await weaponTrait(r, u, target, weapon, potency);
            }
        }
        if (effective && code === 'hidden_weapon_strike') {
            gainHiddenResource(u, r.turn, 20 + (state.lastType && state.lastType !== chosen[0].type ? 10 : 0));
            state.lastType = chosen[0].type;
        }
        if (effective && code === 'hidden_weapon_combo')
            inherit(r, u);
    }
    else if (definition.profession === 'inventor') {
        state.driverTurn = r.turn;
        if (donor && code === 'hidden_transfer') {
            donor.energy -= 40;
            selected[0].device.energy += 30;
        }
        if (code === 'hidden_debug')
            for (const device of [selected[0].device, ...(choice.donor && donor && donor !== selected[0].device ? [donor] : [])]) {
                device.energy = Math.min(device.max, device.energy + 30);
                for (const skill of device.skills) {
                    const key = `device_${device.id}_${skill.code}`;
                    u.cooldowns[key] = Math.max(0, Number(u.cooldowns[key] ?? 0) - 2);
                }
            }
        const budget = { control: false, dispel: 0 }, results = [];
        for (const selection of selected) {
            if (!r.enemies(u).length || u.hp <= 0)
                break;
            const device = selection.device, skill = selection.skill, capability = code === 'hidden_synergy' ? inventorProjection(selection.capability) : selection.capability;
            device.energy -= skill.energyCost;
            u.cooldowns[`device_${device.id}_${skill.code}`] = skill.cooldownTurns + 1;
            if (capability.selfHpCost)
                u.hp = Math.max(1, u.hp - Math.floor(u.hp * capability.selfHpCost / 100));
            const active = ctx.activeCodes ?? [];
            const numeric = code === 'hidden_synergy' ? .9 : code === 'hidden_overclock' ? 1.2 : code === 'hidden_debug' ? 1.25 : 1;
            const stateScale = code === 'hidden_synergy' ? .8 : ['hidden_overclock', 'hidden_debug'].includes(code) ? 1.1 : 1;
            let effective = false;
            const allEnemies = String(skill.targetScope).includes('all_enem'), allAllies = String(skill.targetScope).includes('all_all');
            for (const fragment of capability.fragments) {
                const negative = fragment.kind === 'damage' || fragment.kind === 'control' || fragment.kind === 'dispel' || fragment.kind === 'status' && fragment.debuff;
                const targets = skill.targetScope === 'any' ? [r.units.find(t => t.key === choice.target && t.hp > 0) ?? ally] : negative ? priority(r.enemies(u), enemy) : skill.targetScope === 'self' ? [u] : priority(r.allies(u), ally);
                const limit = (negative ? allEnemies : allAllies) ? code === 'hidden_synergy' ? 3 : targets.length : 1;
                for (const target of targets.slice(0, limit)) {
                    if (fragment.kind === 'damage')
                        effective = await r.strike(u, target, fragment.power * (1 + (active.includes('rail_stabilizer') ? .12 : 0) + (fragment.element === '雷' && active.includes('electromagnetic_coil_cannon') ? .12 : 0)), fragment.element ?? '', fragment.magic ?? false, false, false, 1, { skill: true, single: !allEnemies, accuracyMultiplier: active.includes('precision_scope') ? 1.1 : 1, specializedPower: fixed, finalMultiplier: numeric, damageCap: code === 'hidden_synergy' ? (2 * (fragment.magic ? u.magic : u.attack)) ** 2 / (2 * (fragment.magic ? u.magic : u.attack) + Math.max(1, fragment.magic ? target.magicDefense : target.defense)) : undefined }) || effective;
                    else if (fragment.kind === 'heal') {
                        const before = target.hp;
                        await r.restore(u, target, Math.min(target.hpMax * fragment.percent / 100 * numeric * support, code === 'hidden_synergy' ? .2 * target.hpMax / Math.max(.01, r.healingMultiplier(u, target)) : Infinity), 0, true, code === 'hidden_synergy' ? .2 * target.hpMax : Infinity);
                        effective ||= target.hp > before;
                    }
                    else if (fragment.kind === 'shield')
                        effective = hiddenShield(r, u, target, Math.min(target.hpMax * fragment.percent / 100 * numeric * support, code === 'hidden_synergy' ? .2 * target.hpMax : Infinity)) > 0 || effective;
                    else if (fragment.kind === 'control' && !budget.control) {
                        budget.control = true;
                        effective = await r.control(u, target, 'hidden_' + fragment.code, code === 'hidden_synergy' ? Math.min(50, fragment.chance * (spec?.controlChanceFactor ?? 1)) : fragment.chance, 1, false) || effective;
                    }
                    else if (fragment.kind === 'status') {
                        effect(r, target, fragment.code, specializeEffectValue(fragment.code, fragment.value, stateScale * potency), fragment.duration + (code !== 'hidden_synergy' && skill.effect === 'fold_barrier' && active.includes('fold_barrier_generator') ? 1 : 0), u, fragment.debuff, { untilHit: fragment.untilHit });
                        effective = true;
                    }
                    else if (fragment.kind === 'cleanse' || fragment.kind === 'dispel') {
                        if (code !== 'hidden_synergy' || budget.dispel < 1) {
                            const removed = await r.dispel(u, target, fragment.kind === 'cleanse', 1);
                            effective ||= removed.length > 0;
                            budget.dispel += removed.length;
                            if (!removed.length && skill.effect === 'counter_spider') {
                                effect(r, target, 'exposed', 15 * stateScale * potency, 2, u, true);
                                effective = true;
                            }
                        }
                    }
                    else if (fragment.kind === 'evade' || fragment.kind === 'reduce_once') {
                        effect(r, target, fragment.kind === 'evade' ? 'hidden_evade' : 'hidden_once', fragment.kind === 'reduce_once' ? fragment.value * stateScale : 100, 2, u);
                        effective = true;
                    }
                    else if (fragment.kind === 'random') {
                        const pool = [['accuracy', 30, false], ['crit_bonus', 30, false], ['speed', 30, false], ['reduction', 15, false], ['regeneration', 4, false], ['slow', 30, true], ['evasion_down', 30, true], ['exposed', 15, true], ['bind', 20, true], ['burn', 3, true], ['poison', 2, true]];
                        const picks = Math.min(fragment.count ?? 2, pool.length);
                        let dotBudget = (2 * Math.max(u.attack, u.magic)) ** 2 / (2 * Math.max(u.attack, u.magic) + Math.max(1, target.magicDefense));
                        for (let n = 0; n < picks; n++) {
                            const [[status, value, debuff]] = pool.splice(Math.floor(r.random() * pool.length), 1);
                            if (['regeneration', 'burn', 'poison'].includes(status)) {
                                const healing = status === 'regeneration';
                                let total = target.hpMax * value / 100 * 2 * numeric;
                                if (code === 'hidden_synergy') {
                                    total = Math.min(total, healing ? .2 * target.hpMax : dotBudget);
                                    if (!healing)
                                        dotBudget -= total;
                                }
                                for (let offset = 1; offset <= 2; offset++)
                                    state.ticks.push({ source: hiddenActionKey(u, r.turn), target: target.key, turn: r.turn + offset, kind: healing ? 'heal' : 'damage', amount: total / 2, healLimit: healing && code === 'hidden_synergy' ? total / 2 : undefined, label: '彩蛋·' + (healing ? '再生' : status === 'burn' ? '灼烧' : '中毒') });
                            }
                            else
                                effect(r, target, status, specializeEffectValue(status, value, stateScale * potency), 2, u, debuff);
                        }
                        effective = true;
                    }
                }
            }
            results.push(effective);
            if (effective) {
                gainHiddenResource(u, r.turn, 20 + (state.lastCapability && state.lastCapability !== capability.primary ? 10 : 0));
                state.lastCapability = capability.primary;
            }
        }
        await ctx.saveDevices();
        if (code === 'hidden_synergy' && results.length === 2 && results.every(Boolean))
            inherit(r, u);
    }
    else if (code === 'hidden_order') {
        state.order = { target: orderTarget.key, delta: choice.mode === 'delay' ? 2 : -2, turn: r.turn + 1, side: u.side };
        const friend = choice.mode === 'delay' ? u : ally;
        hiddenShield(r, u, friend, friend.hpMax * Math.min(.12, .08 * support), 1);
    }
    else if (code === 'hidden_plan') {
        const target = choice.mode === 'interrupt' ? enemy : ally;
        const plan = effect(r, target, 'hidden_plan', choice.mode === 'guard' ? Math.min(45, 35 * potency) : Math.min(24, 16 * support), 2, u, false, { mode: choice.mode });
        if (choice.mode === 'interrupt' && target.state.cast)
            await interrupt(r, u, target, plan);
    }
    else {
        const magic = u.magic >= u.attack;
        const hit = await r.strike(u, enemy, definition.power, magic ? '奥术' : '', magic, false, false, 1, { skill: true });
        if (hit && enemy.hp > 0 && code === 'hidden_mark') {
            effect(r, enemy, 'hidden_mark', Math.min(25, 15 * potency), 2, u, true, { charges: 2, cap: .25 * Math.max(u.attack, u.magic), created: hiddenActionKey(u, r.turn) });
            gainHiddenResource(u, r.turn, 20);
        }
        if (hit && enemy.hp > 0 && code === 'hidden_finale')
            effect(r, enemy, 'hidden_echo', 1, 2, u, false, { charges: 2, created: hiddenActionKey(u, r.turn), attack: Math.max(u.attack, u.magic) * (spec?.powerFactor ?? 1), scale: spec?.damageFactor ?? 1, accuracy: u.accuracy, magic });
    }
    return true;
};
const weaponTrait = async (r, u, target, weapon, potency) => {
    const duration = Math.min(3, Math.floor(2 * potency));
    if (['剑', '长剑', '单手剑', '双手剑', 'sword'].includes(weapon.type) && await r.control(u, target, 'armor_shatter', 100, duration))
        effect(r, target, 'armor_shatter', Math.min(20, 10 * potency), duration, u, true);
    if (['拳刃', '拳套', 'fist'].includes(weapon.type) && await r.control(u, target, 'hidden_outgoing', 100, 1))
        effect(r, target, 'hidden_outgoing', Math.min(16, 8 * potency), 1, u, true, { allActions: true });
    if (['法书', '魔导书', 'book'].includes(weapon.type) && await r.control(u, target, 'magic_shatter', 100, duration))
        effect(r, target, 'magic_shatter', Math.min(20, 10 * potency), duration, u, true);
    if (['法球', 'orb'].includes(weapon.type))
        hiddenShield(r, u, u, u.hpMax * Math.min(.08, .04 * potency));
};
const executeMix = async (r, u, mix, ally, enemy) => {
    const failed = mix.outcome === 'failure', great = mix.outcome === 'great', state = hiddenState(u), spec = u.castSpecialization;
    r.log.push(`　➥调配·${failed ? '失败！事故波及己方' : great ? '大成功！' : '成功'} · ${mix.particles.length}颗粒子 · ${mix.targets}目标 · ${mix.duration}回合`);
    const enemies = (failed ? priority(r.allies(u), u) : priority(r.enemies(u), enemy)).slice(0, mix.targets), friends = priority(r.allies(u), ally).slice(0, mix.targets);
    const budgets = new Map();
    let cleanse = 0;
    const allocation = (target, kind, amount) => {
        const budget = budgets.get(target.key) ?? { heal: 0, shield: 0 };
        budgets.set(target.key, budget);
        const factor = kind === 'heal' ? Math.max(.01, r.healingMultiplier(u, target)) : 1;
        const allowed = Math.max(0, Math.min(amount * factor, target.hpMax * (kind === 'heal' ? mix.healCap : mix.shieldCap) / 100 - budget[kind]));
        budget[kind] += allowed;
        return allowed / factor;
    };
    const queue = (target, kind, amount, rounds, label, growthShield) => {
        for (let i = 1; i <= rounds; i++)
            state.ticks.push({ turn: r.turn + i, source: hiddenActionKey(u, r.turn), target: target.key, kind, amount: amount / rounds, label, growthShield, healLimit: kind === 'heal' ? amount / rounds * Math.max(.01, r.healingMultiplier(u, target)) : undefined, failure: failed });
    };
    if (great && mix.primary === 'magic_unit' && enemy)
        await r.dispel(u, enemy, false, 1, e => ['shield', 'life_shield'].includes(e.code));
    for (const branch of mix.branches) {
        const common = branch.weight * mix.radiusScale, damageScale = common * branch.damageScale * mix.numericScale * mix.failureDamageScale;
        const healScale = common * branch.healScale * mix.numericScale * (spec?.supportFactor ?? 1), stateScale = common * branch.stateScale * mix.stateScale * (spec?.effectFactor ?? 1);
        for (const target of enemies) {
            if (branch.damage) {
                let body = 0;
                await r.strike(u, target, branch.damage, branch.element, true, false, failed, 1, { skill: true, single: mix.targets === 1, redirected: failed, finalMultiplier: damageScale, deferFraction: mix.counts.energy_ember ? .4 : 0, onResolved: amount => { body = amount; } });
                if (mix.counts.energy_ember && body > 0) {
                    queue(target, 'damage', body * .4, mix.duration - 1, '余烬反应');
                    r.log.push(`　➥${branch.element}相余烬：另有${Math.floor(body * .4 / (mix.duration - 1)) * (mix.duration - 1)}点伤害，将在后续${mix.duration - 1}回合分段释放。`);
                }
                if (branch.burn)
                    queue(target, 'damage', body * branch.burn / 100, 2, '粒子灼烧');
                if (great && branch.code === mix.primary && ['fire_element_dust', 'thunder_element_dust'].includes(branch.code))
                    queue(target, 'damage', body * (branch.code === 'fire_element_dust' ? .25 : .3), 1, '大成功余响');
            }
            if (branch.slow)
                effect(r, target, 'slow', Math.min(mix.slowCap, branch.slow * stateScale), mix.duration, u, true, { accident: failed });
            if (branch.defenseDown)
                for (const code of ['armor_shatter', 'magic_shatter'])
                    effect(r, target, code, Math.min(mix.defenseCap, branch.defenseDown * stateScale), mix.duration, u, true, { accident: failed });
        }
        for (const target of friends) {
            const total = allocation(target, 'heal', target.hpMax * (branch.heal + branch.regeneration) / 100 * healScale);
            if (branch.regeneration)
                queue(target, 'heal', total, mix.duration, '木相再生', great && mix.primary === branch.code ? allocation(target, 'shield', .06 * target.hpMax * branch.stateScale * common) : undefined);
            else if (total) {
                const immediate = total * (mix.counts.energy_ember ? .6 : 1), overflow = Math.max(0, immediate * r.healingMultiplier(u, target) - (target.hpMax - target.hp));
                await r.restore(u, target, immediate, 0, true, immediate * r.healingMultiplier(u, target));
                if (mix.counts.energy_ember)
                    queue(target, 'heal', total * .4, mix.duration - 1, '余烬复苏');
                if (great && branch.code === mix.primary && ['water_element_dust', 'blood_residue'].includes(branch.code))
                    hiddenShield(r, u, target, allocation(target, 'shield', Math.min(overflow, .15 * target.hpMax * common)));
            }
            if (branch.shield)
                hiddenShield(r, u, target, allocation(target, 'shield', target.hpMax * branch.shield / 100 * common * branch.stateScale * mix.numericScale * (spec?.supportFactor ?? 1)), mix.duration, great && mix.primary === 'metal_element_dust' ? { earth: .08 * target.hpMax * common } : {});
            if (!failed && branch.code === 'light_element_dust' && cleanse < (great && mix.primary === branch.code ? 2 : 1)) {
                const removed = await r.dispel(u, target, true, (great && mix.primary === branch.code ? 2 : 1) - cleanse);
                cleanse += removed.length;
            }
        }
    }
    const controls = mix.branches.filter(b => b.control).sort((a, b) => Number(b.code === mix.primary) - Number(a.code === mix.primary) || mix.counts[b.code] - mix.counts[a.code] || a.code.localeCompare(b.code));
    if (controls.length && enemies[0]) {
        const control = controls[0].control;
        const applied = await r.control(u, enemies[0], 'hidden_' + control.code, control.chance, 1);
        if (applied && failed) {
            const status = r.status(enemies[0], 'hidden_' + control.code);
            if (status)
                status.data = JSON.stringify({ accident: true });
        }
    }
    const primary = mix.branches.find(b => b.code === mix.primary);
    const scale = primary.weight * mix.radiusScale * primary.stateScale;
    if (great) {
        if (mix.primary === 'wood_element_dust')
            for (const target of friends)
                hiddenShield(r, u, target, allocation(target, 'shield', .06 * target.hpMax * scale));
        if (['ice_element_dust', 'energy_ember'].includes(mix.primary))
            hiddenShield(r, u, u, allocation(u, 'shield', u.hpMax * (mix.primary === 'ice_element_dust' ? .12 : .08) * scale));
        if (mix.primary === 'wind_element_dust')
            for (const friend of friends)
                effect(r, friend, 'hidden_once', Math.min(30, 20 * scale), mix.duration, u);
        if (mix.primary === 'dark_element_dust' && enemy)
            effect(r, enemy, 'hidden_outgoing', Math.min(35, 25 * primary.stateScale * primary.weight), mix.duration, u, true);
        if (mix.primary === 'light_element_dust')
            effect(r, ally, 'hidden_light', 1, mix.duration, u);
        if (mix.primary === 'blood_residue' && !cleanse)
            await r.dispel(u, ally, true, 1, e => ['poison', 'burn', 'bleed', 'bleeding'].includes(e.code));
    }
    if (failed) {
        for (const branch of mix.branches) {
            const scale = branch.stateScale * branch.weight * mix.radiusScale * (spec?.effectFactor ?? 1);
            const accidents = [];
            if (branch.code === 'water_element_dust')
                accidents.push(['slow', 20]);
            if (branch.code === 'metal_element_dust')
                accidents.push(['slow', 25]);
            if (['wood_element_dust', 'blood_residue'].includes(branch.code))
                accidents.push(['hidden_heal_down', 30]);
            if (branch.code === 'light_element_dust')
                accidents.push(['accuracy_down', 20]);
            if (mix.branches.length === 1 && branch.code === 'wind_element_dust')
                accidents.push(['accuracy_down', 20]);
            if (mix.branches.length === 1 && ['energy_ember', 'magic_unit'].includes(branch.code))
                accidents.push(['armor_shatter', 15], ['magic_shatter', 15]);
            const recipients = branch.heal || branch.regeneration || branch.shield ? friends : enemies;
            for (const target of recipients) {
                if (branch.code === 'light_element_dust')
                    await r.dispel(u, target, false, 1);
                for (const [code, value] of accidents)
                    effect(r, target, code, value * scale, mix.duration, u, true, { accident: true });
            }
        }
    }
};

export { HiddenBattleError, executeHiddenCombat, hiddenAbsorbed, hiddenAfterHit, hiddenBeforeAction, hiddenBeforeDamage, hiddenDamageSource, hiddenDeviceSnapshot, hiddenEndTurn, hiddenHealingFactor, hiddenIncoming, hiddenNames, hiddenNativeDevice, hiddenReorder, hiddenShield };
