import { achievementSecondaryLevel } from './achievement-hooks';
import { talentProficiency } from './talent-rewards';
import { currentSecondaryShop, shopProgressFor } from './secondary-shop-context';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { materialValueMultiplierForLevel } from './monster-crafting-material.service';
import { secondaryProfessionBonus, secondaryProfessionMaxLevel, secondaryProfessionProficiencyRequired } from './secondary-profession';

const questCode = 'omniscient_apprentice';
type Connection = Pool | PoolConnection;

const characterFor = async (connection: Connection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; level: number; name: string; secondary_profession_code: string | null; current_region_id: number; pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT c.id,c.level,c.name,c.secondary_profession_code,c.current_region_id,c.pos_x,c.pos_y,c.pos_z FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};

export const omniscientQuest = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { status: string | null; slime_observed: number | null; wolf_king_observed: number | null })[]>(`SELECT q.status,op.slime_observed,op.wolf_king_observed
    FROM characters c LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=?
    LEFT JOIN player_omniscient_quest_progress op ON op.character_id=c.id WHERE c.id=?`, [questCode, character.id]);
  const row = rows[0]; const slimeObserved = Boolean(row?.slime_observed); const wolfKingObserved = Boolean(row?.wolf_king_observed);
  const completed = row?.status === 'accepted' && slimeObserved && wolfKingObserved;
  if (completed) await pool.execute("UPDATE player_side_quests SET status='completed',completed_at=COALESCE(completed_at,NOW()) WHERE character_id=? AND quest_code=?", [character.id, questCode]);
  const status = character.secondary_profession_code === 'omniscient' ? 'claimed' : completed ? 'completed' : row?.status === 'claimed' ? 'none' : row?.status ?? 'none';
  return { status, slimeObserved, wolfKingObserved } as const;
};

export const acceptOmniscientQuest = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  if (Number(character.level) < 10) throw new Error('secondary_profession_level_required');
  if (character.secondary_profession_code && character.secondary_profession_code !== 'omniscient') throw new Error('你已经拥有其他副职业，无法再选择全知者。');
  if (character.secondary_profession_code === 'omniscient') return;
  await connection.execute("INSERT INTO player_side_quests (character_id,quest_code) VALUES (?,?) ON DUPLICATE KEY UPDATE status='accepted',completed_at=NULL,claimed_at=NULL", [character.id, questCode]);
  await connection.execute('INSERT INTO player_omniscient_quest_progress (character_id) VALUES (?) ON DUPLICATE KEY UPDATE slime_observed=0,wolf_king_observed=0', [character.id]);
});

export const recordOmniscientObservation = async (connection: PoolConnection, characterId: number, targetCodes: string[]) => {
  const sawSlime = targetCodes.includes('forest_slime'); const sawWolfKing = targetCodes.includes('shadow_wolf_king');
  if (!sawSlime && !sawWolfKing) return;
  const [quests] = await connection.execute<(RowDataPacket & { status: string })[]>('SELECT status FROM player_side_quests WHERE character_id=? AND quest_code=? FOR UPDATE', [characterId, questCode]);
  if (!quests[0] || !['accepted', 'completed'].includes(quests[0].status)) return;
  await connection.execute(`INSERT INTO player_omniscient_quest_progress (character_id,slime_observed,wolf_king_observed) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE slime_observed=GREATEST(slime_observed,VALUES(slime_observed)),wolf_king_observed=GREATEST(wolf_king_observed,VALUES(wolf_king_observed))`, [characterId, sawSlime ? 1 : 0, sawWolfKing ? 1 : 0]);
  const [progress] = await connection.execute<(RowDataPacket & { slime_observed: number; wolf_king_observed: number })[]>('SELECT slime_observed,wolf_king_observed FROM player_omniscient_quest_progress WHERE character_id=? FOR UPDATE', [characterId]);
  if (Number(progress[0]?.slime_observed) && Number(progress[0]?.wolf_king_observed)) await connection.execute("UPDATE player_side_quests SET status='completed',completed_at=NOW() WHERE character_id=? AND quest_code=? AND status='accepted'", [characterId, questCode]);
};

