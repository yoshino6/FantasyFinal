import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { experienceRequiredForLevel } from './constants';
import { monsterCombatStats } from './adventure.service';
import type { Allocation } from './types';
import { girlGratitudeMainQuest } from './girl-gratitude.service';
import { activateEvolutionProfile } from './evolution.service';
import { guildCareerMainQuest } from './career-quest.service';
import { openingMainQuest } from './opening.service';

export type MainQuest = {
  title: string;
  description: string;
  action?: { label: string; command: string };
  actions?: { label: string; command: string }[];
};

const barrierQuestCode = 'realm_barrier';
const evolutionQuestCode = 'evolution_barrier';
const celestialJudicatorCode = 'celestial_judicator_imitation';
type BarrierStage = 0 | 1 | 2 | 3 | 4;
const barrierStage = (value: unknown): BarrierStage => Math.min(4, Math.max(0, Number(value) || 0)) as BarrierStage;
const relativeDirection = (fromX: number, fromY: number, toX: number, toY: number) => {
  const vertical = toY > fromY ? '北' : toY < fromY ? '南' : '';
  const horizontal = toX > fromX ? '东' : toX < fromX ? '西' : '';
  return horizontal || vertical ? `${horizontal}${vertical}方` : '此处';
};
const goblinKingArrivalText = '忽然，沉闷的鼓声从林海深处滚来。\n\n咚。\n\n咚。\n\n地面随之微微颤动。残余的哥布林停止嘶叫，竟齐齐向两旁退开，在泥地间让出一条狭长的通道。\n\n梨子喵的脸色一下白了。\n\n“就是它喵……我看见它在指挥这些家伙。”\n\n通道尽头传来沉重的翼响。一头红鳞幼龙撞断枝干，俯冲落地；它背上坐着一只异常肥硕的哥布林，王袍被撑得鼓鼓囊囊，手里却稳稳握着一杆令旗。\n\n国王眯起眼，目光落在梨子喵身上。\n\n“把那只猫交出来，人类。”它用生硬却清楚的通用语说道，“她闯进我的部落，杀了我的斥候。把她留下，你们还能滚回镇子；否则，我就当着你的面撕票。”\n\n梨子喵握紧短刃，声音发颤却没有后退。\n\n“是你们先抓走镇上的人喵！我才不会让你们把我也抓回去！”\n\n我挡在她身前，抬头看向龙背上的国王。\n\n“她不是你的筹码。你也没有资格替谁决定她的命。”';

type QuestConnection = Pool | PoolConnection;
type GoblinKingQuestRow = RowDataPacket & { stage: number; goblin_kills: number; region_id: number | null; pos_x: number | null; pos_y: number | null; pos_z: number | null; encounter_id: string | null; boss_spawn_id: number | null };
type EvolutionQuestRow = RowDataPacket & { stage: number };
type QuestMonsterTemplate = RowDataPacket & Allocation & Record<`${keyof Allocation}_growth`, number> & { id: number; code: string; monster_class: string; level: number; skill_sequence: unknown };

const goblinQuestFor = async (connection: QuestConnection, characterId: number, lock = false) => {
  const [rows] = await connection.execute<GoblinKingQuestRow[]>(`SELECT stage,goblin_kills,region_id,pos_x,pos_y,pos_z,encounter_id,boss_spawn_id
    FROM player_goblin_king_quest WHERE character_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  return rows[0] ?? null;
};
const evolutionQuestFor = async (connection: QuestConnection, characterId: number, lock = false) => {
  const [rows] = await connection.execute<EvolutionQuestRow[]>(`SELECT stage FROM player_main_quest_progress WHERE character_id=? AND quest_code=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId, evolutionQuestCode]);
  return Number(rows[0]?.stage ?? 0);
};
const writeEvolutionStage = (connection: QuestConnection, characterId: number, stage: number) => connection.execute('INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,?,?) ON DUPLICATE KEY UPDATE stage=VALUES(stage),updated_at=NOW()', [characterId, evolutionQuestCode, stage]);

const requireQuestNpc = async (connection: QuestConnection, characterId: number, code: string) => {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM characters c JOIN map_npcs n ON n.region_id=c.current_region_id AND n.pos_x=c.pos_x AND n.pos_y=c.pos_y AND n.pos_z=c.pos_z WHERE c.id=? AND n.code=? LIMIT 1', [characterId, code]);
  if (!rows[0]) throw new Error('请先前往对应人物处，再继续推进主线。');
};

const ordinaryTrait = { code: 'ordinary', name: '普通的' };
const questBossTrait = (ownerCharacterId: number, encounterId: string) => ({ code: 'main_quest_goblin_king', name: '', owner_character_id: ownerCharacterId, encounter_id: encounterId });
const evolutionBossTrait = (ownerCharacterId: number) => ({ code: 'main_quest_evolution', name: '', owner_character_id: ownerCharacterId });
const stringList = (value: unknown): string[] => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
};

const monsterHp = (template: QuestMonsterTemplate, level: number, bossCore: boolean) => monsterCombatStats({...template,level,traits_json:bossCore?[evolutionBossTrait(0)]:[]}).hpMax;

