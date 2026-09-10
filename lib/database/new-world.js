import { journeyElixirs, newWorldEquipment } from '../game/new-world.config.js';

const initializeNewWorld = async (pool) => {
    await pool.query(`CREATE TABLE IF NOT EXISTS player_new_world_claims (
    character_id BIGINT UNSIGNED NOT NULL, reward_level SMALLINT UNSIGNED NOT NULL,
    claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id,reward_level),
    CONSTRAINT fk_new_world_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
    for (const item of journeyElixirs) {
        const experience = 'experienceBonusPct' in item.effect;
        const value = experience ? item.effect.experienceBonusPct : item.effect.partyDropBonusPct;
        await pool.execute(`INSERT INTO item_definitions
      (code,name,description,obtain_source,item_type,item_category,rarity,required_level,weight,stackable,effect_json)
      VALUES (?,?,?,'新世界旅途','consumable','特殊','普通',1,0.15,1,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),effect_json=VALUES(effect_json)`, [item.code, item.name, `接下来10场战斗${experience ? '经验获取' : '队伍材料掉率'}提高${value}%。同类秘药取强，不叠加。`, JSON.stringify(item.effect)]);
    }
    for (const item of newWorldEquipment) {
        await pool.execute(`INSERT INTO item_definitions
      (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,effect_json)
      VALUES (?,?,?,'新世界旅途','equipment',?,?,?,?,2,0,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),item_category=VALUES(item_category),
      weapon_type=VALUES(weapon_type),rarity=VALUES(rarity),required_level=VALUES(required_level),effect_json=VALUES(effect_json)`, [item.code, item.name, `新世界旅途赠予的Lv.${item.level}${item.rarity}装备，领取时品质100%。`, item.category, item.subtype, item.rarity, item.level, JSON.stringify(item.effect)]);
    }
};

export { initializeNewWorld };
