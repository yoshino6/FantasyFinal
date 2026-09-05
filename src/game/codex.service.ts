import type { RowDataPacket } from 'mysql2';
import { getPool } from '../database/pool';

export const codexKinds = ['装备', '道具', '材料', '怪物', '技能'] as const;
export type CodexKind = (typeof codexKinds)[number];

type CodexCategory = { label: string; value: string };
type CodexEntry = { id: number; name: string; category: string; detailId: string };
type Character = RowDataPacket & { id: number; level: number };

const categories: Record<CodexKind, CodexCategory[]> = {
  装备: [{ label: '全部', value: '全部' }, { label: '武器', value: '武器' }, { label: '头肩', value: '头肩' }, { label: '上装', value: '上装' }, { label: '腰部', value: '腰部' }, { label: '下装', value: '下装' }, { label: '脚部', value: '脚部' }, { label: '项链', value: '项链' }, { label: '手镯', value: '手镯' }, { label: '戒指', value: '戒指' }, { label: '异械', value: '异械' }],
  道具: [{ label: '全部', value: '全部' }, { label: '药剂', value: '药剂' }, { label: '食物', value: '食物' }, { label: '特殊', value: '特殊' }],
  材料: [{ label: '全部', value: '全部' }, { label: '食材', value: '食材' }, { label: '草药', value: '草药' }, { label: '怪材', value: '怪材' }, { label: '建材', value: '建材' }, { label: '锻材', value: '锻材' }, { label: '特殊', value: '特殊' }],
  怪物: [{ label: '全部', value: '全部' }, { label: '普通', value: '普通' }, { label: '大型', value: '大型' }, { label: '精英', value: '精英' }, { label: '首领', value: '首领' }],
  技能: [{ label: '全部', value: '全部' }, { label: '物理', value: '物理' }, { label: '魔法', value: '魔法' }, { label: '辅助', value: '辅助' }, { label: '绑定', value: '绑定' }, { label: '被动', value: '被动' }, { label: '特殊', value: '特殊' }]
};

const categoryExpression = (kind: CodexKind) => {
  if (kind === '装备') return "CASE WHEN i.item_category='副手' THEN '武器' WHEN i.item_category IN ('头部','眼部') THEN '头肩' ELSE i.item_category END";
  if (kind === '道具' || kind === '材料') return 'i.item_category';
  if (kind === '怪物') return "CASE t.monster_class WHEN 'normal' THEN '普通' WHEN 'large' THEN '大型' WHEN 'elite' THEN '精英' WHEN 'boss' THEN '首领' ELSE '特殊' END";
  return "CASE s.category WHEN 'physical' THEN '物理' WHEN 'magic' THEN '魔法' WHEN 'utility' THEN '辅助' WHEN 'bound' THEN '绑定' WHEN 'passive' THEN '被动' ELSE '特殊' END";
};

const characterFor = async (qqUserId: string) => {
  const [rows] = await (await getPool()).execute<Character[]>('SELECT c.id,c.level FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND c.npc_code IS NULL LIMIT 1', [qqUserId]);
  if (!rows[0]) throw new Error('请先完成注册。');
  return rows[0];
};

export const codexCategories = (kind: CodexKind) => categories[kind];

