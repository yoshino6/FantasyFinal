import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { blindBoxBlueprints, blueprintRecipeCode, constructionBlueprintCodes } from './deconstructor-catalog';
import { recordAchievement } from './achievement-events';

const questCode = 'dungeon_secret';
const passCode = 'demon_breaker_teleporter';

type CharacterRow = RowDataPacket & { id: number; name: string; level: number; copper_coins: number; current_region_id: number; pos_x: number; pos_y: number; pos_z: number; secondary_profession_code: string | null };
type ProgressRow = RowDataPacket & { stage: number; dungeon_id: number | null; status: 'accepted' | 'completed' | 'claimed' | null };

const characterFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.name,c.level,c.copper_coins,c.current_region_id,c.pos_x,c.pos_y,c.pos_z,c.secondary_profession_code
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};

const progressFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, lock = false) => {
  const [rows] = await connection.execute<ProgressRow[]>(`SELECT p.stage,p.dungeon_id,q.status FROM player_dungeon_secret_progress p
    LEFT JOIN player_side_quests q ON q.character_id=p.character_id AND q.quest_code=?
    WHERE p.character_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [questCode, characterId]);
  return rows[0] ?? null;
};

const ownsItem = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, code: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { quantity: number })[]>('SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=? AND pi.quantity>0 LIMIT 1', [characterId, code]);
  return Number(rows[0]?.quantity ?? 0) > 0;
};

/** 破魔传送器的来源不限于商店：背包持有即完成该任务步骤。 */
const syncOwnedPassProgress = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, progress: ProgressRow | null) => {
  if (!progress || Number(progress.stage) !== 3 || !await ownsItem(connection, characterId, passCode)) return progress;
  await connection.execute('UPDATE player_dungeon_secret_progress SET stage=4 WHERE character_id=? AND stage=3', [characterId]);
  return { ...progress, stage: 4 };
};

const requireAtNpc = async (connection: PoolConnection, character: CharacterRow, code: string) => {
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM map_npcs WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=? LIMIT 1', [code, character.current_region_id, character.pos_x, character.pos_y, character.pos_z]);
  if (!rows[0]) throw new Error('请先前往对应地点，再继续询问。');
};

const affinityFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, npcCode: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { affinity: number })[]>('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=? LIMIT 1', [characterId, npcCode]);
  return Number(rows[0]?.affinity ?? 0);
};

export const discoverDungeonEntrance = async (connection: PoolConnection, characterId: number, dungeonId: number, regionId: number, posX: number, posY: number) => {
  const mapped = await ownsItem(connection, characterId, 'map_dark_forest');
  const [mark] = await connection.execute<any>('INSERT IGNORE INTO player_dungeon_entrance_marks (character_id,dungeon_id,region_id,pos_x,pos_y) VALUES (?,?,?,?,?)', [characterId, dungeonId, regionId, posX, posY]);
  const progress = await progressFor(connection, characterId, true);
  if (!progress) {
    await connection.execute('INSERT INTO player_dungeon_secret_progress (character_id,stage,dungeon_id) VALUES (?,1,?)', [characterId, dungeonId]);
    await connection.execute('INSERT IGNORE INTO player_side_quests (character_id,quest_code) VALUES (?,?)', [characterId, questCode]);
    return { stage: 1, newMark: mapped && Number(mark.affectedRows) > 0, started: true };
  }
  // 迷宫刷新会关闭旧实例并生成新入口。旧入口失效后，保留任务阶段并迁移绑定，避免玩家带着传送器却无法继续剧情。
  if (progress.dungeon_id && Number(progress.dungeon_id) !== dungeonId) {
    const [bound] = await connection.execute<(RowDataPacket & { state: string })[]>('SELECT state FROM dungeon_instances WHERE id=? LIMIT 1 FOR UPDATE', [progress.dungeon_id]);
    if (bound[0]?.state !== 'active') {
      await connection.execute('UPDATE player_dungeon_secret_progress SET dungeon_id=? WHERE character_id=?', [dungeonId, characterId]);
      return { stage: Number(progress.stage), newMark: mapped && Number(mark.affectedRows) > 0, started: false, rebound: true };
    }
  }
  return { stage: Number(progress.stage), newMark: mapped && Number(mark.affectedRows) > 0, started: false };
};

export const dungeonSecretProgress = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); const progress = await syncOwnedPassProgress(pool, character.id, await progressFor(pool, character.id));
  const hasPass = await ownsItem(pool, character.id, passCode);
  return { stage: Number(progress?.stage ?? 0), dungeonId: progress?.dungeon_id === null || progress?.dungeon_id === undefined ? null : Number(progress.dungeon_id), status: progress?.status ?? 'none', hasPass, level: Number(character.level), hasSecondaryProfession: Boolean(character.secondary_profession_code) };
};

export const secondaryProfessionGuide = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { level: number; secondary_profession_code: string | null })[]>('SELECT c.level,c.secondary_profession_code FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  return Number(rows[0]?.level ?? 0) >= 8 && !rows[0]?.secondary_profession_code;
};

export const consultDungeonAtGuild = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); await requireAtNpc(connection, character, 'guild_counter');
  const progress = await progressFor(connection, character.id, true); if (!progress || Number(progress.stage) !== 1) throw new Error('你暂时没有需要向公会询问的地下秘密。');
  const affinity = await affinityFor(connection, character.id, 'guild_counter');
  await connection.execute('UPDATE player_dungeon_secret_progress SET stage=2 WHERE character_id=?', [character.id]);
  const warm = affinity >= 200 ? '莫妮卡停下手中的登记笔，先替你倒了一杯温水，才将那份泛黄的旧档案摊开。' : '莫妮卡听完你的描述，神情严肃地从档案柜深处取出一卷泛黄的旧地图。';
  return `${warm}\n\n“那很可能是地下城迷宫的入口。很久以前，大法师在门上留下封印，是为了不让误入的平民被它吞没；可迷宫会在不同地方显形，封印只能挡住脚步，挡不住它的阴影。”\n\n她指向图纸上的警示符号：“里面有强大的怪物、陷阱和会误导方向的岔路，但也埋着没有被人带走的宝藏。若你真想进去，先去异工坊找唯薇安。她或许有办法处理那层结界。”`;
});

export const consultDungeonAtWorkshop = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); await requireAtNpc(connection, character, 'oddworkshop');
  const progress = await progressFor(connection, character.id, true); if (!progress || Number(progress.stage) !== 2) throw new Error('你暂时不需要向唯薇安询问迷宫。');
  const affinity = await affinityFor(connection, character.id, 'oddworkshop');
  await connection.execute('UPDATE player_dungeon_secret_progress SET stage=3 WHERE character_id=?', [character.id]);
  const familiar = affinity >= 200 ? '唯薇安一听见“结界”两个字，立刻从零件堆里钻了出来，像是早就等着你问。' : '唯薇安听完后眼睛一亮，踮脚从高处的货架上取下一只巴掌大的银黑色圆盘。';
  return `${familiar}\n\n“这是破魔传送器！它能让携带者穿过那种老式封印，还能把你传回地下大门外——真遇到危险时，按下侧面的符文就能强制脱离。”\n\n她把装置在掌心转了一圈，忽然竖起一根手指：“不过制作很麻烦！这台是展示用的样件，基础货架不出售。你可以请掌握图纸的解构师制作；如果自己就是解构师，可以从个人副职业面板进入图纸研习，学会后自行构造，推荐解构师 Lv.6。要进去之前，至少带上一台。”`;
});

export const completeDungeonSecretPurchase = async (connection: PoolConnection, characterId: number) => {
  const progress = await progressFor(connection, characterId, true);
  if (progress && Number(progress.stage) === 3) await connection.execute('UPDATE player_dungeon_secret_progress SET stage=4 WHERE character_id=?', [characterId]);
};

export const studyWorkshopBlueprint = async (qqUserId: string, code: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); await requireAtNpc(connection, character, 'oddworkshop');
  if(character.secondary_profession_code!=='deconstructor' || !constructionBlueprintCodes.has(code) && !blindBoxBlueprints.some(box=>box.code===code)) throw new Error('请在个人解构师研习面板选择可研习图纸。');
  const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; buy_price: number; stock_quantity: number })[]>(`SELECT i.id,i.name,oi.buy_price,oi.stock_quantity FROM oddworkshop_items oi JOIN item_definitions i ON i.id=oi.item_id WHERE i.code=? AND oi.is_active=1 FOR UPDATE`, [code]);
  const item = items[0]; if (!item) throw new Error('这件商品暂时没有摆上货架。');
  if (Number(item.stock_quantity) < 1) throw new Error('这件商品暂时售罄。');
  if (Number(character.copper_coins) < Number(item.buy_price)) throw new Error(`铜币不足，还需要 ${Number(item.buy_price) - Number(character.copper_coins)} 铜币。`);
  if (code === passCode && await ownsItem(connection, character.id, passCode)) throw new Error('你已经持有破魔传送器，无需重复购买。');
  const box = blindBoxBlueprints.find(entry => entry.code === code);
  if (box) {
    if (character.secondary_profession_code !== 'deconstructor') throw new Error('异械盲盒仅向解构师开放。');
    const [professionRows] = await connection.execute<(RowDataPacket & { level: number })[]>('SELECT level FROM player_secondary_professions WHERE character_id=? AND profession_code=\'deconstructor\' LIMIT 1', [character.id]);
    const deconstructorLevel = Number(professionRows[0]?.level ?? 0);
    if (deconstructorLevel < box.requiredLevel) throw new Error(`需要解构师等级 ${box.requiredLevel} 才能开启这只盲盒。`);
    const candidates: string[] = [];
    for (const recipeCode of box.outputs) if (!await ownsItem(connection, character.id, `${recipeCode}_blueprint`)) candidates.push(recipeCode);
    if (!candidates.length) throw new Error('这档盲盒内的图纸你都已拥有，无需重复购买。');
    const rewardCode = candidates[Math.floor(Math.random() * candidates.length)];
    const [rewardRows] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=? LIMIT 1', [`${rewardCode}_blueprint`]);
    if (!rewardRows[0]) throw new Error('盲盒图纸定义尚未初始化，请稍后再试。');
    await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [item.buy_price, character.id]);
    await connection.execute('UPDATE oddworkshop_items SET stock_quantity=stock_quantity-1 WHERE item_id=?', [item.id]);
    await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1,acquired_at=NOW()', [character.id, rewardRows[0].id]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, rewardRows[0].id]);
    recordAchievement(connection,Number(character.id),[{metric:'ACH_K08',value:Number(item.buy_price),life:true}]);
    return { name: item.name, price: Number(item.buy_price), rewardName: rewardRows[0].name };
  }
  if (constructionBlueprintCodes.has(code) && await ownsItem(connection, character.id, code)) throw new Error('这张图纸已经在你的背包中。');
  await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [item.buy_price, character.id]);
  await connection.execute('UPDATE oddworkshop_items SET stock_quantity=stock_quantity-1 WHERE item_id=?', [item.id]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1,acquired_at=NOW()', [character.id, item.id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [character.id, item.id]);
  recordAchievement(connection,Number(character.id),[{metric:'ACH_K08',value:Number(item.buy_price),life:true}]);
  if (code === passCode) await completeDungeonSecretPurchase(connection, character.id);
  return { name: item.name, price: Number(item.buy_price), rewardName: blueprintRecipeCode(code) ? item.name : undefined };
});

export const oddWorkshopDungeonCatalog = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { code: string; name: string; description: string; item_category: string; buy_price: number; stock_quantity: number; quantity: number })[]>(`SELECT i.code,i.name,i.description,i.item_category,oi.buy_price,oi.stock_quantity,COALESCE(pi.quantity,0) AS quantity
    FROM oddworkshop_items oi JOIN item_definitions i ON i.id=oi.item_id LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=?
    WHERE oi.is_active=1 ORDER BY oi.buy_price`, [character.id]);
  return rows.map(row => ({ code: row.code, name: row.name, description: row.description, category: blindBoxBlueprints.some(box => box.code === row.code) ? '盲盒' : row.item_category || '特殊', price: Number(row.buy_price), stock: Number(row.stock_quantity), owned: Number(row.quantity) }));
};

export const entranceStory = async (qqUserId: string, dungeonId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); const progress = await syncOwnedPassProgress(connection, character.id, await progressFor(connection, character.id, true));
  if (!progress || Number(progress.dungeon_id) !== dungeonId) return { stage: 0, text: '楼梯下的石门覆着一层淡银色结界。你的手才刚靠近，便被柔和却无法撼动的力量推开。' };
  const stage = Number(progress.stage);
  if (stage < 2) return { stage, text: '石门上的结界轻轻泛起波纹，像在无声拒绝来客。你想起公会的档案或许会知道这里的来历。' };
  if (stage < 4) return { stage, text: '结界仍横在石门前。唯薇安提过，只有破魔传送器才能让人安全穿过它。' };
  if (!await ownsItem(connection, character.id, passCode)) return { stage, text: '你曾拿到过破魔传送器的线索，但背包里还没有那台装置。结界安静地挡在石门之外。' };
  if (stage === 4) {
    await connection.execute('UPDATE player_dungeon_secret_progress SET stage=5 WHERE character_id=?', [character.id]);
    const affinity = await affinityFor(connection, character.id, 'hunter_lodge');
    const extra = affinity >= 200 ? '雷恩认出你后，没有阻拦，只把磨得雪亮的箭头压回箭袋。' : '石门另一侧忽然传来脚步声。雷恩·霍尔特从阴影里走出，斗篷上还带着地下的冷尘。';
    return { stage: 5, text: `${extra}\n\n他看了一眼你掌中的传送器，低声道：“进去后，别只盯着宝箱。岔路上的壁画、地砖的划痕、风从哪儿吹来，都是迷宫留下的标记；怪物会守在要道，陷阱却最爱等在你觉得安全的地方。看不懂路，就回头，别拿命和墙赌。”\n\n雷恩的目光越过你，落向石门深处。“传送器能送你回来，可别把它当成第二条命。祝你能带着自己的脚印出来。”\n\n他说完侧身让开。破魔传送器亮起一道细线，结界缓缓裂开可供一人通过的缝隙。` };
  }
  return { stage, text: '结界已经在破魔传送器前让开了一道缝隙。石阶向下延伸，黑暗中有潮湿的风迎面涌来。' };
});

export const authorizeDungeonEntry = async (connection: PoolConnection, characterId: number, dungeonId: number) => {
  const progress = await progressFor(connection, characterId, true);
  if (!progress || Number(progress.dungeon_id) !== dungeonId || Number(progress.stage) < 5) throw new Error('石门上的结界尚未解除。先完成支线【地下的秘密】的引导。');
  if (!await ownsItem(connection, characterId, passCode)) throw new Error('缺少破魔传送器，无法穿过石门结界。');
  if (Number(progress.stage) === 5) await connection.execute('UPDATE player_dungeon_secret_progress SET stage=6 WHERE character_id=?', [characterId]);
};

export const completeDungeonSecretForLeader = async (connection: PoolConnection, characterIds: number[], spawnIds: number[]) => {
  if (!characterIds.length || !spawnIds.length) return false;
  const [leaders] = await connection.execute<RowDataPacket[]>(`SELECT dm.dungeon_id FROM dungeon_monsters dm WHERE dm.is_floor_leader=1 AND dm.spawn_id IN (${spawnIds.map(() => '?').join(',')}) LIMIT 1`, spawnIds);
  const dungeonId = Number(leaders[0]?.dungeon_id ?? 0); if (!dungeonId) return false;
  await connection.execute(`UPDATE player_dungeon_secret_progress p JOIN player_side_quests q ON q.character_id=p.character_id AND q.quest_code=?
    SET p.stage=7,q.status='completed',q.completed_at=NOW() WHERE p.dungeon_id=? AND p.stage=6 AND p.character_id IN (${characterIds.map(() => '?').join(',')})`, [questCode, dungeonId, ...characterIds]);
  return true;
};

export const markedDungeonEntrances = async (qqUserId: string, regionCode: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); if (regionCode !== 'dark_forest') return [];
  const progress = await progressFor(pool, character.id);
  const [rows] = await pool.execute<(RowDataPacket & { id: number; x: number; y: number })[]>(`SELECT d.id,m.pos_x AS x,m.pos_y AS y FROM player_dungeon_entrance_marks m
    JOIN dungeon_instances d ON d.id=m.dungeon_id JOIN map_regions r ON r.id=m.region_id
    WHERE m.character_id=? AND d.state='active' AND r.code=? ORDER BY d.id,x,y`, [character.id, regionCode]);
  return rows.map((row, index) => ({ id: Number(row.id), x: Number(row.x), y: Number(row.y), name: Number(progress?.stage ?? 0) >= 2 ? '地下迷宫入口' : `地下大门${index + 1}#` }));
};

/** 旧货架购买只接受最终成品，图纸研习属于个人副职业。 */
export const buyOddWorkshopItem = async (user:string,code:string) => {
  const {buySecondaryFinished}=await import('./secondary-shop.service');
  const pool=await getPool(); const[rows]=await pool.execute<RowDataPacket[]>('SELECT id FROM item_definitions WHERE code=?',[code]);
  if(!rows[0]) throw new Error('该成品不存在。');
  const result=await buySecondaryFinished(user,'oddworkshop',Number(rows[0].id));
  return {name:result.name,price:result.price,rewardName:undefined as string|undefined};
};
