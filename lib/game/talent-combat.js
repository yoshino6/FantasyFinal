import { talentCode } from './talent.config.js';
import { tenacityContest } from './combat-math.js';

const talentState = (unit) => unit.state.talent ??= {
    clock: 0, serial: 0, seen: [], hit: [], chain: 0, attacks: 0, normal: 0, stacks: 0, core: false, delayed: [], burns: []
};
const hasTalent = (unit, id) => !unit.companion && unit.opening?.pve === true && unit.opening.divines.includes(talentCode(id) ?? '');
const talentBurnEffects = (unit, turn) => (unit.state.talent?.burns ?? []).filter(b => b.ticks > 0).map(b => ({ code: 'talent_suzaku_burn', value: b.amount, until: turn + b.ticks - 1, source: b.source, debuff: true, stacks: 1, data: 'talentSuzaku' }));
const talentOpeningShield = (unit) => {
    const state = talentState(unit);
    if (hasTalent(unit, 'G02') && !state.stoneGranted) {
        state.stoneGranted = true;
        state.stoneShield = Math.floor(unit.hpMax * .5);
    }
};
const rootKey = (unit) => String(unit.state.memory.talentRoot ?? unit.key);
const elemental = (element) => Boolean(element && !['无', '奥术', '物理', '真实'].includes(element));
const fireActive = (unit) => hasTalent(unit, 'H10') && talentState(unit).fireUntil !== undefined && talentState(unit).clock <= talentState(unit).fireUntil;
const talentSupport = (source, target) => {
    if (source.key !== target.key && source.side === target.side && hasTalent(target, 'H08'))
        talentState(target).noAid = false;
};
const talentReceiveHealing = (source, target) => {
    talentSupport(source, target);
    return fireActive(target) ? 0 : hasTalent(target, 'H02') && source.key !== target.key ? .5 : 1;
};
const talentSpellHealing = (source, target = source) => {
    let factor = hasTalent(source, 'A02') ? 1.5 : hasTalent(source, 'F05') && source.key !== target.key ? 1.8 : 1;
    if (hasTalent(source, 'G04'))
        factor *= 1.2;
    if (hasTalent(source, 'H02') && talentState(source).action?.low)
        factor *= 2;
    if (hasTalent(source, 'H04') && talentState(source).action?.prayer)
        factor *= 3.5;
    if (hasTalent(source, 'G10') && talentState(source).phase === '星辉')
        factor *= 2;
    return factor;
};
const talentManaFactor = (unit) => hasTalent(unit, 'A03') ? 2 / 3 : hasTalent(unit, 'G04') ? .8 : hasTalent(unit, 'H08') ? 1.25 : 1;
const talentBeginAction = async (rules, unit, extra = false) => {
    const state = talentState(unit);
    talentOpeningShield(unit);
    state.leech = 0;
    if (!extra) {
        state.clock++;
        unit.state.statuses = unit.state.statuses.filter(e => e.data !== 'talentDefend');
        if (hasTalent(unit, 'G10'))
            state.phase = state.phase ? state.phase === '星辉' ? '星隐' : '星辉' : String(unit.opening?.settings?.phase ?? '星辉');
        for (const pending of state.delayed.filter(p => p.due <= state.clock)) {
            const target = rules.units.find(u => u.key === pending.target && u.hp > 0);
            if (target && unit.hp > 0)
                await rules.take(target, pending.amount, 1, unit);
        }
        state.delayed = state.delayed.filter(p => p.due > state.clock);
        if (hasTalent(unit, 'I05') && state.normal > 0 && state.normal % 2 === 0 && state.shadowedNormal !== state.normal && state.lastBasic) {
            state.shadowedNormal = state.normal;
            const target = rules.units.find(u => u.key === state.lastBasic.target && u.hp > 0);
            if (target) {
                await rules.take(target, Math.floor(state.lastBasic.damage * 1.5), 1, unit);
                rules.log.push(`　➥${unit.name}的影子代班。`);
            }
        }
        for (const burn of state.burns) {
            if (unit.hp <= 0)
                break;
            const owner = rules.units.find(u => u.key === burn.source);
            const factor = rules.elementFactor({ ...(owner ?? unit), mastery: {} }, unit, '火');
            if (rules.status(unit, 'time_guard'))
                rules.log.push(`　➥${unit.name}免疫朱雀灼烧。`);
            else {
                const before = unit.hp;
                await rules.takeUnlinked(unit, Math.floor(burn.amount * factor * (hasTalent(unit, 'G07') ? .35 : 1)), 1, owner);
                rules.log.push(`　&朱雀灼烧&${unit.name}持续损失 ${before - unit.hp} HP。`);
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
const talentCommitAction = (unit, kind, damageType = '', single = true, ranged = false, prayer = false) => {
    const state = talentState(unit);
    if (!state.action)
        return;
    Object.assign(state.action, { kind, damageType, single, ranged, prayer });
    if (kind === 'attack' || kind === 'skill') {
        state.attacks++;
        state.action.core = state.core;
        state.core = false;
    }
    else {
        state.chain = 0;
        state.chainRoot = undefined;
    }
};
const talentCanPaySkill = (unit, harmful) => !hasTalent(unit, 'H03') || !harmful || unit.hp > Math.max(1, Math.ceil(unit.hpMax * .08));
const talentPaySkill = (unit, harmful) => {
    if (!talentCanPaySkill(unit, harmful))
        throw new Error('焚命者需要先支付8%最大HP，并保留至少1HP。');
    if (hasTalent(unit, 'H03') && harmful)
        unit.hp -= Math.max(1, Math.ceil(unit.hpMax * .08));
};
const talentAttackAttempt = (source, target) => {
    const state = talentState(source), action = state.action;
    if (!action || !['attack', 'skill'].includes(action.kind) || source.side === target.side)
        return;
    const root = rootKey(target);
    if (!(root in action.first)) {
        action.first[root] = !state.seen.includes(root);
        if (!state.seen.includes(root))
            state.seen.push(root);
        if (hasTalent(source, 'A07')) {
            state.chain = state.chainRoot === root ? Math.min(5, state.chain + 1) : 1;
            state.chainRoot = root;
        }
    }
};
const talentDirectFactor = (source, target, magic, skill, _element) => {
    if (source.side === target.side)
        return 1;
    const state = talentState(source), action = state.action;
    if (!action || !['attack', 'skill'].includes(action.kind))
        return 1;
    const root = rootKey(target);
    let f = 1;
    if (hasTalent(source, 'A01'))
        f *= 1.5;
    if (hasTalent(source, 'F07'))
        f *= 1.25 + .25 * Math.min(5, state.kills?.length ?? 0);
    if (hasTalent(source, 'A04'))
        f *= state.hit.includes(root) ? 1.25 : 3;
    if (hasTalent(source, 'A05'))
        f *= state.previousType && state.previousType !== action.damageType ? 1.6 : 1.1;
    if (hasTalent(source, 'A06') || hasTalent(source, 'G03'))
        f *= 1.25;
    if (hasTalent(source, 'A07'))
        f *= .9 + .2 * Math.max(1, state.chain);
    if (hasTalent(source, 'A08') && state.defend)
        f *= 3;
    if (hasTalent(source, 'A09') && action.ranged)
        f *= 1.65;
    if (hasTalent(source, 'F04') && ['斩击', '刺击'].includes(action.damageType))
        f *= 1.7;
    if (hasTalent(source, 'F09') && target.hp > target.hpMax / 2)
        f *= 2;
    if (hasTalent(source, 'G04') && magic)
        f *= 1.2;
    if (hasTalent(source, 'G10') && state.phase === '星辉')
        f *= 2;
    if (hasTalent(source, 'H01'))
        f *= 2.25;
    if (hasTalent(source, 'H02') && action.low)
        f *= 2;
    if (hasTalent(source, 'H03') && skill)
        f *= 2;
    if (hasTalent(source, 'H04') && action.prayer && magic)
        f *= 3;
    if (hasTalent(source, 'H05'))
        f *= action.first[root] ? action.single ? 5 : 1 : .75;
    if (hasTalent(source, 'H07') && source.opening?.accessories === 0 && !state.poorBroken)
        f *= 2;
    if (hasTalent(source, 'H08') && state.noAid)
        f *= 2.5;
    if (hasTalent(source, 'H10') && action.fire && !action.extra)
        f *= 3;
    if (hasTalent(source, 'I01'))
        f *= .9;
    if (hasTalent(source, 'D07') && source.opening?.settings?.peaceFailure && state.clock <= 2)
        f *= .5;
    return f;
};
const talentIncomingFactor = (source, target, element) => {
    if (source.side === target.side || element === '真实')
        return 1;
    let f = 1;
    if (hasTalent(target, 'A06'))
        f *= 5 / 6;
    if (hasTalent(target, 'G07'))
        f *= .8;
    if (hasTalent(target, 'G08'))
        f *= .93 ** talentState(target).stacks;
    if (hasTalent(target, 'G09') && elemental(element))
        f *= 5 / 6;
    if (hasTalent(target, 'G10') && talentState(target).phase === '星隐')
        f *= .5;
    return f;
};
const talentHpDamage = (unit, damage) => {
    if (!hasTalent(unit, 'H10') || damage <= 0 || unit.hp <= 0)
        return damage;
    const state = talentState(unit);
    if (!state.fireUsed && unit.hp - damage <= unit.hpMax * .2) {
        state.fireUsed = true;
        state.fireUntil = state.clock + 2;
        state.fireCost = true;
    }
    return fireActive(unit) ? Math.min(damage, Math.max(0, unit.hp - 1)) : damage;
};
const talentRecordEnemyDamage = (source, target, loss) => {
    if (source && source.side !== target.side && hasTalent(target, 'C06') && loss > 0)
        talentState(target).enemyHpLoss = (talentState(target).enemyHpLoss ?? 0) + loss;
};
const talentAfterHit = async (rules, source, target, hpLoss, absorbed, element, extra, magic) => {
    talentRecordEnemyDamage(source, target, hpLoss);
    if (source.side === target.side || extra || hpLoss + absorbed <= 0)
        return;
    if (hasTalent(target, 'F03') && hpLoss > 0 && target.hp > 0 && source.hp > 0) {
        await rules.secondary(target, source, Math.floor(hpLoss * .5), '玄武反震');
    }
    if (hasTalent(target, 'G08'))
        talentState(target).stacks = Math.min(8, talentState(target).stacks + 1);
    if (hasTalent(target, 'G09') && elemental(element))
        talentState(target).core = true;
    const state = talentState(source), action = state.action;
    if (!action || !['attack', 'skill'].includes(action.kind))
        return;
    if (target.state.memory.talentPacified)
        return;
    const root = rootKey(target);
    if (hasTalent(source, 'F04') && root === target.key && target.hp <= 0 && Math.abs(target.level - source.level) <= 5)
        source.state.memory.talentWeakness = 1;
    action.hits[target.key] = (action.hits[target.key] ?? 0) + Math.max(0, hpLoss + (hasTalent(source, 'I01') ? absorbed : 0));
    action.struck[root] = true;
    if (!action.extra && hasTalent(source, 'G01') && !magic && hpLoss > 0)
        state.leech = (state.leech ?? 0) + hpLoss * .5;
    if (hasTalent(source, 'F07') && !action.extra && hpLoss > 0 && target.hp <= 0 && root === target.key && Math.abs(target.level - source.level) <= 5) {
        const kills = state.kills ??= [];
        if (!kills.includes(root)) {
            kills.push(root);
            await rules.restore(source, source, source.hpMax * .25, 0, true, source.hpMax * .25);
            rules.log.push(`　➥${source.name}吞纳战意，直击倍率升至${(1.25 + .25 * Math.min(5, kills.length)).toFixed(2)}。`);
        }
    }
    if (hasTalent(source, 'F09') && root === target.key && target.hp <= 0 && !target.state.memory.talentPacified && Math.abs(target.level - source.level) <= 5 && rules.once(source, `talentDevour:${root}`, true) && rules.once(source, 'talentDevourRound'))
        await rules.restore(source, source, source.hpMax * .08, 0, true, source.hpMax * .08);
};
const talentEndAction = async (rules, unit) => {
    const state = talentState(unit), action = state.action;
    if (!action)
        return;
    const grouped = new Map();
    for (const [key, amount] of Object.entries(action.hits)) {
        const target = rules.units.find(u => u.key === key);
        if (!target)
            continue;
        const root = rootKey(target), old = grouped.get(root);
        if (!old || amount > old.amount)
            grouped.set(root, { target: rules.units.find(u => u.key === root) ?? target, amount });
    }
    for (const { target, amount } of grouped.values()) {
        if (hasTalent(unit, 'F01') && target.hp > 0) {
            const ts = talentState(target), previous = ts.burns.find(b => b.source === unit.key);
            ts.burns = ts.burns.filter(b => b.source !== unit.key);
            const correction = tenacityContest(unit.pierce, target.tenacity * (1 + rules.value(target, 'tenacity') / 100), unit.level - target.level, 100).damageOverTimeMultiplier;
            if (amount > 0 || previous)
                ts.burns.push({ source: unit.key, amount: Math.max(previous?.amount ?? 0, amount * .025 * correction), ticks: 2 });
        }
        if (hasTalent(unit, 'F06') && state.attacks % 3 === 0)
            state.delayed.push({ target: target.key, amount: Math.floor(amount * 2.1), due: state.clock + 1, label: '烛龙回响' });
        if (hasTalent(unit, 'I01'))
            state.delayed.push({ target: target.key, amount, due: state.clock + 1, label: '因果欠条' });
        if (hasTalent(unit, 'G09') && action.core && target.hp > 0)
            await rules.take(target, Math.floor(amount * .4), 1, unit);
        if (hasTalent(unit, 'F10') && !action.extra && unit.hp > 0 && target.hp > 0 && amount > 0)
            await rules.secondary(unit, target, Math.floor(amount * .5), '应龙风压');
    }
    for (const root of Object.keys(action.struck))
        if (!state.hit.includes(root))
            state.hit.push(root);
    if (action.kind === 'attack' || action.kind === 'skill') {
        state.previousType = action.damageType;
        state.defend = false;
    }
    if (action.kind === 'defend')
        state.defend = true;
    if (!action.extra) {
        if (unit.hp > 0 && action.kind !== 'none') {
            state.completed = (state.completed ?? 0) + 1;
            if (hasTalent(unit, 'G01') && (state.leech ?? 0) > 0)
                await rules.restore(unit, unit, state.leech, 0, true, Math.floor(unit.hpMax * .2));
            if (hasTalent(unit, 'G02'))
                state.stoneShield = Math.min(Math.floor(unit.hpMax * .5), (state.stoneShield ?? 0) + Math.floor(unit.hpMax * .05));
        }
        if (action.kind !== 'none')
            state.normal++;
        if (action.kind === 'attack') {
            const hit = [...grouped.values()][0];
            state.lastBasic = hit ? { target: hit.target.key, damage: hit.amount } : undefined;
        }
        if (state.fireUntil !== undefined && state.clock >= state.fireUntil)
            talentFinishFire(unit);
        if (Number(unit.state.memory.talentBottleUntil ?? Infinity) <= state.clock) {
            delete unit.state.memory.talentBottleShield;
            delete unit.state.memory.talentBottleUntil;
        }
    }
    state.action = undefined;
};
const talentFinishFire = (unit) => {
    const state = talentState(unit);
    delete state.fireUntil;
    if (state.fireCost && unit.hp > 0)
        unit.hp = Math.max(1, unit.hp - Math.floor(unit.hpMax * .1));
    state.fireCost = false;
};
const installTalentHealingGuard = (unit, row) => {
    if (!hasTalent(unit, 'H10'))
        return;
    let hp = Number(row.current_hp);
    Object.defineProperty(row, 'current_hp', { enumerable: true, configurable: true, get: () => hp, set: (next) => {
            if (next > hp && fireActive(unit))
                return;
            if (next >= 1 && next < hp && next <= unit.hpMax * .2 && !talentState(unit).fireUsed) {
                const state = talentState(unit);
                state.fireUsed = true;
                state.fireUntil = state.clock + 2;
                state.fireCost = true;
            }
            hp = Math.max(0, Math.floor(next));
        } });
};

export { fireActive, hasTalent, installTalentHealingGuard, talentAfterHit, talentAttackAttempt, talentBeginAction, talentBurnEffects, talentCanPaySkill, talentCommitAction, talentDirectFactor, talentEndAction, talentFinishFire, talentHpDamage, talentIncomingFactor, talentManaFactor, talentOpeningShield, talentPaySkill, talentReceiveHealing, talentRecordEnemyDamage, talentSpellHealing, talentState, talentSupport };
