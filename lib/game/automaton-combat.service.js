import { achievementInstanceVictory } from './achievement-state.js';
import { combatUnitLabel } from './combat-unit-label.js';
import { effectiveAutomatonState } from './automaton.js';
import { realmLevelCap } from './constants.js';
import { craftJson } from './alchemy-journal.service.js';
import { automatonFor, recordAutomatonFirstEvent, automatonIntimacy, recordAutomatonEvent, saveAutomaton } from './automaton.service.js';
import { emptyRuleState } from './combat-rule-registry.js';
import { tenacityContest } from './combat-math.js';
import { automatonRuleUnit } from './automaton-combat.js';
import { prepareAutomatonQuote } from './automaton-dialogue.service.js';

const loadCombatAutomatons = async (connection, sessionId, ownerIds) => {
    if (!ownerIds.length)
        return [];
    const [existing] = await connection.execute('SELECT automaton_id,owner_id,state_json FROM combat_automatons WHERE session_id=? FOR UPDATE', [sessionId]);
    const result = existing.map(row => { const battle = craftJson(row.state_json), id = Number(row.automaton_id); return { id, ownerId: Number(row.owner_id), battle, unit: automatonRuleUnit(id, battle) }; });
    for (const ownerId of ownerIds) {
        if (result.some(p => p.ownerId === ownerId))
            continue;
        const [rows] = await connection.execute('SELECT * FROM player_automatons WHERE owner_id=? AND following=1 FOR UPDATE', [ownerId]);
        const row = rows[0];
        if (!row)
            continue;
        const { state: storedState } = await automatonFor(connection, ownerId, Number(row.id));
        const [owners] = await connection.execute('SELECT level,realm_stage FROM characters WHERE id=?', [ownerId]);
        const state = effectiveAutomatonState(storedState, Math.min(Number(owners[0].level), realmLevelCap(Number(owners[0].realm_stage))));
        if (!state.hp)
            continue;
        const battle = { pet: state, rule: emptyRuleState(), cooldowns: {}, sync: state.equipped.includes('S008') ? 20 : 0, ultimateUsed: false, actionCount: 0, exited: false, threat: {} };
        await connection.execute('INSERT INTO combat_automatons (session_id,automaton_id,owner_id,state_json) VALUES (?,?,?,?)', [sessionId, row.id, ownerId, JSON.stringify(battle)]);
        await connection.execute('UPDATE player_automatons SET combat_id=?,recover_at=NULL WHERE id=?', [sessionId, row.id]);
        result.push({ id: Number(row.id), ownerId, battle, unit: automatonRuleUnit(Number(row.id), battle) });
        await connection.execute('INSERT IGNORE INTO automaton_events (automaton_id,character_id,event_key,kind,data_json) VALUES (?,?,?,\'battle_start\',?)', [row.id, ownerId, `battle:${sessionId}`, JSON.stringify({ name: state.name, sessionId })]);
        await recordAutomatonFirstEvent(connection, Number(row.id), ownerId, 'first_battle', { name: state.name, sessionId });
    }
    return result;
};
const saveCombatAutomatons = async (connection, sessionId, pets) => {
    for (const pet of pets) {
        if (pet.unit.state.memory.automaton_intercept === 1)
            await recordAutomatonFirstEvent(connection, pet.id, pet.ownerId, 'first_intercept', { name: pet.battle.pet.name, sessionId });
        await connection.execute('UPDATE combat_automatons SET state_json=? WHERE session_id=? AND automaton_id=?', [JSON.stringify(pet.battle), sessionId, pet.id]);
    }
};
const finishCombatAutomatons = async (connection, sessionId, victory = false) => {
    const [rows] = await connection.execute('SELECT automaton_id,owner_id,state_json FROM combat_automatons WHERE session_id=? FOR UPDATE', [sessionId]);
    for (const row of rows) {
        const battle = craftJson(row.state_json);
        const { row: stored, state } = await automatonFor(connection, Number(row.owner_id), Number(row.automaton_id));
        state.hp = battle.pet.hp > 0 ? Math.max(1, Math.floor(battle.pet.hp / Math.floor(battle.pet.stats[0]) * Math.floor(state.stats[0]))) : 0;
        state.mp = Math.floor(battle.pet.mp / Math.floor(battle.pet.stats[1]) * Math.floor(state.stats[1]));
        if (victory) {
            const evidence = battle.rule.memory.achievement;
            const [eligible] = await connection.execute('SELECT stamina_eligible FROM combat_members WHERE session_id=? AND character_id=?', [sessionId, row.owner_id]);
            if (eligible[0]?.stamina_eligible && (Number(evidence?.damage) > 0 || Number(evidence?.healed) > 0 || Number(evidence?.playerSupport) > 0))
                await achievementInstanceVictory(connection, Number(row.owner_id), Number(row.automaton_id), sessionId, 'ACH_J11');
            await automatonIntimacy(connection, Number(row.owner_id), state, 'victory', Number(row.automaton_id));
            await recordAutomatonFirstEvent(connection, Number(row.automaton_id), Number(row.owner_id), 'first_victory', { name: state.name, sessionId });
            const [bosses] = await connection.execute("SELECT DISTINCT t.code,t.name,COALESCE(s.level,t.level) level FROM combat_targets ct JOIN monster_spawns s ON s.id=ct.spawn_id JOIN monster_templates t ON t.id=s.template_id WHERE ct.session_id=? AND ct.is_defeated=1 AND t.monster_class='boss' AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_component')) AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test')) AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','npc_sparring'))", [sessionId]);
            for (const boss of bosses)
                await recordAutomatonFirstEvent(connection, Number(row.automaton_id), Number(row.owner_id), 'first_boss', { name: state.name, sessionId, boss: String(boss.name), bossLevel: Number(boss.level) }, `boss:${boss.code}`);
        }
        if (victory && !state.hp)
            await recordAutomatonEvent(connection, Number(row.automaton_id), Number(row.owner_id), `shutdown:${sessionId}`, 'shutdown', { name: state.name, sessionId, hp: 0, mp: state.mp });
        await recordAutomatonEvent(connection, Number(row.automaton_id), Number(row.owner_id), `end:${sessionId}`, victory ? 'victory' : state.hp ? 'rest' : 'shutdown', { name: state.name, sessionId, hp: state.hp, mp: state.mp });
        await saveAutomaton(connection, stored, state);
        await connection.execute('UPDATE player_automatons SET combat_id=NULL,recover_at=DATE_ADD(NOW(),INTERVAL ? MINUTE) WHERE id=?', [state.hp > 0 ? 10 : 30, row.automaton_id]);
    }
    await connection.execute('DELETE FROM combat_automatons WHERE session_id=?', [sessionId]);
};
const appendAutomatonBattleQuotes = async (connection, sessionId, pets, log, victory) => {
    if (!pets.length)
        return;
    const ownerIds = [...new Set(pets.map(p => p.ownerId))];
    const [automatic] = await connection.execute(`SELECT character_id FROM player_auto_battle_settings WHERE enabled=1 AND character_id IN (${ownerIds.map(() => '?').join(',')})`, ownerIds);
    const mutedOwners = new Set(automatic.map(row => Number(row.character_id)));
    if (pets.every(p => mutedOwners.has(p.ownerId)))
        return;
    const [existing] = await connection.execute('SELECT automaton_id,event_type FROM automaton_dialogues WHERE event_key LIKE ?', [`battle:${sessionId}:%`]);
    let teamCount = existing.length;
    for (const p of pets) {
        if (mutedOwners.has(p.ownerId))
            continue;
        if (teamCount >= 4)
            continue;
        const shown = existing.filter(row => Number(row.automaton_id) === p.id).map(row => String(row.event_type));
        if (shown.length >= 2)
            continue;
        const memory = p.unit.state.memory;
        const event = !p.unit.hp ? 'shutdown' : memory.automaton_intercept === 1 ? 'intercept' : memory.automaton_ownerDanger === 1 ? 'owner_danger' : p.battle.actionCount <= 1 ? 'battle_start' : victory ? 'victory' : p.unit.hp / p.unit.hpMax < .3 ? 'hurt' : 'attack';
        if (shown.includes(event))
            continue;
        const facts = new Set([event, 'owner_present']);
        if (victory)
            facts.add('battle_won');
        if (memory.automaton_intercept === 1)
            facts.add('intercept_succeeded');
        if (!p.unit.hp)
            facts.add('automaton_shutdown');
        const quote = await prepareAutomatonQuote(connection, p.id, p.battle.pet, event, `battle:${sessionId}:${event}`, facts, false);
        if (quote) {
            log.push(`\u2063${combatUnitLabel(p.unit)}「${quote.text}」`);
            teamCount++;
        }
    }
};
const applyEnemySkillToAutomaton = async (connection, rules, source, target, skillId, timing, includeSelf = false) => {
    const [effects] = await connection.execute(`SELECT e.code,e.effect_type,e.name,e.max_stacks,e.stackable,COALESCE(se.value_override,e.default_value) value,COALESCE(se.duration_override,e.default_duration) duration,se.target_scope,se.effect_level FROM skill_effects se JOIN effect_definitions e ON e.id=se.effect_id WHERE se.skill_id=? AND se.trigger_timing=? ORDER BY e.id`, [skillId, timing]);
    const names = { stun: 'alchemy_stun', freeze: 'alchemy_stun', bleeding: 'bleed', rending: 'bleed', sword_break: 'attack_down', critical_focus: 'crit_bonus', sprint: 'speed' };
    for (const effect of effects) {
        const hostile = effect.target_scope === 'enemy';
        if (!hostile && !includeSelf)
            continue;
        const recipient = hostile ? target : source;
        let value = Number(effect.value) * (1 + Math.max(0, Number(effect.effect_level) - 1) * .25), duration = Number(effect.duration);
        const code = names[effect.code] ?? String(effect.code);
        if (effect.effect_type === 'control') {
            await rules.control(source, recipient, code, value, Math.min(3, duration), false);
            continue;
        }
        if (hostile) {
            const contest = tenacityContest(source.pierce, recipient.tenacity * (1 + rules.value(recipient, 'tenacity') / 100), source.level - recipient.level, value);
            value *= effect.effect_type === 'damage_over_time' ? contest.damageOverTimeMultiplier : contest.harmfulMultiplier;
            duration = Math.max(1, Math.round(duration * contest.harmfulMultiplier));
        }
        if (code === 'life_shield') {
            await rules.shield(source, recipient, recipient.hpMax * value / 100, duration);
            continue;
        }
        if (effect.effect_type === 'cleanse') {
            await rules.dispel(source, recipient, true, 1);
            continue;
        }
        const stored = effect.effect_type === 'heal_over_time' ? `automaton_hot_enemy_${source.key}_${code}` : effect.effect_type === 'mana_regen' ? `automaton_mana_enemy_${source.key}_${code}` : code;
        const old = rules.status(recipient, stored), status = rules.add(recipient, stored, effect.effect_type === 'heal_over_time' ? recipient.hpMax * value / 100 : value, duration, source, hostile);
        if (effect.stackable)
            status.stacks = Math.min(Number(effect.max_stacks), Number(old?.stacks ?? 0) + 1);
        rules.log.push(`　➥${combatUnitLabel(recipient)}${hostile ? '受到' : '获得'}${effect.name}（${duration}回合）。`);
    }
};

export { appendAutomatonBattleQuotes, applyEnemySkillToAutomaton, finishCombatAutomatons, loadCombatAutomatons, saveCombatAutomatons };