const createGoblinKingEncounter = async (connection: QuestConnection, ownerCharacterId: number, quest: GoblinKingQuestRow) => {
  if (quest.region_id === null || quest.pos_x === null || quest.pos_y === null || quest.pos_z === null || !quest.encounter_id) throw new Error('讨伐坐标尚未准备好。');
  const codes = ['goblin_king', 'habadragon', 'goblin_royal_guard', 'goblin_royal_spearman'];
  const [rows] = await connection.execute<QuestMonsterTemplate[]>(`SELECT id,code,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence
    FROM monster_templates WHERE code IN (${codes.map(() => '?').join(',')}) FOR UPDATE`, codes);
  const byCode = new Map(rows.map(row => [row.code, row]));
  if (codes.some(code => !byCode.has(code))) throw new Error('哥布林国王的遭遇配置尚未完成。');
  const create = async (code: string, role: string, level: number, isBossCore: boolean) => {
    const template = byCode.get(code)!;
    const traits = [...(isBossCore ? [ordinaryTrait] : []), questBossTrait(ownerCharacterId, quest.encounter_id!), { code: 'kingbeast_encounter', name: '', groupId: quest.encounter_id, role }];
    const hp = monsterCombatStats({...template,level,traits_json:traits}).hpMax;
    const [created] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, quest.region_id, quest.pos_x, quest.pos_y, quest.pos_z, level, template.constitution, template.spirit, template.strength, template.intelligence, template.agility, template.perception, hp, JSON.stringify(stringList(template.skill_sequence)), JSON.stringify(traits)]);
    return Number(created.insertId);
  };
  await create('habadragon', 'dragon', 18, true);
  const kingSpawnId = await create('goblin_king', 'king', 18, true);
  await create('goblin_royal_guard', 'guard', 16, false);
  await create('goblin_royal_spearman', 'spearman', 16, false);
  await connection.execute('UPDATE player_goblin_king_quest SET stage=10,boss_spawn_id=? WHERE character_id=?', [kingSpawnId, ownerCharacterId]);
  return kingSpawnId;
};

