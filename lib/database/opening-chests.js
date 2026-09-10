import { openingThemeChests, goldenChestTable, dawnWeapons, crimsonArmor } from '../game/opening-chest.config.js';
import { forgedPrimaryStats, forgedEquipmentBase } from '../game/constants.js';

const initializeOpeningChests = async (pool) => {
    for (const [code, name] of openingThemeChests)
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,trade_price,is_tradeable,effect_json) VALUES (?,?,?,'初行剧情','consumable','宝箱',0,0,0,?) ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),effect_json=VALUES(effect_json)`, [code, name, '打开消耗一只：80%获得Lv.1稀有装备（六类武器与五个防具部位均分），20%获得Lv.1初晓史诗武器（六类均分）。支持一次打开1～100只；无额外加成词条。', JSON.stringify({ chestTableCode: code, chestTableVersion: 1, source: 'opening_fixed' })]);
    await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,trade_price,is_tradeable,effect_json) VALUES ('opening_twilight_dew','黄昏露','仅限安全区脱战使用，恢复最大生命与魔力各25%；两项全满不消耗。用后消失，不改变血统或天赋。','维兰的初行谢礼','consumable','药剂',0.1,0,0,?) ON DUPLICATE KEY UPDATE effect_json=VALUES(effect_json)`, [JSON.stringify({ healPct: 25, restoreMpPct: 25, openingSafeRecovery: true, source: 'opening_fixed' })]);
    await pool.query(`CREATE TABLE IF NOT EXISTS opening_chest_requests (token CHAR(36) NOT NULL PRIMARY KEY,character_id BIGINT UNSIGNED NOT NULL,chest_code VARCHAR(64) NOT NULL,table_version INT NOT NULL,quantity INT NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'preview',result_json JSON NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT fk_opening_chest_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`);
    for (const [code, name, category, effect] of [
        ['opening_golden_chest', '黄金宝箱', '宝箱', { chestTableCode: 'opening_golden_chest', chestTableVersion: goldenChestTable.version }],
        ['opening_medical_coupon', '初行急救券', '特殊', { openingService: 'medical' }],
        ['opening_trade_coupon', '公会补给券', '特殊', { openingService: 'supplies' }]
    ])
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,trade_price,is_tradeable,effect_json) VALUES (?,?,'初行旅途中获得的个人绑定物品。','初行剧情','consumable',?,0,0,0,?) ON DUPLICATE KEY UPDATE effect_json=VALUES(effect_json)`, [code, name, category, JSON.stringify(effect)]);
    for (const [code, type] of dawnWeapons) {
        await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,trade_price,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,'公会选职','equipment','武器',?,'普通',1,0.5,0,0,0,?) ON DUPLICATE KEY UPDATE effect_json=VALUES(effect_json)`, [`opening_normal_${code}`, `公会练习${type}`, '登记职业时领取的普通练习武器。', type, JSON.stringify({ ...forgedPrimaryStats('武器', type, 1, '普通'), balanceVersion: 3 })]);
    }
    await pool.execute(`INSERT IGNORE INTO guild_shop_items (item_id,buy_price,stock_capacity,stock_quantity,is_active) SELECT id,20,9999,9999,1 FROM item_definitions WHERE code='opening_companion_feed'`);
    const gear = async (code, name, category, type, rarity, effect) => pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,trade_price,stackable,is_tradeable,effect_json) VALUES (?,?,'初行者的个人绑定装备。','初行剧情','equipment',?,?,?,1,0.5,0,0,0,?) ON DUPLICATE KEY UPDATE effect_json=VALUES(effect_json)`, [code, name, category, type, rarity, JSON.stringify({ ...effect, balanceVersion: 3 })]);
    for (const [code, type, name] of dawnWeapons) {
        await gear(`dawn_${code}`, name, '武器', type, '史诗', { ...forgedPrimaryStats('武器', type, 1, '史诗'), dawnEffect: code, epicWeaponEffect: `dawn_${code}` });
        await gear(`opening_rare_${code}`, `初行·${type}`, '武器', type, '稀有', { ...forgedPrimaryStats('武器', type, 1, '稀有') });
    }
    for (const [slot, label, name] of crimsonArmor) {
        await gear(`crimson_${slot}`, name, '防具', '布甲', '史诗', { slot: label, physicalDefense: forgedEquipmentBase(1, '防具', slot) * 2, magicDefense: forgedEquipmentBase(1, '防具', slot) * 2, epicSetCode: 'crimson_crown' });
        await gear(`opening_rare_${slot}`, `初行·${label}`, '防具', '布甲', '稀有', { slot: label, physicalDefense: forgedEquipmentBase(1, '防具', slot) * 1.5, magicDefense: forgedEquipmentBase(1, '防具', slot) * 1.5 });
    }
};

export { initializeOpeningChests };
