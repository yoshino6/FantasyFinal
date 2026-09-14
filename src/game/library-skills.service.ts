import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { libraryFreeSkillCodes } from './skill-access.config';
import { recordCharacterOperation } from './character-operation.service';

type Db = Pool | PoolConnection;
const libraryVisitor = async (db: Db, qqUserId: string, lock = false) => {
  const [owners] = await db.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  const id = Number(owners[0]?.id ?? 0);
  if (!id) throw new Error('请先注册角色。');
  const [places] = await db.execute<RowDataPacket[]>(`SELECT 1 FROM characters c JOIN map_npcs n ON n.region_id=c.current_region_id AND n.pos_x=c.pos_x AND n.pos_y=c.pos_y AND n.pos_z=c.pos_z
    JOIN map_regions r ON r.id=n.region_id WHERE c.id=? AND n.code='world_library' AND r.is_enabled=1 AND r.is_owner_only=0 LIMIT 1`, [id]);
  if (!places[0]) throw new Error('请先到世界图书馆，再研读免费馆藏。');
  return id;
};

export const librarySkillCatalog = async (qqUserId: string) => {
  const db = await getPool();
  const id = await libraryVisitor(db, qqUserId);
  const [rows] = await db.execute<(RowDataPacket & { id: number; code: string; name: string; tier: string; category: string; description: string; learned: number; discovered: number })[]>(`SELECT s.id,s.code,s.name,s.tier,s.category,s.description,(ps.skill_id IS NOT NULL) AS learned,(d.skill_id IS NOT NULL) AS discovered
    FROM skill_definitions s LEFT JOIN player_skills ps ON ps.character_id=? AND ps.skill_id=s.id
    LEFT JOIN player_skill_discoveries d ON d.character_id=? AND d.skill_id=s.id
    WHERE s.code IN (${libraryFreeSkillCodes.map(() => '?').join(',')}) ORDER BY s.id`, [id, id, ...libraryFreeSkillCodes]);
  return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, tier: row.tier, category: row.category, description: row.description, learned: Boolean(row.learned), discovered: Boolean(row.discovered) }));
};

export const discoverLibrarySkillInTransaction = async (connection: PoolConnection, qqUserId: string, skillId: number) => {
  if (!Number.isSafeInteger(skillId) || skillId <= 0) throw new Error('技能编号无效。');
  const id = await libraryVisitor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { code: string; name: string; tier: string; learned: number; discovered: number })[]>(`SELECT s.code,s.name,s.tier,(ps.skill_id IS NOT NULL) AS learned,(d.skill_id IS NOT NULL) AS discovered FROM skill_definitions s
    LEFT JOIN player_skills ps ON ps.character_id=? AND ps.skill_id=s.id
    LEFT JOIN player_skill_discoveries d ON d.character_id=? AND d.skill_id=s.id WHERE s.id=? FOR UPDATE`, [id, id, skillId]);
  const skill = rows[0];
  if (!skill || !libraryFreeSkillCodes.includes(skill.code) || skill.tier !== '基础') throw new Error('这项技能不属于世界图书馆的免费馆藏。');
  if (skill.learned) throw new Error('你已经学会这项技能。');
  if (skill.discovered) throw new Error('你已经领悟这项技能，请到未学习列表消耗 SP 学习。');
  await connection.execute('INSERT INTO player_skill_discoveries (character_id,skill_id) VALUES (?,?)', [id, skillId]);
  await recordCharacterOperation(connection, { characterId: id, kind: 'skill.discovered', source: { system: 'character_skill', id: skillId, step: 'discovered' }, outcome: '领悟', summary: `在世界图书馆领悟「${skill.name}」`, detail: { skillId, skillCode: skill.code, skillName: skill.name, library: 'world_library' } });
  return { name: skill.name, learningCost: 1 };
};
export const discoverLibrarySkill = async (qqUserId: string, skillId: number) => withTransaction(connection => discoverLibrarySkillInTransaction(connection, qqUserId, skillId));
