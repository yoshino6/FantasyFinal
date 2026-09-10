import { recordAchievement } from './achievement-events.js';
import { readTalentData, saveTalentData } from './talent-data.js';
import { talentState, talentOpeningShield, hasTalent, talentSupport } from './talent-combat.js';
import { residentSkillByCode } from './resident-skill.config.js';
import { skillSpecialization } from './skill-specialization.js';

const talentPreparationSkills = ['resident_f01', 'resident_f02', 'resident_f03', 'resident_k05'];
const talentTransferLabels = { attack: '物攻强化', magic: '魔攻强化', defense: '物理防御', magic_defense: '魔法防御', speed: '速度', accuracy: '命中', shield: '生命护盾', reduction: '减伤', life_shield: '原生生命护盾', barrier: '减伤屏障', battle_cry: '战吼', precision: '精准', sprint: '疾行' };
const talentTransferEffects = Object.keys(talentTransferLabels);
const canTalentPacify = (target, enemy, memberCount, targetCount) => {
    if (memberCount !== 1 || targetCount !== 1 || enemy.boss || target.monster_class !== 'normal' || target.must_kill || target.quest_id || target.story_id)
        return false;
    try {
        const traits = typeof target.traits_json === 'string' ? JSON.parse(target.traits_json) : target.traits_json ?? [];
        return Array.isArray(traits) && traits.length === 0;
    }
    catch {
        return false;
    }
};
const loadTalentBattle = async (c, rules, members, targets, hasSupport) => {
    for (const row of members) {
        const unit = rules.units.find(u => u.key === `member:${row.id}`);
        if (!unit?.opening?.pve)
            continue;
        const state = talentState(unit), data = await readTalentData(c, Number(row.id));
        state.startedFull ??= unit.hp === unit.hpMax;
        if (state.clock === 0) {
            for (const enemy of targets) {
                const old = data.flags[`life:${enemy.id}`];
                if (!old)
                    continue;
                if (old.seen && !state.seen.includes(`target:${enemy.id}`))
                    state.seen.push(`target:${enemy.id}`);
                if (old.hit && !state.hit.includes(`target:${enemy.id}`))
                    state.hit.push(`target:${enemy.id}`);
                if (old.stoneGranted) {
                    state.stoneGranted = true;
                    state.stoneShield = Math.min(state.stoneShield ?? Infinity, Number(old.stoneShield ?? 0));
                }
                if (old.phase)
                    state.phase = String(old.phase);
                if (old.fireUsed)
                    state.fireUsed = true;
                if (old.noAid === false)
                    state.noAid = false;
                if (old.poorBroken)
                    state.poorBroken = true;
            }
        }
        talentOpeningShield(unit);
        if (unit.opening.settings?.outsideFood)
            state.noAid = false;
        if (hasSupport.has(Number(row.id)))
            state.noAid = false;
        if (hasTalent(unit, 'D07') && targets.some(t => data.flags[`peaceFailure:${t.id}`]))
            unit.opening.settings = { ...unit.opening.settings, peaceFailure: true };
        if (hasTalent(unit, 'I10') && data.settings.pacify && members.length === 1 && targets.length === 1) {
            const target = targets[0], enemy = rules.units.find(u => u.key === `target:${target.id}`);
            if (enemy && canTalentPacify(target, enemy, members.length, targets.length))
                enemy.state.memory.talentPacifyThreshold = Math.max(1, Math.ceil(enemy.hpMax / 3));
        }
        if (hasTalent(unit, 'I04') && !unit.state.memory.talentPrepared && state.clock === 0) {
            unit.state.memory.talentPrepared = 1;
            const code = String(data.settings.prepareSkill ?? ''), skill = residentSkillByCode(code);
            if (skill && talentPreparationSkills.includes(code)) {
                const [owned] = await c.execute('SELECT s.* FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code=?', [row.id, code]);
                if (owned[0] && Number(unit.cooldowns[code] ?? 0) <= 0) {
                    const [levels] = await c.execute('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [row.id, owned[0].id]);
                    const specialized = skillSpecialization(owned[0], Object.fromEntries(levels.map(r => [r.specialization, Number(r.level)])));
                    const baseCost = Math.max(specialized.mana > 0 ? 1 : 0, Math.ceil(specialized.mana * (unit.modifiers?.manaAffinity ? .7 : 1)) - Number(unit.modifiers?.manaCostReduction ?? 0));
                    const cost = rules.manaCost(unit, baseCost);
                    if (unit.mp >= cost) {
                        unit.mp -= cost;
                        unit.castSpecialization = { ...specialized, effectFactor: specialized.effectFactor * 1.5, supportFactor: specialized.supportFactor * 1.5 };
                        unit.state.memory.talentPreparing = 1;
                        try {
                            await rules.paid(unit, cost, skill);
                            await rules.cast(unit, unit, skill, cost);
                            unit.cooldowns[code] = specialized.cooldown + 1;
                        }
                        finally {
                            unit.castSpecialization = undefined;
                            delete unit.state.memory.talentPreparing;
                        }
                        rules.log.push(`　➥${unit.name}在第零回合完成${skill.name}。`);
                    }
                    else
                        rules.log.push(`　➥${unit.name}预备技能MP不足，未支付资源。`);
                }
            }
        }
    }
    const before = rules.hooks.beforeHpDamage, after = rules.hooks.afterDamage;
    rules.hooks.beforeHpDamage = async (unit, amount) => {
        const adjusted = await before?.(unit, amount) ?? amount, threshold = Number(unit.state.memory.talentPacifyThreshold ?? 0);
        return threshold ? Math.min(adjusted, Math.max(0, unit.hp - threshold)) : adjusted;
    };
    rules.hooks.afterDamage = async (unit, damage, broken, shield) => {
        const threshold = Number(unit.state.memory.talentPacifyThreshold ?? 0);
        if (threshold && unit.hp <= threshold && !unit.state.memory.talentPacified) {
            unit.state.memory.talentPacified = 1;
            unit.participating = false;
            const row = targets.find(t => unit.key === `target:${t.id}`);
            if (row)
                row.is_defeated = 1;
            for (const m of members.filter(m => !m.npc_code))
                recordAchievement(c, Number(m.id), ['ACH_L20'], 'pacify:' + unit.key);
            rules.log.push(`　➥${unit.name}放下敌意，已被降服。`);
        }
        await after?.(unit, damage, broken, shield);
    };
};
const persistTalentBattle = async (c, rules, members, targets) => {
    for (const row of members) {
        const unit = rules.units.find(u => u.key === `member:${row.id}`);
        if (!unit?.opening?.pve)
            continue;
        const data = await readTalentData(c, Number(row.id)), state = talentState(unit);
        for (const enemy of targets)
            data.flags[`life:${enemy.id}`] = { seen: state.seen.includes(`target:${enemy.id}`), hit: state.hit.includes(`target:${enemy.id}`), fireUsed: state.fireUsed, noAid: state.noAid, poorBroken: state.poorBroken, stoneGranted: state.stoneGranted, stoneShield: state.stoneShield, phase: state.phase };
        if (unit.state.memory.talentRestMark)
            data.flags.restMark = Number(unit.state.memory.talentRestMark);
        delete unit.state.memory.talentQuickMove;
        delete unit.state.memory.talentWeatherMove;
        delete unit.state.memory.talentRestMark;
        if (unit.hp <= 0 && hasTalent(unit, 'C06') && members.every(m => Number(m.current_hp) <= 0 || m.is_defeated) && state.startedFull && (state.completed ?? 0) >= 3 && (state.enemyHpLoss ?? 0) >= unit.hpMax * .5) {
            const foe = targets.find(t => Math.abs(Number(t.level) - Number(row.level)) <= 5 && !t.is_defeated);
            if (foe)
                data.flags.defeatSpecies = String(foe.template_id);
        }
        await saveTalentData(c, Number(row.id), data);
    }
};
const talentTransferBuff = async (rules, unit) => {
    const state = talentState(unit);
    if (!hasTalent(unit, 'I07') || !state.normal || state.normal % 3 !== 0 || unit.state.memory.talentTransferredAt === state.normal)
        return;
    const chosen = String(unit.opening?.settings?.transferBuff ?? '').split(':');
    if (chosen.length !== 3 || !talentTransferEffects.includes(chosen[0]))
        return;
    const target = rules.allies(unit).find(u => u.key === `${chosen[1]}:${chosen[2]}` && u.key !== unit.key && u.side === 'member');
    if (!target)
        return;
    const effect = rules.effects(unit).find(e => e.code === chosen[0] && !e.debuff && !e.mechanism && !e.data && e.value > 0);
    if (!effect)
        return;
    const existing = rules.effects(target).filter(e => e.code === effect.code);
    if (existing.some(e => e.mechanism || e.debuff || e.data || e.value * e.stacks >= effect.value * effect.stacks))
        return;
    if (effect.legacyId) {
        if (!await rules.hooks.transferLegacy?.(effect, unit, target))
            return;
    }
    else {
        await rules.remove(unit, e => rules.sameEffect(e, effect));
        target.state.statuses.push({ ...effect });
    }
    for (const old of existing)
        await rules.removeEffect(target, old);
    talentSupport(unit, target);
    unit.state.memory.talentTransferredAt = state.normal;
    rules.log.push(`　➥${unit.name}将${talentTransferLabels[effect.code]}及剩余时长转移给${target.name}。`);
};

export { canTalentPacify, loadTalentBattle, persistTalentBattle, talentPreparationSkills, talentTransferBuff, talentTransferEffects, talentTransferLabels };
