import { withTransaction } from '../database/pool.js';
import { worldTreeAdvancedProfessions, advancedInheritanceSkillCode, activeSkillCodesForAdvancedProfession } from './advanced-profession.config.js';
import { hiddenProfessions, hiddenPassiveCode, hiddenSkills } from './hidden-profession.config.js';
import { spiritSummonerActiveSkillCodes } from './spirit-summoner.config.js';
import { revokeAdvancedProfessionSkills } from './advanced-profession.service.js';
import { resetSkillPointAllocation } from './skill-point-ledger.service.js';
import { recalculateCharacterStats } from './character.service.js';
import { assertCombatLoadoutMutable } from './combat-loadout-lock.service.js';
import { requireAdministrator } from './permission.service.js';
import { recordAdminOperation } from './admin-log.service.js';

const professionTestOptions = [
    ...worldTreeAdvancedProfessions.map(p => ({ code: p.code, name: p.name, group: p.baseProfession, role: p.role })),
    ...hiddenProfessions.map(p => ({ code: p.code, name: p.name, group: '店铺二转', role: p.role }))
];
const object = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value))
        return value;
    try {
        const parsed = JSON.parse(String(value ?? '{}'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
};
const applyTestProfession = async (connection, characterId, code) => {
    const option = professionTestOptions.find(p => p.code === code || p.name === code);
    if (!option)
        throw new Error('请选择有效的二转职业。');
    const normal = worldTreeAdvancedProfessions.find(p => p.code === option.code), hidden = hiddenProfessions.find(p => p.code === option.code);
    const [characters] = await connection.execute('SELECT id,name,level,skill_points FROM characters WHERE id=? AND npc_code IS NULL AND npc_id IS NULL FOR UPDATE', [characterId]);
    const character = characters[0];
    if (!character)
        throw new Error('未找到玩家角色。');
    await assertCombatLoadoutMutable(connection, characterId);
    const [current] = await connection.execute('SELECT profession_code FROM player_advanced_professions WHERE character_id=? FOR UPDATE', [characterId]);
    const passive = normal?.passive.code ?? hiddenPassiveCode(hidden.code);
    const required = [...new Set([passive, advancedInheritanceSkillCode(option.code), ...(normal ? activeSkillCodesForAdvancedProfession(normal.code) : hiddenSkills.filter(s => s.profession === hidden.code).map(s => s.code)), ...(option.code === 'spirit_summoner' ? spiritSummonerActiveSkillCodes : [])])];
    const [skills] = await connection.execute(`SELECT id,code FROM skill_definitions WHERE code IN (${required.map(() => '?').join(',')})`, required);
    if (skills.length !== required.length)
        throw new Error('该职业的技能资料尚未完整载入，请先完成游戏数据初始化。');
    await connection.execute('DELETE FROM player_advanced_profession_quests WHERE character_id=? AND stage IN (1,2,3) AND profession_code<>?', [characterId, option.code]);
    if (normal) {
        await connection.execute(`INSERT INTO player_advanced_profession_quests (character_id,profession_code,stage,story_kills,proof_kills,completed_at) VALUES (?,?,4,?,?,NOW())
      ON DUPLICATE KEY UPDATE stage=4,story_kills=VALUES(story_kills),proof_kills=VALUES(proof_kills),completed_at=COALESCE(completed_at,VALUES(completed_at))`, [characterId, normal.code, normal.first.requiredKills, normal.second.requiredKills]);
    }
    else {
        const [quests] = await connection.execute('SELECT completed_json FROM player_hidden_profession_quests WHERE character_id=? AND profession_code=? FOR UPDATE', [characterId, option.code]);
        const completed = object(quests[0]?.completed_json);
        for (let stage = 1; stage <= 10; stage++)
            completed[String(stage)] ??= { adminTest: true };
        await connection.execute(`INSERT INTO player_hidden_profession_quests (character_id,profession_code,stage,accepted_at,materials_paid,evidence_json,completed_json,qualified_at,revision)
      VALUES (?,?,11,NULL,0,JSON_OBJECT(),?,NOW(),1) ON DUPLICATE KEY UPDATE stage=11,accepted_at=NULL,materials_paid=0,evidence_json=JSON_OBJECT(),completed_json=VALUES(completed_json),qualified_at=COALESCE(qualified_at,VALUES(qualified_at)),revision=revision+1`, [characterId, option.code, JSON.stringify(completed)]);
    }
    const changed = current[0]?.profession_code !== option.code;
    let restoredPoints = 0;
    if (changed) {
        const reset = await resetSkillPointAllocation(connection, characterId);
        restoredPoints = reset.restoredPoints;
        await revokeAdvancedProfessionSkills(connection, characterId);
        await connection.execute(`INSERT INTO player_advanced_professions (character_id,profession_code,mentor_code,completed_at) VALUES (?,?,?,NOW())
      ON DUPLICATE KEY UPDATE profession_code=VALUES(profession_code),mentor_code=VALUES(mentor_code),completed_at=VALUES(completed_at)`, [characterId, option.code, normal?.mentor.code ?? hidden.npc]);
    }
    for (const skill of skills)
        await connection.execute('INSERT IGNORE INTO player_skills (character_id,skill_id,level,passive_linked) VALUES (?,?,1,0)', [characterId, skill.id]);
    if (option.code === 'weapon_master') {
        const [main] = await connection.execute("SELECT e.instance_id FROM player_equipment e JOIN player_item_instances ii ON ii.id=e.instance_id AND ii.character_id=e.character_id JOIN item_definitions i ON i.id=ii.item_id WHERE e.character_id=? AND e.slot='weapon' AND i.item_category='武器' AND i.required_level<=? AND ii.market_listing_id IS NULL LIMIT 1", [characterId, character.level]);
        if (main[0])
            await connection.execute('INSERT IGNORE INTO player_hidden_profession_loadouts (character_id,profession_code,config_json) VALUES (?,?,?)', [characterId, option.code, JSON.stringify({ weapons: [Number(main[0].instance_id)] })]);
    }
    await connection.execute('DELETE FROM player_hidden_action_drafts WHERE character_id=?', [characterId]);
    await recalculateCharacterStats(connection, characterId);
    return { characterId, name: String(character.name), profession: option.name, code: option.code, previousCode: String(current[0]?.profession_code ?? ''), changed, restoredPoints, skillCount: skills.length };
};
const adminTestProfession = (user, code) => withTransaction(async (connection) => {
    await requireAdministrator(user, connection);
    const [rows] = await connection.execute('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND c.npc_id IS NULL AND c.npc_code IS NULL LIMIT 1 FOR UPDATE', [user]);
    if (!rows[0])
        throw new Error('请先创建角色。');
    const result = await applyTestProfession(connection, Number(rows[0].id), code);
    await recordAdminOperation(user, '测试二转', `测试转为${result.profession}｜对应任务已完成｜${result.changed ? '已切换职业' : '补齐当前职业'}｜返还技能点${result.restoredPoints}`, user, connection);
    return result;
});

export { adminTestProfession, professionTestOptions };
