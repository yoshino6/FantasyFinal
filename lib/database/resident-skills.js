import { residentSkills } from '../game/resident-skill.config.js';

const initializeResidentSkills = async (pool) => {
    const [columns] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='combat_sessions' AND COLUMN_NAME='mode'");
    if (!columns.length)
        await pool.query("ALTER TABLE combat_sessions ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT 'pve', ADD INDEX idx_combat_mode_state (mode,state)");
    await pool.query(`CREATE TABLE IF NOT EXISTS npc_spar_profiles (
    npc_code VARCHAR(64) NOT NULL PRIMARY KEY, profile_json JSON NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS player_npc_spar_attempts (
    id CHAR(36) NOT NULL PRIMARY KEY, character_id BIGINT UNSIGNED NOT NULL, npc_code VARCHAR(64) NOT NULL,
    business_date DATE NOT NULL, session_id CHAR(36) NOT NULL, snapshot_json JSON NOT NULL, profile_json JSON NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'active', discovered_skill_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME NULL,
    UNIQUE KEY uk_npc_spar_daily (character_id,npc_code,business_date), UNIQUE KEY uk_npc_spar_session (session_id),
    CONSTRAINT fk_npc_spar_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
    for (const skill of residentSkills) {
        const physical = skill.category === 'physical';
        const kind = physical ? skill.damageType : skill.category === 'passive' ? '被动' : skill.element === '无' ? '奥术' : '元素';
        const cost = skill.tier === '基础' ? 2 : skill.tier === '下位' ? 3 : 5;
        const description = `${skill.description}${skill.chant ? ' 吟唱1回合；下一回合自动释放，释放后开始冷却。' : ''} 行动、控制与资源转换次数固定；数值专精按技能详情的上限生效。`;
        await pool.execute(`INSERT INTO skill_definitions
      (code,name,category,tier,damage_type,skill_kind,element,range_type,target_scope,mana_cost,base_mana_cost,cooldown_turns,chant_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,cooldown_reduction_per_level,passive_effect_json,description)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,0,?,?) ON DUPLICATE KEY UPDATE
      name=VALUES(name),category=VALUES(category),tier=VALUES(tier),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),
      range_type=VALUES(range_type),target_scope=VALUES(target_scope),mana_cost=VALUES(mana_cost),base_mana_cost=VALUES(base_mana_cost),cooldown_turns=VALUES(cooldown_turns),chant_turns=VALUES(chant_turns),power=VALUES(power),learn_cost=VALUES(learn_cost),upgrade_cost=VALUES(upgrade_cost),max_level=1,power_per_level=0,cooldown_reduction_per_level=0,passive_effect_json=VALUES(passive_effect_json),description=VALUES(description)`, [skill.code, skill.name, skill.category, skill.tier, skill.damageType, kind, skill.element,
            skill.scope === 'self' ? '自身' : skill.ranged ? '远程' : '近战', ['allies', 'enemies'].includes(skill.scope) ? '全体' : skill.scope === 'self' ? '自身' : '单体',
            skill.mana, physical ? skill.mana / .4 : skill.mana, skill.cooldown, skill.chant, skill.power, cost, cost, JSON.stringify({ residentRule: skill.id }), description]);
    }
    await pool.query("UPDATE player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id SET ps.quick_slot=NULL WHERE s.code='resident_l01' AND ps.quick_slot IS NOT NULL");
    await pool.query("UPDATE skill_definitions SET skill_kind='奥术',damage_type=CASE WHEN damage_type IN ('能量','无','无属性','') THEN '奥术' ELSE damage_type END WHERE category='magic' AND (skill_kind='能量' OR COALESCE(element,'无') IN ('无','无属性','') OR damage_type IN ('能量','奥术'))");
    await pool.query("INSERT IGNORE INTO monster_templates (code,name,monster_class,level,constitution,spirit,strength,intelligence,agility,perception,experience,drops_json) VALUES ('npc_sparring_dummy','切磋域民','normal',1,1,1,1,1,1,1,0,JSON_ARRAY())");
};

export { initializeResidentSkills };