/** 主线只保留当前阶段，由角色等级、剧情进度与地图持有状态自动推导。 */
export const currentMainQuest = async (qqUserId: string): Promise<MainQuest> => {
  const opening = await openingMainQuest(qqUserId);
  if (opening) return opening;
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; level: number; experience: number; realm_stage: number; pos_x: number; pos_y: number; adventurer_registered: number; profession_code: string | null; forest_status: string | null; owns_forest_map: number; owns_sky_dust: number; barrier_stage: number; evolution_stage: number; evolution_cap: number | null })[]>(`
    SELECT c.id,c.level,c.experience,c.realm_stage,c.pos_x,c.pos_y,c.adventurer_registered,c.profession_code,
      (SELECT sp.status FROM player_story_progress sp WHERE sp.character_id=c.id AND sp.story_code='forest_guide' LIMIT 1) AS forest_status,
      EXISTS(SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=c.id AND i.code='map_dark_forest' AND pi.quantity>0) AS owns_forest_map,
      EXISTS(SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=c.id AND i.code='sky_dust' AND pi.quantity>0) AS owns_sky_dust,
      COALESCE((SELECT qp.stage FROM player_main_quest_progress qp WHERE qp.character_id=c.id AND qp.quest_code='realm_barrier' LIMIT 1),0) AS barrier_stage,
      COALESCE((SELECT qp.stage FROM player_main_quest_progress qp WHERE qp.character_id=c.id AND qp.quest_code='evolution_barrier' LIMIT 1),0) AS evolution_stage,
      (SELECT ep.unlocked_level FROM player_evolution_profiles ep WHERE ep.character_id=c.id LIMIT 1) AS evolution_cap
    FROM characters c JOIN players p ON p.id=c.player_id
    WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  const character = rows[0];
  if (!character) throw new Error('请先注册角色。');
  const level = Number(character.level);
  const experience = Number(character.experience);

  if (level < 5) return {
    title: '【主线·初入异界】',
    description: `提升至Lv.5\n当前等级：Lv.${level}/5`
  };
  if (['awaiting_arrival', 'arrival_story', 'guild_story'].includes(character.forest_status ?? '')) return {
    title: '【主线·前往百纳镇】',
    description: '森林史莱姆的战斗已经结束。继续入镇剧情，跟随梨子喵认识百纳镇，前往冒险者公会。',
    action: { label: '[继续 剧情]', command: '/继续剧情' }
  };
  if (character.forest_status !== 'completed') return {
    title: '【主线·寻找出路】',
    description: '在森林里多转转吧，寻找出路。'
  };
  if (!Number(character.adventurer_registered) || !character.profession_code) {
    const careerQuest = await guildCareerMainQuest(qqUserId);
    if (careerQuest) return careerQuest;
  }
  if (!Number(character.owns_forest_map)) return {
    title: '【主线·探索的准备】',
    description: '前往冒险者公会商店，购买【地图·幽暗密林】。',
    action: { label: '[前往 冒险者公会]', command: '/前往 -2 -181' }
  };
  if (Number(character.realm_stage) === 1 && level >= 10 && experience >= experienceRequiredForLevel(10)) {
    const stage = barrierStage(character.barrier_stage);
    if (stage === 0) return { title: '【主线·无形的禁锢】', description: '你决定去找专业的人来请教这件事情。\n先去冒险者公会里面问问吧。', action: { label: '[前往 冒险者公会]', command: '/前往 -2 -181' } };
    if (stage === 1) return { title: '【主线·寻访晴儿】', description: '前台小姐姐建议你去找炼金师晴儿。\n前往糖水屋，询问这道无形的禁锢。', action: { label: '[前往 糖水屋]', command: '/前往 -12 -196' } };
    if (stage === 2 && !Number(character.owns_sky_dust)) return { title: '【主线·追寻天空粉尘】', description: '击败幽影狼王，收集一份【天空粉尘】。\n它或许能帮助你感悟这方世界。' };
    if (stage === 2 || stage === 3) return { title: '【主线·归还天空粉尘】', description: '你已获得【天空粉尘】。\n回到糖水屋，把它交给晴儿看看。', action: { label: '[前往 糖水屋]', command: '/前往 -12 -196' } };
    return { title: '【主线·窥探世间】', description: '天空粉尘在背包中微微发亮，似乎正在等待你的感悟。', action: { label: '[打开背包]', command: '/背包 材料' } };
  }
  const gratitude = await girlGratitudeMainQuest(qqUserId);
  const gratitudeCompleted = gratitude?.description.startsWith('世界树的叶影') ?? false;
  if (gratitudeCompleted && Number(character.realm_stage) === 2 && level >= 20 && experience >= experienceRequiredForLevel(20)) {
    const evolutionStage = Number(character.evolution_stage);
    if (evolutionStage === 0) return { title: '【主线·未知的枷锁】', description: '二十级的经验已然圆满，力量却像被一道从未见过的门槛拦住。去冒险者公会问问，或许莫妮卡能找到些线索。', action: { label: '[前往 冒险者公会]', command: '/前往 -2 -181' } };
    if (evolutionStage === 1) return { title: '【主线·未知的枷锁】', description: '莫妮卡没有见过这种停滞。她只在一张陈旧借阅条上找到一点模糊线索：世界图书馆或许藏有答案。前往世界树，在图书馆里继续追查。', action: { label: '[前往 世界图书馆]', command: '/前往 -4 5' } };
    if (evolutionStage < 5) return { title: '【主线·寻访大学者】', description: '世界图书馆的线索仍未拼全。依次探查大厅、阅览室、资料室与休息室，循着那封封存信件留下的脉络寻找【噶】。', action: { label: '[前往 世界图书馆]', command: '/前往 -4 5' } };
    if (evolutionStage === 5) return { title: '【主线·寻访大学者】', description: '所有线索都指向世界图书馆的无尽回廊。那里每一道门后都是不同的知识与岁月。前往无尽回廊，寻访【噶】的研究室。', action: { label: '[前往 世界图书馆]', command: '/前往 -4 5' } };
    if (evolutionStage === 6) return { title: '【主线·信念的试炼】', description: '大学者【噶】已压制力量，等待你以战斗证明自己的信念。战败后可再次挑战。', action: { label: '[前往 世界图书馆]', command: '/前往 -4 5' } };
    return { title: '【主线·感悟进化之种】', description: '进化之种正在背包深处发亮。打开背包，在它右侧选择【感悟】。', action: { label: '[打开 背包]', command: '/背包 道具' } };
  }
  if (Number(character.realm_stage) === 3 && Number(character.evolution_stage) >= 8) {
    const cap = Number(character.evolution_cap ?? 20);
    if (cap >= 30) return level >= 30
      ? { title: '【主线·开化完成】', description: '十道生长结已尽数解开。进化之种安静地沉入体内，等待下一境界的呼唤。', action: { label: '[查看 进化面板]', command: '/进化面板' } }
      : { title: '【主线·开化·最终生长】', description: '最后一道生长结已经解开。继续积累力量，抵达 Lv.30。', action: { label: '[查看 进化面板]', command: '/进化面板' } };
    if (level >= cap && experience >= experienceRequiredForLevel(cap)) return { title: '【主线·开化·生长结】', description: `Lv.${cap} 的生长结已经形成。前往世界树上的演化研究室，制作并注射一支进化针剂。`, action: { label: '[前往 演化研究室]', command: '/前往 -6 7' } };
    return { title: '【主线·开化】', description: `进化之种在体内缓慢搏动。继续积累力量，抵达 Lv.${cap} 的生长结后前往演化研究室。`, action: { label: '[查看 进化面板]', command: '/进化面板' } };
  }
  if (level < 11) return {
    title: '【主线·更进一步】',
    description: `提升至Lv.11\n当前等级：Lv.${level}/11`
  };
  const goblinQuest = await goblinQuestFor(pool, Number(character.id));
  const stage = Number(goblinQuest?.stage ?? 0);
  if (stage >= 11) {
    if (gratitude) return gratitude;
  }
  const location = goblinQuest?.region_id !== null && goblinQuest?.region_id !== undefined && goblinQuest.pos_x !== null && goblinQuest.pos_y !== null
    ? { label: '[前往 讨伐坐标]', command: `/前往 ${goblinQuest.pos_x} ${goblinQuest.pos_y}` }
    : undefined;
  const questDirection = goblinQuest?.pos_x !== null && goblinQuest?.pos_x !== undefined && goblinQuest.pos_y !== null && goblinQuest.pos_y !== undefined
    ? relativeDirection(Number(character.pos_x), Number(character.pos_y), Number(goblinQuest.pos_x), Number(goblinQuest.pos_y))
    : '';
  if (stage === 0) return { title: '【主线·失踪的少女】', description: '最近哥布林频繁骚扰百纳镇，镇上更接连传出少女失踪的消息。直到有一天，梨子喵进森林打猎后也迟迟未归。\n\n前往冒险者公会，了解失踪事件的情报。', action: { label: '[前往 冒险者公会]', command: '/前往 -2 -181' } };
  if (stage === 1) return { title: '【主线·失踪的少女】', description: '公会的人手一时无法抽调。我不能坐等梨子喵在森林里失去消息。密林深处的异动让我觉得，那里恐怕藏着一头难以应付的大家伙。\n\n前往异工坊，向唯薇安请教深入森林的办法。', action: { label: '[前往 异工坊]', command: '/前往 6 -189' } };
  if (stage === 2) return { title: '【主线·失踪的少女】', description: '唯薇安确认，天位制裁仪能压低未知统领的力量。为了救出梨子喵，我决定以特价购下这台仿品。\n\n前往异工坊，购买【天位制裁仪（仿品）】。', action: { label: '[购买 天位制裁仪（200铜币）]', command: '/购买天位制裁仪' } };
  if (stage === 3) return { title: '【主线·失踪的少女】', description: '天位制裁仪（仿品）已经到手。我要立刻进入幽暗密林深处，循着哥布林活动的痕迹寻找梨子喵。\n\n这次行动只能由我带领的队伍触发。', action: { label: '[前往 幽暗密林深处]', command: '/前往地图 map_dark_forest_deep' } };
  if (stage === 4) return { title: '【主线·失踪的少女】', description: `【线索】从${questDirection}传来打斗声。\n\n可疑坐标位于你当前的${questDirection}：(${goblinQuest?.pos_x}, ${goblinQuest?.pos_y})。\n\n只有我带领的队伍能够发现这处遭遇。`, action: location };
  if (stage >= 5 && stage < 10) return { title: '【主线·失踪的少女】', description: `梨子喵还在哥布林的包围中苦战。我要撑住她，击退这些围剿闯入者的哥布林。\n\n遭遇坐标：幽暗密林深处（${goblinQuest?.pos_x}, ${goblinQuest?.pos_y}）。`, action: location };
  if (stage === 10) return { title: '【主线·失踪的少女】', description: `天位制裁仪已经消耗，哥布林国王与红鳞幼龙的等级被压制至 Lv.18。\n两名御前侍卫均为 Lv.16。\n\n讨伐坐标：幽暗密林深处（${goblinQuest?.pos_x}, ${goblinQuest?.pos_y}）\n战败不会使副本或任务消失，可再次挑战。`, action: location };
  return { title: '【主线·失踪的少女】', description: '哥布林大军已经溃散，所有失踪的少女都已获救。\n\n带她们回冒险者公会报平安。', action: { label: '[前往 冒险者公会]', command: '/前往 -2 -181' } };
};

export const startGoblinKingQuest = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; level: number; realm_stage: number })[]>('SELECT c.id,c.level,c.realm_stage FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE', [qqUserId]);
  const character = rows[0]; if (!character) throw new Error('请先注册角色。');
  if (Number(character.level) < 11 || Number(character.realm_stage) < 2) throw new Error('完成天空粉尘突破并达到 Lv.11 后，才能接受这项征召。');
  await requireQuestNpc(connection, Number(character.id), 'guild_counter');
  const current = await goblinQuestFor(connection, Number(character.id), true);
  if (current && Number(current.stage) > 0) throw new Error('你已经接受了「失踪的少女」。');
  await connection.execute('INSERT INTO player_goblin_king_quest (character_id,stage,goblin_kills) VALUES (?,1,0) ON DUPLICATE KEY UPDATE stage=1,goblin_kills=0,region_id=NULL,pos_x=NULL,pos_y=NULL,pos_z=NULL,encounter_id=NULL,boss_spawn_id=NULL,completed_at=NULL', [character.id]);
  return '我赶到公会时，柜台前已经围了不少人。莫妮卡没有像往常那样微笑，桌上的失踪登记册被翻得卷起了边。\n\n“最近那些哥布林越来越大胆，白天敢摸进镇子闹事，夜里就有人家的女儿不见。”她压低声音，“已经不是一两起了，搜查队却始终找不到能追下去的线索。”\n\n她停了停，才把一枚沾着泥渍的鱼骨头发卡轻轻放到我面前。\n\n“直到前天，梨子喵进幽暗密林打猎后也没有回来。搜查队只找到这个，还有一串杂乱的哥布林足迹。”\n\n一名刚回镇的盗贼挤过人群，斗篷上还挂着枯叶。\n\n“我在深处看见一大群绿皮四处奔走，连灌木和石缝都不放过，像是在搜捕什么闯进它们地盘的家伙。”\n\n莫妮卡攥紧登记笔。\n\n“高等级冒险者都在外地执行委托，最快也要几天才能回来。我会继续组织人手，可现在不能贸然深入。”\n\n我望着那枚发卡，心里却再也等不下去。密林深处这样反常的动静，让我隐隐觉得那里藏着一头不好惹的大家伙。\n\n“我先去找唯薇安。她或许知道该怎么让我进入森林，找到梨子喵。”';
});

export const consultVivianForJudicator = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE', [qqUserId]);
  const character = rows[0]; if (!character) throw new Error('请先注册角色。');
  await requireQuestNpc(connection, Number(character.id), 'oddworkshop');
  const quest = await goblinQuestFor(connection, Number(character.id), true);
  if (!quest || Number(quest.stage) !== 1) throw new Error('你暂时不需要向唯薇安询问这件事。');
  await connection.execute('UPDATE player_goblin_king_quest SET stage=2 WHERE character_id=?', [character.id]);
  return '我把密林深处的异状告诉唯薇安：哥布林不再各自为战，开始巡逻、设伏，行动得异常有章法，像有谁在暗处把它们拧成了一股绳。\n\n唯薇安停下手里的扳手，若有所思地敲了敲桌面。\n\n“能把一群哥布林拧成一股绳的，只有足够强的统领。若真是它们的国王，你们正面碰上时，最麻烦的不是兵多，而是首领的力量会把整个战场压垮。”\n\n她从柜子最深处取出一枚银白色装置。细小的弧光沿着刻纹游走，像被关在金属里的雷。\n\n“这是天位制裁仪的仿品。它不能替你赢下战斗，但能在短时间内扰乱高阶目标的力量结构，把它拉回你们能够应付的层次。”\n\n唯薇安掂了掂装置，眼神里闪过一丝肉疼。\n\n“照材料和工时算，我本来准备卖八百铜币。不过这次牵扯的是整个百纳镇，若让那群哥布林继续闹下去，我的零件也别想安稳运进来了。”\n\n她把装置塞进我手里，伸出两根手指。\n\n“二百铜币，特价。只能用一次，不能卖，也不能丢；启动以后记得离远些——我不保证它会不会顺手带走你的眉毛。”';
});

export const buyCelestialJudicator = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; copper_coins: number })[]>('SELECT c.id,c.copper_coins FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE', [qqUserId]);
  const character = rows[0]; if (!character) throw new Error('请先注册角色。');
  await requireQuestNpc(connection, Number(character.id), 'oddworkshop');
  const quest = await goblinQuestFor(connection, Number(character.id), true);
  if (!quest || Number(quest.stage) !== 2) throw new Error('先向唯薇安了解天位制裁仪。');
  if (Number(character.copper_coins) < 200) throw new Error(`铜币不足，还需要 ${200 - Number(character.copper_coins)} 铜币。`);
  const [regions] = await connection.execute<(RowDataPacket & { id: number; min_x: number; max_x: number; min_y: number; max_y: number; town_min_y: number | null })[]>(`SELECT deep.id,deep.min_x,deep.max_x,deep.min_y,deep.max_y,town.min_y AS town_min_y
    FROM map_regions deep LEFT JOIN map_regions town ON town.code='baina_town'
    WHERE deep.code='dark_forest_deep' LIMIT 1 FOR UPDATE`);
  const region = regions[0]; if (!region) throw new Error('幽暗密林深处尚未初始化。');
  // 百纳镇覆盖深处最北侧的一段区域；主线遭遇必须落在城镇南界之外，确保坐标解析为幽暗密林深处。
  const encounterMaxY = Math.min(Number(region.max_y), Number(region.town_min_y ?? Number.POSITIVE_INFINITY) - 1);
  if (encounterMaxY < Number(region.min_y)) throw new Error('幽暗密林深处暂无可用的讨伐区域。');
  let x = 0; let y = 0; let foundCoordinate = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    x = Math.floor(Math.random() * (Number(region.max_x) - Number(region.min_x) + 1)) + Number(region.min_x);
    y = Math.floor(Math.random() * (encounterMaxY - Number(region.min_y) + 1)) + Number(region.min_y);
    const [occupied] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM monster_spawns WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=0 AND defeated_at IS NULL LIMIT 1', [region.id, x, y]);
    if (!occupied[0]) { foundCoordinate = true; break; }
  }
  if (!foundCoordinate) throw new Error('暂时无法确定安全的讨伐坐标，请稍后再试。');
  const encounterId = `main-goblin-king-${character.id}-${Date.now()}`;
  await connection.execute('UPDATE characters SET copper_coins=copper_coins-200 WHERE id=?', [character.id]);
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) SELECT ?,id,1 FROM item_definitions WHERE code=? ON DUPLICATE KEY UPDATE quantity=quantity+1,acquired_at=NOW()`, [character.id, celestialJudicatorCode]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) SELECT ?,id FROM item_definitions WHERE code=?', [character.id, celestialJudicatorCode]);
  await connection.execute('UPDATE player_goblin_king_quest SET stage=3,region_id=?,pos_x=?,pos_y=?,pos_z=0,encounter_id=? WHERE character_id=?', [region.id, x, y, encounterId, character.id]);
  return { x, y, text: '唯薇安一把收走铜币，将装置塞进我手里。\n\n“成交！启动时别碰侧面的银纹，等弧光散尽再靠近；我可不想回收一堆熔成疙瘩的零件。”\n\n装置在掌心轻轻震动，像一颗被压住的雷。唯薇安朝密林的方向抬了抬下巴。\n\n“进去以后多留意动静，也留意脚下的痕迹。别一个劲往最深处扎，先找到梨子喵，再想怎么把她带出来。”\n\n我握紧装置，转身朝森林走去。' };
});

