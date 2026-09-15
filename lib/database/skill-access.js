import { residentSkillByCode } from '../game/resident-skill.config.js';
import { guildSkillCodes, bookshopSkillCodes, guildSkillBookContributionPrice } from '../game/skill-access.config.js';

const initializeSkillAccess = async (pool) => {
    await pool.query(`CREATE TABLE IF NOT EXISTS player_library_free_skills (
    character_id BIGINT UNSIGNED NOT NULL, skill_id BIGINT UNSIGNED NOT NULL, learned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,skill_id),
    CONSTRAINT fk_library_free_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT fk_library_free_skill FOREIGN KEY (skill_id) REFERENCES skill_definitions(id)
  ) ENGINE=InnoDB`);
    await pool.query(`UPDATE skill_definitions SET learn_cost=CASE tier WHEN '基础' THEN 1 WHEN '下位' THEN 2 WHEN '中位' THEN 3 ELSE learn_cost END
    WHERE learn_cost BETWEEN 1 AND 98 AND tier IN ('基础','下位','中位') AND category NOT IN ('bound','special')`);
    for (const [channel, codes] of [['guild', guildSkillCodes], ['bookshop', bookshopSkillCodes]])
        for (const code of codes) {
            const skill = residentSkillByCode(code);
            const bookCode = `skill_book_${code}`;
            const source = channel === 'guild' ? '冒险者公会·贡献度兑换' : '百纳镇·百味书屋';
            await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,stack_limit,is_tradeable,effect_json)
      VALUES (?,?,?,?,'consumable','技能书',0.35,1,0,JSON_OBJECT('skillBook',?))
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),is_tradeable=0,effect_json=VALUES(effect_json)`, [bookCode, `技能书·${skill.name}`, `研读后发现「${skill.name}」；正式学习需达到 Lv.${skill.tier === '中位' ? 25 : skill.tier === '下位' ? 6 : 1}，并按${skill.tier}技能支付 SP。`, source, code]);
            const price = channel === 'guild' ? guildSkillBookContributionPrice(skill.tier, code) * 10 : skill.tier === '中位' ? 900 : skill.tier === '下位' ? 400 : 150;
            if (channel === 'guild')
                await pool.execute(`INSERT INTO guild_shop_items (item_id,buy_price,sell_price,stock_capacity,stock_quantity,is_active)
      SELECT id,?,0,99,99,1 FROM item_definitions WHERE code=?
      ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),sell_price=0,stock_capacity=99,is_active=1`, [price, bookCode]);
            else
                await pool.execute(`INSERT INTO bookshop_items (item_id,buy_price,stock_capacity,stock_quantity,is_active)
      SELECT id,?,99,99,1 FROM item_definitions WHERE code=?
      ON DUPLICATE KEY UPDATE buy_price=VALUES(buy_price),stock_capacity=99,is_active=1`, [price, bookCode]);
        }
    await pool.query(`UPDATE item_definitions SET codex_id=CONCAT('23',CASE WHEN id>=100000 THEN CAST(id AS CHAR) ELSE LPAD(id,5,'0') END)
    WHERE code LIKE 'skill_book_resident_%' AND codex_id IS NULL`);
};

export { initializeSkillAccess };