export const claimOmniscientQuest = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [quests] = await connection.execute<(RowDataPacket & { status: string })[]>('SELECT status FROM player_side_quests WHERE character_id=? AND quest_code=? FOR UPDATE', [character.id, questCode]);
  if (quests[0]?.status !== 'completed') throw new Error('任务尚未完成。');
  const [gifts] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=\'luowen_gift\' LIMIT 1 FOR UPDATE');
  if (!gifts[0]) throw new Error('洛文的赠礼尚未初始化，请重启机器人后重试。');
  await connection.execute("UPDATE player_side_quests SET status='claimed',claimed_at=NOW() WHERE character_id=? AND quest_code=?", [character.id, questCode]);
  await connection.execute("UPDATE characters SET secondary_profession_code='omniscient' WHERE id=?", [character.id]);
  await connection.execute("INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,'omniscient',1,0)", [character.id]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [character.id, gifts[0].id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, gifts[0].id]);
  return { name: '全知者', characterName: character.name, giftName: gifts[0].name };
});

export const omniscientProgress = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  const shop=await shopProgressFor(pool,Number(character.id),'omniscient');if(shop)return {...shop,rangeBonus:3,informationBonus:3,dropBonusPct:shop.bonus};
  if (character.secondary_profession_code !== 'omniscient') throw new Error('尚未转职全知者。');
  await pool.execute("INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,'omniscient',1,0)", [character.id]);
  const [rows] = await pool.execute<(RowDataPacket & { level: number; proficiency: number })[]>('SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code=\'omniscient\'', [character.id]);
  const level = Math.min(secondaryProfessionMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
  const proficiency = level >= secondaryProfessionMaxLevel ? 0 : Number(rows[0]?.proficiency ?? 0);
  const informationBonus = Math.min(4, level);
  const rangeBonus = level + (informationBonus >= 4 ? 1 : 0);
  const required = secondaryProfessionProficiencyRequired(level);
  return { level, proficiency, required, rangeBonus, informationBonus, dropBonusPct: secondaryProfessionBonus(level) };
};

