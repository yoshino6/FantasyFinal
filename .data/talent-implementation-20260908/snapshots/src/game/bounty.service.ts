import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

type Connection = Pool | PoolConnection;
type BountyRow = RowDataPacket & { id: number; board_no?: number; title: string; target_name: string; required_count: number; copper_reward: number; source_spawn_id: number | null; region_name: string | null; pos_x: number | null; pos_y: number | null; pos_z: number | null; progress: number | null; status: 'accepted' | 'completed' | 'claimed' | null; is_invalid?: number };
type CharacterRow = RowDataPacket & { id: number; adventurer_registered: number };

const refreshKey = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}`;
};

const characterFor = async (connection: Connection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.adventurer_registered FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};

const boardCandidate = `b.source_spawn_id IS NOT NULL AND b.is_active=1 AND b.expires_at>NOW() AND s.defeated_at IS NULL
  AND COALESCE(r.is_owner_only,0)=0 AND COALESCE(r.is_enabled,1)=1
  AND EXISTS (SELECT 1 FROM map_monster_pools mp WHERE mp.region_id=s.region_id AND mp.monster_template_id=s.template_id) AND (
    t.monster_class='boss' OR (t.monster_class='elite' AND JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','riot')))
  ) AND NOT EXISTS (SELECT 1 FROM dungeon_monsters dm JOIN dungeon_instances d ON d.id=dm.dungeon_id WHERE dm.spawn_id=s.id AND d.state<>'active')`;
const sourceSpawnUnavailable = `(s.id IS NULL OR s.defeated_at IS NOT NULL OR EXISTS (
  SELECT 1 FROM dungeon_monsters dm JOIN dungeon_instances d ON d.id=dm.dungeon_id
  WHERE dm.spawn_id=s.id AND d.state<>'active'
))`;
const occupiedBountySlot = `(pb.status='completed' OR (pb.status='accepted' AND b.is_active=1 AND b.expires_at>NOW()
  AND (b.source_spawn_id IS NULL OR NOT ${sourceSpawnUnavailable})))`;

const syncBountyBoard = async (connection: Connection) => {
  await connection.execute(`DELETE bs FROM bounty_board_slots bs
    LEFT JOIN bounty_notices b ON b.id=bs.bounty_id
    LEFT JOIN monster_spawns s ON s.id=b.source_spawn_id
    LEFT JOIN monster_templates t ON t.id=b.target_template_id
    LEFT JOIN map_regions r ON r.id=s.region_id
    WHERE b.id IS NULL OR NOT (${boardCandidate})`);
  const [slots] = await connection.execute<(RowDataPacket & { slot_no: number })[]>('SELECT slot_no FROM bounty_board_slots ORDER BY slot_no');
  const usedSlots = new Set(slots.map(slot => Number(slot.slot_no)));
  const vacantSlots = Array.from({ length: 10 }, (_, index) => index + 1).filter(slot => !usedSlots.has(slot));
  if (!vacantSlots.length) return;
  const [candidates] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT b.id FROM bounty_notices b
    JOIN monster_spawns s ON s.id=b.source_spawn_id JOIN monster_templates t ON t.id=b.target_template_id
    LEFT JOIN map_regions r ON r.id=s.region_id LEFT JOIN bounty_board_slots bs ON bs.bounty_id=b.id
    WHERE bs.bounty_id IS NULL AND ${boardCandidate} ORDER BY RAND() LIMIT ?`, [vacantSlots.length]);
  for (const [index, candidate] of candidates.entries()) {
    await connection.execute('INSERT IGNORE INTO bounty_board_slots (slot_no,bounty_id) VALUES (?,?)', [vacantSlots[index], candidate.id]);
  }
};

