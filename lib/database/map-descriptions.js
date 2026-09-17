import { mapRegionDescriptions, mapItemDescription } from '../game/map-description.config.js';

const initializeMapDescriptions = async (pool) => {
    for (const [code, description] of Object.entries(mapRegionDescriptions)) {
        await pool.execute('UPDATE map_regions SET description=? WHERE code=?', [description, code]);
        await pool.execute(`UPDATE item_definitions SET description=?
      WHERE item_category='地图' AND JSON_UNQUOTE(JSON_EXTRACT(effect_json,'$.map'))=?`, [mapItemDescription(code), code]);
    }
};

export { initializeMapDescriptions };
