import type { Pool } from 'mysql2/promise';
import { folioSkills } from '../game/active-folio-skills.config';
import { retiredBookshopSkillCodes, tierLearningCost } from '../game/skill-access.config';
export const initializeActiveFolioSkills = async (pool: Pool) => {
    await pool.query("UPDATE skill_effects se JOIN skill_definitions s ON s.id=se.skill_id SET se.duration_override=CASE WHEN s.code='warlord_triumph_banner' THEN 3 ELSE 2 END WHERE s.code IN ('warlord_triumph_banner','spellblade_phase_guard','ranger_guiding_smoke')");
    await pool.query(`CREATE TABLE IF NOT EXISTS skill_shop_offers (
    skill_code VARCHAR(64) NOT NULL PRIMARY KEY, shop_code VARCHAR(64) NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
    price INT NOT NULL, is_active TINYINT NOT NULL DEFAULT 1, unlimited_stock TINYINT NOT NULL DEFAULT 1,
    UNIQUE KEY uk_folio_item(item_id), CONSTRAINT fk_folio_item FOREIGN KEY(item_id) REFERENCES item_definitions(id)
  ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS player_folio_vouchers (
    character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, granted TINYINT NOT NULL DEFAULT 0, used TINYINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_folio_voucher_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
    for (const s of folioSkills) {
        const scope = s.targetCount === 0 ? '全体' : '单体';
        await pool.execute(`INSERT INTO skill_definitions (code,name,category,tier,damage_type,skill_kind,element,range_type,target_scope,mana_cost,base_mana_cost,cooldown_turns,chant_turns,power,learn_cost,upgrade_cost,max_level,power_per_level,cooldown_reduction_per_level,description)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,0,0,?) ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),tier=VALUES(tier),damage_type=VALUES(damage_type),skill_kind=VALUES(skill_kind),element=VALUES(element),range_type=VALUES(range_type),target_scope=VALUES(target_scope),mana_cost=VALUES(mana_cost),base_mana_cost=VALUES(base_mana_cost),cooldown_turns=VALUES(cooldown_turns),chant_turns=VALUES(chant_turns),power=VALUES(power),learn_cost=VALUES(learn_cost),max_level=1,power_per_level=0,description=VALUES(description)`, [s.code, s.name, s.category, s.tier, s.damageType, s.category === 'physical' ? s.damageType : s.element === '无' ? '奥术' : '元素', s.element, s.ranged ? '远程' : '近战', scope, s.mana, s.category === 'physical' ? s.mana / .4 : s.mana, s.cooldown, s.chant, s.power, tierLearningCost(s.tier, 3), s.description]);
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stack_limit,is_tradeable,effect_json)
      VALUES (?,?,?,?,'consumable','技能书',0.35,1,0,JSON_OBJECT('skillBook',?)) ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),is_tradeable=0,effect_json=VALUES(effect_json)`, ['skill_book_' + s.code, '技能书·' + s.name, `研读后领悟；正式学习需要Lv.${s.learnLevel}及${tierLearningCost(s.tier, 3)} SP。${s.description}`, s.shop, s.code]);
        await pool.execute(`INSERT INTO skill_shop_offers(skill_code,shop_code,item_id,price,is_active,unlimited_stock) SELECT ?,?,id,?,1,1 FROM item_definitions WHERE code=?
      ON DUPLICATE KEY UPDATE shop_code=VALUES(shop_code),price=VALUES(price),is_active=1,unlimited_stock=1`, [s.code, s.shop, s.price, 'skill_book_' + s.code]);
    }
    for (const code of retiredBookshopSkillCodes)
        await pool.execute('UPDATE bookshop_items b JOIN item_definitions i ON i.id=b.item_id SET b.is_active=0 WHERE i.code=?', ['skill_book_' + code]);
    await pool.query("UPDATE item_definitions SET codex_id=CONCAT('23',CASE WHEN id>=100000 THEN CAST(id AS CHAR) ELSE LPAD(id,5,'0') END) WHERE code LIKE 'skill_book_folio_%' AND codex_id IS NULL");
    for (const [region, code, name, x, y, z, description] of [
        ['world_tree', 'worldtree_skill_shop', '翠庭秘藏', 4, 3, 0, '术式誊录师·枢叶经营的战技馆，出售打击、土木光术式与守护技能。'],
        ['floating_leaf_town', 'leaf_skill_shop', '云海星咏', 14, -2, 30, '航队教习·翎砂的战技铺，出售刺击、风水冰术式与机动支援。']
    ])
        await pool.execute(`INSERT INTO map_npcs(region_id,code,name,description,interaction_kind,pos_x,pos_y,pos_z) SELECT id,?,?,?,'building',?,?,? FROM map_regions WHERE code=? ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description)`, [code, name, description, x, y, z, region]);
};