export const refreshBounties = async (connection: Connection, _rollBossBounties = false) => {
  await connection.execute('UPDATE bounty_notices SET is_active=0 WHERE is_active=1 AND expires_at<=NOW()');
  await connection.execute('UPDATE bounty_notices SET is_active=0 WHERE is_active=1 AND source_spawn_id IS NULL');
  await connection.execute(`UPDATE bounty_notices b LEFT JOIN monster_spawns s ON s.id=b.source_spawn_id
    SET b.is_active=0 WHERE b.source_spawn_id IS NOT NULL AND ${sourceSpawnUnavailable}`);
  await connection.execute(`UPDATE bounty_notices b JOIN monster_spawns s ON s.id=b.source_spawn_id
    SET b.is_active=0 WHERE b.is_active=1 AND (
      NOT EXISTS (SELECT 1 FROM map_monster_pools mp WHERE mp.region_id=s.region_id AND mp.monster_template_id=s.template_id)
      OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))
      OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution'))
      OR JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial'))
    )`);
  await connection.execute(`INSERT INTO bounty_notices (refresh_key,title,target_template_id,source_spawn_id,required_count,copper_reward,is_active,expires_at)
    SELECT CONCAT('riot-',s.id),CONCAT('紧急：镇压暴动的',t.name),s.template_id,s.id,1,120+COALESCE(s.level,t.level)*20,1,DATE_ADD(NOW(),INTERVAL 3650 DAY)
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE s.defeated_at IS NULL AND t.monster_class='elite' AND JSON_CONTAINS(s.traits_json,JSON_OBJECT('code','riot'))
      AND EXISTS (SELECT 1 FROM map_monster_pools mp WHERE mp.region_id=s.region_id AND mp.monster_template_id=s.template_id)
    ON DUPLICATE KEY UPDATE title=VALUES(title),source_spawn_id=VALUES(source_spawn_id),copper_reward=VALUES(copper_reward),is_active=1,expires_at=VALUES(expires_at)`);
  await connection.execute(`INSERT INTO bounty_notices (refresh_key,title,target_template_id,source_spawn_id,required_count,copper_reward,is_active,expires_at)
    SELECT CONCAT('boss-',s.id),CONCAT('紧急：讨伐',t.name),s.template_id,s.id,1,300+COALESCE(s.level,t.level)*60,1,DATE_ADD(NOW(),INTERVAL 3650 DAY)
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE t.monster_class='boss' AND s.defeated_at IS NULL
      AND EXISTS (SELECT 1 FROM map_monster_pools mp WHERE mp.region_id=s.region_id AND mp.monster_template_id=s.template_id)
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial'))
    ON DUPLICATE KEY UPDATE title=VALUES(title),source_spawn_id=VALUES(source_spawn_id),copper_reward=VALUES(copper_reward),is_active=1,expires_at=VALUES(expires_at)`);
  // 地图开放、怪物刷新等入口调用本函数后，悬赏板立即同步，不必等玩家下一次手动打开面板。
  await syncBountyBoard(connection);
};

export const postBossBounty = async (bossCode: string) => {
  const pool = await getPool();
  const [result] = await pool.execute<any>(`INSERT INTO bounty_notices (refresh_key,title,target_template_id,source_spawn_id,required_count,copper_reward,is_active,expires_at)
    SELECT CONCAT('boss-',s.id),CONCAT('紧急：讨伐',t.name),s.template_id,s.id,1,300+COALESCE(s.level,t.level)*60,1,DATE_ADD(NOW(),INTERVAL 3650 DAY)
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE t.code=? AND t.monster_class='boss' AND s.defeated_at IS NULL
      AND EXISTS (SELECT 1 FROM map_monster_pools mp WHERE mp.region_id=s.region_id AND mp.monster_template_id=s.template_id)
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','boss_test'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution'))
      AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial'))
    ON DUPLICATE KEY UPDATE title=VALUES(title),source_spawn_id=VALUES(source_spawn_id),copper_reward=VALUES(copper_reward),is_active=1,expires_at=VALUES(expires_at)`, [bossCode]);
  if (!Number(result.affectedRows)) throw new Error('当前 Boss 未刷新，无法上悬赏板。');
  await pool.execute(`INSERT INTO boss_bounty_rolls (spawn_id,last_roll_key,posted_at)
    SELECT s.id,?,NOW() FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
      WHERE t.code=? AND t.monster_class='boss' AND s.defeated_at IS NULL
        AND EXISTS (SELECT 1 FROM map_monster_pools mp WHERE mp.region_id=s.region_id AND mp.monster_template_id=s.template_id)
        AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_goblin_king'))
        AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','main_quest_evolution'))
        AND NOT JSON_CONTAINS(COALESCE(s.traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_profession_trial'))
    ON DUPLICATE KEY UPDATE last_roll_key=VALUES(last_roll_key),posted_at=VALUES(posted_at)`, [refreshKey(), bossCode]);
  const [rows] = await pool.execute<(RowDataPacket & { id: number; title: string })[]>(`SELECT b.id,b.title FROM bounty_notices b JOIN monster_templates t ON t.id=b.target_template_id
    WHERE t.code=? AND b.is_active=1 AND b.expires_at>NOW() ORDER BY b.id DESC LIMIT 1`, [bossCode]);
  return rows[0];
};