/** 全知者每场战斗按怪物材料价值获得熟练度，随机补足小数以保持 1.2 倍累乘期望。 */
export const awardOmniscientProficiency = async (connection: PoolConnection, characterId: number, targetLevels: readonly number[]) => {
  const [characters] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>('SELECT secondary_profession_code FROM characters WHERE id=? FOR UPDATE', [characterId]);
  if (characters[0]?.secondary_profession_code !== 'omniscient') return null;
  await connection.execute("INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,'omniscient',1,0)", [characterId]);
  const [rows] = await connection.execute<(RowDataPacket & { level: number; proficiency: number })[]>('SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code=\'omniscient\' FOR UPDATE', [characterId]);
  let level = Math.min(secondaryProfessionMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
  let proficiency = level >= secondaryProfessionMaxLevel ? 0 : Number(rows[0]?.proficiency ?? 0);
  const averageLevel = targetLevels.reduce((total, targetLevel) => total + Math.max(1, Number(targetLevel)), 0) / Math.max(1, targetLevels.length);
  const materialValue = materialValueMultiplierForLevel(averageLevel); const gain = await talentProficiency(connection,characterId,Math.floor(materialValue) + (Math.random() < materialValue % 1 ? 1 : 0),{profession:'omniscient',successfulBase:0});
  proficiency += gain;
  while (level < secondaryProfessionMaxLevel && proficiency >= secondaryProfessionProficiencyRequired(level)) {
    proficiency -= secondaryProfessionProficiencyRequired(level);
    level += 1;
  }
  if (level >= secondaryProfessionMaxLevel) proficiency = 0;
  await connection.execute("UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=? AND profession_code='omniscient'", [level, proficiency, characterId]);
  achievementSecondaryLevel(connection,Number(characterId),level);
  return { level, proficiency, required: secondaryProfessionProficiencyRequired(level), gain };
};

const direction = (fromX: number, fromY: number, toX: number, toY: number) => {
  const vertical = toY > fromY ? '北' : toY < fromY ? '南' : '';
  const horizontal = toX > fromX ? '东' : toX < fromX ? '西' : '';
  return `${horizontal}${vertical}` || '附近';
};
const traceDistanceHint = (fromX: number, fromY: number, toX: number, toY: number) => {
  // 地图移动按横纵坐标逐格推进，使用实际所需的曼哈顿步数而非直线距离。
  const distance = Math.abs(toX - fromX) + Math.abs(toY - fromY);
  return distance <= 10 ? '很近' : distance <= 25 ? '较近' : distance <= 50 ? '较远' : '很远';
};
type TrailProfile = { aura: string; signs: [string, string, string]; interruption: string };
const trailProfiles: Record<string, TrailProfile> = {
  forest_slime: { aura: '黏稠而灼热的魔力正在缓慢鼓动', signs: ['苔藓间残留着一片异常温热的黏液，边缘已开始凝结。', '数株灌木被沉重躯体压弯，枝叶上挂着猩红色的胶质。', '泥地里留下连续的滑痕，周围草木被高温烤得卷曲。'], interruption: '湿热的黏液气息忽然凝固，像被谁从林中整个抹去。' },
  shadow_wolf_king: { aura: '隐约的暗影魔力在风里起伏', signs: ['地上横亘着一道爪痕，但似乎不是很新鲜。', '一串连绵起伏的脚印压过湿土，残叶间还留着碎毛。', '此处草木翻折，打斗痕迹无比新鲜。'], interruption: '血腥的气息似乎消失了，林间只剩下散不开的薄雾。' },
  rootcrown_ram: { aura: '厚重的木元素正随地脉一同呼吸', signs: ['草根被巨力翻起，断面渗出微亮的树汁。', '几株矮树的树皮留有向上顶裂的撞痕。', '新鲜的角质碎屑嵌在泥土里，仍带着温热的木息。'], interruption: '草叶重新垂下，先前躁动的根系已经归于沉寂。' },
  dawntide_crocodile: { aura: '潮湿而凶蛮的水汽正沿河湾游走', signs: ['浅滩上散落着破裂的河壳，边缘留有巨大的齿印。', '泥水里拖着一条宽阔的尾痕，尚未被河流抹平。', '芦苇被压成一片，水面浮着新鲜的暗红色涟漪。'], interruption: '河雾卷走了腥味，水面恢复得像什么都没发生过。' },
  shattertide_crab: { aura: '坚硬甲壳间的水元素发出低沉回响', signs: ['碎潮池边堆着新鲜裂开的甲壳，断口锋利如刃。', '礁石上留有数道横向刮痕，潮水尚未完全灌满。', '湿沙里陷着沉重步足印，周围细砾被碾成粉末。'], interruption: '潮声忽然变得空洞，甲壳碰撞的余响也彻底断绝。' },
  gruen_mountainheart: { aura: '沉重的土元素在岩层深处规律震颤', signs: ['碎石间散落着刚崩落的矿屑，仍带有轻微震感。', '岩壁上多出一道粗粝裂纹，像被巨拳硬生生砸开。', '地面残留着沉重足迹，缝隙里还透出土黄微光。'], interruption: '山腹的震颤平息了，尘土缓缓落回裂缝。' },
  valk_forge_overseer: { aura: '炽热的炉火魔力混着铁锈味翻涌', signs: ['焦黑石面散着新鲜炉渣，踩近仍能感到灼热。', '断裂铁链被拖过矿道，留下明亮的刮擦痕。', '岩壁上有刚熄灭的火印，空气里仍残着敲击回声。'], interruption: '炉火味被冷风吹散，只余一地无温的灰烬。' },
  threehead_mother: { aura: '腥甜的沼雾里混入三股纠缠的气息', signs: ['泥潭边留有三种方向交错的蛇行痕迹。', '腐根上挂着刚褪下的鳞片，颜色仍未黯淡。', '芦苇大片折伏，腥甜气息浓得几乎化不开。'], interruption: '沼雾吞没了最后一点腥甜，泥水重新归于死寂。' },
  fallingstar_mudid: { aura: '陨星残响在暗水下发出低沉嗡鸣', signs: ['星泥表面浮着不规则凹坑，边缘还闪着细碎冷光。', '淤泥里混有刚碎裂的陨石壳，触碰时指尖发麻。', '周围水草被未知力量压伏，暗光正从泥底渗出。'], interruption: '陨星的嗡鸣忽然止息，暗水再也没有回应。' },
  frostking_whiteantler: { aura: '刺骨的冰息在雪线下无声扩散', signs: ['积雪上横着一道巨大的角痕，冰晶尚未融化。', '冻松枝头散落着新鲜白毛，周围霜纹向外蔓延。', '雪面被沉重蹄印踏碎，裂隙中凝着新的寒霜。'], interruption: '风雪抹平了蹄印，冰息也像从未出现过一样淡去。' },
  askr_stormroc: { aura: '断崖上空有躁动雷意在云层间回鸣', signs: ['焦黑羽片嵌在岩缝里，边缘仍跳着细微电弧。', '碎石被利爪翻开，空气里留有暴雨前的腥味。', '崖顶草木尽数伏倒，远处传来刚消散的雷鸣。'], interruption: '雷云突然散开，连残余的电意也被风带走。' },
  seles_eclipse_watcher: { aura: '光与暗彼此纠缠的魔力正在遗迹深处回荡', signs: ['破碎砖石上出现新鲜的半月灼痕，光暗边界仍在游移。', '古老铭文被无形力量擦亮，地面留有交错的黑白碎屑。', '坍塌石柱周围浮着细小月尘，空气里有低沉的祷音。'], interruption: '月尘无声落尽，遗迹重新只剩下空洞的回音。' }
};
const fallbackTrailProfile = (name: string): TrailProfile => ({ aura: '难以辨析的强大魔力正在远处盘踞', signs: [`地面留有属于【${name}】的凌乱痕迹，尚未被风完全掩去。`, '附近的草木与碎石都被某种强大力量扰乱了原本的位置。', '残余魔力在此处格外浓重，连呼吸都像被轻轻压住。'], interruption: '原本清晰的魔力残响突然断开，仿佛目标已经离开此地。' });
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
const clueVariant = (profile: TrailProfile, stage: number) => {
  const sign = profile.signs[Math.min(2, stage)] ?? profile.signs[2];
  const endings = ['你的感知停留了片刻，才重新捕捉到下一缕余波。', '残留的魔力仍在缓慢消散。', '这显然是目标不久前留下的痕迹。', '空气里还残着难以忽视的压迫感。', '附近的细小生灵似乎刚刚逃离。', '地面的细节被你的感知一一拼合。', '痕迹虽不完整，却足够指向新的方向。', '风声掠过时，余韵仍在耳边震动。', '你辨认出其中有一部分并非自然留下。', '这条线索让目标的轮廓更清晰了一分。'];
  return `${sign}${pick(endings)}`;
};
const initialVariant = (profile: TrailProfile, bearing: string) => pick([
  `你感知到${bearing}方有${profile.aura}。`, `一缕异常的感知牵向${bearing}方：${profile.aura}。`, `风里传来${bearing}方的回响，那里${profile.aura}。`, `你的意识捕捉到${bearing}方一阵脉动——${profile.aura}。`, `地脉的细响指向${bearing}方，${profile.aura}。`, `你从杂乱的气息中分辨出${bearing}方的异样：${profile.aura}。`, `感知边缘泛起波纹，${bearing}方${profile.aura}。`, `有一道微弱却顽固的踪迹从${bearing}方传来，${profile.aura}。`, `你停下脚步，察觉${bearing}方${profile.aura}。`, `周围的元素悄然偏转，${bearing}方${profile.aura}。`
]);
const nextVariant = (bearing: string) => pick([
  `余下的痕迹向${bearing}方延伸。`, `下一缕魔力残响从${bearing}方传来。`, `你的感知提示你继续前往${bearing}方。`, `空气中的细微异样正指向${bearing}方。`, `残留气息在${bearing}方变得更清晰。`, `地面的微小变化一路引向${bearing}方。`, `你捕捉到${bearing}方有新的线索正在等待。`, `风声把若有若无的余韵送往${bearing}方。`, `附近的元素流向暗示${bearing}方仍有踪迹。`, `你的感知在${bearing}方轻轻收紧。`
]);
const interruptionVariant = (profile: TrailProfile) => pick([
  profile.interruption, `你追寻的余韵骤然断绝。${profile.interruption}`, `原本清晰的感应被什么东西搅散，只剩一片空白。${profile.interruption}`, `魔力的脉搏在此刻沉寂，后续的踪迹再也无法延展。${profile.interruption}`, `四周的异样消退得太快，仿佛猎物已经离开了这片土地。${profile.interruption}`, `感知末端传来一阵短促的震颤，随后归于沉寂。${profile.interruption}`, `你试图顺着残响继续追溯，却只摸到一段被掐断的空洞。${profile.interruption}`, `那道若隐若现的气息忽然散开，已无法再辨出方向。${profile.interruption}`, `线索在最关键处褪成了杂乱的魔力噪声。${profile.interruption}`, `你感到这场追猎已被旁人或别的变故打断。${profile.interruption}`
]);
const trailNodes = (boss: { id: number; pos_x: number; pos_y: number; min_x: number; max_x: number; min_y: number; max_y: number }) => {
  const centerX = (Number(boss.min_x) + Number(boss.max_x)) / 2; const centerY = (Number(boss.min_y) + Number(boss.max_y)) / 2;
  let vx = centerX - Number(boss.pos_x); let vy = centerY - Number(boss.pos_y); const length = Math.hypot(vx, vy) || 1; vx /= length; vy /= length;
  const rotate = (degrees: number) => { const radians = degrees * Math.PI / 180; return { x: vx * Math.cos(radians) - vy * Math.sin(radians), y: vx * Math.sin(radians) + vy * Math.cos(radians) }; };
  const radius = Math.max(12, Math.min(72, Math.min(Number(boss.max_x) - Number(boss.min_x), Number(boss.max_y) - Number(boss.min_y)) * .32)); const side = Number(boss.id) % 2 ? 1 : -1;
  const clamp = (value: number, low: number, high: number) => Math.max(low + 2, Math.min(high - 2, Math.round(value)));
  const count = 3 + Number(boss.id) % 4;
  const raw = Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    const distance = .95 - progress * .72; const angle = 78 - progress * 60;
    const vector = rotate(angle * side);
    return { x: clamp(Number(boss.pos_x) + vector.x * radius * distance, Number(boss.min_x), Number(boss.max_x)), y: clamp(Number(boss.pos_y) + vector.y * radius * distance, Number(boss.min_y), Number(boss.max_y)) };
  });
  // 线索之间按实际横纵移动步数限为 40 格，避免中段出现过长的赶路空档。
  const nodes = new Array<{ x: number; y: number }>(count); let next = { x: Number(boss.pos_x), y: Number(boss.pos_y) };
  for (let index = raw.length - 1; index >= 0; index -= 1) {
    const candidate = raw[index]!; const distance = Math.abs(candidate.x - next.x) + Math.abs(candidate.y - next.y);
    const node = distance <= 40 ? candidate : { x: next.x + Math.trunc((candidate.x - next.x) * 40 / distance), y: next.y + Math.trunc((candidate.y - next.y) * 40 / distance) };
    nodes[index] = node; next = node;
  }
  return nodes;
};

