import { equipmentQualityMultiplier } from './constants.js';
import { skillSpecialization } from './skill-specialization.js';
import { ruleManaCost, readRuleState } from './combat-rule-registry.js';
import { hiddenParticles, hiddenMix } from './hidden-particles.js';
import { HiddenBattleError } from './hidden-combat.js';
import { withTransaction } from '../database/pool.js';
import { hiddenQuestCharacter } from './hidden-quest.service.js';
import { hiddenProfession, hiddenSkill } from './hidden-profession.config.js';
import { hiddenState, hiddenResourceShortage } from './hidden-combat-state.js';
import { activeDeviceDefinitionByCode } from './device.service.js';
import { consumeInventory } from './inventory-binding.js';
import { assertCombatLoadoutMutable } from './combat-loadout-lock.service.js';

const object = (value) => typeof value === 'string' ? JSON.parse(value) : (value ?? {});
const initializeHiddenBattleUnits = async (connection, units) => {
    const playerUnits = units.filter(u => /^(member|pvp):\d+$/.test(u.key));
    if (!playerUnits.length)
        return;
    const ids = playerUnits.map(u => Number(u.key.split(':')[1]));
    const [rows] = await connection.execute(`SELECT character_id,profession_code FROM player_advanced_professions WHERE character_id IN (${ids.map(() => '?').join(',')})`, ids);
    for (const unit of playerUnits) {
        const profession = hiddenProfession(String(rows.find(row => Number(row.character_id) === Number(unit.key.split(':')[1]))?.profession_code ?? ''));
        if (profession)
            hiddenState(unit).profession = profession.code;
    }
};
const hiddenOwnedWeapons = async (connection, characterId) => {
    const [rows] = await connection.execute(`SELECT ii.id,i.name,i.weapon_type,ii.quality,COALESCE(ii.effect_json,i.effect_json) AS effect_json FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id JOIN characters c ON c.id=ii.character_id WHERE ii.character_id=? AND i.item_category='武器' AND i.required_level<=c.level AND ii.market_listing_id IS NULL AND NOT EXISTS (SELECT 1 FROM player_home_storage_instances hs WHERE hs.instance_id=ii.id) ORDER BY ii.id`, [characterId]);
    return rows.map(row => { const stats = object(row.effect_json); return { id: Number(row.id), name: String(row.name), type: String(row.weapon_type), attack: Number(stats.physicalAttack ?? 0) * equipmentQualityMultiplier(Number(row.quality)), magic: Number(stats.magicAttack ?? 0) * equipmentQualityMultiplier(Number(row.quality)), element: String(stats.element ?? '') }; });
};
const hiddenBattleContext = async (connection, characterId, sessionId, kind) => {
    const [configs] = await connection.execute('SELECT profession_code,config_json FROM player_hidden_profession_loadouts WHERE character_id=?', [characterId]);
    const config = (code) => object(configs.find(row => row.profession_code === code)?.config_json);
    const owned = await hiddenOwnedWeapons(connection, characterId), ids = config('weapon_master').weapons ?? [];
    const weapons = ids.map(id => owned.find(w => w.id === id)).filter(Boolean);
    const [rows] = kind === 'setup' ? await connection.execute(`SELECT ii.id AS instance_id,100 AS current_energy,100 AS max_energy,i.code,i.name FROM player_active_devices ad JOIN player_item_instances ii ON ii.id=ad.instance_id JOIN item_definitions i ON i.id=ii.item_id WHERE ad.character_id=? AND ii.market_listing_id IS NULL`, [characterId]) : await connection.execute(`SELECT e.instance_id,e.current_energy,e.max_energy,i.code,i.name FROM combat_device_energy e JOIN player_item_instances ii ON ii.id=e.instance_id AND ii.character_id=e.character_id JOIN item_definitions i ON i.id=ii.item_id JOIN player_active_devices ad ON ad.character_id=e.character_id AND ad.instance_id=e.instance_id WHERE e.battle_kind=? AND e.session_id=? AND e.character_id=? AND ii.market_listing_id IS NULL ORDER BY e.instance_id FOR UPDATE`, [kind, sessionId, characterId]);
    const [activeRows] = await connection.execute('SELECT i.code FROM player_active_devices a JOIN player_item_instances ii ON ii.id=a.instance_id JOIN item_definitions i ON i.id=ii.item_id WHERE a.character_id=?', [characterId]);
    const configured = config('inventor').devices ?? [];
    const devices = rows.filter(row => configured.includes(Number(row.instance_id))).flatMap(row => { const definition = activeDeviceDefinitionByCode.get(String(row.code)); return definition ? [{ id: Number(row.instance_id), code: String(row.code), name: String(row.name), energy: Number(row.current_energy), max: Number(row.max_energy), skills: definition.skills }] : []; });
    return { weapons, devices, activeCodes: activeRows.map(row => String(row.code)), autoChoice: (code) => config(hiddenSkill(code)?.profession ?? '').auto?.[code],
        payParticles: async (particles) => {
            const counts = new Map();
            for (const particle of particles)
                counts.set(particle, (counts.get(particle) ?? 0) + 1);
            for (const [code, quantity] of counts) {
                const [stocks] = await connection.execute('SELECT i.id,p.quantity FROM item_definitions i JOIN player_inventory p ON p.item_id=i.id WHERE p.character_id=? AND i.code=? FOR UPDATE', [characterId, code]);
                if (Number(stocks[0]?.quantity ?? 0) < quantity)
                    throw new HiddenBattleError(`背包内${hiddenParticles.find(p => p.code === code)?.name ?? code}不足${quantity}个。`);
            }
            for (const [code, quantity] of counts) {
                const [items] = await connection.execute('SELECT id FROM item_definitions WHERE code=?', [code]);
                await consumeInventory(connection, characterId, Number(items[0].id), quantity);
            }
        },
        saveDevices: async () => { for (const device of devices)
            await connection.execute('UPDATE combat_device_energy SET current_energy=? WHERE battle_kind=? AND session_id=? AND character_id=? AND instance_id=?', [device.energy, kind, sessionId, characterId, device.id]); } };
};
const hiddenLoadout = (user, type, toggle) => withTransaction(async (connection) => {
    const character = await hiddenQuestCharacter(connection, user);
    await assertCombatLoadoutMutable(connection, Number(character.id));
    const [rows] = await connection.execute('SELECT profession_code FROM player_advanced_professions WHERE character_id=?', [character.id]);
    const profession = hiddenProfession(String(rows[0]?.profession_code));
    if (!profession)
        throw new Error('请先完成隐藏二转。');
    const [saved] = await connection.execute('SELECT config_json FROM player_hidden_profession_loadouts WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, profession.code]);
    const config = object(saved[0]?.config_json);
    const weapons = await hiddenOwnedWeapons(connection, Number(character.id));
    const [deviceRows] = await connection.execute('SELECT ii.id,i.code,i.name FROM player_active_devices ad JOIN player_item_instances ii ON ii.id=ad.instance_id JOIN item_definitions i ON i.id=ii.item_id WHERE ad.character_id=? AND ii.market_listing_id IS NULL ORDER BY ii.id', [character.id]);
    const devices = deviceRows.filter(row => activeDeviceDefinitionByCode.has(String(row.code))).map(row => ({ id: Number(row.id), code: String(row.code), name: String(row.name) }));
    if (type && toggle) {
        if ((type === 'weapons' ? 'weapon_master' : 'inventor') !== profession.code)
            throw new Error('当前职业不能配置这类阵列。');
        const available = type === 'weapons' ? weapons : devices;
        if (!available.some(w => w.id === toggle))
            throw new Error('该物品不在可配置范围内。');
        const selected = config[type] ?? [];
        config[type] = selected.includes(toggle) ? selected.filter(id => id !== toggle) : [...selected, toggle];
        if (config[type].length > 3)
            throw new Error('至多配置3件，请先移除一件。');
        if (type === 'devices' && new Set(config[type].map((id) => devices.find(d => d.id === id)?.code)).size !== config[type].length)
            throw new Error('主脑不能连接重复型号。');
        await connection.execute('INSERT INTO player_hidden_profession_loadouts (character_id,profession_code,config_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE config_json=VALUES(config_json),revision=revision+1', [character.id, profession.code, JSON.stringify(config)]);
    }
    return { profession, config, weapons, devices };
});
const hiddenDraft = (user, code, revision, operation, value) => withTransaction(async (connection) => {
    const character = await hiddenQuestCharacter(connection, user), skill = hiddenSkill(code);
    if (!skill)
        throw new Error('技能无效。');
    const [owned] = await connection.execute('SELECT s.id FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id JOIN player_advanced_professions ap ON ap.character_id=ps.character_id WHERE ps.character_id=? AND s.code=? AND ap.profession_code=?', [character.id, code, skill.profession]);
    if (!owned[0])
        throw new Error('当前职业尚未掌握该技能。');
    const [pve] = await connection.execute("SELECT cs.id,cs.turn_no,cm.pending_action,cm.cooldowns,cm.is_defeated FROM combat_sessions cs JOIN combat_members cm ON cm.session_id=cs.id WHERE cm.character_id=? AND cs.state='active' LIMIT 1 FOR UPDATE", [character.id]);
    const [pvp] = pve.length ? [[]] : await connection.execute("SELECT id,turn_no,attacker_character_id,attacker_cooldowns AS cooldowns FROM player_pvp_battle_sessions WHERE (attacker_character_id=? OR defender_character_id=?) AND state='active' LIMIT 1 FOR UPDATE", [character.id, character.id]);
    const battle = pve[0] ?? pvp[0] ?? { id: skill.profession, turn_no: 0 }, kind = pve.length ? 'pve' : pvp.length ? 'pvp' : 'setup';
    if (kind === 'setup')
        await assertCombatLoadoutMutable(connection, Number(character.id));
    if (!battle || battle.pending_action || battle.is_defeated || kind === 'pvp' && Number(battle.attacker_character_id) !== Number(character.id))
        throw new Error('当前不能准备战斗行动。');
    if (kind !== 'setup') {
        const shortage = hiddenResourceShortage(code, object(battle.cooldowns));
        if (shortage)
            throw new HiddenBattleError(shortage);
    }
    const key = `${kind}:${battle.id}`, turn = Number(battle.turn_no);
    const [drafts] = await connection.execute('SELECT * FROM player_hidden_action_drafts WHERE character_id=? AND battle_key=? AND turn_no=? FOR UPDATE', [character.id, key, turn]);
    const draft = drafts[0];
    if (revision !== undefined && (!draft || Number(draft.revision) !== revision || draft.skill_code !== code || draft.submitted))
        throw new Error('这张调配面板已过期，请重新打开技能。');
    let choice = draft?.skill_code === code && !draft.submitted ? object(draft.draft_json) : {};
    const [stocks] = await connection.execute('SELECT i.code,p.quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? FOR UPDATE', [character.id]);
    const inventory = Object.fromEntries(stocks.map(s => [s.code, Number(s.quantity)]));
    if (operation === 'particle') {
        if (!hiddenParticles.some(p => p.code === value))
            throw new Error('粒子无效。');
        choice.particles = [...(choice.particles ?? []), value];
        if (choice.particles.length > 4)
            throw new Error('最多放入4颗粒子。');
    }
    if (operation === 'undo') {
        choice.particles?.pop();
        choice.weapons?.pop();
        choice.devices?.pop();
    }
    if (operation === 'clear')
        choice = {};
    if (operation === 'weapon')
        choice.weapons = [...(choice.weapons ?? []), Number(value)];
    if (operation === 'device') {
        const [id, ...mode] = String(value).split(':');
        choice.devices = [...(choice.devices ?? []), { id: Number(id), skill: mode.join(':') }];
    }
    if (operation === 'mode')
        choice.mode = value;
    if (operation === 'target')
        choice.target = value;
    if (operation === 'donor')
        choice.donor = Number(value);
    const selected = {};
    for (const particle of choice.particles ?? [])
        selected[particle] = (selected[particle] ?? 0) + 1;
    if (operation === 'particle')
        for (const [particle, count] of Object.entries(selected))
            if (count > (inventory[particle] ?? 0))
                throw new HiddenBattleError(`${hiddenParticles.find(p => p.code === particle)?.name ?? particle}不足：本次需要${count}个，背包现有${inventory[particle] ?? 0}个。`);
    const next = Number(draft?.revision ?? 0) + 1;
    await connection.execute('INSERT INTO player_hidden_action_drafts (character_id,battle_key,turn_no,skill_code,draft_json,revision) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE skill_code=VALUES(skill_code),draft_json=VALUES(draft_json),revision=VALUES(revision),submitted=0', [character.id, key, turn, code, JSON.stringify(choice), next]);
    const ctx = await hiddenBattleContext(connection, Number(character.id), String(battle.id), kind);
    const [levels] = await connection.execute('SELECT specialization,level FROM player_skill_specializations WHERE character_id=? AND skill_id=?', [character.id, owned[0].id]);
    const spec = skillSpecialization({ code, tier: skill.tier, category: skill.power ? 'magic' : 'utility', power: skill.power, mana_cost: skill.mana, cooldown_turns: skill.cooldown }, Object.fromEntries(levels.map(row => [row.specialization, Number(row.level)])));
    const mix = ['hidden_mix', 'hidden_kettle'].includes(code) && (choice.particles?.length ?? 0) >= 2 ? hiddenMix(choice.particles, 'success', code === 'hidden_kettle') : undefined;
    const [linked] = await connection.execute('SELECT s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.passive_linked=1', [character.id]);
    const cooldowns = object(battle.cooldowns), mana = ruleManaCost(readRuleState(cooldowns.__rules), linked.map(row => String(row.code)), Math.ceil((mix?.mana ?? skill.mana) * spec.manaFactor), turn);
    return { code, mana, spec, catalyst: cooldowns.__hidden?.catalyst?.mode, skillId: Number(owned[0].id), choice, revision: next, battleKey: key, turn, kind, ctx: { weapons: ctx.weapons, devices: ctx.devices }, stocks: inventory, remainingStocks: Object.fromEntries(hiddenParticles.map(p => [p.code, Math.max(0, (inventory[p.code] ?? 0) - (selected[p.code] ?? 0))])) };
});
const submitHiddenDraft = async (connection, characterId, sessionId, turn, kind, code, ticket) => {
    if (!ticket || ticket.battleKey !== `${kind}:${sessionId}` || ticket.turn !== turn)
        throw new Error('请从本回合的技能面板重新确认。');
    if (hiddenSkill(code)?.resource) {
        const [battles] = kind === 'pve'
            ? await connection.execute("SELECT cm.cooldowns FROM combat_members cm JOIN combat_sessions cs ON cs.id=cm.session_id WHERE cm.character_id=? AND cs.id=? AND cs.turn_no=? AND cs.state='active' FOR UPDATE", [characterId, sessionId, turn])
            : await connection.execute("SELECT attacker_cooldowns AS cooldowns FROM player_pvp_battle_sessions WHERE attacker_character_id=? AND id=? AND turn_no=? AND state='active' FOR UPDATE", [characterId, sessionId, turn]);
        if (!battles[0])
            throw new Error('战斗或回合已变化，请重新打开技能。');
        const shortage = hiddenResourceShortage(code, object(battles[0].cooldowns));
        if (shortage)
            throw new HiddenBattleError(shortage);
    }
    const [rows] = await connection.execute('SELECT * FROM player_hidden_action_drafts WHERE character_id=? AND battle_key=? AND turn_no=? FOR UPDATE', [characterId, ticket.battleKey, turn]);
    const row = rows[0];
    if (!row || row.submitted || row.skill_code !== code || Number(row.revision) !== ticket.revision)
        throw new Error('该行动已提交或面板已过期。');
    const choice = object(row.draft_json);
    if (['hidden_mix', 'hidden_kettle'].includes(code)) {
        const mix = hiddenMix(choice.particles ?? []);
        const [stocks] = await connection.execute('SELECT i.code,p.quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? FOR UPDATE', [characterId]);
        for (const particle of hiddenParticles)
            if (mix.counts[particle.code] > Number(stocks.find(s => s.code === particle.code)?.quantity ?? 0))
                throw new HiddenBattleError(`背包内${particle.name}不足${mix.counts[particle.code]}个，请重新调整配方。`);
    }
    await connection.execute('UPDATE player_hidden_action_drafts SET submitted=1 WHERE character_id=? AND battle_key=? AND turn_no=?', [characterId, ticket.battleKey, turn]);
    return choice;
};
const saveHiddenAuto = (user, code, revision) => withTransaction(async (connection) => {
    const character = await hiddenQuestCharacter(connection, user);
    await assertCombatLoadoutMutable(connection, Number(character.id));
    const skill = hiddenSkill(code);
    if (!skill)
        throw new Error('技能不存在。');
    const [rows] = await connection.execute('SELECT * FROM player_hidden_action_drafts WHERE character_id=? AND battle_key=? AND turn_no=0 FOR UPDATE', [character.id, `setup:${skill.profession}`]);
    const draft = rows[0];
    if (!draft || draft.skill_code !== code || draft.submitted || Number(draft.revision) !== revision)
        throw new Error('自动配置面板已过期。');
    const choice = object(draft.draft_json);
    if (['hidden_mix', 'hidden_kettle'].includes(code))
        (await import('./hidden-particles.js')).validateHiddenParticles(choice.particles ?? []);
    const [configs] = await connection.execute('SELECT config_json FROM player_hidden_profession_loadouts WHERE character_id=? AND profession_code=? FOR UPDATE', [character.id, skill.profession]);
    const config = object(configs[0]?.config_json);
    config.auto ??= {};
    config.auto[code] = choice;
    await connection.execute('INSERT INTO player_hidden_profession_loadouts (character_id,profession_code,config_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE config_json=VALUES(config_json),revision=revision+1', [character.id, skill.profession, JSON.stringify(config)]);
    await connection.execute('UPDATE player_hidden_action_drafts SET submitted=1 WHERE character_id=? AND battle_key=? AND turn_no=0', [character.id, `setup:${skill.profession}`]);
    return skill.name;
});

export { hiddenBattleContext, hiddenDraft, hiddenLoadout, hiddenOwnedWeapons, initializeHiddenBattleUnits, saveHiddenAuto, submitHiddenDraft };