export const bountyBoard = async (qqUserId: string, _requestedPage = 1, keyword = '') => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); await refreshBounties(pool); await syncBountyBoard(pool);
  const search = String(keyword).trim(); const pageSize = 10;
  const searchSql = search ? ' AND (b.title LIKE CONCAT(\'%\',?,\'%\') OR t.name LIKE CONCAT(\'%\',?,\'%\'))' : '';
  const [rows] = await pool.execute<BountyRow[]>(`SELECT b.id,bs.slot_no AS board_no,b.title,t.name AS target_name,b.required_count,b.copper_reward,b.source_spawn_id,r.name AS region_name,s.pos_x,s.pos_y,s.pos_z,pb.progress,pb.status
    FROM bounty_board_slots bs JOIN bounty_notices b ON b.id=bs.bounty_id JOIN monster_templates t ON t.id=b.target_template_id
    JOIN monster_spawns s ON s.id=b.source_spawn_id LEFT JOIN map_regions r ON r.id=s.region_id LEFT JOIN player_bounties pb ON pb.bounty_id=b.id AND pb.character_id=?
    WHERE ${boardCandidate}${searchSql} ORDER BY bs.slot_no LIMIT ?`, [character.id, ...(search ? [search, search] : []), pageSize]);
  const [activeRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_bounties pb
    JOIN bounty_notices b ON b.id=pb.bounty_id LEFT JOIN monster_spawns s ON s.id=b.source_spawn_id
    WHERE pb.character_id=? AND ${occupiedBountySlot}`, [character.id]);
  return { bounties: rows.map(row => ({ id: Number(row.id), boardNo: Number(row.board_no), title: row.title, targetName: row.target_name, requiredCount: Number(row.required_count), copperReward: Number(row.copper_reward), sourceSpawnId: Number(row.source_spawn_id), location: row.region_name === null ? undefined : { regionName: row.region_name, x: Number(row.pos_x), y: Number(row.pos_y), z: Number(row.pos_z) }, progress: row.progress === null ? 0 : Number(row.progress), status: row.status })), activeCount: Number(activeRows[0]?.total ?? 0), page: 1, totalPages: 1, total: rows.length, keyword: search };
};

export const playerBounties = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  const [rows] = await pool.execute<BountyRow[]>(`SELECT b.id,b.title,t.name AS target_name,b.required_count,b.copper_reward,b.source_spawn_id,r.name AS region_name,s.pos_x,s.pos_y,s.pos_z,pb.progress,pb.status,
      CASE WHEN pb.status='accepted' AND (b.is_active=0 OR b.expires_at<=NOW() OR (b.source_spawn_id IS NOT NULL AND ${sourceSpawnUnavailable})) THEN 1 ELSE 0 END AS is_invalid
    FROM player_bounties pb JOIN bounty_notices b ON b.id=pb.bounty_id JOIN monster_templates t ON t.id=b.target_template_id LEFT JOIN monster_spawns s ON s.id=b.source_spawn_id LEFT JOIN map_regions r ON r.id=s.region_id
    WHERE pb.character_id=? AND pb.status IN ('accepted','completed') ORDER BY pb.accepted_at,b.id`, [character.id]);
  return rows.map(row => ({ id: Number(row.id), title: row.title, targetName: row.target_name, requiredCount: Number(row.required_count), copperReward: Number(row.copper_reward), sourceSpawnId: row.source_spawn_id === null ? undefined : Number(row.source_spawn_id), location: row.region_name === null ? undefined : { regionName: row.region_name, x: Number(row.pos_x), y: Number(row.pos_y), z: Number(row.pos_z) }, progress: Number(row.progress), status: Number(row.is_invalid) ? 'invalid' as const : row.status! }));
};

export const clearInvalidBounty = async (qqUserId: string, bountyId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { is_invalid: number })[]>(`SELECT CASE WHEN pb.status='accepted' AND (b.is_active=0 OR b.expires_at<=NOW() OR (b.source_spawn_id IS NOT NULL AND ${sourceSpawnUnavailable})) THEN 1 ELSE 0 END AS is_invalid
    FROM player_bounties pb JOIN bounty_notices b ON b.id=pb.bounty_id LEFT JOIN monster_spawns s ON s.id=b.source_spawn_id
    WHERE pb.character_id=? AND pb.bounty_id=? FOR UPDATE`, [character.id, bountyId]);
  if (!rows[0]) throw new Error('没有找到这份悬赏。');
  if (!Number(rows[0].is_invalid)) throw new Error('这份悬赏仍在进行，无法清除。');
  await connection.execute('DELETE FROM player_bounties WHERE character_id=? AND bounty_id=?', [character.id, bountyId]);
});

export const abandonBounty = async (qqUserId: string, bountyId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { title: string })[]>(`SELECT b.title FROM player_bounties pb JOIN bounty_notices b ON b.id=pb.bounty_id
    WHERE pb.character_id=? AND pb.bounty_id=? AND pb.status IN ('accepted','completed') FOR UPDATE`, [character.id, bountyId]);
  const bounty = rows[0];
  if (!bounty) throw new Error('没有找到可放弃的悬赏。');
  await connection.execute("DELETE FROM player_bounties WHERE character_id=? AND bounty_id=?", [character.id, bountyId]);
  return { title: bounty.title };
});

export const abandonSecondaryQuest = async (qqUserId: string, questCode: 'blacksmith_apprentice' | 'alchemist_apprentice' | 'deconstructor_apprentice' | 'omniscient_apprentice') => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [result] = await connection.execute<any>("DELETE FROM player_side_quests WHERE character_id=? AND quest_code=? AND status IN ('accepted','completed')", [character.id, questCode]);
  if (!Number(result.affectedRows)) throw new Error('没有找到可放弃的支线任务。');
});

export const acceptBounty = async (qqUserId: string, bountyId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); if (!character.adventurer_registered) throw new Error('完成冒险者注册后才能接受悬赏。');
  await(await import('./guild-context')).requireGuildService(connection,Number(character.id));
  await refreshBounties(connection);
  await syncBountyBoard(connection);
  const [counts] = await connection.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM player_bounties pb
    JOIN bounty_notices b ON b.id=pb.bounty_id LEFT JOIN monster_spawns s ON s.id=b.source_spawn_id
    WHERE pb.character_id=? AND ${occupiedBountySlot} FOR UPDATE`, [character.id]);
  if (Number(counts[0]?.total ?? 0) >= 3) throw new Error('同时最多接受三个悬赏，请先完成并领取现有悬赏。');
  const [notices] = await connection.execute<(RowDataPacket & { id: number; title: string })[]>(`SELECT b.id,b.title FROM bounty_board_slots bs JOIN bounty_notices b ON b.id=bs.bounty_id
    JOIN monster_templates t ON t.id=b.target_template_id JOIN monster_spawns s ON s.id=b.source_spawn_id LEFT JOIN map_regions r ON r.id=s.region_id
    WHERE b.id=? AND ${boardCandidate} FOR UPDATE`, [bountyId]);
  const notice = notices[0]; if (!notice) throw new Error('该悬赏已经刷新，请查看最新悬赏板。');
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_bounties WHERE character_id=? AND bounty_id=? FOR UPDATE', [character.id, bountyId]);
  if (existing[0]) throw new Error('你已经接受过这份悬赏。');
  await connection.execute('INSERT INTO player_bounties (character_id,bounty_id) VALUES (?,?)', [character.id, bountyId]);
  return { title: notice.title };
});

