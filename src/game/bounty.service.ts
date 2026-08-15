import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

type Connection = Pool | PoolConnection;
type BountyRow = RowDataPacket & { id: number; title: string; target_name: string; required_count: number; copper_reward: number; source_spawn_id: number | null; progress: number | null; status: 'accepted' | 'completed' | 'claimed' | null };
type CharacterRow = RowDataPacket & { id: number; adventurer_registered: number };

const seeds = [
  { code: 'ball_rabbit', title: '清理扰人的球兔', count: 5, copper: 36 },
  { code: 'spike_boar', title: '讨伐林间刺猪', count: 4, copper: 48 },
  { code: 'vine_snake', title: '清除盘踞的藤蛇', count: 4, copper: 54 },
  { code: 'mist_wolf', title: '驱散雾中的幽狼', count: 3, copper: 72 },
  { code: 'roll_rabbit', title: '讨伐失控的滚兔', count: 2, copper: 90 }
];

const refreshKey = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}`;
};

const characterFor = async (connection: Connection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<CharacterRow[]>(`SELECT c.id,c.adventurer_registered FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return rows[0];
};

export const refreshBounties = async (connection: Connection) => {
  await connection.execute('UPDATE bounty_notices SET is_active=0 WHERE is_active=1 AND expires_at<=NOW()');
  await connection.execute(`UPDATE bounty_notices b LEFT JOIN monster_spawns s ON s.id=b.source_spawn_id
    SET b.is_active=0 WHERE b.source_spawn_id IS NOT NULL AND (s.id IS NULL OR s.defeated_at IS NOT NULL)`);
  const [active] = await connection.execute<RowDataPacket[]>('SELECT id FROM bounty_notices WHERE is_active=1 AND expires_at>NOW() LIMIT 1');
  if (!active[0]) {
    const key = refreshKey();
    for (const seed of seeds) await connection.execute(`INSERT IGNORE INTO bounty_notices (refresh_key,title,target_template_id,required_count,copper_reward,expires_at)
      SELECT ?,?,id,?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR) FROM monster_templates WHERE code=?`, [key, seed.title, seed.count, seed.copper, seed.code]);
  }
  await connection.execute(`INSERT INTO bounty_notices (refresh_key,title,target_template_id,source_spawn_id,required_count,copper_reward,is_active,expires_at)
    SELECT CONCAT('riot-',s.id),CONCAT('紧急：镇压暴动的',t.name),s.template_id,s.id,1,120+COALESCE(s.level,t.level)*20,1,DATE_ADD(NOW(),INTERVAL 1 HOUR)
    FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE s.defeated_at IS NULL AND JSON_CONTAINS(s.traits_json,JSON_OBJECT('code','riot'))
    ON DUPLICATE KEY UPDATE title=VALUES(title),source_spawn_id=VALUES(source_spawn_id),copper_reward=VALUES(copper_reward),is_active=1,expires_at=VALUES(expires_at)`);
};

export const bountyBoard = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId); await refreshBounties(pool);
  const [rows] = await pool.execute<BountyRow[]>(`SELECT b.id,b.title,t.name AS target_name,b.required_count,b.copper_reward,b.source_spawn_id,pb.progress,pb.status
    FROM bounty_notices b JOIN monster_templates t ON t.id=b.target_template_id LEFT JOIN player_bounties pb ON pb.bounty_id=b.id AND pb.character_id=?
    WHERE b.is_active=1 AND b.expires_at>NOW() ORDER BY b.id`, [character.id]);
  const [activeRows] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM player_bounties WHERE character_id=? AND status IN (\'accepted\',\'completed\')', [character.id]);
  return { bounties: rows.map(row => ({ id: Number(row.id), title: row.title, targetName: row.target_name, requiredCount: Number(row.required_count), copperReward: Number(row.copper_reward), sourceSpawnId: row.source_spawn_id === null ? undefined : Number(row.source_spawn_id), progress: row.progress === null ? 0 : Number(row.progress), status: row.status })), activeCount: Number(activeRows[0]?.total ?? 0) };
};

export const playerBounties = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  const [rows] = await pool.execute<BountyRow[]>(`SELECT b.id,b.title,t.name AS target_name,b.required_count,b.copper_reward,b.source_spawn_id,pb.progress,pb.status
    FROM player_bounties pb JOIN bounty_notices b ON b.id=pb.bounty_id JOIN monster_templates t ON t.id=b.target_template_id
    WHERE pb.character_id=? AND pb.status IN ('accepted','completed') ORDER BY pb.accepted_at,b.id`, [character.id]);
  return rows.map(row => ({ id: Number(row.id), title: row.title, targetName: row.target_name, requiredCount: Number(row.required_count), copperReward: Number(row.copper_reward), sourceSpawnId: row.source_spawn_id === null ? undefined : Number(row.source_spawn_id), progress: Number(row.progress), status: row.status! }));
};

export const acceptBounty = async (qqUserId: string, bountyId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true); if (!character.adventurer_registered) throw new Error('完成冒险者注册后才能接受悬赏。');
  await refreshBounties(connection);
  const [counts] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM player_bounties WHERE character_id=? AND status IN (\'accepted\',\'completed\') FOR UPDATE', [character.id]);
  if (Number(counts[0]?.total ?? 0) >= 3) throw new Error('同时最多接受三个悬赏，请先完成并领取现有悬赏。');
  const [notices] = await connection.execute<(RowDataPacket & { id: number; title: string })[]>('SELECT id,title FROM bounty_notices WHERE id=? AND is_active=1 AND expires_at>NOW() FOR UPDATE', [bountyId]);
  const notice = notices[0]; if (!notice) throw new Error('该悬赏已经刷新，请查看最新悬赏板。');
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_bounties WHERE character_id=? AND bounty_id=? FOR UPDATE', [character.id, bountyId]);
  if (existing[0]) throw new Error('你已经接受过这份悬赏。');
  await connection.execute('INSERT INTO player_bounties (character_id,bounty_id) VALUES (?,?)', [character.id, bountyId]);
  return { title: notice.title };
});

export const claimBounty = async (qqUserId: string, bountyId: number) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { title: string; copper_reward: number; status: string })[]>(`SELECT b.title,b.copper_reward,pb.status FROM player_bounties pb JOIN bounty_notices b ON b.id=pb.bounty_id
    WHERE pb.character_id=? AND pb.bounty_id=? FOR UPDATE`, [character.id, bountyId]);
  const bounty = rows[0]; if (!bounty) throw new Error('没有找到这份已接受的悬赏。');
  if (bounty.status !== 'completed') throw new Error('讨伐目标尚未全部完成。');
  await connection.execute('UPDATE player_bounties SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND bounty_id=?', [character.id, bountyId]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [bounty.copper_reward, character.id]);
  return { title: bounty.title, copper: Number(bounty.copper_reward) };
});

export const advanceBountyProgress = async (connection: PoolConnection, characterId: number, targets: { spawnId: number; templateId: number }[]) => {
  for (const target of targets) await connection.execute(`UPDATE player_bounties pb JOIN bounty_notices b ON b.id=pb.bounty_id
    SET pb.progress=LEAST(b.required_count,pb.progress+?),pb.status=IF(pb.progress+?>=b.required_count,'completed','accepted'),
      pb.completed_at=IF(pb.progress+?>=b.required_count,COALESCE(pb.completed_at,NOW()),pb.completed_at)
    WHERE pb.character_id=? AND ((b.source_spawn_id IS NULL AND b.target_template_id=?) OR b.source_spawn_id=?) AND pb.status='accepted'`, [1, 1, 1, characterId, target.templateId, target.spawnId]);
};