export const goblinKingArrival = async (connection: PoolConnection, characterId: number, regionId: number, regionCode: string, x: number, y: number, z: number) => {
  const quest = await goblinQuestFor(connection, characterId, true);
  if (!quest) return null;
  if (Number(quest.stage) === 3 && regionCode === 'dark_forest_deep') {
    await connection.execute('UPDATE player_goblin_king_quest SET stage=4 WHERE character_id=?', [characterId]);
    const direction = relativeDirection(x, y, Number(quest.pos_x), Number(quest.pos_y));
    return { clue: true, chapter: 4, text: `踏进幽暗密林深处的一刻，潮湿的风裹着血腥味迎面吹来。林间到处是被踩断的枝叶与凌乱的脚印，哥布林显然在这里来回奔走过许多次。\n\n我俯身辨认泥地上几道较新的爪印，忽然听见远处传来兵刃相撞的脆响。声音被古木遮断，又很快从风里漏出来。\n\n我屏住呼吸，侧耳倾听。那声音时断时续，先是短刃格开木矛的锐响，紧接着便是杂乱的怪叫与枝叶被撞开的闷响；每一次动静都像被更密的林影吞没。\n\n【线索】从${direction}传来打斗声。\n\n那不是野兽搏斗的动静。有人正在以寡敌众，而且已经被逼得不断后退。梨子喵若还活着，或许就在那边。` };
  }
  if (Number(quest.region_id) !== regionId || Number(quest.pos_x) !== x || Number(quest.pos_y) !== y || Number(quest.pos_z) !== z) return null;
  if (Number(quest.stage) === 4) {
    await connection.execute('UPDATE player_goblin_king_quest SET stage=5 WHERE character_id=?', [characterId]);
    return { clue: false, chapter: 5, text: '我循着声音穿过一片被踩烂的蕨丛，终于在断木与乱石之间看见了梨子喵。\n\n她背靠着半截树根，手里短刃已卷了口，肩头沾着血和泥。那枚鱼骨头发卡不见了，只剩几缕凌乱的浅黄发贴在额前。\n\n“你怎么会在这里？”我冲上前挡开一支木矛。\n\n梨子喵先是一怔，随即咬牙挥刀。\n\n“别问了喵！这些家伙一直缠着我……小心左边！”\n\n哥布林从灌木间蜂拥而出。来不及解释，我与她背靠背站定，先把眼前的包围撕开。\n\n一波哥布林刚倒下，新的怪影又从林子里窜出。梨子喵的呼吸越来越急，却仍死死守着身后的断木。\n\n“我不是被它们追着跑进来的喵。”她趁着空隙低声说，“我一路跟到这里，发现那些失踪的少女被关在部落里，就想趁守卫少的时候把人救出来。”\n\n她咬紧牙关，短刃上的缺口在昏光里一闪。\n\n“我杀了不少拦路的哥布林，可警报一响，它们就全出来搜我了。现在它们把我当成闯进部落的侵略者，非要把我围死不可。”\n\n我抬手击落迎面飞来的石斧。\n\n“那就先让它们明白，谁才该滚出这里。”\n\n我们一前一后压上，刀光与法术在昏暗的林影间接连闪过。最后一只哥布林哀嚎着退开，周围终于空出一圈狼藉的泥地。' };
  }
  if (![5, 6, 7].includes(Number(quest.stage))) return null;
  const resumed = Number(quest.stage) === 5
    ? { chapter: 5, text: '梨子喵仍守在断木旁，林间的怪叫没有停下。哥布林随时会从阴影里再度扑来。\n\n我必须留在这里，继续援护她。' }
    : Number(quest.stage) === 6
      ? { chapter: 6, text: '林海深处的鼓声仍在回荡。哥布林国王与它的红鳞坐骑没有离开，正隔着林影俯视我们。\n\n我该回到梨子喵身边，结束这场战斗。' }
      : { chapter: 7, text: '天位制裁仪已在掌中发出细微的震鸣。国王仍在等待，而我已经准备好让它为所做的一切付出代价。' };
  return { clue: false, ...resumed };
};

