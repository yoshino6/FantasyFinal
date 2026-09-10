import { armorSetsFor } from './armor-set.js';
import { openingCombatEffectsFor } from './opening-combat.js';
import { installTalentHealingGuard, hasTalent } from './talent-combat.js';
import { initializeHiddenBattleUnits } from './hidden-battle.service.js';
import { passiveSpecializationFactor } from './passive-specialization.js';
import { CombatRules, readRuleState } from './combat-rule-registry.js';

const record = (value) => typeof value === 'string' ? JSON.parse(value) : (value ?? {});
const negative = new Set(['vulnerability', 'armor_shatter', 'magic_shatter', 'imbalance', 'slow', 'bind', 'stun', 'exposed', 'poison', 'burn', 'bleed', 'bleeding', 'alchemy_confusion', 'advanced_hunt']);
const ruleAppraisalLevels = async (connection, ids) => {
    if (!ids.length)
        return new Map();
    const [rows] = await connection.execute(`SELECT c.id,GREATEST(
    COALESCE((SELECT ap.information_level FROM player_appraisal_progress ap JOIN player_skills ps ON ps.character_id=ap.character_id JOIN skill_definitions s ON s.id=ps.skill_id WHERE ap.character_id=c.id AND s.code='appraisal' AND (s.category='bound' OR ps.passive_linked=1) LIMIT 1),0),
    COALESCE((SELECT LEAST(4,sp.level) FROM player_secondary_professions sp WHERE sp.character_id=c.id AND sp.profession_code='omniscient' AND c.secondary_profession_code='omniscient' LIMIT 1),0)) AS information_level
    FROM characters c WHERE c.id IN (${ids.map(() => '?').join(',')})`, ids);
    return new Map(rows.map(row => [Number(row.id), Number(row.information_level)]));
};
const createCombatRules = async (connection, sessionId, turn, members, targets, statsForTarget, effects, log, weather, absorb, onExtra, openingPve = true) => {
    const ids = members.map(member => Number(member.id));
    const appraisal = await ruleAppraisalLevels(connection, ids);
    const armorSets = await armorSetsFor(connection, ids);
    const openingEffects = await openingCombatEffectsFor(connection, members.filter(member => !member.npc_code).map(member => Number(member.id)), openingPve);
    const [passives] = await connection.execute(`SELECT ps.character_id,s.code,s.tier,COALESCE(sp.level,1) AS potent_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id LEFT JOIN player_skill_specializations sp ON sp.character_id=ps.character_id AND sp.skill_id=s.id AND sp.specialization='potent' WHERE ps.character_id IN (${ids.map(() => '?').join(',')}) AND ps.passive_linked=1 AND s.code LIKE 'resident_%'`, ids);
    const [weapons] = await connection.execute(`SELECT pe.character_id,COUNT(DISTINCT i.weapon_type) AS types FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id IN (${ids.map(() => '?').join(',')}) AND i.item_category IN ('武器','副手') GROUP BY pe.character_id`, ids);
    const make = (row, kind) => {
        const cooldowns = record(row.cooldowns);
        row.cooldowns = cooldowns;
        const state = readRuleState(cooldowns.__rules);
        cooldowns.__rules = state;
        const traits = typeof row.traits_json === 'string' ? JSON.parse(row.traits_json) : row.traits_json;
        const profile = Array.isArray(traits) ? traits.find(trait => trait.code === 'npc_sparring')?.profile : undefined;
        const nightmare = Array.isArray(traits) ? traits.find(trait => trait.code === 'nightmare') : undefined;
        if (nightmare?.breakComponent)
            state.memory.nightmareMechanism = `target:${row.id}:${nightmare.breakComponent}`;
        const stats = kind === 'target' ? statsForTarget(row) : { physicalAttack: Number(row.physical_attack), magicAttack: Number(row.magic_attack), physicalDefense: Number(row.physical_defense), magicDefense: Number(row.magic_defense), accuracy: Number(row.accuracy), evasion: Number(row.evasion), speed: Number(row.speed), crit: Number(row.crit_rate_bp), critResist: Number(row.crit_resist_bp), critDamage: Number(row.crit_damage_bp), critReduction: Number(row.crit_damage_reduction_bp), tenacityPierce: Number(row.tenacity_pierce), tenacity: Number(row.tenacity) };
        return {
            key: `${kind}:${row.id}`, name: profile?.name ?? row.name, companion: kind === 'member' && Boolean(row.npc_code), side: kind, level: Number(row.level), boss: !profile && row.monster_class === 'boss',
            get hp() { return Number(row.current_hp); }, set hp(value) { row.current_hp = Math.max(0, Math.floor(value)); row.is_defeated = row.current_hp <= 0 ? 1 : 0; },
            hpMax: Number(row.hp_max), get mp() { return Number(row.current_mp); }, set mp(value) { row.current_mp = Math.max(0, Math.floor(value)); }, mpMax: Number(profile?.stats.mpMax ?? (kind === 'target' ? statsForTarget(row).mpMax : row.mp_max)),
            attack: stats.physicalAttack, magic: stats.magicAttack, defense: stats.physicalDefense, magicDefense: stats.magicDefense,
            accuracy: stats.accuracy, evasion: stats.evasion, speed: stats.speed, crit: stats.crit, critResist: stats.critResist, critDamage: stats.critDamage, critReduction: stats.critReduction, pierce: stats.tenacityPierce, tenacity: stats.tenacity,
            state, get cooldowns() { return record(row.cooldowns); }, passives: kind === 'member' ? passives.filter(passive => Number(passive.character_id) === Number(row.id)).map(passive => passive.code) : [...(profile?.passives ?? []), ...(nightmare ? ['resident_l01'] : [])],
            get selected() { return `target:${row.selected_target_id}`; }, set selected(value) { if (kind === 'member' && value?.startsWith('target:'))
                row.selected_target_id = Number(value.split(':')[1]); },
            weaponsDifferent: Number(weapons.find(weapon => Number(weapon.character_id) === Number(row.id))?.types ?? 0) > 1,
            mastery: record(row.element_mastery_json), resistance: record(row.element_resistance_json), appraisal: kind === 'target' ? 0 : appraisal.get(Number(row.id)) ?? 0,
            passiveSpecializations: Object.fromEntries(passives.filter(passive => Number(passive.character_id) === Number(row.id) && kind === 'member').map(passive => [passive.code, passiveSpecializationFactor(passive.potent_level, String(passive.tier))])),
            armorSet: kind === 'member' ? armorSets.get(Number(row.id)) : profile?.armorSet ?? (Array.isArray(traits) ? traits.find(trait => trait.code === 'advanced_mentor_build')?.build?.armorSet : undefined),
            opening: kind === 'member' && !row.npc_code ? openingEffects.get(Number(row.id)) : undefined,
            modifiers: profile?.advancedEffect ?? {}
        };
    };
    const units = [...members.map(row => make(row, 'member')), ...targets.map(row => make(row, 'target'))];
    for (const unit of units) {
        const row = [...members, ...targets].find(row => unit.key === `${unit.side}:${row.id}`);
        if (row)
            installTalentHealingGuard(unit, row);
    }
    await initializeHiddenBattleUnits(connection, units);
    const identity = (unit) => { const [kind, id] = unit.key.split(':'); return { kind: kind, id: Number(id) }; };
    const removed = new Set();
    const shieldResults = new Map();
    const rule = new CombatRules(units, turn, log, {
        strikeResolved: async (source, target, damage) => {
            if (source.side !== 'member' || target.side !== 'target' || damage <= 0)
                return;
            await connection.execute('UPDATE combat_threat SET threat=threat+? WHERE session_id=? AND spawn_id=? AND character_id=?', [damage * (hasTalent(source, 'A06') ? 1.5 : 1), sessionId, identity(target).id, identity(source).id]);
        },
        absorb: async (unit, amount) => { const { kind, id } = identity(unit); const result = await absorb(kind, id, unit.hpMax, amount); shieldResults.set(unit.key, result); return result.absorbed; },
        legacyEffects: unit => { const { kind, id } = identity(unit); return effects().filter(effect => effect.target_kind === kind && Number(effect.target_id) === id && !removed.has(Number(effect.id))).map(effect => ({ code: effect.code === 'alchemy_confusion' ? 'confusion' : effect.code, value: Number(effect.value), until: turn + Number(effect.remaining_turns), source: String(effect.source_key ?? ''), debuff: negative.has(effect.code) || ['control', 'damage_over_time'].includes(effect.effect_type), stacks: Number(effect.stacks), legacyId: Number(effect.id) })); },
        removeLegacy: async (id) => { removed.add(id); const row = effects().find(effect => Number(effect.id) === id); if (row) {
            row.value = 0;
            row.stacks = 0;
        } await connection.execute('DELETE FROM combat_status_effects WHERE session_id=? AND id=?', [sessionId, id]); },
        updateLegacy: async (effect) => { if (!effect.legacyId)
            return; const row = effects().find(item => Number(item.id) === effect.legacyId); if (row) {
            row.value = effect.value;
            row.stacks = effect.stacks;
        } await connection.execute('UPDATE combat_status_effects SET value=?,stacks=? WHERE session_id=? AND id=?', [effect.value, effect.stacks, sessionId, effect.legacyId]); },
        transferLegacy: async (effect, source, target) => {
            const row = effects().find(e => Number(e.id) === effect.legacyId);
            if (!row || removed.has(Number(row.id)) || row.remaining_turns <= 0)
                return false;
            const destination = identity(target), origin = identity(source);
            if (row.target_kind !== origin.kind || Number(row.target_id) !== origin.id)
                return false;
            await connection.execute('UPDATE combat_status_effects SET target_kind=?,target_id=? WHERE session_id=? AND id=?', [destination.kind, destination.id, sessionId, row.id]);
            row.target_kind = destination.kind;
            row.target_id = destination.id;
            return true;
        },
        extraAction: unit => { const { kind, id } = identity(unit); onExtra(kind, id); },
        swapThreat: async (a, b) => {
            if (a.side !== 'member' || b.side !== 'member' || a.key === b.key)
                return;
            const [rows] = await connection.execute('SELECT spawn_id,character_id,threat FROM combat_threat WHERE session_id=? AND character_id IN (?,?) FOR UPDATE', [sessionId, identity(a).id, identity(b).id]);
            for (const row of rows)
                await connection.execute('UPDATE combat_threat SET threat=? WHERE session_id=? AND spawn_id=? AND character_id=?', [row.threat, sessionId, row.spawn_id, Number(row.character_id) === identity(a).id ? identity(b).id : identity(a).id]);
        }
    }, weather);
    const get = (kind, id) => units.find(unit => unit.key === `${kind}:${id}`);
    const profile = targets.map(row => { const traits = typeof row.traits_json === 'string' ? JSON.parse(row.traits_json) : row.traits_json; return Array.isArray(traits) ? traits.find(trait => trait.code === 'npc_sparring')?.profile : undefined; }).find(Boolean);
    rule.sparLevelBand = profile?.band;
    rule.start();
    const takeDamage = async (kind, id, incoming, areaHit = false, source) => {
        const unit = get(kind, id);
        const ownBefore = rule.value(unit, 'shield');
        const result = await rule.takeHit(unit, incoming, 1, areaHit, source);
        incoming = result.damage;
        const absorbed = result.absorbed;
        const ownAfter = rule.value(unit, 'shield');
        const legacy = shieldResults.get(unit.key);
        return { incoming, absorbed, remaining: ownAfter + Number(legacy?.remaining ?? 0), broken: Boolean(legacy?.broken) || ownBefore > 0 && ownAfter <= 0 };
    };
    return { rule, get, takeDamage };
};

export { createCombatRules, ruleAppraisalLevels };
