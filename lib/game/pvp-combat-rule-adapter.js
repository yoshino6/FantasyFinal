import { specializedPassiveValue, passiveSpecializationFactor } from './passive-specialization.js';
import { readRuleState, CombatRules } from './combat-rule-registry.js';
import { ruleAppraisalLevels } from './combat-rule-adapter.js';
import { isCachedAdvancedPassiveKey } from './advanced-profession.config.js';

const record = (value) => typeof value === 'string' ? JSON.parse(value) : (value ?? {});
const createPvpCombatRules = async (connection, fighters, states, turn, log, extra) => {
    const ids = fighters.map(f => Number(f.id));
    const appraisal = await ruleAppraisalLevels(connection, ids);
    const [passives] = await connection.execute(`SELECT ps.character_id,s.code,s.passive_effect_json,s.tier,COALESCE(sp.level,1) AS potent_level FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id LEFT JOIN player_skill_specializations sp ON sp.character_id=ps.character_id AND sp.skill_id=s.id AND sp.specialization='potent' WHERE ps.character_id IN (${ids.map(() => '?').join(',')}) AND (s.category='bound' OR (s.category='passive' AND ps.passive_linked=1))`, ids);
    const [weapons] = await connection.execute(`SELECT pe.character_id,COUNT(DISTINCT i.weapon_type) AS types FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id IN (${ids.map(() => '?').join(',')}) AND i.item_category IN ('武器','副手') GROUP BY pe.character_id`, ids);
    const units = fighters.map((fighter, index) => {
        const cooldowns = states[index];
        const state = readRuleState(cooldowns.__rules);
        cooldowns.__rules = state;
        const owned = passives.filter(row => Number(row.character_id) === Number(fighter.id));
        const modifiers = {};
        for (const passive of owned)
            for (const [key, value] of Object.entries(record(passive.passive_effect_json)))
                if (typeof value === 'number' && !isCachedAdvancedPassiveKey(key))
                    modifiers[key] = Number(modifiers[key] ?? 0) + specializedPassiveValue(key, value, passive.potent_level, String(passive.tier));
        return { key: `pvp:${fighter.id}`, name: fighter.name, side: `pvp:${fighter.id}`, level: Number(fighter.level), boss: false,
            get hp() { return Number(fighter.current_hp); }, set hp(value) { fighter.current_hp = Math.max(0, Math.floor(value)); }, hpMax: Number(fighter.hp_max),
            get mp() { return Number(fighter.current_mp); }, set mp(value) { fighter.current_mp = Math.max(0, Math.floor(value)); }, mpMax: Number(fighter.mp_max),
            attack: Number(fighter.physical_attack), magic: Number(fighter.magic_attack), defense: Number(fighter.physical_defense), magicDefense: Number(fighter.magic_defense),
            accuracy: Number(fighter.accuracy), evasion: Number(fighter.evasion), speed: Number(fighter.speed), crit: Number(fighter.crit_rate_bp), critResist: Number(fighter.crit_resist_bp), critDamage: Number(fighter.crit_damage_bp), critReduction: Number(fighter.crit_damage_reduction_bp), pierce: Number(fighter.tenacity_pierce ?? 0), tenacity: Number(fighter.tenacity ?? 0),
            state, cooldowns, passives: owned.map(row => String(row.code)), modifiers,
            passiveSpecializations: Object.fromEntries(owned.map(row => [row.code, passiveSpecializationFactor(row.potent_level, String(row.tier))])),
            weaponsDifferent: Number(weapons.find(row => Number(row.character_id) === Number(fighter.id))?.types ?? 0) > 1,
            mastery: record(fighter.element_mastery_json), resistance: record(fighter.element_resistance_json), appraisal: appraisal.get(Number(fighter.id)) ?? 0 };
    });
    const legacy = [['device_slow', 'slow', 30, true], ['device_exposed', 'exposed', 15, true], ['device_evasion_down', 'evasion_down', 30, true], ['device_barrier', 'barrier', 15, false], ['device_battle_cry', 'battle_cry', 20, false], ['device_precision_aim', 'precision', 100, false]];
    const rule = new CombatRules(units, turn, log, {
        absorb: async () => 0,
        legacyEffects: unit => legacy.flatMap(([key, code, value, debuff], index) => Number(unit.cooldowns[key] ?? 0) > 0 ? [{ code, value, until: turn + Number(unit.cooldowns[key]) - 1, source: unit.key, debuff, stacks: 1, legacyId: units.indexOf(unit) * 100 + index + 1 }] : []),
        removeLegacy: async (id) => { const unit = units[Math.floor((id - 1) / 100)]; delete unit.cooldowns[legacy[(id - 1) % 100][0]]; },
        extraAction: extra, swapThreat: async () => { },
        directMultiplier: (_source, target) => 1 - Math.min(80, rule.value(target, 'barrier')) / 100
    });
    rule.start();
    return { rule, get: (id) => units.find(unit => unit.key === `pvp:${id}`) };
};

export { createPvpCombatRules };
