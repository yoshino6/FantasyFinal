import { achievementActivity, achievementNpcState } from './achievement-hooks.js';
import { recordAchievement } from './achievement-events.js';
import { randomUUID } from 'node:crypto';
import { grantInventory, consumeInventory } from './inventory-binding.js';
import { talentDay, saveTalentData, readTalentData, talentWhole } from './talent-data.js';
import { experienceRequiredForLevel } from './constants.js';
import { talentNpcAffinity } from './talent-rewards.js';

const talentNpcLinks = { guild_counter: ['blacksmith', 'alchemy_sweetshop', 'oddworkshop', 'bookshop'], blacksmith: ['guild_counter', 'oddworkshop'], alchemy_sweetshop: ['guild_counter', 'bookshop'], oddworkshop: ['guild_counter', 'blacksmith'], bookshop: ['guild_counter', 'alchemy_sweetshop'] };
const samePoint = (actor, point) => Number(actor.current_region_id) === Number(point.region_id) && ['x', 'y', 'z'].every(axis => Number(actor[`pos_${axis}`]) === Number(point[`pos_${axis}`]));
const affinity = async (c, id, npc, amount) => { await c.execute('INSERT INTO player_npc_affinity(character_id,npc_code,affinity,daily_date,daily_interactions) VALUES (?,?,?,CURDATE(),0) ON DUPLICATE KEY UPDATE affinity=affinity+VALUES(affinity)', [id, npc, amount]); await achievementNpcState(c, id, npc, amount > 0); };
const award = async (c, actor, data, amount, kind, npc) => {
    await saveTalentData(c, Number(actor.id), data);
    await (await import('./adventure.service.js')).awardRealmExperience(c, actor, amount, { talent: { kind, npc } });
    Object.assign(data, await readTalentData(c, Number(actor.id)));
};
const talentActivityActions = ['勘察', '调查', '完成调查', '取消调查', '购买种子', '种植', '采收', '委托', '立约委托', '交付委托', '放弃委托', '引荐', '人物索引'];
const talentActivity = async (c, actor, talent, data, action, arg, value) => {
    const id = Number(actor.id), day = talentDay();
    if (action === '取消调查') {
        const job = data.jobs.find(j => j.id === arg && ['survey', 'investigation'].includes(j.kind) && j.payload.working);
        if (!job)
            throw new Error('没有这条进行中的调查。');
        data.jobs = data.jobs.filter(j => j.id !== job.id);
        await c.execute("UPDATE characters SET activity_status='active',rest_started_at=NULL WHERE id=?", [id]);
        return '已取消调查，未领取调查奖励。';
    }
    if (action === '勘察') {
        const [resources] = await c.execute('SELECT rs.id,rs.pos_x,rs.pos_y,rs.pos_z,i.name,i.item_category FROM resource_spawns rs JOIN item_definitions i ON i.id=rs.item_id WHERE rs.region_id=? AND rs.mined_at IS NULL ORDER BY ABS(rs.pos_x-?)+ABS(rs.pos_y-?)+ABS(rs.pos_z-?),rs.id LIMIT 5', [actor.current_region_id, actor.pos_x, actor.pos_y, actor.pos_z]);
        const duration = talent.number === 'B02' ? 24 : 60;
        if (data.jobs.some(j => j.payload.working))
            throw new Error('请先结束当前调查或复盘。');
        const job = { id: randomUUID(), kind: 'survey', created: Date.now(), ready: Date.now() + duration * 1000, payload: { working: true, region_id: actor.current_region_id, pos_x: actor.pos_x, pos_y: actor.pos_y, pos_z: actor.pos_z, resources } };
        data.jobs.push(job);
        await c.execute("UPDATE characters SET activity_status='resting',rest_started_at=NULL WHERE id=?", [id]);
        return `开始勘察，${duration}秒后用“完成调查”领取记录。${talent.number === 'B02' ? '\n' + resources.map(r => `${r.name}｜${r.item_category}｜方向(${Number(r.pos_x) - Number(actor.pos_x)},${Number(r.pos_y) - Number(actor.pos_y)},${r.pos_z})`).join('\n') : ''}`;
    }
    if (action === '调查') {
        const [objects] = await c.execute('SELECT o.*,r.danger_level FROM map_special_objects o JOIN map_regions r ON r.id=o.region_id WHERE o.region_id=? AND o.pos_x=? AND o.pos_y=? AND o.pos_z=?', [actor.current_region_id, actor.pos_x, actor.pos_y, actor.pos_z]);
        const site = objects.find(o => o.code === 'mist_stone');
        if (!site)
            throw new Error('请前往幽暗密林的雾石调查点。');
        const mode = arg === '机关' ? 'mechanism' : 'ruins', key = `site:${day}:${site.id}:${mode}`;
        if (data.flags[key])
            throw new Error('今日这处调查已完成，需等下一次公开补充。');
        if (data.jobs.some(j => j.payload.working))
            throw new Error('请先结束当前调查或复盘。');
        const duration = Number(data.flags[`ash:${site.region_id}`] ?? 0) > Date.now() && talent.number === 'B08' ? 30 : 120;
        data.jobs.push({ id: randomUUID(), kind: 'investigation', created: Date.now(), ready: Date.now() + duration * 1000, payload: { working: true, ...Object.fromEntries(['id', 'region_id', 'pos_x', 'pos_y', 'pos_z', 'danger_level'].map(k => [k, site[k]])), key, mode } });
        await c.execute("UPDATE characters SET activity_status='resting',rest_started_at=NULL WHERE id=?", [id]);
        return `雾石调查：${duration}秒。${mode === 'mechanism' ? `每次成功推进${talent.number === 'B09' ? 3 : 1}/3，进度完成后才有奖励；刻痕公开线索：湿润面、缺口面、完整面。` : '搜寻一次普通废料。'}${talent.number === 'B06' ? ' 陷阱类型：冰冷环境伤害。' : ' 石缝中有寒雾渗出。'}`;
    }
    if (action === '完成调查') {
        const job = data.jobs.find(j => j.id === arg && ['survey', 'investigation'].includes(j.kind));
        if (!job || !job.payload.working || job.ready > Date.now())
            throw new Error('调查尚未完成或已经取消。');
        if (!samePoint(actor, job.payload))
            throw new Error('已经离开调查点，请取消后重新调查。');
        data.jobs = data.jobs.filter(j => j.id !== job.id);
        await c.execute("UPDATE characters SET activity_status='active',rest_started_at=NULL WHERE id=?", [id]);
        if (job.kind === 'survey') {
            const ids = job.payload.resources.map((r) => Number(r.id));
            const [live] = ids.length ? await c.execute(`SELECT id FROM resource_spawns WHERE id IN (${ids.map(() => '?').join(',')}) AND mined_at IS NULL`, ids) : [[]];
            const available = new Set(live.map(r => Number(r.id)));
            const routes = new Set(data.flags.routes ?? []), from = `${actor.current_region_id}:${actor.pos_x}:${actor.pos_y}:${actor.pos_z}`;
            for (const r of job.payload.resources) {
                const to = `${actor.current_region_id}:${r.pos_x}:${r.pos_y}:${r.pos_z}`;
                routes.add(`${from}>${to}`);
                routes.add(`${to}>${from}`);
            }
            data.flags.routes = [...routes].slice(-100);
            return job.payload.resources.map((r) => `${r.name} #${r.id}｜(${r.pos_x},${r.pos_y},${r.pos_z})${!available.has(Number(r.id)) ? '｜已采尽或移除' : talent.number === 'B07' ? '｜可采1次' : ''}`).join('\n') || '附近没有尚可采集的公开资源。';
        }
        if (Math.random() < .25 && Number(job.payload.danger_level) > 0) {
            const raw = Math.max(1, Math.ceil(Number(actor.hp_max) * .1)), loss = Math.min(Math.max(0, Number(actor.current_hp) - 1), Math.ceil(raw * (talent.number === 'B06' ? .4 : 1)));
            await c.execute('UPDATE characters SET current_hp=current_hp-? WHERE id=?', [loss, id]);
            actor.current_hp -= loss;
            if (loss > 0 && talent.number === 'B08')
                data.flags[`ash:${actor.current_region_id}`] = Date.now() + 1800000;
        }
        if (job.payload.mode === 'mechanism') {
            const key = `progress:${job.payload.id}`;
            if (Math.random() >= .75)
                return `机关没有松动。${talent.number === 'B09' ? '已排除：缺口面无法承接完整雾纹。' : '可以继续调查积累进度。'}`;
            data.counters[key] = Math.min(3, (data.counters[key] ?? 0) + (talent.number === 'B09' ? 3 : 1));
            if (data.counters[key] < 3)
                return `机关进度 ${data.counters[key]}/3。`;
            data.counters[key] = 0;
        }
        data.flags[job.payload.key] = true;
        const [items] = await c.execute("SELECT id,name FROM item_definitions WHERE code='blood_residue' AND rarity='普通'");
        if (!items[0])
            throw new Error('搜寻产物尚未初始化。');
        const quantity = job.payload.mode === 'ruins' && talent.number === 'B05' ? 3 : 1;
        await grantInventory(c, id, Number(items[0].id), { unbound: quantity, personal: 0, trade: 0 });
        await award(c, actor, data, Math.max(1, Math.floor(experienceRequiredForLevel(Math.min(10, Number(actor.level))) * .01)), 'exploration');
        return `完成调查，获得${items[0].name}×${quantity}。该处普通搜寻明日补充。`;
    }
    if (action === '购买种子') {
        const [npcs] = await c.execute("SELECT 1 FROM map_npcs WHERE code='guild_counter' AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=?", [actor.current_region_id, actor.pos_x, actor.pos_y, actor.pos_z]);
        if (!npcs.length)
            throw new Error('请前往百纳镇公会购买活木种子与水肥包。');
        const [items] = await c.execute("SELECT id FROM item_definitions WHERE code='talent_living_seed'");
        if (!items[0])
            throw new Error('种子尚未初始化。');
        const [paid] = await c.execute('UPDATE characters SET copper_coins=copper_coins-20 WHERE id=? AND copper_coins>=20', [id]);
        if (!paid.affectedRows)
            throw new Error('需要20铜币，包含一份种子和水肥。');
        await grantInventory(c, id, Number(items[0].id), { unbound: 1, personal: 0, trade: 0 });
        return '购买活木种植包×1。';
    }
    if (action === '种植' || action === '采收') {
        const [homes] = await c.execute("SELECT h.id,h.house_level FROM player_homes h JOIN player_home_visits v ON v.home_id=h.id AND v.character_id=h.character_id WHERE h.character_id=? AND h.status='active'", [id]);
        if (!homes[0])
            throw new Error('请回到自己的家园，在花圃操作。');
        if (action === '种植') {
            if (data.jobs.filter(j => j.kind === 'crop').length >= Math.max(1, Number(homes[0].house_level)))
                throw new Error('当前花圃已满，每级家园提供一块种植地。');
            const [items] = await c.execute("SELECT id FROM item_definitions WHERE code='talent_living_seed'");
            if (!items[0])
                throw new Error('种子尚未初始化。');
            await consumeInventory(c, id, Number(items[0].id), 1);
            const seconds = talent.number === 'E10' ? 8 * 3600 : 24 * 3600;
            data.jobs.push({ id: randomUUID(), kind: 'crop', created: Date.now(), ready: Date.now() + seconds * 1000, payload: { homeId: Number(homes[0].id) } });
            recordAchievement(c, id, ['ACH_H09']);
            return `已用种子与水肥播种，${seconds / 3600}小时后成熟。`;
        }
        const job = data.jobs.find(j => j.id === arg && j.kind === 'crop' && Number(j.payload.homeId) === Number(homes[0].id));
        if (!job || job.ready > Date.now())
            throw new Error('作物尚未成熟或不在这座家园。');
        const [items] = await c.execute("SELECT id,name FROM item_definitions WHERE code='living_wood'");
        if (!items[0])
            throw new Error('作物尚未初始化。');
        await grantInventory(c, id, Number(items[0].id), { unbound: 3, trade: 0, personal: 0 });
        data.jobs = data.jobs.filter(j => j.id !== job.id);
        recordAchievement(c, id, [{ metric: 'ACH_H10' }, { metric: 'ACH_H11', distinct: 'living_wood' }], 'crop:' + job.id);
        achievementActivity(c, id);
        return `采收${items[0].name}×3，土地已腾空。`;
    }
    if (action === '引荐') {
        if (talent.number !== 'D06' || !talentNpcLinks[arg]?.includes(value))
            throw new Error('只能沿已公开的人物关系引荐。');
        const [npcs] = await c.execute('SELECT * FROM map_npcs WHERE code IN (?,?)', [arg, value]);
        if (!npcs.some(n => n.code === arg && samePoint(actor, n)) || !npcs.some(n => n.code === value))
            throw new Error('请拜访引荐人，目标须已在公开关系网登场。');
        const [relations] = await c.execute('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [id, arg]);
        if (Number(relations[0]?.affinity ?? 0) < 200)
            throw new Error('引荐人好感需达到意气相投（200）。');
        const [targetRelations] = await c.execute('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [id, value]);
        if (Number(targetRelations[0]?.affinity ?? 0) < 0 || data.flags[`introduced:${value}`])
            throw new Error('敌对关系或已经接受过引荐，无法再次引荐。');
        data.flags[`introduced:${value}`] = true;
        data.counters[`introduced:${value}`] = 5;
        return '引荐信已记入关系档案，目标前5次有效正向好感获得加成。';
    }
    if (action === '人物索引') {
        if (talent.number !== 'D09' || Number(data.counters[`reputation:${actor.current_region_id}`] ?? 0) < 100)
            throw new Error('该地公开声望达到100后开放人物索引。');
        const [npcs] = await c.execute('SELECT name,pos_x,pos_y,pos_z FROM map_npcs WHERE region_id=? ORDER BY id', [actor.current_region_id]);
        return npcs.map(n => `${n.name}（${n.pos_x},${n.pos_y},${n.pos_z}）`).join('\n');
    }
    if (['委托', '立约委托', '交付委托', '放弃委托'].includes(action)) {
        const existing = data.jobs.find(j => j.kind === 'npcQuest');
        if (action === '委托' || action === '立约委托') {
            if (existing)
                throw new Error('请先交付或放弃当前委托。');
            if (!talentNpcLinks[arg])
                throw new Error('这名NPC暂时没有公开材料委托。');
            const [npcs] = await c.execute('SELECT * FROM map_npcs WHERE code=?', [arg]);
            const npc = npcs.find(n => samePoint(actor, n));
            if (!npc)
                throw new Error('请前往委托人所在坐标。');
            if (data.flags[`quest:${day}:${arg}`])
                throw new Error('该NPC今日委托已承接过。');
            const [items] = await c.execute("SELECT i.id,i.name,COALESCE(pi.quantity,0) AS quantity FROM item_definitions i LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE i.code=?", [id, arg === 'alchemy_sweetshop' ? 'living_wood' : 'blood_residue']);
            const item = items[0];
            if (!item)
                throw new Error('委托材料尚未初始化。');
            const needed = 3, pledge = action === '立约委托';
            if (pledge && (talent.number !== 'D04' || Number(item.quantity) >= needed))
                throw new Error('立约需要言出有契，且承接时尚未备齐材料。');
            data.flags[`quest:${day}:${arg}`] = true;
            data.jobs.push({ id: randomUUID(), kind: 'npcQuest', created: Date.now(), ready: Date.now() + 2 * 3600000, payload: { npc: arg, regionId: npc.region_id, itemId: item.id, quantity: needed, affinity: 10, reputation: 10, experience: Math.max(1, Math.floor(experienceRequiredForLevel(Math.min(10, Number(actor.level))) * .02)), pledge } });
            return `委托：交付${item.name}×3。基础好感+10、地区声望+10。期限2小时。${pledge ? '已立约：按时完成好感与声望×4；逾期或放弃扣5好感。' : ''}`;
        }
        if (!existing)
            throw new Error('没有当前委托。');
        const job = existing, p = job.payload;
        if (action === '放弃委托' || job.ready < Date.now()) {
            data.jobs = data.jobs.filter(j => j.id !== job.id);
            if (p.pledge)
                await affinity(c, id, String(p.npc), -Math.ceil(Number(p.affinity) * .5));
            return p.pledge ? '契约未能履行，好感-5。' : '委托已结束。';
        }
        const [npcs] = await c.execute('SELECT * FROM map_npcs WHERE code=?', [p.npc]);
        if (!npcs.some(n => samePoint(actor, n)))
            throw new Error('请回到委托人所在坐标交付。');
        await consumeInventory(c, id, Number(p.itemId), Number(p.quantity));
        data.jobs = data.jobs.filter(j => j.id !== job.id);
        await saveTalentData(c, id, data);
        const gain = await talentNpcAffinity(c, id, String(p.npc), Number(p.affinity) * (p.pledge ? 4 : 1), 'quest');
        Object.assign(data, await readTalentData(c, id));
        await affinity(c, id, String(p.npc), gain);
        const reputation = talentWhole(data, `reputationRemainder:${p.regionId}`, Number(p.reputation), p.pledge ? 4 : talent.number === 'D09' ? 3.5 : 1);
        data.counters[`reputation:${p.regionId}`] = (data.counters[`reputation:${p.regionId}`] ?? 0) + reputation;
        recordAchievement(c, id, ['ACH_F23', 'ACH_F24'], 'npc-quest:' + job.id);
        achievementActivity(c, id);
        await award(c, actor, data, Number(p.experience), 'social', String(p.npc));
        return `委托完成：好感+${gain}，地区声望+${reputation}。`;
    }
    throw new Error('未知活动。');
};

export { talentActivity, talentActivityActions, talentNpcLinks };
