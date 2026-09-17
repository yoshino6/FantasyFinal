import type { Pool } from 'mysql2/promise';
import { mapItemDescription, mapRegionDescriptions } from '../game/map-description.config';

/** 在内容种子之后同步，修正旧库中误用公会对白的地区介绍。仅更新描述字段。 */
export const initializeMapDescriptions = async (pool: Pool) => {
  for (const [code, description] of Object.entries(mapRegionDescriptions)) {
    await pool.execute('UPDATE map_regions SET description=? WHERE code=?', [description, code]);
    await pool.execute(`UPDATE item_definitions SET description=?
      WHERE item_category='地图' AND JSON_UNQUOTE(JSON_EXTRACT(effect_json,'$.map'))=?`, [mapItemDescription(code), code]);
  }
};