export const continueGoblinKingArrival = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>('SELECT c.id,c.current_region_id,c.pos_x,c.pos_y,c.pos_z FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE', [qqUserId]);
  const character = rows[0]; if (!character) throw new Error('请先注册角色。');
  const quest = await goblinQuestFor(connection, Number(character.id), true);
  if (!quest || ![5, 6, 7].includes(Number(quest.stage))) throw new Error('当前没有可继续的讨伐剧情。');
  if (Number(quest.region_id) !== Number(character.current_region_id) || Number(quest.pos_x) !== Number(character.pos_x) || Number(quest.pos_y) !== Number(character.pos_y) || Number(quest.pos_z) !== Number(character.pos_z)) throw new Error('请回到讨伐坐标，再继续剧情。');
  if (Number(quest.stage) === 5) {
    await connection.execute('UPDATE player_goblin_king_quest SET stage=6 WHERE character_id=?', [character.id]);
    return { ready: false, chapter: 6, text: goblinKingArrivalText };
  }
  const [devices] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number })[]>('SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=? FOR UPDATE', [character.id, celestialJudicatorCode]);
  if (!devices[0]?.quantity) throw new Error('缺少天位制裁仪（仿品），无法压制哥布林国王。');
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [character.id, devices[0].item_id]);
  const bossSpawnId = await createGoblinKingEncounter(connection, Number(character.id), quest);
  return { ready: true, chapter: 7, bossSpawnId, text: '国王发出短促的笑声，红龙压低头颅，鼻息将落叶吹得四散翻飞。\n\n“资格？”它不屑地晃了晃令旗，“森林从不问狼为什么咬鹿。弱者看不住自己的东西，就该把命和东西一起交出来。”\n\n它抬起手，几名披着破甲的哥布林侍卫越众而出。梨子喵盯着他们，指节泛白。\n\n“就是它们喵……一直守着那些木笼。”\n\n我没有再给国王说下去的机会，取出天位制裁仪。\n\n“你把掠夺叫作法则，那我就用更简单的法则回答你。”\n\n装置落在龙爪前，强光骤然绽放，空气中响起噼里啪啦的电音。国王脸上的轻蔑第一次凝住。\n\n“你——”\n\n红龙发出痛苦的低吼，国王与坐骑的气势急剧滑落，像被无形的锁链硬生生拖回地面。\n\n我横起武器。\n\n“放了她。然后，轮到你付代价。”' };
});