export const claimBounty = async (qqUserId: string, bountyId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  await(await import('./guild-context')).requireGuildService(connection,Number(character.id));
  const [rows] = await connection.execute<(RowDataPacket & { title: string; copper_reward: number; status: string })[]>(`SELECT b.title,b.copper_reward,pb.status FROM player_bounties pb JOIN bounty_notices b ON b.id=pb.bounty_id
    WHERE pb.character_id=? AND pb.bounty_id=? FOR UPDATE`, [character.id, bountyId]);
  const bounty = rows[0]; if (!bounty) throw new Error('没有找到这份已接受的悬赏。');
  if (bounty.status !== 'completed') throw new Error('讨伐目标尚未全部完成。');
  await connection.execute('UPDATE player_bounties SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND bounty_id=?', [character.id, bountyId]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [bounty.copper_reward, character.id]);
  return { title: bounty.title, copper: Number(bounty.copper_reward) };
});

export const advanceBountyProgress = async (connection: PoolConnection, characterId: number, targets: { spawnId: number; templateId: number }[]) => {
  for (const target of targets) {
    await connection.execute(`UPDATE player_bounties pb JOIN bounty_notices b ON b.id=pb.bounty_id
    SET pb.progress=LEAST(b.required_count,pb.progress+?),pb.status=IF(pb.progress+?>=b.required_count,'completed','accepted'),
      pb.completed_at=IF(pb.progress+?>=b.required_count,COALESCE(pb.completed_at,NOW()),pb.completed_at)
    WHERE pb.character_id=? AND ((b.source_spawn_id IS NULL AND b.target_template_id=?) OR b.source_spawn_id=?) AND pb.status='accepted'`, [1, 1, 1, characterId, target.templateId, target.spawnId]);
    await connection.execute(`DELETE bs FROM bounty_board_slots bs JOIN player_bounties pb ON pb.bounty_id=bs.bounty_id
      WHERE pb.character_id=? AND pb.status='completed'`, [characterId]);
  }
};
