import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { snapshotCombatEnvironment } from './world-dynamics.service';
import { leafRouteTransport } from './leaf-route.service';
import { resetCardMovementCharge } from './monster-card-exploration.service';
const json = (v: unknown): Record<string, any> => typeof v === 'string' ? JSON.parse(v) : v as any ?? {};
export const leafEnemyScale = (stage: number, wave: number) => stage === 4 ? { hp: .8, attack: .75, defense: 1 } : wave === 0 ? { hp: .55, attack: .75, defense: .6 } : { hp: 2, attack: .85, defense: 1.1 };
const spawnEnemies = async (c: PoolConnection, character: RowDataPacket, stage: number, wave: number, level: number) => {
    const [templates] = await c.execute<RowDataPacket[]>("SELECT * FROM monster_templates WHERE code='windchime_bird'");
    const [dummy] = await c.execute<RowDataPacket[]>("SELECT id FROM monster_templates WHERE code='npc_sparring_dummy'");
    if (!templates[0] || !dummy[0])
        throw Error('航务战斗基础数据尚未初始化。');
    const stats = (await import('./adventure.service')).monsterCombatStats({ ...templates[0], level, monster_class: 'normal' } as any), scale = leafEnemyScale(stage, wave), spawns: number[] = [];
    for (let i = 0; i < (stage === 8 && wave === 1 ? 1 : 2); i++) {
        const name = stage === 4 ? '乱流团·' + (i === 0 ? '薄刃风卷' : '震荡气团') : wave === 0 ? '守风之结·' + (i + 1) : '引航风核';
        const profile = { code: 'leaf_route_' + stage + '_' + wave + '_' + i, name, level, rotation: [], passives: [], stats: { ...stats, hpMax: Math.floor(stats.hpMax * scale.hp), physicalAttack: Math.floor(stats.physicalAttack * scale.attack), magicAttack: Math.floor(stats.magicAttack * scale.attack), physicalDefense: Math.floor(stats.physicalDefense * scale.defense), magicDefense: Math.floor(stats.magicDefense * scale.defense), critRateBp: stats.crit, critResistBp: stats.critResist, critDamageBp: stats.critDamage, critDamageReductionBp: stats.critReduction } };
        const [spawn] = await c.execute<any>("INSERT INTO monster_spawns(template_id,region_id,pos_x,pos_y,pos_z,level,current_hp,skill_sequence,traits_json,defeated_at) VALUES (?,?,?,?,?,?,?,JSON_ARRAY(),?,NOW())", [dummy[0].id, character.current_region_id, character.pos_x, character.pos_y, character.pos_z, level, profile.stats.hpMax, JSON.stringify([{ code: 'npc_sparring', name: '', profile }, { code: 'leaf_route_encounter', stage, wave, name, weakness: stage === 4 ? [i === 0 ? '斩击' : '打击'] : [] }])]);
        spawns.push(Number(spawn.insertId));
    }
    return { spawns, mp: stats.mpMax };
};
const attach = async (c: PoolConnection, session: string, id: number, enemies: {
    spawns: number[];
    mp: number;
}) => {
    for (const spawn of enemies.spawns) {
        await c.execute('INSERT INTO combat_targets(session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())', [session, spawn, enemies.mp]);
        await c.execute('INSERT INTO combat_threat(session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)', [session, spawn, id]);
    }
    await c.execute('UPDATE combat_members SET selected_target_id=? WHERE session_id=?', [enemies.spawns[0], session]);
};
export const startLeafRouteBattle = async (c: PoolConnection, character: RowDataPacket, row: RowDataPacket) => {
    await (await import('./character.service')).recalculateCharacterStats(c, Number(character.id));
    const [current] = await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?', [character.id]);
    Object.assign(character, current[0]);
    const session = randomUUID(), enemies = await spawnEnemies(c, character, Number(row.stage), 0, Number(row.level_snapshot));
    await c.execute('INSERT INTO player_leaf_route_battles(session_id,character_id,stage,snapshot_json) VALUES (?,?,?,?)', [session, character.id, row.stage, JSON.stringify({ hp: character.current_hp, mp: character.current_mp, level: Number(row.level_snapshot) })]);
    await resetCardMovementCharge(c, [Number(character.id)]);
    await c.execute("INSERT INTO combat_sessions(id,character_id,spawn_id,player_hp,player_mp,cooldowns,opening_damage_bonus,mode) VALUES (?,?,?,?,?,JSON_OBJECT(),0,'story')", [session, character.id, enemies.spawns[0], character.current_hp, character.current_mp]);
    await c.execute('INSERT INTO combat_members(session_id,character_id,current_hp,current_mp,selected_target_id,cooldowns,stamina_eligible) VALUES (?,?,?,?,?,JSON_OBJECT(),0)', [session, character.id, character.current_hp, character.current_mp, enemies.spawns[0]]);
    await attach(c, session, Number(character.id), enemies);
    await snapshotCombatEnvironment(c, session, Number(character.current_region_id), [Number(character.id)]);
    const [professions] = await c.execute<RowDataPacket[]>('SELECT profession_code FROM player_advanced_professions WHERE character_id=?', [character.id]);
    const resource = (await import('./advanced-resource.config')).advancedResourceForProfession(String(professions[0]?.profession_code ?? ''));
    if (resource)
        await c.execute('INSERT INTO combat_profession_resources(session_id,character_id,profession_code,resource_code,resource_name,current_value,max_value) VALUES (?,?,?,?,?,0,100)', [session, character.id, resource.professionCode, resource.code, resource.name]);
    return session;
};
export const advanceLeafWave = async (c: PoolConnection, session: string) => {
    const [rows] = await c.execute<RowDataPacket[]>('SELECT * FROM player_leaf_route_battles WHERE session_id=? FOR UPDATE', [session]);
    const row = rows[0];
    if (!row || row.state !== 'active' || Number(row.stage) !== 8 || Number(row.wave) !== 0)
        return false;
    const [characters] = await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?', [row.character_id]);
    await attach(c, session, Number(row.character_id), await spawnEnemies(c, characters[0], 8, 1, Number(json(row.snapshot_json).level)));
    await c.execute("UPDATE combat_targets SET cooldowns=JSON_OBJECT('__rules',JSON_OBJECT('statuses',JSON_ARRAY(),'memory',JSON_OBJECT('leafCharged',1))) WHERE session_id=? AND is_defeated=0", [session]);
    await c.execute('UPDATE player_leaf_route_battles SET wave=1 WHERE session_id=?', [session]);
    await c.execute('UPDATE combat_sessions SET turn_no=turn_no+1 WHERE id=?', [session]);
    return true;
};
export const finishLeafRouteBattle = async (c: PoolConnection, session: string, result: 'victory' | 'defeat' | 'escaped' | 'timeout') => {
    const [rows] = await c.execute<RowDataPacket[]>('SELECT * FROM player_leaf_route_battles WHERE session_id=? FOR UPDATE', [session]);
    const row = rows[0];
    if (!row)
        return null;
    if (row.state !== 'active')
        return '本次航务遭遇已经结算。';
    await c.execute('UPDATE player_leaf_route_battles SET state=? WHERE session_id=?', [result, session]);
    await c.execute('UPDATE combat_sessions SET state=? WHERE id=?', [result === 'timeout' ? 'escaped' : result, session]);
    if (result === 'victory') {
        await c.execute('UPDATE player_leaf_route_progress SET work=1,revision=revision+1 WHERE character_id=? AND stage=?', [row.character_id, row.stage]);
        await c.execute('UPDATE characters c JOIN combat_members m ON m.character_id=c.id SET c.current_hp=GREATEST(1,m.current_hp),c.current_mp=m.current_mp WHERE m.session_id=?', [session]);
    }
    else {
        const snap = json(row.snapshot_json);
        await c.execute('UPDATE characters SET current_hp=LEAST(hp_max,?),current_mp=LEAST(mp_max,?) WHERE id=?', [Math.max(1, Number(snap.hp)), snap.mp, row.character_id]);
        await leafRouteTransport(c, Number(row.character_id), 'world_tree');
    }
    await (await import('./automaton-combat.service')).finishCombatAutomatons(c, session, result === 'victory');
    await c.execute('DELETE FROM combat_status_effects WHERE session_id=?', [session]);
    await c.execute('DELETE FROM combat_spirits WHERE session_id=?', [session]);
    await c.execute('UPDATE combat_members SET pending_action=NULL WHERE session_id=?', [session]);
    await c.execute('UPDATE player_battle_buffs SET remaining_battles=remaining_battles-1 WHERE character_id=? AND remaining_battles>0', [row.character_id]);
    return result === 'victory' ? '航务遭遇完成，无战斗经验与掉落。请回到 /浮叶航路 完成安全确认。' : '已接回地面安全点，装备与修理进度保留，可重试本幕。';
};