export const completeGoblinKingQuest = async (connection: PoolConnection, targets: Array<{ traits_json?: unknown }>) => {
  const trait = targets.flatMap(target => {
    try { return Array.isArray(target.traits_json) ? target.traits_json : JSON.parse(String(target.traits_json ?? '[]')); } catch { return []; }
  }).find((item: any) => item?.code === 'main_quest_goblin_king');
  const ownerId = Number(trait?.owner_character_id ?? 0); if (!ownerId) return false;
  await connection.execute('UPDATE player_goblin_king_quest SET stage=11,completed_at=NOW() WHERE character_id=? AND stage=10', [ownerId]);
  return true;
};

type EvolutionSource = 'guild' | 'hall' | 'reading' | 'archive' | 'rest';

const evolutionCharacterFor = async (connection: PoolConnection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; level: number; experience: number; realm_stage: number; gratitude_stage: number; goblin_quest_stage: number })[]>(`SELECT c.id,c.name,c.level,c.experience,c.realm_stage,
    COALESCE((SELECT stage FROM player_main_quest_progress WHERE character_id=c.id AND quest_code='girl_gratitude' LIMIT 1),0) AS gratitude_stage,
    COALESCE((SELECT stage FROM player_goblin_king_quest WHERE character_id=c.id LIMIT 1),0) AS goblin_quest_stage
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  const character = rows[0];
  if (!character) throw new Error('请先注册角色。');
  if (Number(character.goblin_quest_stage) < 11) throw new Error('先完成「失踪的少女」，再处理这道新的瓶颈。');
  if (Number(character.gratitude_stage) < 6) throw new Error('先完成与梨子喵在世界树上的同行，再处理这道新的瓶颈。');
  if (Number(character.realm_stage) !== 2 || Number(character.level) < 20 || Number(character.experience) < experienceRequiredForLevel(20)) throw new Error('你的积累尚未触及这道新的灵阶枷锁。');
  return character;
};

export const evolutionQuestStage = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  const character = rows[0];
  if (!character) throw new Error('请先注册角色。');
  return evolutionQuestFor(connection, Number(character.id));
});

export const advanceEvolutionQuest = async (qqUserId: string, source: EvolutionSource) => withTransaction(async connection => {
  const character = await evolutionCharacterFor(connection, qqUserId, true);
  const stage = await evolutionQuestFor(connection, Number(character.id), true);
  const expected: Record<EvolutionSource, number> = { guild: 0, hall: 1, reading: 2, archive: 3, rest: 4 };
  if (stage !== expected[source]) return { stage, changed: false };
  await requireQuestNpc(connection, Number(character.id), source === 'guild' ? 'guild_counter' : 'world_library');
  await writeEvolutionStage(connection, Number(character.id), stage + 1);
  return { stage: stage + 1, changed: true };
});

export const openGaStudy = async (qqUserId: string) => withTransaction(async connection => {
  const character = await evolutionCharacterFor(connection, qqUserId, true);
  const stage = await evolutionQuestFor(connection, Number(character.id), true);
  if (stage < 5 || stage > 6) throw new Error('你暂时还没有找到大学者【噶】的研究室。');
  await requireQuestNpc(connection, Number(character.id), 'world_library');
  const [templates] = await connection.execute<QuestMonsterTemplate[]>(`SELECT id,code,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,skill_sequence
    FROM monster_templates WHERE code='scholar_ga' LIMIT 1 FOR UPDATE`);
  const template = templates[0];
  if (!template) throw new Error('大学者【噶】的战斗配置尚未完成。');
  const [existing] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT s.id FROM monster_spawns s WHERE s.defeated_at IS NULL
    AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution','owner_character_id',?)) LIMIT 1 FOR UPDATE`, [character.id]);
  if (existing[0]) {
    const [active] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state=? LIMIT 1 FOR UPDATE', [existing[0].id, 'active']);
    // “域民”是地图中的实体分类，不是大学者·噶的怪物词条；旧生成实体也在此一并清理。
    if (!active[0]) await connection.execute('UPDATE monster_spawns SET current_hp=?,traits_json=? WHERE id=?', [monsterHp(template, 22, true), JSON.stringify([evolutionBossTrait(Number(character.id))]), existing[0].id]);
    return { spawnId: Number(existing[0].id), created: false };
  }
  const [positions] = await connection.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>('SELECT region_id,pos_x,pos_y,pos_z FROM map_npcs WHERE code=? LIMIT 1', ['world_library']);
  const position = positions[0];
  if (!position) throw new Error('世界图书馆尚未开放。');
  const [created] = await connection.execute<any>('INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,constitution,spirit,strength,intelligence,agility,perception,current_hp,skill_sequence,traits_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [template.id, position.region_id, position.pos_x, position.pos_y, position.pos_z, 22, template.constitution, template.spirit, template.strength, template.intelligence, template.agility, template.perception, monsterHp(template, 22, true), JSON.stringify(stringList(template.skill_sequence)), JSON.stringify([evolutionBossTrait(Number(character.id))])]);
  await writeEvolutionStage(connection, Number(character.id), 6);
  return { spawnId: Number(created.insertId), created: true };
});

