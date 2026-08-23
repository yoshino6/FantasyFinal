import type { Pool } from 'mysql2/promise';

/**
 * 商店库存会在启动与整点统一补货。城镇商店按固定备货量恢复，
 * 猎户小屋则按小时随机决定当批猎获的实际余量。
 */
export const refreshShopStocks = async (pool: Pool) => {
  await pool.query(`UPDATE guild_shop_items si
    JOIN item_definitions i ON i.id=si.item_id
    SET si.stock_capacity=CASE WHEN i.item_category='地图' THEN 100 ELSE 99 END,
        si.stock_quantity=CASE WHEN si.buy_price>0 THEN CASE WHEN i.item_category='地图' THEN 100 ELSE 99 END ELSE 0 END
    WHERE si.is_active=1`);
  await pool.query(`UPDATE blacksmith_shop_items si
    JOIN item_definitions i ON i.id=si.item_id
    SET si.stock_capacity=CASE i.required_level WHEN 5 THEN 999 WHEN 10 THEN 499 WHEN 15 THEN 199 ELSE 99 END,
        si.stock_quantity=CASE i.required_level WHEN 5 THEN 999 WHEN 10 THEN 499 WHEN 15 THEN 199 ELSE 99 END
    WHERE si.is_active=1`);
  await pool.query(`UPDATE alchemist_shop_items si
    JOIN item_definitions i ON i.id=si.item_id
    SET si.stock_capacity=CASE
          WHEN i.code IN ('minor_experience_elixir','minor_luck_elixir') THEN 99
          WHEN i.code LIKE '%large' THEN 499
          ELSE 999 END,
        si.stock_quantity=CASE
          WHEN i.code IN ('minor_experience_elixir','minor_luck_elixir') THEN 99
          WHEN i.code LIKE '%large' THEN 499
          ELSE 999 END
    WHERE si.is_active=1`);
  await pool.query(`UPDATE hunter_lodge_items hs
    JOIN item_definitions i ON i.id=hs.item_id
    SET hs.stock_capacity=CASE WHEN i.code LIKE 'magic_%' THEN 9 ELSE 99 END,
        hs.stock_quantity=CASE WHEN i.code LIKE 'magic_%' THEN FLOOR(RAND()*9)+1 ELSE FLOOR(RAND()*99)+1 END
    WHERE hs.is_active=1`);
  await pool.query(`UPDATE bookshop_items bs
    SET bs.stock_capacity=99,bs.stock_quantity=99
    WHERE bs.is_active=1`);
  await pool.query(`UPDATE oddworkshop_items
    SET stock_capacity=99,stock_quantity=99
    WHERE is_active=1`);
};
