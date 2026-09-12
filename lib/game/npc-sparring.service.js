import { recordAchievement } from './achievement-events.js';
import { playerGrowthShares } from './growth-rules.js';
import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from '../database/pool.js';
import { recalculateCharacterStats } from './character.service.js';
import { snapshotCombatEnvironment } from './world-dynamics.service.js';
import { advancedResourceForProfession } from './advanced-resource.config.js';
import { canonicalSparNpc, canSparNpc, buildNpcSparProfile, carriedSparSkills } from './npc-sparring.config.js';
import { residentSkillByCode } from './resident-skill.config.js';

const json = (value) => typeof value === 'string' ? JSON.parse(value) : (value ?? {});
const sparBusinessDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const playerFor = async (connection, userId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.*,r.code AS region_code FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [userId]);
    if (!rows[0])
        throw new Error('请先创建角色。');
    return rows[0];
};
const profileFor = async (connection, character, input, businessDate = sparBusinessDate()) => {
    const code = canonicalSparNpc(input);
    const locationCode = input === 'ga_library' ? 'world_library' : code === 'guild_merchant' ? 'guild_counter' : code;
    const [rows] = await connection.execute(`SELECT n.*,r.code AS region_code FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE n.code IN (?,?) AND n.region_id=? ORDER BY n.code=? DESC LIMIT 1`, [locationCode, input, character.current_region_id, locationCode]);
    const npc = rows[0];
    if (!npc || !canSparNpc(code, npc.interaction_kind))
        throw new Error('附近没有这位可以切磋的域民。');
    if (code === 'evolution_lab') {
        const [progress] = await connection.execute("SELECT q.stage,EXISTS(SELECT 1 FROM player_evolution_profiles ep WHERE ep.character_id=q.character_id) AS evolved FROM player_main_quest_progress q WHERE q.character_id=? AND q.quest_code='evolution_barrier'", [character.id]);
        const stage = Number(progress[0]?.stage ?? 0);
        if (input === 'ga_library' ? stage < 5 || stage > 6 : stage < 8 || !progress[0]?.evolved)
            throw new Error('这位域民所在的研究室尚未向你开放。');
    }
    if (Number(character.pos_z) !== Number(npc.pos_z))
        throw new Error('请先到达这位域民所在的地图层。');
    const [visits] = await connection.execute('SELECT 1 FROM player_home_visits WHERE character_id=? LIMIT 1', [character.id]);
    if (visits.length)
        throw new Error('请先离开住宅，再与外面的域民切磋。');
    if (npc.pos_x === null || npc.pos_y === null)
        throw new Error('这位域民当前不在场。');
    const perception = Number(character.perception) + Number(character.perception_growth) * playerGrowthShares(Number(character.level));
    const range = Math.max(1, Math.min(10, 2 + Math.floor(Number(character.level) / 5), 1 + Math.floor(Math.pow(Math.max(1, perception) / 7, .9))));
    if (Math.abs(Number(character.pos_x) - Number(npc.pos_x)) + Math.abs(Number(character.pos_y) - Number(npc.pos_y)) > range)
        throw new Error('这位域民已离开你的感知范围。');
    const [stages] = await connection.execute("SELECT COALESCE(MAX(stage),0) AS stage FROM worldline_states WHERE JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.regionCode'))=?", [npc.region_code]);
    const profile = buildNpcSparProfile({ ...npc, code }, Number(character.level), Number(stages[0]?.stage ?? 0));
    const [attempts] = await connection.execute('SELECT state FROM player_npc_spar_attempts WHERE character_id=? AND npc_code=? AND business_date=? LIMIT 1', [character.id, code, businessDate]);
    return { profile, used: Boolean(attempts[0]) };
};
const npcSparringView = async (userId, code) => { const pool = await getPool(); return profileFor(pool, await playerFor(pool, userId), code); };
const startNpcSparring = async (userId, code) => withTransaction(async (connection) => {
    const businessDate = sparBusinessDate();
    let character = await playerFor(connection, userId, true);
    if (character.activity_status !== 'active' || Number(character.current_hp) <= 0)
        throw new Error('请在能够正常行动时再切磋。');
    const [busy] = await connection.execute(`SELECT
    EXISTS(SELECT 1 FROM player_travels WHERE character_id=?) AS travelling,
    EXISTS(SELECT 1 FROM player_resource_mining WHERE character_id=?) AS mining,
    EXISTS(SELECT 1 FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?)) AS pvp`, [character.id, character.id, character.id, character.id]);
    if (busy[0]?.travelling || busy[0]?.mining || busy[0]?.pvp)
        throw new Error('请先结束移动、开采或玩家对战，再与域民切磋。');
    const [active] = await connection.execute("SELECT cs.id FROM combat_sessions cs JOIN combat_members cm ON cm.session_id=cs.id WHERE cm.character_id=? AND cs.state='active' LIMIT 1 FOR UPDATE", [character.id]);
    if (active.length)
        throw new Error('请先结束当前战斗。');
    const { profile, used } = await profileFor(connection, character, code, businessDate);
    if (used)
        throw new Error(`今天已经与【${profile.name}】切磋过了，明日再来。`);
    await recalculateCharacterStats(connection, Number(character.id));
    character = await playerFor(connection, userId, true);
    const sessionId = randomUUID();
    const attemptId = randomUUID();
    await connection.execute('INSERT INTO player_npc_spar_attempts (id,character_id,npc_code,business_date,session_id,snapshot_json,profile_json) VALUES (?,?,?,?,?,?,?)', [attemptId, character.id, profile.code, businessDate, sessionId, JSON.stringify({ hp: character.current_hp, mp: character.current_mp, activity: character.activity_status }), JSON.stringify(profile)]);
    await connection.execute('INSERT INTO npc_spar_profiles (npc_code,profile_json) VALUES (?,?) ON DUPLICATE KEY UPDATE profile_json=VALUES(profile_json)', [profile.code, JSON.stringify(profile)]);
    const [templates] = await connection.execute("SELECT id FROM monster_templates WHERE code='npc_sparring_dummy' LIMIT 1");
    if (!templates[0])
        throw new Error('切磋数据尚未初始化，请稍后再试。');
    const [spawn] = await connection.execute(`INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,current_hp,skill_sequence,traits_json,defeated_at)
    VALUES (?,?,?,?,?,?,?,?,?,NOW())`, [templates[0].id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z, profile.level, profile.stats.hpMax, JSON.stringify(profile.rotation), JSON.stringify([{ code: 'npc_sparring', name: '', profile }])]);
    await connection.execute("INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns,opening_damage_bonus,mode) VALUES (?,?,?,?,?,JSON_OBJECT(),0,'spar')", [sessionId, character.id, spawn.insertId, character.current_hp, character.current_mp]);
    await connection.execute('INSERT INTO combat_members (session_id,character_id,current_hp,current_mp,selected_target_id,cooldowns,stamina_eligible) VALUES (?,?,?,?,?,JSON_OBJECT(),0)', [sessionId, character.id, character.current_hp, character.current_mp, spawn.insertId]);
    await connection.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [sessionId, spawn.insertId, profile.stats.mpMax]);
    await connection.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [sessionId, spawn.insertId, character.id]);
    await snapshotCombatEnvironment(connection, sessionId, Number(character.current_region_id), [Number(character.id)]);
    const [professions] = await connection.execute('SELECT profession_code FROM player_advanced_professions WHERE character_id=?', [character.id]);
    const resource = advancedResourceForProfession(String(professions[0]?.profession_code ?? ''));
    if (resource)
        await connection.execute('INSERT INTO combat_profession_resources (session_id,character_id,profession_code,resource_code,resource_name,current_value,max_value) VALUES (?,?,?,?,?,0,100)', [sessionId, character.id, resource.professionCode, resource.code, resource.name]);
    return { sessionId, profile };
});
const finishNpcSparring = async (connection, sessionId, result) => {
    const worldtree = await (await import('./worldtree-witness.service.js')).finishAesonDuel(connection, sessionId, result);
    if (worldtree)
        return worldtree;
    const lamplight = await (await import('./lamplight-battle.service.js')).finishLamplightBattle(connection, sessionId, result);
    if (lamplight)
        return lamplight;
    const [rows] = await connection.execute('SELECT * FROM player_npc_spar_attempts WHERE session_id=? FOR UPDATE', [sessionId]);
    const attempt = rows[0];
    if (!attempt || attempt.state !== 'active')
        return '切磋已经结算。';
    const profile = json(attempt.profile_json);
    const snapshot = json(attempt.snapshot_json);
    const [affinities] = await connection.execute('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [attempt.character_id, attempt.npc_code]);
    const [characters] = await connection.execute('SELECT level FROM characters WHERE id=?', [attempt.character_id]);
    const [knowledge] = await connection.execute(`SELECT GREATEST(
    COALESCE((SELECT ap.information_level FROM player_appraisal_progress ap JOIN player_skills ps ON ps.character_id=ap.character_id JOIN skill_definitions s ON s.id=ps.skill_id WHERE ap.character_id=c.id AND s.code='appraisal' AND (s.category='bound' OR ps.passive_linked=1) LIMIT 1),0),
    COALESCE((SELECT LEAST(4,sp.level) FROM player_secondary_professions sp WHERE sp.character_id=c.id AND sp.profession_code='omniscient' AND c.secondary_profession_code='omniscient' LIMIT 1),0)) AS level FROM characters c WHERE c.id=?`, [attempt.character_id]);
    const [members] = await connection.execute('SELECT cooldowns FROM combat_members WHERE session_id=? AND character_id=?', [sessionId, attempt.character_id]);
    const exploited = Boolean(json(members[0]?.cooldowns).__rules?.memory?.sparWeakness);
    const affinity = Number(affinities[0]?.affinity ?? 0);
    const affinityBonus = affinity >= 500 ? .03 : affinity >= 200 ? .02 : affinity >= 50 ? .01 : 0;
    const chance = Math.min(.15, .05 + (result === 'victory' ? .03 : 0) + affinityBonus + (exploited ? .02 : 0) + Math.min(.02, Number(knowledge[0]?.level ?? 0) * .005) - (Number(characters[0]?.level) < profile.band[0] - 5 ? .02 : 0));
    let discovered;
    const eligible = carriedSparSkills(profile).filter(code => { const skill = residentSkillByCode(code); return skill && (skill.tier !== '中位' || Number(characters[0]?.level) >= 25) && (skill.tier !== '下位' || Number(characters[0]?.level) >= 6); });
    if (eligible.length && Math.random() < chance) {
        const [candidates] = await connection.execute(`SELECT s.id,s.name FROM skill_definitions s WHERE s.code IN (${eligible.map(() => '?').join(',')})
      AND NOT EXISTS(SELECT 1 FROM player_skills ps WHERE ps.character_id=? AND ps.skill_id=s.id)
      AND NOT EXISTS(SELECT 1 FROM player_skill_discoveries d WHERE d.character_id=? AND d.skill_id=s.id) ORDER BY s.id`, [...eligible, attempt.character_id, attempt.character_id]);
        discovered = candidates[Math.floor(Math.random() * candidates.length)];
        if (discovered)
            await connection.execute('INSERT IGNORE INTO player_skill_discoveries (character_id,skill_id) VALUES (?,?)', [attempt.character_id, discovered.id]);
    }
    await connection.execute('UPDATE player_npc_spar_attempts SET state=?,discovered_skill_id=?,finished_at=NOW() WHERE id=?', [result, discovered?.id ?? null, attempt.id]);
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [snapshot.hp, snapshot.mp, attempt.character_id]);
    await connection.execute('UPDATE combat_sessions SET state=? WHERE id=?', [result === 'timeout' ? 'escaped' : result, sessionId]);
    await connection.execute('DELETE FROM combat_status_effects WHERE session_id=?', [sessionId]);
    await connection.execute('DELETE FROM combat_spirits WHERE session_id=?', [sessionId]);
    await connection.execute('UPDATE combat_members SET pending_action=NULL WHERE session_id=?', [sessionId]);
    if (result === 'victory')
        recordAchievement(connection, Number(attempt.character_id), [{ metric: 'ACH_L18' }, { metric: 'ACH_L19', distinct: String(attempt.npc_code) }], 'spar:' + sessionId);
    await connection.execute("UPDATE monster_spawns s JOIN combat_targets ct ON ct.spawn_id=s.id SET s.current_hp=0,s.defeated_at=NOW(),s.traits_json=JSON_ARRAY(JSON_OBJECT('code','npc_sparring','name','')) WHERE ct.session_id=?", [sessionId]);
    return `切磋${result === 'victory' ? '胜利' : result === 'defeat' ? '落败' : result === 'timeout' ? '超时结束' : '结束'} · ${profile.name}\nHP、MP已恢复至切磋前。今日次数 1/1。\n${discovered ? `领悟线索：「${discovered.name}」已加入技能发现，可前往技能列表消耗 SP 学习。` : '这次交流有所启发，但尚未领悟新的技能。'}`;
};

export { finishNpcSparring, npcSparringView, sparBusinessDate, startNpcSparring };