export const completeEvolutionQuest = async (connection: PoolConnection, targets: Array<{ traits_json?: unknown }>) => {
  const trait = targets.flatMap(target => {
    try { return Array.isArray(target.traits_json) ? target.traits_json : JSON.parse(String(target.traits_json ?? '[]')); } catch { return []; }
  }).find((item: any) => item?.code === 'main_quest_evolution');
  if (!trait?.owner_character_id) return false;
  const characterId = Number(trait.owner_character_id);
  if (await evolutionQuestFor(connection, characterId, true) !== 6) return false;
  await writeEvolutionStage(connection, characterId, 7);
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity) SELECT ?,id,1 FROM item_definitions WHERE code='evolution_seed' ON DUPLICATE KEY UPDATE quantity=GREATEST(quantity,1),acquired_at=NOW()`, [characterId]);
  await connection.execute(`INSERT IGNORE INTO player_item_codex (character_id,item_id) SELECT ?,id FROM item_definitions WHERE code='evolution_seed'`, [characterId]);
  return true;
};

export const contemplateEvolutionSeed = async (qqUserId: string) => withTransaction(async connection => {
  const character = await evolutionCharacterFor(connection, qqUserId, true);
  if (await evolutionQuestFor(connection, Number(character.id), true) !== 7) throw new Error('进化之种还没有准备好回应你的感悟。');
  const [items] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number })[]>('SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=? FOR UPDATE', [character.id, 'evolution_seed']);
  if (!items[0]?.quantity) throw new Error('背包中没有进化之种。');
  if (Number(items[0].quantity) <= 1) await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=?', [character.id, items[0].item_id]);
  else await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [character.id, items[0].item_id]);
  await connection.execute('UPDATE characters SET realm_stage=3 WHERE id=?', [character.id]);
  await activateEvolutionProfile(connection, Number(character.id));
  await connection.execute(`INSERT INTO player_events (player_id,event_type,payload)
    SELECT player_id,'evolution.seed_awakened',JSON_OBJECT('level',level) FROM characters WHERE id=?`, [character.id]);
  await writeEvolutionStage(connection, Number(character.id), 8);
  return { name: character.name };
});

/** 天空粉尘只作为感悟媒介保留在背包中；突破本身由角色境界记录。 */
export const contemplateSkyDust = async (qqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; level: number; experience: number; realm_stage: number; owns_sky_dust: number; barrier_stage: number })[]>(`
    SELECT c.id,c.name,c.level,c.experience,c.realm_stage,
      EXISTS(SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=c.id AND i.code='sky_dust' AND pi.quantity>0) AS owns_sky_dust,
      COALESCE((SELECT qp.stage FROM player_main_quest_progress qp WHERE qp.character_id=c.id AND qp.quest_code='realm_barrier' LIMIT 1),0) AS barrier_stage
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE`, [qqUserId]);
  const character = rows[0];
  if (!character) throw new Error('请先注册角色。');
  if (Number(character.realm_stage) !== 1) throw new Error('你已经完成初心境界的突破。');
  if (Number(character.level) < 10 || Number(character.experience) < experienceRequiredForLevel(10)) throw new Error('你的积累尚未触及初心境界的枷锁。');
  if (!Number(character.owns_sky_dust)) throw new Error('背包中没有可供感悟的天空粉尘。');
  if (barrierStage(character.barrier_stage) !== 4) throw new Error('先带着天空粉尘回去向晴儿请教，再开始窥探吧。');
  await connection.execute('UPDATE characters SET realm_stage=2 WHERE id=?', [character.id]);
  return { name: character.name };
});

export const advanceRealmBarrier = async (qqUserId: string, source: 'guild' | 'alchemist') => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; level: number; experience: number; realm_stage: number; owns_sky_dust: number; barrier_stage: number })[]>(`
    SELECT c.id,c.level,c.experience,c.realm_stage,
      EXISTS(SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=c.id AND i.code='sky_dust' AND pi.quantity>0) AS owns_sky_dust,
      COALESCE((SELECT qp.stage FROM player_main_quest_progress qp WHERE qp.character_id=c.id AND qp.quest_code='realm_barrier' LIMIT 1),0) AS barrier_stage
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE`, [qqUserId]);
  const character = rows[0];
  if (!character || Number(character.realm_stage) !== 1 || Number(character.level) < 10 || Number(character.experience) < experienceRequiredForLevel(10)) throw new Error('你暂时还没有遇到这道境界的阻碍。');
  const current = barrierStage(character.barrier_stage);
  const next = source === 'guild'
    ? current === 0 ? 1 : current
    : current === 1 ? Number(character.owns_sky_dust) ? 4 : 2 : current === 2 && Number(character.owns_sky_dust) ? 4 : current;
  await connection.execute('INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,?,?) ON DUPLICATE KEY UPDATE stage=VALUES(stage)', [character.id, barrierQuestCode, next]);
  return { previous: current, stage: next as BarrierStage };
});
