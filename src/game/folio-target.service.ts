import type { RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { folioSkillByCode } from './active-folio-skills.config';
import { battleStatus, finalizeCombatCardGrants, submitFolioActionInTransaction } from './adventure.service';
const parse = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value ?? {};
export const folioTargetView = async (user: string, slot: number) => {
    const c = await getPool();
    const [rows] = await c.execute<RowDataPacket[]>('SELECT s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id JOIN characters c ON c.id=ps.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND ps.quick_slot=?', [user, slot]);
    const skill = folioSkillByCode(String(rows[0]?.code ?? ''));
    if (!skill || skill.targetCount <= 1)
        return null;
    const battle = await battleStatus(user);
    if (!battle.canAct)
        throw Error('当前不能重新选择技能目标。');
    const friendly = skill.scope === 'ally', pool = (friendly ? battle.members : battle.targets).filter(t => !t.defeated);
    if (friendly)
        pool.sort((a, b) => Number(a.hp) / Number(a.hpMax) - Number(b.hp) / Number(b.hpMax) || a.id - b.id);
    const primary = (friendly ? battle.selectedAllyId ?? battle.characterId : battle.selectedTargetId) ?? pool[0]?.id;
    return { skill, battle, pool, primary };
};
export const saveFolioTargets = async (user: string, slot: number, ids: number[], turn: number, session: string) => finalizeCombatCardGrants(await withTransaction(async (c) => {
    const [rows] = await c.execute<RowDataPacket[]>('SELECT m.*,s.turn_no FROM combat_members m JOIN combat_sessions s ON s.id=m.session_id AND s.state=\'active\' JOIN characters ch ON ch.id=m.character_id JOIN players p ON p.id=ch.player_id WHERE p.qq_user_id=? FOR UPDATE', [user]);
    const row = rows[0];
    if (!row || row.session_id !== session || Number(row.turn_no) !== turn || row.pending_action)
        throw Error('选择界面已过期，请重新选择。');
    const [skills] = await c.execute<RowDataPacket[]>('SELECT s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=?', [row.character_id, slot]);
    const skill = folioSkillByCode(String(skills[0]?.code ?? ''));
    if (!skill || skill.targetCount <= 1)
        throw Error('该技能无需多目标选择。');
    const [targets] = skill.scope === 'ally' ? await c.execute<RowDataPacket[]>('SELECT character_id AS id FROM combat_members WHERE session_id=? AND is_defeated=0', [session]) : await c.execute<RowDataPacket[]>('SELECT spawn_id AS id FROM combat_targets WHERE session_id=? AND is_defeated=0', [session]);
    const view = { skill, pool: targets.map(t => ({ id: Number(t.id) })) };
    if (!ids.length || ids.length > view.skill.targetCount || new Set(ids).size !== ids.length || ids.some(id => !view.pool.some(t => t.id === id)))
        throw Error('请选择数量范围内的不同存活目标。');
    const cooldowns = parse(row.cooldowns);
    cooldowns.__folioDraft = { code: view.skill.code, turn, ids };
    await c.execute('UPDATE combat_members SET cooldowns=? WHERE session_id=? AND character_id=?', [JSON.stringify(cooldowns), session, row.character_id]);
    return submitFolioActionInTransaction(c, user, slot);
}));
