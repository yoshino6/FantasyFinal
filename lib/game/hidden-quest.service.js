import { recordAchievement } from './achievement-events.js';
import { advanceHiddenTrial } from './hidden-trial.js';
import { withTransaction, getPool } from '../database/pool.js';
import { hiddenPassiveCode, hiddenSkills, hiddenProfession, hiddenProfessionDiscoveryAffinity } from './hidden-profession.config.js';
import { hiddenQuest } from './hidden-quest.config.js';
import { hiddenQuestStory } from './hidden-quest.story.js';
import { newHiddenLesson, advanceHiddenLesson, hiddenLessonSteps } from './hidden-quest.lesson.js';
import { consumeInventory } from './inventory-binding.js';
import { assertCombatLoadoutMutable } from './combat-loadout-lock.service.js';
import { revokeAdvancedProfessionSkills } from './advanced-profession.service.js';
import { resetSkillPointAllocation } from './skill-point-ledger.service.js';
import { recalculateCharacterStats } from './character.service.js';
import { advancedInheritanceSkillCode } from './advanced-profession.config.js';

const parse = (value, fallback) => {
    if (!value)
        return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch {
            return fallback;
        }
    }
    return value;
};
const hiddenQuestCharacter = async (connection, user) => {
    const [rows] = await connection.execute('SELECT c.* FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND c.npc_id IS NULL LIMIT 1 FOR UPDATE', [user]);
    if (!rows[0])
        throw new Error('请先创建角色。');
    return rows[0];
};
const context = async (connection, user, code, optional = false) => {
    const profession = hiddenProfession(code);
    if (!profession)
        throw new Error('这里没有这样的私人委托。');
    const character = await hiddenQuestCharacter(connection, user);
    const [npcs] = await connection.execute('SELECT 1 FROM map_npcs WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [profession.npc, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
    if (!npcs.length) {
        if (optional)
            return null;
        throw new Error(`请到${profession.mentor}所在的店内当面交谈。`);
    }
    const [rows] = await connection.execute('SELECT * FROM player_hidden_profession_quests WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, profession.code]);
    let row = rows[0];
    if (!row || Number(row.stage) === 1 && !row.accepted_at && !row.qualified_at) {
        const [affinity] = await connection.execute('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [character.id, profession.npc]);
        if (Number(affinity[0]?.affinity ?? 0) < hiddenProfessionDiscoveryAffinity) {
            if (optional)
                return null;
            throw new Error('对方暂时没有想向你提起的私人委托。');
        }
    }
    if (!row) {
        row = { stage: 1, accepted_at: null, materials_paid: 0, evidence_json: null, completed_json: null, qualified_at: null, revision: 0 };
    }
    return { profession, character, row };
};
const view = (data) => {
    const { row, profession } = data;
    const stage = Number(row.stage), evidence = parse(row.evidence_json, {});
    const completed = parse(row.completed_json, {});
    return { profession, stage, revision: Number(row.revision), accepted: Boolean(row.accepted_at), paid: Boolean(row.materials_paid), qualified: Boolean(row.qualified_at), quest: hiddenQuest(profession.code, stage), story: hiddenQuestStory(profession.code, stage), evidence, steps: hiddenLessonSteps(profession.code, stage), observations: stage === 6 && profession.code === 'tactician' ? completed['2']?.observations ?? [] : evidence.observations ?? [] };
};
const hiddenQuestView = (user, code) => withTransaction(async (connection) => {
    const data = await context(connection, user, code);
    return view(data);
});
const hiddenQuestTopic = (user, npc) => withTransaction(async (connection) => {
    const data = await context(connection, user, npc, true);
    if (!data)
        return null;
    return { code: data.profession.code, label: data.row.qualified_at ? `关于 ${data.profession.name}` : `关于 ${data.profession.topic}` };
});
const hiddenTrackedQuests = async (user) => {
    const pool = await getPool();
    const [rows] = await pool.execute(`SELECT q.*,c.current_region_id,c.pos_x,c.pos_y,c.pos_z
    FROM player_hidden_profession_quests q JOIN characters c ON c.id=q.character_id JOIN players p ON p.id=c.player_id
    WHERE p.qq_user_id=? AND c.npc_id IS NULL AND q.accepted_at IS NOT NULL AND q.qualified_at IS NULL
      AND q.stage BETWEEN 1 AND 10 ORDER BY q.accepted_at,q.profession_code`, [user]);
    const entries = [];
    for (const row of rows) {
        const profession = hiddenProfession(String(row.profession_code)), stage = Number(row.stage);
        if (!profession || !row.accepted_at || row.qualified_at || stage < 1 || stage > 10)
            continue;
        const quest = hiddenQuest(profession.code, stage);
        if (!quest)
            continue;
        const evidence = parse(row.evidence_json, {}), lines = [`目标：${quest.objective}`];
        if (profession.code === 'tactician' && stage === 2) {
            for (const [code, name] of [['forest_slime', '森林史莱姆'], ['shadow_wolf_king', '幽影狼王']])
                lines.push(`${name}观察：${evidence.observations?.some(record => record.code === code) ? '已记录' : '未记录'}`);
            if (['forest_slime', 'shadow_wolf_king'].every(code => evidence.observations?.some(record => record.code === code)))
                lines.push('记录齐全，返回导师处交付。');
        }
        else if (row.materials_paid) {
            const steps = hiddenLessonSteps(profession.code, stage);
            const complete = evidence.lesson?.complete && (stage !== 10 || evidence.trial?.won);
            lines.push(`备台：已完成`, complete ? '操作与记录齐全，返回导师处交付。' : `${stage === 10 ? '个人演练' : '工作台'}：${Math.min(steps.length, evidence.lesson?.cursor ?? 0)}/${steps.length}`);
        }
        else {
            for (const material of quest.materials) {
                const codes = material.code.startsWith('alchemy_') ? [material.code, `${material.code}_q1`, `${material.code}_q2`] : [material.code];
                const [stocks] = await pool.execute(`SELECT COALESCE(SUM(p.quantity),0) AS quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code IN (${codes.map(() => '?').join(',')})`, [row.character_id, ...codes]);
                lines.push(`${material.name}：${Number(stocks[0]?.quantity ?? 0)}/${material.quantity}`);
            }
            lines.push(quest.materials.length ? '备齐后回店交付材料并备台。' : '返回导师处出示实物或准备工作台。');
        }
        const [npcs] = await pool.execute('SELECT n.region_id,n.pos_x,n.pos_y,n.pos_z,r.name AS region_name FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE n.code=? ORDER BY n.id LIMIT 1', [profession.npc]);
        const npc = npcs[0], atShop = npc && ['pos_x', 'pos_y', 'pos_z'].every(key => Number(row[key]) === Number(npc[key])) && Number(row.current_region_id) === Number(npc.region_id);
        lines.push(`导师：${profession.mentor}${npc ? ` · ${npc.region_name} (${npc.pos_x}, ${npc.pos_y}, ${npc.pos_z})` : ''}`, '交付、教学和推进均需回店当面完成。');
        entries.push({ title: `【二转·${profession.name} ${stage}/10】${quest.name}`, description: lines.join('\n'),
            action: npc ? { label: atShop ? `[与${profession.mentor}继续委托]` : `[返回导师·${profession.mentor}]`, command: atShop ? `/店内委托 ${profession.code}` : `/前往 ${npc.pos_x} ${npc.pos_y}` } : undefined });
    }
    return entries;
};
const becomeHiddenProfession = (user, code) => withTransaction(async (connection) => {
    const { profession, character, row } = (await context(connection, user, code));
    await assertCombatLoadoutMutable(connection, Number(character.id));
    if (!row.qualified_at || Number(row.stage) !== 11)
        throw new Error('请先完成这位店主的十环委托。');
    if (!character.profession_code)
        throw new Error('请先选择初始职业。');
    if (!character.adventurer_registered || Number(character.level) < 25)
        throw new Error('完成冒险者登记并达到Lv.25后，才能举行二转仪式。资格会保留。');
    if (character.secondary_profession_code !== profession.secondary)
        throw new Error('请先切换到这位店主对应的副职业，再举行仪式。资格不会丢失。');
    const [current] = await connection.execute('SELECT profession_code,completed_at FROM player_advanced_professions WHERE character_id=? FOR UPDATE', [character.id]);
    if (current[0]?.profession_code === profession.code)
        throw new Error(`你当前已经是${profession.name}。`);
    if (current[0] && Date.now() - new Date(current[0].completed_at).getTime() < 86400000)
        throw new Error('距离上次二转尚未满24小时，请稍后再来。');
    const required = [hiddenPassiveCode(profession.code), advancedInheritanceSkillCode(profession.code), ...hiddenSkills.filter(skill => skill.profession === profession.code).map(skill => skill.code)];
    const [skills] = await connection.execute(`SELECT id,code FROM skill_definitions WHERE code IN (${required.map(() => '?').join(',')})`, required);
    if (skills.length !== required.length)
        throw new Error('该职业的技能资料尚未载入，请联系管理员。');
    const reset = await resetSkillPointAllocation(connection, Number(character.id));
    await revokeAdvancedProfessionSkills(connection, Number(character.id));
    await connection.execute('INSERT INTO player_advanced_professions (character_id,profession_code,mentor_code,completed_at) VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE profession_code=VALUES(profession_code),mentor_code=VALUES(mentor_code),completed_at=VALUES(completed_at)', [character.id, profession.code, profession.npc]);
    recordAchievement(connection, Number(character.id), ['ACH_A17', 'ACH_L17'], 'hidden-profession:' + profession.code + ':' + character.id);
    for (const skill of skills)
        await connection.execute('INSERT INTO player_skills (character_id,skill_id,level,passive_linked) VALUES (?,?,1,0)', [character.id, skill.id]);
    if (profession.code === 'weapon_master') {
        const [main] = await connection.execute("SELECT e.instance_id FROM player_equipment e JOIN player_item_instances ii ON ii.id=e.instance_id AND ii.character_id=e.character_id JOIN item_definitions i ON i.id=ii.item_id WHERE e.character_id=? AND e.slot='weapon' AND i.item_category='武器' AND i.required_level<=? AND ii.market_listing_id IS NULL LIMIT 1", [character.id, character.level]);
        if (main[0])
            await connection.execute('INSERT IGNORE INTO player_hidden_profession_loadouts (character_id,profession_code,config_json) VALUES (?,?,?)', [character.id, profession.code, JSON.stringify({ weapons: [Number(main[0].instance_id)] })]);
    }
    await connection.execute('DELETE FROM player_hidden_action_drafts WHERE character_id=?', [character.id]);
    await recalculateCharacterStats(connection, Number(character.id));
    return { profession, reset };
});
const payMaterials = async (connection, characterId, code, stage) => {
    for (const material of hiddenQuest(code, stage)?.materials ?? []) {
        const codes = material.code.startsWith('alchemy_') ? [material.code, `${material.code}_q1`, `${material.code}_q2`] : [material.code];
        const [stocks] = await connection.execute(`SELECT i.id,i.code,p.quantity FROM item_definitions i JOIN player_inventory p ON p.item_id=i.id WHERE p.character_id=? AND i.code IN (${codes.map(() => '?').join(',')}) ORDER BY i.code FOR UPDATE`, [characterId, ...codes]);
        if (stocks.reduce((n, stock) => n + Number(stock.quantity), 0) < material.quantity)
            throw new Error(`还需要备齐【${material.name}】×${material.quantity}。品质不限，已存入家中或挂售的物品不计入。`);
        let remaining = material.quantity;
        for (const stock of stocks) {
            const used = Math.min(remaining, Number(stock.quantity));
            if (used)
                await consumeInventory(connection, characterId, Number(stock.id), used);
            remaining -= used;
        }
    }
};
const inspectEquipment = async (connection, characterId, profession, stage) => {
    const needsWeapons = profession === 'weapon_master' && [1, 5, 6].includes(stage);
    const deviceCodes = { 5: 'emergency_evasion_module', 6: 'simple_launcher', 7: 'weave_repair_swarm' };
    if (!needsWeapons && !(profession === 'inventor' && deviceCodes[stage]))
        return [];
    const [items] = await connection.execute(`SELECT ii.id,i.code,i.name,i.item_category,i.weapon_type,i.rarity,i.required_level,e.slot FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id LEFT JOIN player_equipment e ON e.character_id=ii.character_id AND e.instance_id=ii.id WHERE ii.character_id=? AND ii.market_listing_id IS NULL AND NOT EXISTS (SELECT 1 FROM player_home_storage_instances hs WHERE hs.instance_id=ii.id) ORDER BY ii.id FOR UPDATE`, [characterId]);
    let selected = [];
    if (profession === 'inventor') {
        selected = items.filter(item => item.code === deviceCodes[stage]).slice(0, 1);
        if (!selected.length)
            throw new Error(`请随身携带本环要求的异械，再请唯薇安查看。出示后仍归你所有。`);
    }
    else if (stage === 1) {
        selected = items.filter(item => item.item_category === '武器' && item.rarity === '普通' && Number(item.required_level) <= 15 && !item.slot).slice(0, 2);
        if (selected.length < 2)
            throw new Error('请出示两件不同实例、未装备、需求等级不高于15的普通品质武器。武器只供检测，不会被收走。');
    }
    else if (stage === 5) {
        for (const type of ['长剑', '匕首', '法杖']) {
            const item = items.find(item => item.weapon_type === type && Number(item.required_level) <= 15);
            if (!item)
                throw new Error(`还缺一件需求等级不高于15的【${type}】，品质不限。`);
            selected.push(item);
        }
    }
    else {
        for (const slot of ['upper', 'feet']) {
            const item = items.find(item => item.slot === slot);
            if (!item)
                throw new Error('请先实际穿好上装与脚部装备，再让小北记录护阵的防护底子。');
            selected.push(item);
        }
    }
    return selected.map(item => `${item.name} #${item.id}`);
};
const hiddenQuestAction = (user, code, revision, action, choice) => withTransaction(async (connection) => {
    const data = (await context(connection, user, code));
    const { profession, character, row } = data;
    await assertCombatLoadoutMutable(connection, Number(character.id));
    if (!Number.isSafeInteger(revision) || revision !== Number(row.revision))
        throw new Error('这张工作台已更新，请重新打开；不会重复交付材料。');
    if (row.qualified_at)
        throw new Error('这条委托已全部完成，资格会永久保留。');
    const stage = Number(row.stage), evidence = parse(row.evidence_json, {}), completed = parse(row.completed_json, {});
    let receipt = '';
    if (action === 'accept') {
        if (row.accepted_at)
            throw new Error('已经接下这一环了。');
        await connection.execute('INSERT IGNORE INTO player_hidden_profession_quests (character_id,profession_code) VALUES (?,?)', [character.id, profession.code]);
        row.accepted_at = new Date();
        receipt = `${profession.mentor}把本环的记录板留给了你。已加入任务栏，可随时查看进度；交付与推进仍需回店当面完成。`;
    }
    else {
        if (!row.accepted_at)
            throw new Error('请先当面接下这一环委托。');
        if (action === 'prepare') {
            if (row.materials_paid)
                throw new Error('本环已经备妥，不必再交一次。');
            evidence.shown = await inspectEquipment(connection, Number(character.id), profession.code, stage);
            await payMaterials(connection, Number(character.id), profession.code, stage);
            row.materials_paid = 1;
            evidence.lesson = newHiddenLesson();
            receipt = evidence.shown.length ? `已记录：${evidence.shown.join('、')}。物品仍归你所有，接下来的演示使用借用副本。` : '材料与教学样本已摆上工作台，接下来按面前的读数操作。';
        }
        else if (action === 'lesson') {
            if (!row.materials_paid)
                throw new Error('请先备齐本环材料或出示所需装备。');
            if (profession.code === 'tactician' && stage === 6 && completed['2']?.observations?.length !== 2)
                throw new Error('两份原始观察记录不完整，请先核对记录。');
            const oldCursor = evidence.lesson?.cursor ?? 0;
            evidence.lesson = advanceHiddenLesson(profession.code, stage, evidence.lesson ?? newHiddenLesson(), Number(choice));
            if (stage === 10 && evidence.lesson.cursor > oldCursor) {
                evidence.trial = await advanceHiddenTrial(profession.code, evidence.trial);
                evidence.lesson.last += '\n\n' + evidence.trial.log.join('\n');
                evidence.lesson.complete = evidence.trial.won;
            }
            receipt = evidence.lesson.last;
        }
        else if (action === 'finish') {
            const observed = profession.code === 'tactician' && stage === 2 && ['forest_slime', 'shadow_wolf_king'].every(code => evidence.observations?.some(record => record.code === code));
            if (!observed && !(row.materials_paid && evidence.lesson?.complete))
                throw new Error('这环还有未完成的操作或记录，请先核对工作台。');
            if (stage === 10 && !evidence.trial?.won)
                throw new Error('请完成真实个人演练，再交回验收记录。');
            completed[String(stage)] = evidence;
            receipt = hiddenQuestStory(profession.code, stage)?.completed ?? '';
            row.stage = stage + 1;
            row.accepted_at = null;
            row.materials_paid = 0;
            if (stage === 10)
                row.qualified_at = new Date();
        }
        else
            throw new Error('未知的工作台操作。');
    }
    row.revision = Number(row.revision) + 1;
    row.evidence_json = action === 'finish' ? {} : evidence;
    row.completed_json = completed;
    await connection.execute('UPDATE player_hidden_profession_quests SET stage=?,accepted_at=?,materials_paid=?,evidence_json=?,completed_json=?,qualified_at=?,revision=? WHERE character_id=? AND profession_code=?', [row.stage, row.accepted_at, row.materials_paid, JSON.stringify(row.evidence_json), JSON.stringify(completed), row.qualified_at, row.revision, character.id, profession.code]);
    return { ...view(data), receipt };
});
const recordHiddenQuestObservation = async (connection, characterId, record) => {
    if (!['forest_slime', 'shadow_wolf_king'].includes(record.code) || !record.fact.trim())
        return;
    const [rows] = await connection.execute('SELECT * FROM player_hidden_profession_quests WHERE character_id=? AND profession_code=\'tactician\' AND stage=2 AND accepted_at IS NOT NULL FOR UPDATE', [characterId]);
    if (!rows[0])
        return;
    const row = rows[0], evidence = parse(row.evidence_json, {});
    evidence.observations ??= [];
    if (evidence.observations.some(item => item.code === record.code))
        return;
    evidence.observations.push({ ...record, observedAt: new Date().toISOString() });
    await connection.execute('UPDATE player_hidden_profession_quests SET evidence_json=?,revision=revision+1 WHERE character_id=? AND profession_code=\'tactician\'', [JSON.stringify(evidence), characterId]);
};

export { becomeHiddenProfession, hiddenQuestAction, hiddenQuestCharacter, hiddenQuestTopic, hiddenQuestView, hiddenTrackedQuests, recordHiddenQuestObservation };
