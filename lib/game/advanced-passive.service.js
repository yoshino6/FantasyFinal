import { withTransaction, getPool } from '../database/pool.js';
import { inheritancePassiveFor, advancedProfessionByMentor, advancedProfessionByCode } from './advanced-profession.config.js';

const studyMinutes = 5;
const characterFor = async (qqUserId, connection) => {
    const [rows] = await connection.execute(`SELECT c.id,c.level,r.code AS region_code,c.pos_x,c.pos_y
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id
    WHERE p.qq_user_id=? AND c.npc_id IS NULL LIMIT 1`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先创建角色。');
    return rows[0];
};
const assertAtMentor = (character, professionCode) => {
    const profession = advancedProfessionByCode(professionCode);
    if (!profession)
        throw new Error('未知的传承。');
    if (character.region_code !== 'world_tree' || Number(character.pos_x) !== profession.mentor.x || Number(character.pos_y) !== profession.mentor.y)
        throw new Error(`请前往世界树的【${profession.mentor.title}·${profession.mentor.name}】处。`);
    return profession;
};
const assertStudyEligibility = async (connection, character, sourceProfessionCode) => {
    const profession = assertAtMentor(character, sourceProfessionCode);
    if (Number(character.level) < 30)
        throw new Error('旁修传承将在 Lv.30 开放。');
    const [ownRows] = await connection.execute('SELECT profession_code FROM player_advanced_professions WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
    if (!ownRows[0])
        throw new Error('完成自己的二转导师试炼后，才能旁修其他传承。');
    if (ownRows[0].profession_code === sourceProfessionCode)
        throw new Error('不能旁修自己所属的传承。');
    const [combatRows] = await connection.execute('SELECT 1 FROM combat_sessions cs JOIN combat_members cm ON cm.session_id=cs.id WHERE cm.character_id=? AND cs.state=\'active\' LIMIT 1 FOR UPDATE', [character.id]);
    if (combatRows[0])
        throw new Error('请在非战斗状态下进行旁修。');
    return { profession, ownProfessionCode: ownRows[0].profession_code };
};
const inheritanceStudyView = async (qqUserId, mentorCode) => {
    const pool = await getPool();
    const profession = advancedProfessionByMentor(mentorCode);
    if (!profession)
        throw new Error('这位导师不传授旁修。');
    const character = await characterFor(qqUserId, pool);
    assertAtMentor(character, profession.code);
    const [ownRows] = await pool.execute('SELECT profession_code FROM player_advanced_professions WHERE character_id=? LIMIT 1', [character.id]);
    const [studies] = await pool.execute('SELECT profession_code,started_at,completed_at,equipped FROM player_advanced_passive_studies WHERE character_id=? AND profession_code=? LIMIT 1', [character.id, profession.code]);
    const study = studies[0];
    const started = study?.started_at ? new Date(study.started_at) : null;
    return { professionCode: profession.code, ownProfessionCode: ownRows[0]?.profession_code ?? null, level: Number(character.level), startedAt: started, completedAt: study?.completed_at ? new Date(study.completed_at) : null, equipped: Boolean(study?.equipped), readyAt: started ? new Date(started.getTime() + studyMinutes * 60_000) : null };
};
const beginInheritanceStudy = async (qqUserId, sourceProfessionCode) => withTransaction(async (connection) => {
    const character = await characterFor(qqUserId, connection);
    const { profession } = await assertStudyEligibility(connection, character, sourceProfessionCode);
    const [rows] = await connection.execute('SELECT profession_code,started_at,completed_at,equipped FROM player_advanced_passive_studies WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, sourceProfessionCode]);
    if (rows[0]?.completed_at)
        throw new Error(`你已经掌握【${inheritancePassiveFor(sourceProfessionCode)?.name ?? profession.name}】；可直接装备或替换旁修槽。`);
    if (!rows[0])
        await connection.execute('INSERT INTO player_advanced_passive_studies (character_id,profession_code,started_at,completed_at,equipped) VALUES (?,?,NOW(),NULL,0)', [character.id, sourceProfessionCode]);
    const startedAt = rows[0]?.started_at ? new Date(rows[0].started_at) : new Date();
    const readyAt = new Date(startedAt.getTime() + studyMinutes * 60_000);
    return { profession, readyAt };
});
const completeInheritanceStudy = async (qqUserId, sourceProfessionCode) => withTransaction(async (connection) => {
    const character = await characterFor(qqUserId, connection);
    const { profession } = await assertStudyEligibility(connection, character, sourceProfessionCode);
    const [rows] = await connection.execute('SELECT profession_code,started_at,completed_at,equipped FROM player_advanced_passive_studies WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, sourceProfessionCode]);
    const study = rows[0];
    if (!study)
        throw new Error('请先开始旁修课。');
    if (study.completed_at)
        throw new Error('这条传承已经旁修完成。');
    const readyAt = new Date(new Date(study.started_at).getTime() + studyMinutes * 60_000);
    const remainingSeconds = Math.ceil((readyAt.getTime() - Date.now()) / 1000);
    if (remainingSeconds > 0)
        throw new Error(`导师仍在讲解传承细节，请在 ${remainingSeconds} 秒后回来。`);
    const [crystals] = await connection.execute('SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=\'resonance_crystal\' FOR UPDATE', [character.id]);
    if (Number(crystals[0]?.quantity ?? 0) < 1)
        throw new Error('旁修需要交付 1 枚【回响结晶】。');
    await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [character.id, crystals[0].item_id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, crystals[0].item_id]);
    await connection.execute('UPDATE player_advanced_passive_studies SET completed_at=NOW(),equipped=0 WHERE character_id=? AND profession_code=?', [character.id, sourceProfessionCode]);
    return { profession, passive: inheritancePassiveFor(sourceProfessionCode) };
});
const equipInheritanceStudy = async (qqUserId, sourceProfessionCode, equipped) => withTransaction(async (connection) => {
    const character = await characterFor(qqUserId, connection);
    await assertStudyEligibility(connection, character, sourceProfessionCode);
    const [rows] = await connection.execute('SELECT profession_code,started_at,completed_at,equipped FROM player_advanced_passive_studies WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, sourceProfessionCode]);
    if (!rows[0]?.completed_at)
        throw new Error('完成旁修课后才能装备这条传承。');
    if (equipped)
        await connection.execute('UPDATE player_advanced_passive_studies SET equipped=0 WHERE character_id=?', [character.id]);
    await connection.execute('UPDATE player_advanced_passive_studies SET equipped=? WHERE character_id=? AND profession_code=?', [equipped ? 1 : 0, character.id, sourceProfessionCode]);
    return inheritancePassiveFor(sourceProfessionCode);
});
const inheritancePassivesFor = async (connection, characterIds) => {
    const result = new Map();
    if (!characterIds.length)
        return result;
    const placeholders = characterIds.map(() => '?').join(',');
    const [ownRows] = await connection.execute(`SELECT character_id,profession_code FROM player_advanced_professions WHERE character_id IN (${placeholders})`, characterIds);
    const [studyRows] = await connection.execute(`SELECT character_id,profession_code FROM player_advanced_passive_studies WHERE character_id IN (${placeholders}) AND completed_at IS NOT NULL AND equipped=1`, characterIds);
    for (const row of ownRows) {
        const definition = inheritancePassiveFor(row.profession_code);
        if (!definition)
            continue;
        result.set(Number(row.character_id), [...(result.get(Number(row.character_id)) ?? []), { professionCode: row.profession_code, mode: 'own', values: definition.own }]);
    }
    for (const row of studyRows) {
        const definition = inheritancePassiveFor(row.profession_code);
        if (!definition)
            continue;
        result.set(Number(row.character_id), [...(result.get(Number(row.character_id)) ?? []), { professionCode: row.profession_code, mode: 'study', values: definition.study }]);
    }
    return result;
};

export { beginInheritanceStudy, completeInheritanceStudy, equipInheritanceStudy, inheritancePassivesFor, inheritanceStudyView };
