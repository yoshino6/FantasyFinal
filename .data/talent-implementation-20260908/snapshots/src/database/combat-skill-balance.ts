import type { Pool, RowDataPacket } from 'mysql2/promise';
import { nativeSkillBalance, balancedSkillDescription } from '../game/combat-skill-balance.config';

/** 只覆盖已知技能配置；不重置SP、已学技能、专精等级、快捷栏或自动战斗设置。 */
export const initializeCombatSkillBalance = async (pool: Pool) => {
  const [descriptions] = await pool.query<RowDataPacket[]>('SELECT code,description FROM skill_definitions');
  const currentDescriptions = new Map(descriptions.map(row => [String(row.code), String(row.description ?? '')]));
  for (const skill of nativeSkillBalance) await pool.execute(`UPDATE skill_definitions SET
    tier=?,mana_cost=?,base_mana_cost=CASE WHEN COALESCE(?,category)='physical' THEN ?/0.4 ELSE ? END,
    cooldown_turns=?,chant_turns=?,power=?,category=COALESCE(?,category),name=COALESCE(?,name),target_scope=COALESCE(?,target_scope),description=COALESCE(?,description)
    WHERE code=?`, [skill.tier, skill.mana, skill.category ?? null, skill.mana, skill.mana, skill.cooldown, skill.chant, skill.power, skill.category ?? null, skill.name ?? null, skill.scope ?? null, skill.description ?? (currentDescriptions.has(skill.code) ? balancedSkillDescription(skill.code, currentDescriptions.get(skill.code)!) : null), skill.code]);
  await pool.query("UPDATE skill_effects se JOIN skill_definitions s ON s.id=se.skill_id JOIN effect_definitions e ON e.id=se.effect_id SET se.value_override=60 WHERE s.code='shield_counter' AND e.code='shield_counter'");
  await pool.query("UPDATE skill_definitions SET skill_kind='奥术',damage_type='奥术',element=CASE WHEN element='能量' THEN '无' ELSE element END WHERE category='magic' AND (skill_kind='能量' OR element IN ('能量','无','无属性','') OR damage_type IN ('能量','奥术'))");
};
