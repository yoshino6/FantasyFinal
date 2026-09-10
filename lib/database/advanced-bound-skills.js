import { advancedBoundSkillDefinitions } from '../game/advanced-profession.config.js';

const initializeAdvancedBoundSkills = async (db) => {
    for (const skill of advancedBoundSkillDefinitions) {
        await db.execute(`INSERT INTO skill_definitions
      (code,name,category,tier,skill_kind,range_type,target_scope,max_level,learn_cost,upgrade_cost,description,passive_effect_json)
      VALUES (?,?,'bound','中位','绑定','自身','自身',1,0,1,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),category='bound',skill_kind='绑定',range_type='自身',target_scope='自身',description=VALUES(description),passive_effect_json=VALUES(passive_effect_json)`, [skill.code, skill.name, `本职${skill.kind}·随当前二转常驻，不占普通被动槽。${skill.description}`, JSON.stringify(skill.effect)]);
        await db.execute(`INSERT IGNORE INTO player_skills (character_id,skill_id,level,passive_linked)
      SELECT ap.character_id,s.id,1,0 FROM player_advanced_professions ap JOIN skill_definitions s ON s.code=? WHERE ap.profession_code=?`, [skill.code, skill.professionCode]);
        await db.execute(`UPDATE player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
      SET ps.passive_linked=0 WHERE s.code=? AND ps.passive_linked<>0`, [skill.code]);
    }
};

export { initializeAdvancedBoundSkills };
