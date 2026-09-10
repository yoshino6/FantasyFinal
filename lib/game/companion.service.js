import { recordAchievement } from './achievement-events.js';
import { hasTalent } from './talent-combat.js';
import { standardPlayerAttribute } from './growth-rules.js';
import { withTransaction, getPool } from '../database/pool.js';
import { consumeInventory } from './inventory-binding.js';
import { assertOpeningFree } from './opening-state.js';
import { calculateDerivedStats, experienceRequiredForLevel } from './constants.js';
import { moodScale } from './negotiation-rules.js';
import { attributes } from './types.js';
import { talentIntimacy } from './talent-rewards.js';
import { grantOpeningItem } from './opening.service.js';

const companionSpecialties = (code) => code === 'golden_rabbit' ? ['find', 'watch'] : code.includes('goblin') ? ['watch', 'negotiate', 'workshop'] : /(slime|spore|mushroom|vine|treant)/.test(code) ? ['watch', 'gather'] : ['watch', 'find'];
const activeCompanionSpecialty = async (c, id, specialty) => {
    const [rows] = await c.execute('SELECT template_code,intimacy FROM player_companions WHERE character_id=? AND is_out=1 AND injured=0 AND stability>=20 AND released_at IS NULL AND specialty=?', [id, specialty]);
    return rows.some(p => (Number(p.intimacy) >= 50 || p.template_code === 'golden_rabbit' && specialty === 'find') && companionSpecialties(String(p.template_code)).includes(specialty));
};
const companionChance = (kind, moodRatio, capacity, divine = false) => {
    if (!(capacity > 0) || !Number.isFinite(moodRatio))
        return 0;
    const gates = { normal: [.6, .12], ordinary: [.6, .12], large: [.8, .06], elite: [.8, .02], boss: [1, .0005] };
    const gate = gates[kind];
    return !gate || moodRatio < gate[0] ? 0 : kind === 'boss' ? gate[1] : Math.min(divine ? .75 : .3, gate[1] * (divine ? 3 : 1));
};
const companionStats = (level) => {
    const standard = calculateDerivedStats(Object.fromEntries(attributes.map(key => [key, standardPlayerAttribute(level)])));
    return { hp: Math.floor(standard.hpMax * .4), attack: Math.floor(standard.physicalAttack * .3), defense: Math.floor(standard.physicalDefense * .4) };
};
const owner = async (connection, user) => {
    const [rows] = await connection.execute('SELECT c.id,c.level,c.activity_status FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE', [user]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return rows[0];
};
const requireMutable = async (connection, id) => {
    await assertOpeningFree(connection, id);
    const [busy] = await connection.execute(`SELECT '行动' FROM characters WHERE id=? AND activity_status<>'active' UNION ALL SELECT '移动' FROM player_travels WHERE character_id=? UNION ALL SELECT '交涉' FROM negotiation_participants p JOIN negotiation_sessions n ON n.id=p.session_id WHERE p.character_id=? AND n.state='active' LIMIT 1`, [id, id, id]);
    if (busy.length)
        throw new Error('请先结束当前行动，再照料或更换随从。');
    const [combat] = await connection.execute("SELECT s.id FROM combat_sessions s JOIN combat_members m ON m.session_id=s.id WHERE s.state='active' AND m.character_id=? LIMIT 1", [id]);
    const [pvp] = await connection.execute("SELECT id FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1", [id, id]);
    if (combat.length || pvp.length)
        throw new Error('战斗中不能更换或照料随从。');
};
const grantGoldenRabbit = async (connection, id) => {
    const [old] = await connection.execute("SELECT id FROM player_companions WHERE character_id=? AND template_code='golden_rabbit' LIMIT 1", [id]);
    if (old.length)
        throw new Error('黄金兔的初次结契已经记录。');
    await connection.execute("INSERT INTO player_companions (character_id,template_code,name,is_out,intimacy,stability,specialty) VALUES (?,'golden_rabbit','黄金兔',1,10,80,'find')", [id]);
};
const grantWindbirdChick = async (connection, id) => {
    const [old] = await connection.execute("SELECT id,name FROM player_companions WHERE character_id=? AND template_code='windbird_chick' AND released_at IS NULL LIMIT 1 FOR UPDATE", [id]);
    if (old[0])
        return String(old[0].name);
    const [count] = await connection.execute('SELECT COUNT(*) total FROM player_companions WHERE character_id=? AND released_at IS NULL FOR UPDATE', [id]);
    if (Number(count[0]?.total ?? 0) >= 6)
        throw new Error('随从名册已满，请先安置一位随从后再继续剧情。');
    await connection.execute('UPDATE player_companions SET is_out=0 WHERE character_id=?', [id]);
    await connection.execute("INSERT INTO player_companions(character_id,template_code,name,is_out,intimacy,stability,specialty) VALUES(?,'windbird_chick','风羽幼鸟',1,15,80,'find')", [id]);
    return '风羽幼鸟';
};
const openingFeedRabbit = async (connection, id) => {
    await connection.execute("UPDATE player_companions SET stability=LEAST(100,stability+10) WHERE character_id=? AND template_code='golden_rabbit' AND released_at IS NULL", [id]);
};
const offerNegotiatedCompanion = async (connection, id, spawnId, moodPpm, capacity, random = Math.random) => {
    const [pending] = await connection.execute('SELECT 1 FROM companion_invitations WHERE character_id=? FOR UPDATE', [id]);
    if (pending.length)
        return '';
    const [rows] = await connection.execute(`SELECT s.level AS spawn_level,s.traits_json,t.code,t.name,t.monster_class,t.level AS template_level,c.level AS owner_level,
    EXISTS(SELECT 1 FROM player_blessings b WHERE b.character_id=c.id AND b.code='talent_social_02') AS divine
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id JOIN characters c ON c.id=? WHERE s.id=?`, [id, spawnId]);
    const monster = rows[0];
    if (!monster)
        return '';
    const traits = typeof monster.traits_json === 'string' ? JSON.parse(monster.traits_json) : monster.traits_json;
    const traitText = JSON.stringify(traits ?? []);
    if (/owner_character_id|main_quest|kingbeast|component|summon|test|dungeon|instance|trial/.test(traitText))
        return '';
    if (monster.monster_class === 'boss' && (!['shadow_wolf_king', 'goblin_king'].includes(String(monster.code)) || Number(monster.owner_level) < Number(monster.template_level) - 5))
        return '';
    const chance = companionChance(String(monster.monster_class), moodPpm / moodScale, capacity, Boolean(monster.divine));
    if (random() >= chance)
        return '';
    await connection.execute('INSERT INTO companion_invitations (character_id,spawn_id,template_code,name,source_level) VALUES (?,?,?,?,?)', [id, spawnId, monster.code, monster.name, monster.template_level]);
    return '\n\n对方没有立刻离开，似乎愿意继续同行。已为交涉发起者保留邀请，可在 /随从 选择接纳或婉拒。';
};
const companionPanel = async (user) => {
    const pool = await getPool();
    const [rows] = await pool.execute('SELECT f.* FROM player_companions f JOIN characters c ON c.id=f.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND f.released_at IS NULL ORDER BY f.is_out DESC,f.id', [user]);
    const [invites] = await pool.execute('SELECT f.* FROM companion_invitations f JOIN characters c ON c.id=f.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=?', [user]);
    return { companions: rows, invitation: invites[0] ?? null };
};
const acceptCompanion = async (user, accept) => withTransaction(async (connection) => {
    const character = await owner(connection, user);
    await requireMutable(connection, Number(character.id));
    const [invite] = await connection.execute('SELECT * FROM companion_invitations WHERE character_id=? FOR UPDATE', [character.id]);
    if (!invite[0])
        throw new Error('没有待处理的同行邀请。');
    if (accept) {
        const [existing] = await connection.execute('SELECT id FROM player_companions WHERE character_id=? AND released_at IS NULL FOR UPDATE', [character.id]);
        if (existing.length >= 6)
            throw new Error('名册已满（6/6）。邀请会一直保留，确认放归一位随从后可再来接纳。');
        await connection.execute('INSERT INTO player_companions (character_id,template_code,name,level,source_level,source_spawn_id) VALUES (?,?,?,?,?,?)', [character.id, invite[0].template_code, invite[0].name, Math.min(Number(character.level), Number(invite[0].source_level)), invite[0].source_level, invite[0].spawn_id]);
    }
    if (accept)
        recordAchievement(connection, Number(character.id), [{ metric: 'ACH_G20' }, { metric: 'ACH_G22', distinct: String(invite[0].template_code) }]);
    await connection.execute('DELETE FROM companion_invitations WHERE character_id=?', [character.id]);
    return accept ? '对方接受了你的邀请，在名册中有了自己的位置。' : '你向对方道别。它回头望了一眼，走回熟悉的土地。';
});
const companionAction = async (user, companionId, action, value = '') => withTransaction(async (connection) => {
    const character = await owner(connection, user);
    await requireMutable(connection, Number(character.id));
    const [rows] = await connection.execute('SELECT * FROM player_companions WHERE id=? AND character_id=? AND released_at IS NULL FOR UPDATE', [companionId, character.id]);
    const pet = rows[0];
    if (!pet)
        throw new Error('随从不在你的名册中。');
    if (action === 'out') {
        if (pet.injured || Number(pet.stability) < 20)
            throw new Error('它需要先接受照料，暂时无法提供支援。');
        await connection.execute("UPDATE opening_world SET aqua_location='world_tree',revision=revision+1 WHERE id=1 AND aqua_character_id=? AND aqua_location='follow'", [character.id]);
        await connection.execute('UPDATE player_companions SET is_out=0 WHERE character_id=?', [character.id]);
        await connection.execute('UPDATE player_companions SET is_out=1 WHERE id=?', [pet.id]);
        return `${pet.name}来到你的身边。`;
    }
    if (action === 'rest') {
        await connection.execute('UPDATE player_companions SET is_out=0 WHERE id=?', [pet.id]);
        return `${pet.name}回到休整处。`;
    }
    if (action === 'release') {
        if (value !== String(pet.name))
            throw new Error('放归后不能找回，请输入该随从当前名字再次确认。');
        await connection.execute('UPDATE player_companions SET released_at=NOW(),is_out=0 WHERE id=?', [pet.id]);
        return `你与${pet.name}正式道别。这段相遇仍留在记录里。`;
    }
    if (action === 'name') {
        if (Number(pet.intimacy) < 25)
            throw new Error('亲密达到25后才能改名。');
        if (!value.trim() || [...value].length > 12 || /[\r\n<>]/.test(value))
            throw new Error('名字请使用1～12个普通字符。');
        await connection.execute('UPDATE player_companions SET name=? WHERE id=?', [value.trim(), pet.id]);
        return '它渐渐熟悉了你呼唤的新名字。';
    }
    if (action === 'feed') {
        await connection.execute('INSERT IGNORE INTO companion_daily (companion_id,day_key) VALUES (?,CURRENT_DATE())', [pet.id]);
        const [daily] = await connection.execute('SELECT * FROM companion_daily WHERE companion_id=? AND day_key=CURRENT_DATE() FOR UPDATE', [pet.id]);
        if (Number(daily[0].feed_count) >= 3)
            throw new Error('它今天已经吃过三份饲料，先让它休息。');
        const [food] = await connection.execute("SELECT id FROM item_definitions WHERE code='opening_companion_feed'");
        await consumeInventory(connection, Number(character.id), Number(food[0]?.id), 1);
        const intimacy = Number(daily[0].feed_count) === 0 ? await talentIntimacy(connection, Number(character.id), Number(pet.id), 2) : 0;
        await connection.execute('UPDATE player_companions SET stability=LEAST(100,stability+10),injured=0,intimacy=LEAST(100,intimacy+?) WHERE id=?', [intimacy, pet.id]);
        await connection.execute('UPDATE companion_daily SET feed_count=feed_count+1 WHERE companion_id=? AND day_key=CURRENT_DATE()', [pet.id]);
        return `${pet.name}吃完饲料，安稳地靠近了些。`;
    }
    if (action === 'specialty') {
        if (Number(pet.intimacy) < 50)
            throw new Error('亲密达到50后可以调整物种专长。');
        if (!companionSpecialties(String(pet.template_code)).includes(value))
            throw new Error('这项专长不适合它的物种，请查看随从详情。');
        await connection.execute('UPDATE player_companions SET specialty=? WHERE id=?', [value, pet.id]);
        return '已调整出行专长。';
    }
    if (action === 'talk' && pet.template_code === 'golden_rabbit' && Number(pet.intimacy) >= 50) {
        await (await import('./guild-context.js')).requireGuildService(connection, Number(character.id));
        await connection.execute('INSERT IGNORE INTO companion_daily (companion_id,day_key) VALUES (?,CURRENT_DATE())', [pet.id]);
        const [used] = await connection.execute('UPDATE companion_daily SET bread_used=1 WHERE companion_id=? AND day_key=CURRENT_DATE() AND bread_used=0', [pet.id]);
        if (used.affectedRows) {
            await connection.execute('UPDATE characters SET stamina=LEAST(?,stamina+10) WHERE id=?', [(await import('./constants.js')).staminaMaxForRealm(Number((await connection.execute('SELECT realm_stage FROM characters WHERE id=?', [character.id]))[0][0].realm_stage)), character.id]);
            return '黄金兔从爪边推来半块面包，又往你的手心拱了拱。这回，它先等你吃。\n\n分享面包，恢复 10 点体力（每日一次，不超过上限）。';
        }
        return '黄金兔舔了舔空空的爪子，又靠着你的鞋坐下。今天的面包已经一起吃过了。';
    }
    if (action === 'talk')
        return pet.template_code === 'golden_rabbit' ? (Number(pet.intimacy) >= 80 ? '黄金兔把面包推到你手边。这回，它先等你吃。' : Number(pet.intimacy) >= 25 ? '黄金兔不再一听见树叶响就躲起来，不过仍悄悄挨着你的鞋。' : '它把空口粮袋叼到你脚边，想了想，又推回来一点，像在问你有没有吃饱。') : `${pet.name}在你身边停留了一会儿。${Number(pet.intimacy) >= 80 ? '它已经很熟悉与你同行的节奏。' : '你们仍在慢慢熟悉彼此。'}`;
    throw new Error('未知随从操作。');
});
const grantCompanionExperience = async (connection, id, baseExperience) => {
    if (baseExperience <= 0)
        return;
    const [rows] = await connection.execute('SELECT f.*,c.level AS owner_level FROM player_companions f JOIN characters c ON c.id=f.character_id WHERE f.character_id=? AND f.is_out=1 AND f.released_at IS NULL FOR UPDATE', [id]);
    const pet = rows[0];
    if (!pet)
        return;
    let experience = Number(pet.experience) + Math.floor(baseExperience * .2), level = Number(pet.level);
    while (level < Number(pet.owner_level) && experience >= experienceRequiredForLevel(level)) {
        experience -= experienceRequiredForLevel(level);
        level++;
    }
    if (level >= Number(pet.owner_level))
        experience = Math.min(experience, experienceRequiredForLevel(level));
    await connection.execute('UPDATE player_companions SET experience=?,level=? WHERE id=?', [experience, level, pet.id]);
    await connection.execute('INSERT IGNORE INTO companion_daily (companion_id,day_key) VALUES (?,CURRENT_DATE())', [pet.id]);
    const [daily] = await connection.execute('SELECT adventure_count FROM companion_daily WHERE companion_id=? AND day_key=CURRENT_DATE() FOR UPDATE', [pet.id]);
    if (!Number(daily[0].adventure_count)) {
        await connection.execute('UPDATE player_companions SET intimacy=LEAST(100,intimacy+?) WHERE id=?', [await talentIntimacy(connection, id, Number(pet.id), 1), pet.id]);
        await connection.execute('UPDATE companion_daily SET adventure_count=1 WHERE companion_id=? AND day_key=CURRENT_DATE()', [pet.id]);
    }
};
const companionFind = async (c, id, random = Math.random) => {
    if (!await activeCompanionSpecialty(c, id, 'find') || random() >= .1)
        return '';
    const [pets] = await c.execute('SELECT id,name FROM player_companions WHERE character_id=? AND is_out=1 AND released_at IS NULL FOR UPDATE', [id]);
    const pet = pets[0];
    if (!pet)
        return '';
    await c.execute('INSERT IGNORE INTO companion_daily (companion_id,day_key) VALUES (?,CURRENT_DATE())', [pet.id]);
    const [used] = await c.execute('UPDATE companion_daily SET find_count=find_count+1 WHERE companion_id=? AND day_key=CURRENT_DATE() AND find_count<3', [pet.id]);
    if (!used.affectedRows)
        return '';
    await grantOpeningItem(c, id, 'healing_herb');
    return `\n\n${pet.name}从草丛里探出头，将一株微光草药推到你脚边。获得【微光草药】×1。`;
};
const companionSupport = async (c, rules, owner, actionKey) => {
    if (owner.hp <= 0 || owner.companion || owner.opening?.pve === false || owner.state.memory.opening_companion_action === actionKey)
        return;
    const id = Number(owner.key.split(':')[1]);
    const [pets] = await c.execute('SELECT * FROM player_companions WHERE character_id=? AND is_out=1 AND injured=0 AND stability>=20 AND released_at IS NULL FOR UPDATE', [id]);
    const pet = pets[0];
    if (!pet)
        return;
    owner.state.memory.opening_companion_action = actionKey;
    const count = Number(owner.state.memory.opening_companion_actions ?? 0) + 1;
    owner.state.memory.opening_companion_actions = count;
    if (count % 3)
        return;
    if (pet.template_code === 'golden_rabbit') {
        if (owner.hp < owner.hpMax * .4 && rules.once(owner, 'opening_rabbit_healed', true)) {
            const heal = Math.min(owner.hpMax - owner.hp, Math.floor(owner.hpMax * .08));
            owner.hp += heal;
            rules.log.push(`　&黄金兔·微光护持&它抖着耳朵挪到你身前，恢复 ${heal} HP。`);
        }
        return;
    }
    const target = rules.enemies(owner).find(enemy => enemy.key === owner.selected) ?? rules.enemies(owner)[0];
    if (!target)
        return;
    const stats = companionStats(Math.min(Number(pet.level), owner.level));
    const damage = Math.max(1, Math.floor(stats.attack * stats.attack / (stats.attack + Math.max(1, target.defense))));
    const before = target.hp;
    await rules.takeHit(target, damage * (hasTalent(owner, 'A10') && owner.opening?.settings?.command === `companion:${pet.id}` ? 2 : 1));
    rules.log.push(`　&${pet.name}·同行支援&向${target.name}发起扑击，造成 ${before - target.hp} 点伤害。`);
};
const companionAreaHit = async (c, rules, owner, attacker, magic) => {
    if (owner.companion)
        return;
    const [pets] = await c.execute('SELECT id,name,level FROM player_companions WHERE character_id=? AND is_out=1 AND injured=0 AND stability>=20 AND released_at IS NULL FOR UPDATE', [Number(owner.key.split(':')[1])]);
    const pet = pets[0];
    if (!pet)
        return;
    const stats = companionStats(Math.min(owner.level, Number(pet.level))), attack = magic ? attacker.magic : attacker.attack;
    const damage = Math.max(1, Math.floor(attack * attack / (attack + Math.max(1, stats.defense))));
    const before = Number(owner.state.memory.opening_companion_hp ?? stats.hp), hp = Math.max(0, before - damage);
    owner.state.memory.opening_companion_hp = hp;
    rules.log.push(`　&${pet.name}·范围波及&损失 ${before - hp} HP${hp ? '。' : '，受伤退出本场支援。'}`);
    if (!hp)
        await c.execute('UPDATE player_companions SET injured=1 WHERE id=?', [pet.id]);
};

export { acceptCompanion, activeCompanionSpecialty, companionAction, companionAreaHit, companionChance, companionFind, companionPanel, companionSpecialties, companionStats, companionSupport, grantCompanionExperience, grantGoldenRabbit, grantWindbirdChick, offerNegotiatedCompanion, openingFeedRabbit };