export const codexList = async (qqUserId: string, kind: CodexKind, category = '全部', page = 1, keyword = '') => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const categoryName = categories[kind].some(item => item.value === category) ? category : '全部';
  const expression = categoryExpression(kind);
  const itemType = kind === '装备' ? 'equipment' : kind === '道具' ? 'consumable' : 'material';
  const config = kind === '怪物'
    ? { from: 'FROM player_monster_codex c JOIN monster_templates t ON t.id=c.monster_template_id', where: 'c.character_id=?', params: [character.id], id: 't.id', name: 't.name', detail: 't.id' }
    : kind === '技能'
      ? { from: 'FROM skill_definitions s LEFT JOIN player_skills ps ON ps.skill_id=s.id AND ps.character_id=? LEFT JOIN player_skill_discoveries d ON d.skill_id=s.id AND d.character_id=?', where: '(ps.skill_id IS NOT NULL OR d.skill_id IS NOT NULL)', params: [character.id, character.id], id: 's.id', name: 's.name', detail: 's.id' }
      : { from: 'FROM player_item_codex c JOIN item_definitions i ON i.id=c.item_id', where: 'c.character_id=? AND i.item_type=?', params: [character.id, itemType], id: 'i.id', name: 'i.name', detail: 'i.codex_id' };
  const conditions = [config.where]; const params: Array<number | string> = [...config.params];
  if (categoryName !== '全部') { conditions.push(`${expression}=?`); params.push(categoryName); }
  if (keyword.trim()) { conditions.push(`${config.name} LIKE ?`); params.push(`%${keyword.trim()}%`); }
  const where = conditions.join(' AND '); const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total ${config.from} WHERE ${where}`, params);
  const total = Number(countRows[0]?.total ?? 0); const pageSize = 5; const totalPages = Math.max(1, Math.ceil(total / pageSize)); const currentPage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const [rows] = await pool.execute<(RowDataPacket & CodexEntry)[]>(`SELECT ${config.id} AS id,${config.name} AS name,${expression} AS category,${config.detail} AS detailId ${config.from} WHERE ${where} ORDER BY ${config.id} LIMIT ? OFFSET ?`, [...params, pageSize, (currentPage - 1) * pageSize]);
  return { kind, category: categoryName, keyword: keyword.trim(), entries: rows.map(row => ({ id: Number(row.id), name: row.name, category: row.category, detailId: String(row.detailId) })), page: currentPage, totalPages };
};

export const skillCodexDetail = async (qqUserId: string, skillId: number) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; code: string; codex_id: string; name: string; category: string; skill_kind: string; element: string; range_type: string; target_scope: string; power: number; mana_cost: number; cooldown_turns: number; chant_turns: number; description: string; effects: string | null })[]>(`SELECT s.id,s.code,s.codex_id,s.name,s.category,s.skill_kind,s.element,s.range_type,s.target_scope,s.power,s.mana_cost,s.cooldown_turns,s.chant_turns,s.description,
    GROUP_CONCAT(CONCAT(e.name,' Lv.',se.effect_level) ORDER BY e.id SEPARATOR '、') AS effects
    FROM skill_definitions s LEFT JOIN player_skills ps ON ps.skill_id=s.id AND ps.character_id=?
    LEFT JOIN player_skill_discoveries d ON d.skill_id=s.id AND d.character_id=?
    LEFT JOIN skill_effects se ON se.skill_id=s.id LEFT JOIN effect_definitions e ON e.id=se.effect_id
    WHERE s.id=? AND (ps.skill_id IS NOT NULL OR d.skill_id IS NOT NULL) GROUP BY s.id`, [character.id, character.id, skillId]);
  if (!rows[0]) throw new Error('尚未领悟该技能。');
  return rows[0];
};

const jsonList = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
};

export const monsterCodexDetail = async (qqUserId: string, templateId: number) => {
  const character = await characterFor(qqUserId); const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; monster_class: string; level: number; skill_sequence: unknown; weakness_json: unknown; resistance_json: unknown })[]>(`SELECT t.id,t.name,t.monster_class,t.level,t.skill_sequence,t.weakness_json,t.resistance_json
    FROM player_monster_codex c JOIN monster_templates t ON t.id=c.monster_template_id WHERE c.character_id=? AND t.id=?`, [character.id, templateId]);
  const monster = rows[0]; if (!monster) throw new Error('尚未遭遇该怪物。');
  const [appraisalRows] = await pool.execute<(RowDataPacket & { range_level: number | null; information_level: number | null })[]>(`SELECT ap.range_level,ap.information_level FROM player_skills ps
    JOIN skill_definitions s ON s.id=ps.skill_id AND s.code='appraisal' LEFT JOIN player_appraisal_progress ap ON ap.character_id=ps.character_id WHERE ps.character_id=? LIMIT 1`, [character.id]);
  const appraisal = appraisalRows[0]; const rangeLevel = Number(appraisal?.range_level ?? 0); const informationLevel = Number(appraisal?.information_level ?? 0);
  const className: Record<string, string> = { normal: '普通', large: '大型', elite: '精英', boss: '首领' };
  const inRange = rangeLevel > 0 && Number(monster.level) <= Number(character.level) + rangeLevel * 3;
  const skillCodes = inRange ? jsonList(monster.skill_sequence) : [];
  let skills: string[] = [];
  if (skillCodes.length) {
    const [skillRows] = await pool.query<(RowDataPacket & { code: string; name: string })[]>(`SELECT code,name FROM skill_definitions WHERE code IN (${skillCodes.map(() => '?').join(',')})`, skillCodes);
    const names = new Map(skillRows.map(row => [row.code, row.name])); skills = skillCodes.map(code => names.get(code) ?? code);
  }
  return { name: monster.name, category: className[monster.monster_class] ?? '特殊', level: Number(monster.level), inRange, informationLevel, skills, weaknesses: informationLevel >= 4 && inRange ? jsonList(monster.weakness_json) : [], resistances: informationLevel >= 4 && inRange ? jsonList(monster.resistance_json) : [] };
};
