import { recordAchievement } from './achievement-events.js';
import { achievementActivity } from './achievement-hooks.js';
import { withTransaction, getPool } from '../database/pool.js';
import { openingCharacter, grantOpeningItem } from './opening.service.js';
import { assertOpeningFree, openingSafeHubs } from './opening-state.js';
import { openingHubs } from './opening-world.config.js';
import { lamplightNode, lamplightPublicText, lamplightPrivateEcho, nextLamplightState, lamplightHubNames, lamplightNodes } from './lamplight.config.js';
import { lamplightWork, lamplightWorkResult } from './lamplight-work.js';
import { lamplightPeople } from './lamplight-people.js';
import { openingRouteByCode } from './opening-content.js';
import { experienceRequiredForLevel } from './constants.js';
import { pointBelongsToRegion, validWorldSitePoint } from './world-site-geometry.js';

const lampJson = (value) => typeof value === 'string' ? JSON.parse(value) : value ?? {};
const load = async (c, id) => { const [rows] = await c.execute('SELECT * FROM player_lamplight_progress WHERE character_id=? FOR UPDATE', [id]); return rows[0]; };
const legacyProgress = async (c, id) => {
    const [rows] = await c.execute(`SELECT COALESCE((SELECT stage FROM player_goblin_king_quest WHERE character_id=?),0) AS goblin,
    COALESCE((SELECT stage FROM player_main_quest_progress WHERE character_id=? AND quest_code='girl_gratitude'),0) AS gratitude,
    COALESCE((SELECT stage FROM player_main_quest_progress WHERE character_id=? AND quest_code='evolution_barrier'),0) AS evolution`, [id, id, id]);
    return rows[0];
};
const initialize = async (c, character) => {
    const old = await load(c, Number(character.id));
    if (old)
        return old;
    await assertOpeningFree(c, Number(character.id));
    if (!character.adventurer_registered || !character.profession_code || Number(character.level) < 5)
        throw Error('先完成公会登记、选择职业并达到 Lv.5，再领取灯火所至主线。');
    const [stories] = await c.execute("SELECT * FROM player_opening_stories WHERE character_id=? AND state='completed'", [character.id]);
    const story = stories[0];
    const safe = await openingSafeHubs(c);
    if (!safe.length)
        throw Error('当前没有可承接案卷的安全公会。');
    const hub = story?.destination_code ?? safe.find(h => Number(h.id) === Number(character.current_region_id))?.code ?? 'world_tree';
    const progress = await legacyProgress(c, Number(character.id));
    let phase = 'private', index = 0;
    if (Number(progress.evolution) >= 1) {
        phase = 'join';
        index = Number(progress.evolution) >= 7 ? 4 : 2;
    }
    else if (Number(progress.gratitude) >= 6) {
        phase = 'join';
    }
    else if (Number(progress.goblin) > 0) {
        phase = 'local';
        index = 5;
    }
    await c.execute(`INSERT INTO player_lamplight_progress (character_id,origin_route,origin_branch,story_version,local_hub,phase,node_index,flags_json) VALUES (?,?,?,?,?,?,?,?)`, [character.id, story?.route_code ?? 'LEGACY', story?.branch_code ?? '', story?.story_version ?? 0, Number(progress.goblin) > 0 && phase === 'local' ? 'baina_town' : hub, phase, index, JSON.stringify({ homeHub: hub, initialLegacy: progress, choices: {} })]);
    return (await load(c, Number(character.id)));
};
const assertLamplightIdle = async (c, id) => {
    await assertOpeningFree(c, id);
    const [rows] = await c.execute(`SELECT '战斗' AS reason FROM combat_sessions s JOIN combat_members m ON m.session_id=s.id WHERE m.character_id=? AND s.state='active'
    UNION ALL SELECT '玩家对战' FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?)
    UNION ALL SELECT '移动' FROM player_travels WHERE character_id=?
    UNION ALL SELECT '开采' FROM player_resource_mining WHERE character_id=?
    UNION ALL SELECT '交涉' FROM negotiation_sessions s JOIN negotiation_participants p ON p.session_id=s.id WHERE p.character_id=? AND s.state='active'
    UNION ALL SELECT '家园内活动（请先出门）' FROM player_home_visits WHERE character_id=? LIMIT 1`, [id, id, id, id, id, id, id]);
    if (rows.length)
        throw Error(`先结束${rows[0].reason}，再处理主线。`);
};
const place = async (c, state, node, point = 0) => {
    const requested = node.place === 'origin' ? state.local_hub : node.place;
    const hub = openingHubs[requested];
    const library = /^JN-[345]$/.test(node.code ?? '');
    const [rows] = await c.execute('SELECT r.id,r.code,n.pos_x,n.pos_y,n.pos_z FROM map_regions r JOIN map_npcs n ON n.region_id=r.id WHERE r.code=? AND r.is_enabled=1 AND r.is_owner_only=0 AND r.is_spawn_enabled=0 AND n.code=?', [requested, library ? 'world_library' : hub?.guild ?? `${requested}_station`]);
    let row = rows[0];
    if (!row && library)
        throw Error('世界图书馆暂未开放。请保留研究记录，待恢复后继续。');
    if (!row && hub) {
        const safe = await openingSafeHubs(c);
        row = safe.find(h => h.code === 'world_tree') ?? safe.find(h => h.code === 'baina_town') ?? safe[0];
    }
    if (!row)
        throw Error('本章接驳地点暂未开放。进度已保留，可先返回安全公会进行其他活动。');
    const [areas] = await c.execute('SELECT a.*,r.danger_level FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id');
    if (!pointBelongsToRegion(areas, Number(row.id), { x: Number(row.pos_x), y: Number(row.pos_y), z: Number(row.pos_z) })) {
        if (library || !hub)
            throw Error('接驳建筑位置暂不可用，调查记录保留。');
        const safe = await openingSafeHubs(c);
        row = safe[0];
        if (!row)
            throw Error('暂时没有可用的安全接驳点。');
    }
    const position = validWorldSitePoint(areas, Number(row.id), { x: Number(row.pos_x) + point, y: Number(row.pos_y), z: Number(row.pos_z) });
    return { id: Number(row.id), code: String(row.code), ...position, remote: String(row.code) !== requested };
};
const at = (character, p) => Number(character.current_region_id) === Number(p.id) && Number(character.pos_x) === p.x && Number(character.pos_y) === p.y && Number(character.pos_z) === p.z;
const assertLamplightBoarding = async (c, regionId) => {
    const [boarding] = await c.execute('SELECT 1 FROM map_regions WHERE id=? AND is_spawn_enabled=0 AND is_owner_only=0', [regionId]);
    if (!boarding.length)
        throw Error('公务接驳从安全区出发，请先结束野外行程并返回安全区。');
};
const move = async (c, character, p) => {
    await assertLamplightBoarding(c, Number(character.current_region_id));
    await c.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?', [p.id, p.x, p.y, p.z, character.id]);
    await c.execute('DELETE FROM player_opening_visits WHERE character_id=?', [character.id]);
    await grantOpeningItem(c, Number(character.id), `map_${p.code}`);
    Object.assign(character, { current_region_id: p.id, pos_x: p.x, pos_y: p.y, pos_z: p.z });
};
const getGate = async (c, character, state, node) => {
    const flags = lampJson(state.flags_json), old = await legacyProgress(c, Number(character.id));
    if (node.gate === 'goblin' && Number(old.goblin) < 11)
        return '梨子喵还没有回来。莫妮卡将最后一次报平安的时间交给你，请你接着调查她的去向。';
    if (node.gate === 'gratitude' && Number(old.gratitude) < 6)
        return '先完成梨子喵的「少女的谢意」。这次同行不会重发已有礼物。';
    if (node.gate === 'library' && Number(old.evolution) < 7 && Number(flags.libraryRoom ?? 0) < 5)
        return '依次调查世界图书馆的大厅、阅览室、资料室、休息室与无尽回廊。';
    if (node.gate === 'research' && Number(old.evolution) < 7 && !flags.research)
        return '噶需要一次实际研究验证。已通过原试炼者可直接提交记录。';
    if (node.gate === 'boss' && Number(flags.bossStage ?? 0) < 2)
        return '先击败诺维恩的两阶段中枢防卫，再继续关停改线核心。';
    if (Number(character.level) < node.minLevel)
        return `本项要求 Lv.${node.minLevel} 或同等实力，目前 Lv.${character.level}。可先做当地普通委托积累。`;
    return '';
};
const lamplightInvestigationStep = (seen, atTarget) => {
    if (!(seen & 1))
        return atTarget ? { label: '调查现场', action: 'scene' } : { label: '前往现场', action: 'go_scene' };
    if (!(seen & 2))
        return atTarget ? { label: '询问见证人', action: 'record' } : { label: '前往联络处', action: 'go_record' };
    return null;
};
const view = async (c, character, state) => {
    const flags = lampJson(state.flags_json);
    if (state.phase === 'completed')
        return { title: '灯火所至·把门打开以后', npc: lamplightHubNames[(flags.endingHub ?? state.local_hub)], text: flags.ending ?? '你回到最初的安全公会。柜台前又来了陌生的旅人，接待员给他留了一把稳当的椅子。', revision: state.revision, complete: true, buttons: [{ label: '返回最初公会', action: 'return' }, { label: '回看旅程', command: '/灯火回忆' }, { label: '普通委托', command: '/任务分类 委托' }] };
    const node = lamplightNode(state);
    if (!node)
        throw Error('这份主线的版本暂不可读取，请保留当前进度。');
    const gate = await getGate(c, character, state, node), seen = Number(flags.seen ?? 0), plan = flags.plan;
    const buttons = [];
    if (gate) {
        if (node.gate === 'goblin' || node.gate === 'gratitude')
            buttons.push({ label: '继续原有主线', command: '/灯火旧程' });
        else if (node.gate === 'barrier')
            buttons.push({ label: '向当地公会请教突破', action: 'barrier_consult' }, { label: '接受粉尘调查遭遇', action: 'barrier_challenge' }, { label: '请晴儿核验粉尘', action: 'barrier_report' }, { label: '感悟天空粉尘', command: '/窥探天空粉尘' });
        else if (node.gate === 'library')
            buttons.push({ label: '前往图书馆', action: 'library_go' }, { label: '调查当前房间', action: 'library_read' });
        else if (node.gate === 'research') {
            if (Number(flags.calibration ?? 0) === 0)
                buttons.push({ label: '开始设施校验', action: 'research_start' }, { label: '接受研究对抗', action: 'challenge' });
            else
                for (const n of [1, 2, 3])
                    buttons.push({ label: Number(flags.calibration) === 1 ? `源图端保留 ${n} 条记录` : `接收端保留 ${n} 路维生`, action: `research_${n}` });
            buttons.push({ label: '原有成长试炼', command: '/灯火成长' });
        }
        else if (node.gate === 'boss')
            buttons.push({ label: '挑战中枢防卫', action: 'challenge' }, { label: '返回战斗', command: '/战斗' });
        if (Number(character.level) < node.minLevel)
            buttons.push({ label: '普通委托', command: '/任务分类 委托' }, { label: '查看天赋成长', command: '/天赋' }, { label: '成长与突破指引', command: '/灯火成长' });
    }
    else if (!plan) {
        const target = seen & 1 ? 'record' : 'scene';
        const point = await place(c, state, node, target === 'scene' ? 1 : 0);
        const step = lamplightInvestigationStep(seen, at(character, point));
        if (step)
            buttons.push(step);
        else
            node.choices.forEach((label, i) => buttons.push({ label, action: `plan_${'ABC'[i]}` }));
    }
    else {
        const task = lamplightWork(node);
        const work = Number(flags.work ?? 0);
        if (work === 0)
            task.test.forEach((label, i) => buttons.push({ label, action: `work_${i}` }));
        else if (work === 1)
            buttons.push({ label: task.steps[1], action: 'verify' });
        else
            buttons.push({ label: '提交处理结果', action: 'complete' });
        buttons.push({ label: '返回交接点', action: 'go_record' });
    }
    buttons.push({ label: '返回安全公会', action: 'return' });
    const [active] = await c.execute("SELECT 1 FROM combat_sessions s JOIN combat_members m ON m.session_id=s.id WHERE m.character_id=? AND s.state='active' LIMIT 1", [character.id]);
    if (active.length)
        buttons.splice(0, buttons.length, { label: '返回实际战斗', command: '/战斗' }, { label: '查看主线', command: '/灯火主线' });
    const intro = lamplightPublicText(node.intro, state);
    let npc = node.npc, text = `${flags.message ?? intro}${gate ? '\n\n' + gate : ''}`;
    if (node.code.startsWith('WM05-')) {
        const [world] = await c.query('SELECT current_goddess FROM opening_world WHERE id=1');
        npc = world[0]?.current_goddess === 'eris' ? '厄里斯' : '阿库娅';
        if (!flags.message)
            text += '\n\n' + (npc === '厄里斯' ? '厄里斯将茶杯移开，认真翻到你指出的那一页。“请继续，我在听。”' : '阿库娅抱起手臂，刚想说这张图多么完美，又瞥见地面的断桥拓样。“……先说好，是地图出了问题！好啦，我会听完的。”');
    }
    return { title: `灯火所至·${node.title}`, npc, text, revision: Number(state.revision), buttons };
};
const lamplightView = (user) => withTransaction(async (c) => { const character = await openingCharacter(c, user, true); return view(c, character, await initialize(c, character)); });
const lamplightAction = (user, revision, action) => withTransaction(async (c) => {
    if (!Number.isSafeInteger(revision) || revision < 0 || !/^(?:go_scene|go_record|scene|record|plan_[ABC]|work_[012]|verify|complete|return|library_go|library_read|growth_library|challenge|research_(?:start|[123])|barrier_consult|barrier_challenge|barrier_report)$/.test(action))
        throw Error('请使用当前主线页上的操作。');
    const character = await openingCharacter(c, user, true), id = Number(character.id), state = await initialize(c, character);
    const [prior] = await c.execute('SELECT action_key,result_json FROM player_lamplight_actions WHERE character_id=? AND revision=?', [id, revision]);
    if (prior[0])
        return prior[0].action_key === action ? lampJson(prior[0].result_json) : view(c, character, state);
    if (Number(state.revision) !== revision)
        return view(c, character, state);
    await assertLamplightIdle(c, id);
    if (Number(character.current_hp) <= 0 || character.activity_status !== 'active')
        throw Error('请先恢复正常行动状态。');
    const node = lamplightNode(state), flags = lampJson(state.flags_json);
    delete flags.message;
    if (action === 'return') {
        const p = await place(c, state, { place: flags.homeHub ?? 'origin' });
        await move(c, character, p);
        flags.message = `接驳员核对你的回程记录，将你送回${openingHubs[p.code]?.name ?? '安全公会'}。主线调查进度仍保留。`;
    }
    else if (state.phase === 'completed')
        throw Error('这段旅程已经结清，回忆不会重复发奖。');
    else if (action === 'growth_library') {
        if (!['join', 'world'].includes(state.phase) || state.phase === 'join' && state.node_index < 3)
            throw Error('先取得联合调查的图书馆研究资格。');
        const [places] = await c.execute("SELECT n.region_id,n.pos_x,n.pos_y,n.pos_z FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE n.code='world_library' AND r.is_enabled=1 AND r.is_owner_only=0");
        const p = places[0];
        if (!p)
            throw Error('世界图书馆暂未开放，调查记录保留。');
        await move(c, character, { id: Number(p.region_id), code: 'world_tree', x: Number(p.pos_x), y: Number(p.pos_y), z: Number(p.pos_z), remote: false });
        const talent = await (await import('./talent-data.js')).ownedTalent(c, id);
        if (talent?.group !== '？？？' && Number(character.realm_stage) === 2 && Number(character.level) === 20 && Number(character.experience) >= experienceRequiredForLevel(20) && Number(flags.libraryRoom ?? 0) >= 5) {
            await c.execute("INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,'evolution_barrier',5) ON DUPLICATE KEY UPDATE stage=GREATEST(stage,5)", [id]);
        }
        flags.message = '你来到世界图书馆。已经查清的房间线索仍保留；经验积累足够以后，可通过原有研究室入口接受噶的正式试炼。';
    }
    else if (action === 'library_go' || action === 'library_read') {
        await (await import('./lamplight-library.service.js')).lamplightLibraryAction(c, character, state, flags, action);
    }
    else if (action.startsWith('barrier_')) {
        if (node.gate !== 'barrier' || Number(character.level) < 10)
            throw Error('请先推进到当地公会的第一道成长门槛。');
        const talent = await (await import('./talent-data.js')).ownedTalent(c, id);
        if (talent?.group === '？？？')
            throw Error('这项天赋采用自己的晋阶方式，请从天赋入口继续成长。');
        if (Number(character.realm_stage) !== 1 || Number(character.experience) < experienceRequiredForLevel(10))
            throw Error('普通突破需要初心境界达到 Lv.10 并积累满当前经验。');
        const p = await place(c, state, { place: 'origin' });
        if (!at(character, p))
            await move(c, character, p);
        if (action === 'barrier_consult') {
            await c.execute("INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,'realm_barrier',2) ON DUPLICATE KEY UPDATE stage=GREATEST(stage,2)", [id]);
            flags.barrierConsulted = true;
            flags.message = '当地公会通过联络魔石向晴儿核对了你的情况。她说明天空粉尘与幽影狼王的联系，值守安排了有接应的适级调查，提醒你取得粉尘后先回来核验。';
        }
        else if (action === 'barrier_challenge') {
            if (!flags.barrierConsulted)
                throw Error('先听完公会与晴儿的说明，再参加调查。');
            if (flags.barrierWon)
                throw Error('这次粉尘调查已完成，请携现有粉尘继续请教。');
            await (await import('./lamplight-battle.service.js')).startLamplightBattle(c, character, node, 0);
            flags.message = '调查遭遇已建立。请使用战斗面板完成挑战，结果由实际胜负确认。';
        }
        else {
            if (!flags.barrierConsulted)
                throw Error('先请公会联络晴儿。');
            const [dust] = await c.execute("SELECT 1 FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code='sky_dust' AND p.quantity>0", [id]);
            if (!dust.length)
                throw Error('请先取得天空粉尘。');
            await c.execute("INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,'realm_barrier',4) ON DUPLICATE KEY UPDATE stage=GREATEST(stage,4)", [id]);
            flags.message = '晴儿通过公会核验粉尘，逐项说明感知与积累的变化。你已完成请教，可依照原规则感悟天空粉尘。';
        }
    }
    else if (action.startsWith('research_')) {
        if (node.gate !== 'research' || Number(character.level) < 20 || flags.research)
            throw Error('当前没有待校验的研究设施。');
        const p = await place(c, state, node);
        if (!at(character, p)) {
            if (action !== 'research_start')
                throw Error('请先回到研究联络处。');
            await move(c, character, p);
        }
        const step = Number(flags.calibration ?? 0);
        if (action === 'research_start') {
            if (step)
                throw Error('校验已经开始，请按当前读数继续。');
            flags.calibration = 1;
            flags.message = '噶将三份来源不同的样本接入源图端：原图记录、实地观察、接收端回讯。三个样本各占一条独立记录，先核对源图端应保留的记录数量。';
        }
        else if (step === 1 && action === 'research_3') {
            flags.calibration = 2;
            flags.message = '源图端的三条独立记录一致。接收端有供暖、返程、强制改线三路；试验要求隔离强制改线，保留供暖与返程。请确认必须保留几路。';
        }
        else if (step === 2 && action === 'research_2') {
            flags.calibration = 3;
            flags.research = true;
            flags.message = '你保留供暖与返程两路，单独隔离强制改线。噶检查实际回讯与试验日志，确认研究验证完成。进化之种仍须依照原有成长试炼取得。';
        }
        else
            throw Error('设置与当前样本或回讯不符，装置保持隔离，核验记录保留。请重看当前读数。');
    }
    else if (action === 'challenge') {
        if (!['research', 'boss'].includes(node.gate ?? '') || Number(character.level) < node.minLevel || node.gate === 'boss' && Number(flags.bossStage ?? 0) >= 2 || node.gate === 'research' && flags.research)
            throw Error('眼前没有可接受的研究或中枢挑战。');
        const p = await place(c, state, node);
        if (!at(character, p))
            await move(c, character, p);
        await (await import('./lamplight-battle.service.js')).startLamplightBattle(c, character, node, Number(flags.bossStage ?? 0));
        flags.message = '你已进入本次对抗。请使用战斗面板行动，胜负由实际战斗结算；逃离或战败后可从本项重试。';
    }
    else {
        const gate = await getGate(c, character, state, node);
        if (gate)
            throw Error(gate);
        const p = await place(c, state, node, action.includes('scene') ? 1 : 0);
        if (action === 'go_scene' || action === 'go_record') {
            await move(c, character, p);
            flags.message = p.remote ? '原驻地暂不接待，联络员在开放公会接收函询。原调查与人物关系保持不变。' : action === 'go_scene' ? '你沿已经核验的通道抵达调查现场。先观察，再动手。' : '你来到联络处，见证人和待核记录已经准备好。';
        }
        else {
            if (!at(character, p))
                throw Error('先前往本项对应的现场或联络处，再进行操作。');
            if (action === 'scene' || action === 'record') {
                flags.seen = Number(flags.seen ?? 0) | (action === 'scene' ? 1 : 2);
                flags.message = lamplightPublicText(node.findings[action === 'scene' ? 0 : 1], state) || '你逐项记录眼前可确认的事实，将不确定的部分留待进一步核验。';
                if (node.code === 'WM07-1' && action === 'record') {
                    flags.echoRead = true;
                    flags.message += '\n\n' + lamplightPrivateEcho(state);
                }
                if (node.code === 'WM04-1' && state.origin_route === 'F02')
                    flags.message += '\n\n' + (state.origin_branch === 'B' ? '瑟芙菈认出当初救过她的人，亲自说明约见安排。旧邀请的记录仍在，今天的公务登记照常核验。' : '瑟芙菈认出了你，目光停在你握过武器的手上。“我记得。今天由使节窗口核验。”她没有阻止正式调查，也没有说那件事已经过去。');
            }
            else if (action.startsWith('plan_')) {
                if (Number(flags.seen) !== 3)
                    throw Error('先完成现场观察和见证核验，不能凭空提交结论。');
                if (node.code === 'WM07-3' && !flags.echoRead)
                    throw Error('请先核对原相识的实际回复，再安排这次协助。');
                if (!node.choices['ABC'.indexOf(action.at(-1))])
                    throw Error('当前任务没有这个选择。');
                if (flags.plan)
                    throw Error('本项已经开始处理，请完成当前交接。');
                flags.plan = action.at(-1);
                flags.work = 0;
                flags.crates = lamplightWork(node).units;
                flags.message = `你决定：${node.choices['ABC'.indexOf(flags.plan)]}。\n\n现场已登记：${lamplightWork(node).object} ${flags.crates} 份。
请按现场观察与见证记录选择处理方法；这批物资或资料仅用于本次任务。`;
            }
            else if (action.startsWith('work_') || action === 'verify') {
                const task = lamplightWork(node), index = Number(flags.work ?? 0);
                if (!flags.plan || index > 1)
                    throw Error('请先选择本项处理方式。');
                if (index === 0) {
                    if (action !== `work_${task.answer}`)
                        throw Error('这项做法与现场核验记录不符。请重看线索，按实际情况处理；任务进度未丢失。');
                    if (Number(flags.crates) !== task.units)
                        throw Error('现场领用数量不一致，请保留记录核查。');
                    flags.crates = 0;
                }
                else if (action !== 'verify' || Number(flags.crates) !== 0)
                    throw Error('先完成实际领用和处理，再核对回执。');
                flags.work = index + 1;
                flags.receipts = [...(flags.receipts ?? []), task.receipts[index]];
                flags.message = lamplightWorkResult(node, task, index, flags.plan);
            }
            else if (action === 'complete') {
                if (Number(flags.seen) !== 3 || Number(flags.work) !== 2 || Number(flags.crates) !== 0 || !flags.plan)
                    throw Error('现场、见证与交接尚未完成。');
                let experience = 0;
                for (let level = node.minLevel; level <= node.endLevel; level++)
                    experience += experienceRequiredForLevel(level);
                experience = Math.floor(experience * node.experienceShare);
                const [inserted] = await c.execute('INSERT IGNORE INTO player_lamplight_rewards (character_id,node_code,copper,experience,choice_code,record_json) VALUES (?,?,?,?,?,?)', [id, node.code, node.copper, experience, flags.plan, JSON.stringify({ title: node.title, origin: state.origin_route, branch: state.origin_branch, version: state.story_version, seen: flags.seen, work: flags.work, conclusion: node.conclusion })]);
                let awardedExperience = 0;
                if (inserted.affectedRows) {
                    await c.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [node.copper, id]);
                    recordAchievement(c, id, [{ metric: 'ACH_K09', value: Number(node.copper), life: true }], `lamplight-income:${node.code}:${id}`);
                    if (experience) {
                        const gain = await (await import('./adventure.service.js')).awardRealmExperience(c, character, experience, { talent: { kind: 'quest', key: `lamplight:${node.code}` } });
                        awardedExperience = gain.experience;
                    }
                    await c.execute('UPDATE player_lamplight_rewards SET experience=? WHERE character_id=? AND node_code=?', [awardedExperience, id, node.code]);
                    await (await import('./character.service.js')).recalculateCharacterStats(c, id);
                    Object.assign(character, await openingCharacter(c, user));
                }
                flags.choices = { ...flags.choices, [node.code]: flags.plan };
                if (node.code === 'WM07-3')
                    flags.echoAssisted = true;
                const next = nextLamplightState(state);
                if (inserted.affectedRows) {
                    const stages = { private: 'ACH_L01', local: 'ACH_L02', join: 'ACH_L03', world: 'ACH_L04' };
                    if (next.phase !== state.phase && stages[state.phase])
                        recordAchievement(c, id, [stages[state.phase]], 'lamplight:' + node.code + ':' + id);
                    achievementActivity(c, id);
                }
                Object.assign(state, next);
                delete flags.seen;
                delete flags.plan;
                delete flags.work;
                delete flags.crates;
                delete flags.receipts;
                flags.message = `${lamplightPublicText(node.conclusion, state)}\n\n本项已结清：${inserted.affectedRows ? node.copper : 0} 铜币、${awardedExperience} 经验。`;
                if (next.phase === 'completed') {
                    const home = await place(c, state, { place: flags.homeHub ?? 'origin' });
                    await move(c, character, home);
                    flags.endingHub = home.code;
                    flags.ending = await (await import('./lamplight-endings.js')).lamplightEnding({ ...state, local_hub: home.code }, flags.choices);
                }
                else
                    flags.message += `\n\n接下来：${lamplightNode(state).title}\n${lamplightPublicText(lamplightNode(state).intro, state)}`;
            }
        }
    }
    state.flags_json = flags;
    state.revision = Number(state.revision) + 1;
    await c.execute('UPDATE player_lamplight_progress SET phase=?,node_index=?,revision=?,flags_json=? WHERE character_id=?', [state.phase, state.node_index, state.revision, JSON.stringify(flags), id]);
    const result = await view(c, character, state);
    await c.execute('INSERT INTO player_lamplight_actions (character_id,revision,action_key,result_json) VALUES (?,?,?,?)', [id, revision, action, JSON.stringify(result)]);
    return result;
});
const lamplightMainQuest = async (user) => {
    const pool = await getPool();
    const character = await openingCharacter(pool, user);
    if (Number(character.level) < 5 || !character.profession_code || !character.adventurer_registered)
        return null;
    const [rows] = await pool.execute('SELECT phase FROM player_lamplight_progress WHERE character_id=?', [character.id]);
    if (rows[0]?.phase === 'completed')
        return { title: '【主线·灯火所至·已完成】', description: '改线核心已停止强制执行，各地仍维持自己的灯与归路。你的经历保留在旅程案卷中。', action: { label: '[回看个人结局]', command: '/灯火主线' } };
    return { title: '【主线·灯火所至】', description: '从自己经历的那次相遇继续调查，与安全公会的同伴一起核验被改动的道路。', action: { label: '[继续 灯火所至]', command: '/灯火主线' } };
};
const lamplightHistory = (user, page = 1) => withTransaction(async (c) => {
    const character = await openingCharacter(c, user);
    const state = await load(c, Number(character.id));
    if (!state)
        throw Error('先在公会领取自己的主线案卷。');
    const [rows] = await c.execute('SELECT node_code,choice_code,copper,experience,record_json FROM player_lamplight_rewards WHERE character_id=?', [character.id]);
    const order = new Map(['private', 'local', 'join', 'world'].flatMap(phase => lamplightNodes({ ...state, phase: phase })).map((node, i) => [node.code, i]));
    rows.sort((a, b) => (order.get(a.node_code) ?? -1) - (order.get(b.node_code) ?? -1));
    const pages = Math.max(1, Math.ceil(rows.length / 6));
    page = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)));
    const buttons = [{ label: '继续主线', command: '/灯火主线' }];
    if (page > 1)
        buttons.push({ label: '上一页', command: `/灯火回忆 ${page - 1}` });
    if (page < pages)
        buttons.push({ label: '下一页', command: `/灯火回忆 ${page + 1}` });
    return { title: `灯火所至·旅程案卷（${page}/${pages}）`, npc: lamplightHubNames[state.local_hub], revision: state.revision,
        text: `你的来路：${openingRouteByCode(state.origin_route, state.story_version)?.title ?? '旧冒险记录'}。已完成 ${rows.length} 项交接。\n\n` + rows.slice((page - 1) * 6, page * 6).map(row => `${lampJson(row.record_json).title ?? '已核验的见闻'} · 选择 ${row.choice_code}\n${lamplightPublicText(lampJson(row.record_json).conclusion ?? '', state)}\n已到账：${row.copper} 铜币、${row.experience} 经验。`).join('\n\n'), buttons };
});
const lamplightGrowthView = (user) => withTransaction(async (c) => {
    const character = await openingCharacter(c, user);
    const state = await initialize(c, character);
    const text = Number(character.realm_stage) === 1 ? '达到 Lv.10 且经验积满后，在本地案卷的第一道门槛请教公会，完成天空粉尘调查与核验，再感悟粉尘。'
        : Number(character.realm_stage) === 2 ? '达到 Lv.20 且经验积满后，完成图书馆调查，亲自通过噶的正式试炼，取得并感悟进化之种。研究验证本身不会代替这场试炼。'
            : '继续沿用进化研究室的针剂与生长结规则，逐步提升至 Lv.30；职业与天赋成长仍可独立办理。';
    const buttons = [{ label: '继续灯火主线', command: '/灯火主线' }, { label: '普通委托', command: '/任务分类 委托' }];
    if (Number(character.realm_stage) === 2 && (['world', 'completed'].includes(state.phase) || state.phase === 'join' && state.node_index >= 3))
        buttons.push({ label: '前往世界图书馆', action: 'growth_library' }, { label: '进入噶的研究室', command: '/寻访噶的研究室' }, { label: '感悟进化之种', command: '/感悟进化之种' });
    if (Number(character.realm_stage) >= 3)
        buttons.push({ label: '进化面板', command: '/进化面板' });
    buttons.push({ label: '天赋成长', command: '/天赋' }, { label: '职业任务', command: '/任务' });
    return { title: '灯火所至·成长与突破', npc: lamplightHubNames[state.local_hub], text, revision: state.revision, buttons };
});
const lamplightPersonView = (user) => withTransaction(async (c) => {
    const character = await openingCharacter(c, user), state = await initialize(c, character), current = await view(c, character, state);
    const person = openingRouteByCode(state.origin_route, state.story_version)?.person;
    const known = person?.name.includes(current.npc) ? person.description : undefined;
    const text = known ?? lamplightPeople[current.npc] ?? `${current.npc}正在协助《${lamplightNode(state)?.title ?? '灯火所至'}》的交接。你可以从当事人亲口说明的经历与公会留存的记录继续了解，不把传闻当作已经证实的身世。`;
    return { title: '灯火所至·人物', npc: current.npc, text, revision: state.revision, buttons: [{ label: '返回当前剧情', command: '/灯火主线' }] };
});

export { assertLamplightBoarding, assertLamplightIdle, lampJson, lamplightAction, lamplightGrowthView, lamplightHistory, lamplightInvestigationStep, lamplightMainQuest, lamplightPersonView, lamplightView };
