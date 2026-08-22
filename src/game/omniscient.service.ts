import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

const questCode = 'omniscient_apprentice';
type Connection = Pool | PoolConnection;

const characterFor = async (connection: Connection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; level: number; name: string; secondary_profession_code: string | null })[]>(`SELECT c.id,c.level,c.name,c.secondary_profession_code FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
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
  if (character.secondary_profession_code !== 'omniscient') throw new Error('尚未转职全知者。');
  await pool.execute("INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,'omniscient',1,0)", [character.id]);
  const [rows] = await pool.execute<(RowDataPacket & { level: number; proficiency: number })[]>('SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code=\'omniscient\'', [character.id]);
  const level = Math.max(1, Number(rows[0]?.level ?? 1));
  return { level, proficiency: Number(rows[0]?.proficiency ?? 0), required: level === 1 ? 10 : level === 2 ? 50 : level === 3 ? 200 : level === 4 ? 1000 : 1000 * Math.pow(5, level - 4), rangeLevel: level * 5, informationLevel: Math.min(4, level) };
};

const direction = (fromX: number, fromY: number, toX: number, toY: number) => {
  const vertical = toY > fromY ? '北' : toY < fromY ? '南' : '';
  const horizontal = toX > fromX ? '东' : toX < fromX ? '西' : '';
  return `${horizontal}${vertical}` || '附近';
};
const distanceWord = (distance: number) => distance <= 8 ? '不远处' : distance <= 25 ? '稍远处' : '很远的地方';

export const omniscientTraces = async (qqUserId: string) => {
  const pool = await getPool(); const character = await characterFor(pool, qqUserId);
  if (character.secondary_profession_code !== 'omniscient') throw new Error('只有全知者能辨识野外踪迹。');
  const [bosses] = await pool.execute<(RowDataPacket & { name: string; pos_x: number; pos_y: number })[]>(`SELECT t.name,s.pos_x,s.pos_y FROM monster_spawns s JOIN monster_templates t ON t.id=s.template_id
    WHERE s.region_id=(SELECT current_region_id FROM characters WHERE id=?) AND s.defeated_at IS NULL AND t.monster_class='boss' ORDER BY ABS(s.pos_x-?)+ABS(s.pos_y-?) LIMIT 1`, [character.id, character.pos_x, character.pos_y]);
  const [ores] = await pool.execute<(RowDataPacket & { name: string; pos_x: number; pos_y: number })[]>(`SELECT i.name,rs.pos_x,rs.pos_y FROM resource_spawns rs JOIN item_definitions i ON i.id=rs.item_id
    WHERE rs.region_id=(SELECT current_region_id FROM characters WHERE id=?) AND rs.mined_at IS NULL AND i.code IN ('star_copper','moon_silver','sun_gold') ORDER BY ABS(rs.pos_x-?)+ABS(rs.pos_y-?) LIMIT 1`, [character.id, character.pos_x, character.pos_y]);
  const boss = bosses[0]; const ore = ores[0];
  const clue = (target: { pos_x: number; pos_y: number }) => ({
    direction: direction(Number(character.pos_x), Number(character.pos_y), Number(target.pos_x), Number(target.pos_y)),
    distance: distanceWord(Math.abs(Number(target.pos_x) - Number(character.pos_x)) + Math.abs(Number(target.pos_y) - Number(character.pos_y)))
  });
  return { boss: boss ? { text: `${clue(boss).distance}的${clue(boss).direction}方，有一股沉重而躁动的魔力正反复回响。`, name: boss.name } : null, ore: ore ? { text: `${clue(ore).distance}的${clue(ore).direction}方，地脉传来一丝异常清冽的金属共鸣。`, name: ore.name } : null };
};
