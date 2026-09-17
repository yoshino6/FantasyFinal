import type { CombatRules, RuleStatus, RuleUnit } from './combat-rule-registry';
import type { FolioSkill } from './active-folio-skills.config';
import { folioBuffs as buffs, folioDebuffs as debuffs } from './folio-effect.config';
import { canDispelCombatEffect } from './combat-dispel-policy';
import { tenacityContest } from './combat-math';
import { resolveStrike } from './combat-math';
export const resolveFolioStrike = (rules: CombatRules | undefined, source: RuleUnit | undefined, target: RuleUnit | undefined, magic: boolean, ...args: Parameters<typeof resolveStrike>) => {
    if (rules && source && target) {
        args[0] = folioStat(source, magic ? 'magic' : 'attack', args[0], rules.turn);
        args[1] = folioStat(target, magic ? 'magic_defense' : 'defense', args[1], rules.turn);
        args[2] = folioStat(source, 'accuracy', args[2], rules.turn);
        args[3] = folioStat(target, 'evasion', args[3], rules.turn);
        args[12] = (args[12] ?? 1) * (1 - folioValue(source, 'hit_down', rules.turn) / 100);
        const correction = args[13] ?? {};
        args[13] = { ...correction, hitCorrectionPct: 100 * (1 - (1 - (correction.hitCorrectionPct ?? 0) / 100) * (1 - folioCorrection(source, target, rules.turn) / 100)) };
        source.state.statuses = source.state.statuses.filter(e => e.code !== 'folio_accuracy');
    }
    return resolveStrike(...args);
};
export const folioStatusNames: Record<string, string> = { folio_attack: '战意祝福', folio_magic: '魔力增幅', folio_defense: '岩肤', folio_magic_defense: '抗魔结界', folio_speed: '风行', folio_accuracy: '精准祝福', folio_evasion: '闪避强化', folio_evasion_down: '风痕', folio_attack_down: '物攻衰减', folio_magic_down: '魔攻衰减', folio_slow: '迟缓', folio_hit: '命中修正', folio_hit_down: '雷网失准', folio_exposed_hit: '乱流标记', folio_healing_down: '枯萎', folio_burn: '绯焰灼烧', folio_regen: '潮汐再生' };
export const folioValue = (unit: RuleUnit, code: string, turn: number) => Math.max(0, ...unit.state.statuses.filter(e => e.code === 'folio_' + code && e.until >= turn).map(e => e.value));
export const folioStat = (unit: RuleUnit, stat: 'attack' | 'magic' | 'defense' | 'magic_defense' | 'accuracy' | 'evasion' | 'speed', base: number, turn: number) => {
    if (stat === 'accuracy')
        return base + folioValue(unit, 'accuracy', turn);
    if (stat === 'evasion')
        return Math.max(0, base + folioValue(unit, 'evasion', turn) - folioValue(unit, 'evasion_down', turn));
    return base * (1 + (folioValue(unit, stat, turn) - folioValue(unit, stat === 'speed' ? 'slow' : stat + '_down', turn)) / 100);
};
export const folioCorrection = (source: RuleUnit, target: RuleUnit, turn: number) => Math.max(folioValue(source, 'hit', turn), folioValue(target, 'exposed_hit', turn));
export const folioDuration = (source: RuleUnit, turns: number) => Math.min(4, Math.max(1, Math.floor(turns * (source.castSpecialization?.effectFactor ?? 1) + 1e-9)));
export const folioBenefit = (source: RuleUnit, value: number, cap: number) => Math.min(cap, value * (source.castSpecialization?.effectFactor ?? 1));
/** 不把强值短时和弱值长时拼成超长强效果。 */
export const addFolioStatus = (rules: CombatRules, source: RuleUnit, target: RuleUnit, code: string, value: number, turns: number, debuff = false, data?: string) => {
    const current = rules.status(target, code);
    const until = rules.turn + turns - (target.state.memory.actedTurn === rules.turn ? 0 : 1);
    if (current && (current.value > value || current.value === value && current.until >= until))
        return current;
    target.state.statuses = target.state.statuses.filter(e => e.code !== code);
    const status = rules.add(target, code, value, turns, source, debuff, data);
    if (['folio_burn', 'folio_regen'].includes(code))
        target.state.memory[code + '_starts'] = rules.turn + (target.state.memory.actedTurn === rules.turn ? 1 : 0);
    rules.log.push(`　➥【${target.name}】获得${folioStatusNames[code] ?? code}，持续${turns}回合。`);
    return status;
};
const cleansePriority = (e: RuleStatus) => ['sleep', 'stun', 'fear', 'alchemy_stun', 'hidden_stun', 'hidden_freeze'].includes(e.code) ? 0 : ['silence', 'blind', 'confusion'].includes(e.code) ? 1 : /poison|burn|bleed/.test(e.code) ? 2 : 3;
export const folioCleanseCandidates = (rules: CombatRules, target: RuleUnit, dotOnly = false) => rules.effects(target).filter(e => e.debuff && canDispelCombatEffect(e.code, 'ordinary', Boolean(e.mechanism)) && (!dotOnly || /^(poison|burn|bleed|bleeding|folio_burn)$/.test(e.code))).sort((a, b) => cleansePriority(a) - cleansePriority(b) || b.until - a.until || a.code.localeCompare(b.code));
export const folioTargets = (rules: CombatRules, source: RuleUnit, target: RuleUnit, skill: FolioSkill, keys?: string[]) => {
    const friendly = ['ally', 'allies', 'self'].includes(skill.scope);
    const pool = friendly ? rules.allies(source) : rules.enemies(source).filter(u => u.state.memory.folioTargetable !== 0);
    if (skill.targetCount === 0)
        return [...pool.filter(u => u.key === target.key), ...pool.filter(u => u.key !== target.key)];
    if (keys)
        return [...new Set(keys)].map(key => pool.find(u => u.key === key)).filter((u): u is RuleUnit => Boolean(u)).slice(0, skill.targetCount);
    const first = pool.find(u => u.key === target.key) ?? (friendly ? source : pool[0]);
    const remaining = pool.filter(u => u.key !== first?.key);
    if (friendly)
        remaining.sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax || a.key.localeCompare(b.key));
    return [first, ...remaining].filter((u): u is RuleUnit => Boolean(u)).slice(0, skill.targetCount);
};
export const validateFolioCast = (rules: CombatRules, source: RuleUnit, target: RuleUnit, skill: FolioSkill, keys?: string[]) => {
    const chosen = folioTargets(rules, source, target, skill, keys);
    if (!chosen.length)
        throw new Error('没有合法的施法目标，未消耗行动。');
    if (['folio_s01', 'folio_s03'].includes(skill.code) && !chosen.some(u => folioCleanseCandidates(rules, u).length))
        throw new Error('所选目标没有可普通净化的负面状态，未消耗行动。');
    return chosen;
};
/** 商店技能共享执行器：PvE、PvP和吟唱释放使用同一套效果。 */
export const castFolioSkill = async (rules: CombatRules, source: RuleUnit, target: RuleUnit, skill: FolioSkill, extra = false) => {
    const keys = source.state.memory.folioTargets ? String(source.state.memory.folioTargets).split('|') : undefined;
    delete source.state.memory.folioTargets;
    const targets = folioTargets(rules, source, target, skill, keys);
    const primaryKey = keys?.[0] ?? String(source.state.memory.folioPrimary ?? target.key);
    delete source.state.memory.folioPrimary;
    rules.log.push(`➤【${source.name}】释放技能「${skill.name}」`);
    if (!targets.length) {
        rules.log.push('　➥原定目标已退场，技能失效。');
        return;
    }
    const id = skill.code.slice(6);
    const magic = skill.category === 'magic';
    const healingMagic = folioStat(source, 'magic', source.magic, rules.turn);
    const effect = async (unit: RuleUnit, code: string, value: number, cap: number, turns: number, debuff = false, data?: string) => {
        let amount = folioBenefit(source, value, cap);
        if (debuff) {
            const contest = tenacityContest(source.pierce, unit.tenacity, source.level - unit.level, 100);
            if (rules.random() >= contest.controlChance)
                return;
            amount *= contest.harmfulMultiplier;
        }
        addFolioStatus(rules, source, unit, 'folio_' + code, amount, Math.min(code === 'burn' ? 3 : 4, folioDuration(source, turns)), debuff, data);
    };
    if (skill.category === 'utility') {
        const before = skill.targetCount === 1 && !extra ? rules.supportSnapshot(targets[0]) : undefined;
        for (const unit of targets) {
            if (/^s0[1-6]$/.test(id)) {
                const count = ['s05', 's06'].includes(id) ? 2 : 1;
                for (const status of folioCleanseCandidates(rules, unit, id === 's06').slice(0, count)) {
                    await rules.removeEffect(unit, status);
                    rules.log.push(`　➥【${unit.name}】净化了${folioStatusNames[status.code] ?? status.code}。`);
                }
                const healing = ({ s02: .6, s04: .4, s06: .5 } as Record<string, number>)[id];
                if (healing)
                    await rules.restore(source, unit, healingMagic * healing, 0, false, healingMagic * (id === 's02' ? 1.2 : .8) * rules.healingMultiplier(source, unit));
            }
            if (id === 's05' || id === 's17') {
                const amount = unit.hpMax * folioBenefit(source, id === 's05' ? 12 : 8, id === 's05' ? 20 : 12) / 100;
                // shield()本身会再吃强效；这里已计算上限，直接使用同组生命盾。
                const old = rules.status(unit, 'shield');
                if (!old || old.value <= amount) {
                    unit.state.statuses = unit.state.statuses.filter(e => e.code !== 'shield');
                    rules.add(unit, 'shield', amount, folioDuration(source, 3), source, false, 'folio');
                }
                rules.log.push(`　➥【${unit.name}】获得${Math.floor(amount)}点生命护盾。`);
                await rules.rootEcho(source);
            }
            for (const [code, value, cap] of buffs[id] ?? [])
                await effect(unit, code, value, cap, 3);
        }
        if (before)
            await rules.echoSupport(source, targets[0], before);
        if (!/^s0[1-6]$/.test(id) && id !== 's17')
            await rules.rootEcho(source);
        return;
    }
    for (let segment = 0; segment < skill.parts.length; segment++)
        await rules.areaDamage(targets, async (unit) => {
            const main = unit.key === primaryKey;
            let power = skill.parts[segment];
            if (id === 'p02' && ['armor_shatter', 'magic_shatter', 'vulnerability', 'sword_break'].some(code => rules.value(unit, code) > 0))
                power *= 1.1;
            const hit = await rules.strike(source, unit, power, skill.element, magic, extra || segment > 0, false, 1, { single: skill.targetCount === 1, damageType: skill.damageType, ranged: skill.ranged, penetration: id === 'p07' ? 10 : 0, shieldMultiplier: id === 'p23' ? 1.3 : 1, accuracyFlat: ['p10', 'm04'].includes(id) ? folioBenefit(source, 10, 20) : 0, hitCorrection: id === 'p04' && main ? folioBenefit(source, 10, 20) : 0 });
            if (!hit || segment > 0 || unit.hp <= 0)
                return;
            if (debuffs[id] && (!['p20', 'm14', 'm23'].includes(id) || main)) {
                const [code, value, cap, turns] = debuffs[id];
                await effect(unit, code, value, cap, turns, true);
            }
            if (id === 'm03')
                await effect(unit, 'burn', unit.boss ? .5 : 2, unit.boss ? 1 : 4, 2, true, String(healingMagic * .4));
            if (id === 'm09' && main)
                await rules.dispel(source, unit, false, 1);
        });
};
/** 回合末一次结算，不因额外行动重复跳再生/DOT。 */
export const folioEndTurn = async (rules: CombatRules) => {
    for (const unit of rules.units) {
        if (unit.hp <= 0 || unit.participating === false)
            continue;
        for (const status of rules.effects(unit).filter(e => ['folio_regen', 'folio_burn'].includes(e.code))) {
            if (Number(unit.state.memory[status.code + '_starts'] ?? 0) > rules.turn)
                continue;
            if (Number(unit.state.memory[status.code + '_tick']) === rules.turn)
                continue;
            unit.state.memory[status.code + '_tick'] = rules.turn;
            const source = rules.units.find(u => u.key === status.source) ?? unit;
            if (status.code === 'folio_regen')
                await rules.restore(source, unit, unit.hpMax * status.value / 100, 0, true);
            else {
                const damage = Math.floor(Math.min(unit.hpMax * status.value / 100, Number(status.data) || Infinity));
                await rules.take(unit, damage, 1, source);
                rules.log.push(`　➥【${unit.name}】受到${damage}点绯焰灼烧。`);
            }
        }
    }
};