export const omniscientTraces = async (qqUserId: string) => {
  const pool = await getPool(); const preview = await characterFor(pool, qqUserId);
  if (preview.secondary_profession_code !== 'omniscient'&&!currentSecondaryShop()) return null;
  return withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  await shopProgressFor(connection,Number(character.id),'omniscient');
  const [materials] = await connection.execute<(RowDataPacket & { name: string })[]>(`SELECT i.name FROM map_resource_pools rp JOIN item_definitions i ON i.id=rp.item_id
    LEFT JOIN blacksmith_refinement_materials rm ON rm.item_id=i.id WHERE rp.region_id=? AND rm.item_id IS NOT NULL ORDER BY rm.max_gain DESC,rp.spawn_density ASC,i.id DESC LIMIT 1`, [character.current_region_id]);
  const materialText = materials[0] ? `【锻材感知】本区域最高阶锻材为「${materials[0].name}」，其地脉共鸣正与强敌的气息彼此呼应。` : null;
  const [bossRows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; pos_x: number; pos_y: number; min_x: number; max_x: number; min_y: number; max_y: number; occupied: number })[]>(`SELECT s.id,t.code,t.name,s.pos_x,s.pos_y,r.min_x,r.max_x,r.min_y,r.max_y,
    EXISTS(SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=s.id AND cs.state='active') AS occupied
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id JOIN map_regions r ON r.id=s.region_id
    WHERE s.region_id=? AND s.defeated_at IS NULL AND t.monster_class='boss'
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial'))
    ORDER BY s.spawned_at DESC,s.id DESC LIMIT 1 FOR UPDATE`, [character.current_region_id]);
  const boss = bossRows[0];
  if (!boss) {
    const [previous] = await connection.execute<(RowDataPacket & { spawn_id: number; boss_code: string; boss_name: string })[]>(`SELECT spawn_id,boss_code,boss_name FROM player_omniscient_boss_traces WHERE character_id=? AND region_id=? AND interrupted=0 AND completed=0 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`, [character.id, character.current_region_id]);
    if (!previous[0]) return materialText;
    const profile = trailProfiles[previous[0].boss_code] ?? fallbackTrailProfile(previous[0].boss_name);
    await connection.execute('UPDATE player_omniscient_boss_traces SET interrupted=1 WHERE character_id=? AND spawn_id=?', [character.id, previous[0].spawn_id]);
    return [materialText, `【线索·中断】${interruptionVariant(profile)}`].filter(Boolean).join('\n');
  }
  await connection.execute(`INSERT INTO player_omniscient_boss_traces (character_id,spawn_id,region_id,boss_code,boss_name) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE boss_name=VALUES(boss_name),updated_at=NOW()`, [character.id, boss.id, character.current_region_id, boss.code, boss.name]);
  const [traceRows] = await connection.execute<(RowDataPacket & { stage: number; interrupted: number; completed: number })[]>('SELECT stage,interrupted,completed FROM player_omniscient_boss_traces WHERE character_id=? AND spawn_id=? FOR UPDATE', [character.id, boss.id]);
  const profile = trailProfiles[boss.code] ?? fallbackTrailProfile(boss.name); const trace = traceRows[0]!;
  const nodes = trailNodes(boss); const previousStage = Math.max(0, Number(trace.stage)); let stage = previousStage;
  if (Number(trace.completed)) return [materialText, `【踪迹】${boss.name} 位于（${boss.pos_x}，${boss.pos_y}）`].filter(Boolean).join('\n');
  if (Number(trace.interrupted)) return [materialText, `【线索·中断】${interruptionVariant(profile)}`].filter(Boolean).join('\n');
  if (Number(boss.occupied)) {
    if (!Number(trace.interrupted)) await connection.execute('UPDATE player_omniscient_boss_traces SET interrupted=1 WHERE character_id=? AND spawn_id=?', [character.id, boss.id]);
    return [materialText, `【线索·中断】${interruptionVariant(profile)}`].filter(Boolean).join('\n');
  }
  while (stage < nodes.length && Number(character.pos_x) === nodes[stage]!.x && Number(character.pos_y) === nodes[stage]!.y) stage += 1;
  // 仅在本次推进时回显刚完成的线索；后续打开面板只保留尚待追寻的线索。
  const completedLines = Array.from({ length: Math.max(0, stage - previousStage) }, (_, index) =>
    `【线索·${previousStage + index + 1}】${clueVariant(profile, previousStage + index)}`);
  if (stage >= nodes.length) {
    await connection.execute('UPDATE player_omniscient_boss_traces SET stage=?,completed=1 WHERE character_id=? AND spawn_id=?', [stage, character.id, boss.id]);
    return [materialText, ...completedLines, `【踪迹】${boss.name} 位于（${boss.pos_x}，${boss.pos_y}）`].filter(Boolean).join('\n');
  }
  if (stage !== previousStage) await connection.execute('UPDATE player_omniscient_boss_traces SET stage=? WHERE character_id=? AND spawn_id=?', [stage, character.id, boss.id]);
  const bearing = direction(Number(character.pos_x), Number(character.pos_y), nodes[stage]!.x, nodes[stage]!.y);
  const distanceHint = traceDistanceHint(Number(character.pos_x), Number(character.pos_y), nodes[stage]!.x, nodes[stage]!.y);
  const lines = [materialText, ...completedLines];
  lines.push(`【线索·${stage + 1}】${stage === 0 ? initialVariant(profile, bearing) : nextVariant(bearing)}（${distanceHint}）`);
  return lines.filter(Boolean).join('\n');
  });
};
