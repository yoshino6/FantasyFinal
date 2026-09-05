import { withTransaction, getPool } from '../database/pool.js';
import { worldTreeAdvancedProfessions, activeSkillCodesForAdvancedProfession, advancedProfessionByCode, advancedProfessionByMentor, inheritancePassiveFor } from './advanced-profession.config.js';
import { spiritSummonerActiveSkillCodes } from './spirit-summoner.config.js';
import { advancedMentorTrialBuild, advancedMentorTrialTraits } from './advanced-mentor-trial.config.js';
import { resetSkillPointAllocation } from './skill-point-ledger.service.js';
import { recalculateCharacterStats } from './character.service.js';
import { durationText } from './time-format.js';

const advancedProfessionRetrainCooldownMs = 24 * 60 * 60_000;
const allAdvancedProfessionSkillCodes = [...new Set([
        ...worldTreeAdvancedProfessions.flatMap(profession => [profession.passive.code, ...activeSkillCodesForAdvancedProfession(profession.code)]),
        ...spiritSummonerActiveSkillCodes
    ])];
const revokeAdvancedProfessionSkills = async (connection, characterId) => {
    if (!allAdvancedProfessionSkillCodes.length)
        return;
    const placeholders = allAdvancedProfessionSkillCodes.map(() => '?').join(',');
    const values = [characterId, ...allAdvancedProfessionSkillCodes];
    await connection.execute(`DELETE pss FROM player_skill_specializations pss JOIN skill_definitions s ON s.id=pss.skill_id
    WHERE pss.character_id=? AND s.code IN (${placeholders})`, values);
    for (const table of ['player_auto_battle_actions', 'player_pvp_auto_battle_actions']) {
        await connection.execute(`UPDATE ${table} a JOIN skill_definitions s ON s.id=a.skill_id
      SET a.skill_id=NULL WHERE a.character_id=? AND s.code IN (${placeholders})`, values);
    }
    await connection.execute(`DELETE ps FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
    WHERE ps.character_id=? AND s.code IN (${placeholders})`, values);
};
const characterFor = async (qqUserId, connection) => {
    const db = connection ?? await getPool();
    const [rows] = await db.execute(`SELECT c.id,c.level,c.profession_code AS profession,c.current_region_id,r.code AS region_code,c.pos_x,c.pos_y
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id
    WHERE p.qq_user_id=? AND c.npc_id IS NULL LIMIT 1`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先创建角色。');
    return rows[0];
};
const assertAtMentor = (character, profession) => {
    if (character.region_code !== 'world_tree' || Number(character.pos_x) !== profession.mentor.x || Number(character.pos_y) !== profession.mentor.y)
        throw new Error(`请前往世界树的【${profession.mentor.title}·${profession.mentor.name}】处。`);
};
const isWorldTreeAdvancedMentor = (code) => Boolean(advancedProfessionByMentor(code));
const advancedProfessionView = async (qqUserId, mentorCode) => {
    const pool = await getPool();
    const character = await characterFor(qqUserId, pool);
    const profession = mentorCode ? advancedProfessionByMentor(mentorCode) : undefined;
    if (!profession)
        throw new Error('这位导师暂未开放二转试炼。');
    assertAtMentor(character, profession);
    const [activeQuests] = await pool.execute('SELECT profession_code,stage,story_kills,proof_kills,completed_at FROM player_advanced_profession_quests WHERE character_id=? AND stage IN (1,2,3) ORDER BY stage DESC,profession_code ASC', [character.id]);
    const [done] = await pool.execute('SELECT profession_code,completed_at FROM player_advanced_professions WHERE character_id=? LIMIT 1', [character.id]);
    const [cores] = await pool.execute('SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=\'ridge_core\' LIMIT 1', [character.id]);
    const activeQuest = activeQuests[0] ?? null;
    const retrainRemainingSeconds = done[0]
        ? Math.max(0, Math.ceil((new Date(done[0].completed_at).getTime() + advancedProfessionRetrainCooldownMs - Date.now()) / 1000))
        : 0;
    return { profession, character, active: activeQuest?.profession_code === profession.code ? activeQuest : null, activeQuest, completedCode: done[0]?.profession_code ?? null, retrainRemainingSeconds, ridgeCore: Number(cores[0]?.quantity ?? 0) };
};
const beginAdvancedProfession = async (qqUserId, code, replaceActiveQuest = false) => withTransaction(async (connection) => {
    const profession = advancedProfessionByCode(code);
    if (!profession)
        throw new Error('未知的二转职业。');
    const character = await characterFor(qqUserId, connection);
    assertAtMentor(character, profession);
    if (Number(character.level) < 25)
        throw new Error('二转试炼将在 Lv.25 开放。');
    const baseCodes = { 战士: 'warrior', 法师: 'mage', 盗贼: 'rogue', 牧师: 'priest' };
    if (character.profession !== baseCodes[profession.baseProfession])
        throw new Error(`【${profession.name}】仅限${profession.baseProfession}开启。`);
    const [done] = await connection.execute('SELECT profession_code,completed_at FROM player_advanced_professions WHERE character_id=? LIMIT 1 FOR UPDATE', [character.id]);
    const currentProfession = done[0];
    if (currentProfession?.profession_code === profession.code)
        throw new Error(`你当前已经是【${profession.name}】，无需重复接受这条试炼。`);
    if (currentProfession) {
        const remainingSeconds = Math.ceil((new Date(currentProfession.completed_at).getTime() + advancedProfessionRetrainCooldownMs - Date.now()) / 1000);
        if (remainingSeconds > 0)
            throw new Error(`重新二转仍在冷却中，请在 ${durationText(remainingSeconds)} 后再来。`);
    }
    const [activeQuests] = await connection.execute('SELECT profession_code,stage,story_kills,proof_kills,completed_at FROM player_advanced_profession_quests WHERE character_id=? AND stage IN (1,2,3) FOR UPDATE', [character.id]);
    const currentQuest = activeQuests.find(quest => quest.profession_code === profession.code);
    const otherQuest = activeQuests.find(quest => quest.profession_code !== profession.code);
    if (currentQuest && !otherQuest)
        return profession;
    if (otherQuest && !replaceActiveQuest) {
        const activeProfession = advancedProfessionByCode(otherQuest.profession_code);
        throw new Error(`你正在进行【${activeProfession?.name ?? otherQuest.profession_code}】的二转任务。确认中断当前进度后，才能开启新的试炼。`);
    }
    if (otherQuest)
        await connection.execute('DELETE FROM player_advanced_profession_quests WHERE character_id=? AND stage IN (1,2,3)', [character.id]);
    await connection.execute(`INSERT INTO player_advanced_profession_quests (character_id,profession_code,stage,story_kills,proof_kills)
    VALUES (?,?,1,0,0) ON DUPLICATE KEY UPDATE stage=1,story_kills=0,proof_kills=0,completed_at=NULL`, [character.id, profession.code]);
    return profession;
});
const advanceAdvancedProfessionStage = async (qqUserId, code) => withTransaction(async (connection) => {
    const profession = advancedProfessionByCode(code);
    if (!profession)
        throw new Error('未知的二转职业。');
    const character = await characterFor(qqUserId, connection);
    assertAtMentor(character, profession);
    const [rows] = await connection.execute('SELECT profession_code,stage,story_kills,proof_kills,completed_at FROM player_advanced_profession_quests WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, code]);
    const quest = rows[0];
    if (!quest || Number(quest.stage) !== 1)
        throw new Error('当前不能提交第一段见闻。');
    if (Number(quest.story_kills) < profession.first.requiredKills)
        throw new Error(`还需完成 ${profession.first.requiredKills - Number(quest.story_kills)} 次【${profession.first.targetText}】战斗。`);
    await connection.execute('UPDATE player_advanced_profession_quests SET stage=2 WHERE character_id=? AND profession_code=?', [character.id, code]);
    return profession;
});
const submitAdvancedProfessionProof = async (qqUserId, code) => withTransaction(async (connection) => {
    const profession = advancedProfessionByCode(code);
    if (!profession)
        throw new Error('未知的二转职业。');
    const character = await characterFor(qqUserId, connection);
    assertAtMentor(character, profession);
    const [rows] = await connection.execute('SELECT profession_code,stage,story_kills,proof_kills,completed_at FROM player_advanced_profession_quests WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, code]);
    const quest = rows[0];
    if (!quest || Number(quest.stage) !== 2)
        throw new Error('当前不能提交第二段凭证。');
    if (Number(quest.proof_kills) < profession.second.requiredKills)
        throw new Error(`还需完成 ${profession.second.requiredKills - Number(quest.proof_kills)} 次【${profession.second.targetText}】战斗。`);
    const [cores] = await connection.execute('SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=\'ridge_core\' FOR UPDATE', [character.id]);
    if (Number(cores[0]?.quantity ?? 0) < profession.second.materialCount)
        throw new Error(`还需 ${profession.second.materialCount - Number(cores[0]?.quantity ?? 0)} 个【岩脊核心】。`);
    await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [profession.second.materialCount, character.id, cores[0].item_id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [character.id, cores[0].item_id]);
    await connection.execute('UPDATE player_advanced_profession_quests SET stage=3 WHERE character_id=? AND profession_code=?', [character.id, code]);
    return profession;
});
const beginAdvancedProfessionTrial = async (qqUserId, code) => withTransaction(async (connection) => {
    const profession = advancedProfessionByCode(code);
    if (!profession)
        throw new Error('未知的二转职业。');
    const character = await characterFor(qqUserId, connection);
    assertAtMentor(character, profession);
    const [quests] = await connection.execute('SELECT profession_code,stage,story_kills,proof_kills,completed_at FROM player_advanced_profession_quests WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, code]);
    if (!quests[0] || Number(quests[0].stage) !== 3)
        throw new Error('请先完成前两段试炼。');
    const [templates] = await connection.execute('SELECT id FROM monster_templates WHERE code=? LIMIT 1', [profession.trial.code]);
    if (!templates[0])
        throw new Error('导师试炼尚未完成初始化，请稍后重试。');
    const build = advancedMentorTrialBuild(profession, inheritancePassiveFor(profession.code));
    const traits = [
        { code: 'advanced_profession_trial', name: '二转导师试炼', owner_character_id: character.id, profession_code: profession.code },
        ...advancedMentorTrialTraits(build)
    ];
    const skillSequence = [...new Set([...build.rotation, 'boss_mana_charge'])];
    const [existing] = await connection.execute(`SELECT s.id,s.traits_json FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE t.code=? AND s.region_id=? AND s.pos_x=? AND s.pos_y=? AND s.defeated_at IS NULL
      AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial','owner_character_id',?))
    LIMIT 1 FOR UPDATE`, [profession.trial.code, character.current_region_id, character.pos_x, character.pos_y, character.id]);
    if (existing[0]) {
        if (!String(existing[0].traits_json ?? '').includes('"version":2'))
            await connection.execute(`UPDATE monster_spawns SET level=30,constitution=?,spirit=?,strength=?,intelligence=?,agility=?,perception=?,current_hp=?,skill_sequence=?,traits_json=? WHERE id=?`, [
                build.trainedAttributes.constitution, build.trainedAttributes.spirit, build.trainedAttributes.strength, build.trainedAttributes.intelligence, build.trainedAttributes.agility, build.trainedAttributes.perception,
                build.stats.hpMax, JSON.stringify(skillSequence), JSON.stringify(traits), existing[0].id
            ]);
        return { profession, spawnId: Number(existing[0].id) };
    }
    const [result] = await connection.execute(`INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        templates[0].id, character.current_region_id, character.pos_x, character.pos_y, 0, 30,
        build.trainedAttributes.constitution, build.trainedAttributes.spirit, build.trainedAttributes.strength, build.trainedAttributes.intelligence, build.trainedAttributes.agility, build.trainedAttributes.perception,
        build.stats.hpMax, JSON.stringify(skillSequence), JSON.stringify(traits)
    ]);
    return { profession, spawnId: Number(result.insertId) };
});
const recordAdvancedProfessionKills = async (connection, characterId, targetCodes) => {
    if (!targetCodes.length)
        return;
    const [rows] = await connection.execute('SELECT profession_code,stage,story_kills,proof_kills,completed_at FROM player_advanced_profession_quests WHERE character_id=? AND stage IN (1,2) LIMIT 1 FOR UPDATE', [characterId]);
    const quest = rows[0];
    const profession = quest ? advancedProfessionByCode(quest.profession_code) : undefined;
    if (!quest || !profession)
        return;
    const phase = Number(quest.stage) === 1 ? profession.first : profession.second;
    const gained = targetCodes.filter(code => phase.targetCodes.includes(code)).length;
    if (!gained)
        return;
    const column = Number(quest.stage) === 1 ? 'story_kills' : 'proof_kills';
    const cap = phase.requiredKills;
    await connection.execute(`UPDATE player_advanced_profession_quests SET ${column}=LEAST(?,${column}+?) WHERE character_id=? AND profession_code=?`, [cap, gained, characterId, profession.code]);
};
const completeAdvancedProfessionTrial = async (connection, characterId, trialCode) => {
    const profession = advancedProfessionByCode(trialCode);
    if (!profession)
        return null;
    const [rows] = await connection.execute('SELECT profession_code,stage,story_kills,proof_kills,completed_at FROM player_advanced_profession_quests WHERE character_id=? AND profession_code=? FOR UPDATE', [characterId, trialCode]);
    if (!rows[0] || Number(rows[0].stage) !== 3)
        return null;
    await connection.execute('UPDATE player_advanced_profession_quests SET stage=4,completed_at=NOW() WHERE character_id=? AND profession_code=?', [characterId, trialCode]);
    const reset = await resetSkillPointAllocation(connection, characterId);
    await revokeAdvancedProfessionSkills(connection, characterId);
    await connection.execute(`INSERT INTO player_advanced_professions (character_id,profession_code,mentor_code,completed_at) VALUES (?,?,?,NOW())
    ON DUPLICATE KEY UPDATE profession_code=VALUES(profession_code),mentor_code=VALUES(mentor_code),completed_at=VALUES(completed_at)`, [characterId, profession.code, profession.mentor.code]);
    await connection.execute(`INSERT IGNORE INTO player_skills (character_id,skill_id,level,passive_linked)
    SELECT ?,id,1,1 FROM skill_definitions WHERE code=?`, [characterId, profession.passive.code]);
    const activeSkills = [...activeSkillCodesForAdvancedProfession(profession.code), ...(profession.code === 'spirit_summoner' ? spiritSummonerActiveSkillCodes : [])];
    for (const skillCode of activeSkills)
        await connection.execute(`INSERT IGNORE INTO player_skills (character_id,skill_id,level,passive_linked)
    SELECT ?,id,1,0 FROM skill_definitions WHERE code=?`, [characterId, skillCode]);
    await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity)
    SELECT ?,id,1 FROM item_definitions WHERE code='resonance_crystal'
    ON DUPLICATE KEY UPDATE quantity=quantity+1`, [characterId]);
    await recalculateCharacterStats(connection, characterId);
    return { ...profession, reset };
};

export { advanceAdvancedProfessionStage, advancedProfessionView, beginAdvancedProfession, beginAdvancedProfessionTrial, completeAdvancedProfessionTrial, isWorldTreeAdvancedMentor, recordAdvancedProfessionKills, submitAdvancedProfessionProof };
