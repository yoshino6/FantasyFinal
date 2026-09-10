import { achievementRegionalMaterials } from './achievement-production.js';
import { recordAchievement } from './achievement-events.js';
import { armorSetFromRows } from './armor-set.js';
import { armorSlot } from './armor-class.js';

const achievementActivity = (c, id) => {
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    recordAchievement(c, id, [{ metric: 'ACH_A24', distinct: day }, { metric: 'ACH_A25', distinct: day }]);
};
const normalSkillSpecializationFacts = (category, rows) => {
    if (['passive', 'bound'].includes(category))
        return [];
    const legal = new Set(['overcharge', 'instant', 'efficient', 'potent']);
    return [...new Set(rows.filter(row => legal.has(row.specialization) && Number(row.level) >= 2).map(row => row.specialization))]
        .map(specialization => ({ metric: 'ACH_A09', distinct: specialization, life: true }));
};
const achievementLevel = (c, id, level) => recordAchievement(c, id, [[5, 'ACH_A11'], [10, 'ACH_A12'], [20, 'ACH_A13'], [30, 'ACH_A14']].filter(([n]) => level >= Number(n)).map(([, metric]) => String(metric)));
const achievementSecondaryLevel = (c, id, level) => recordAchievement(c, id, [[3, 'ACH_A18'], [5, 'ACH_A19'], [11, 'ACH_A20']].filter(([n]) => level >= Number(n)).map(([, metric]) => String(metric)));
const achievementSecondary = async (c, id) => {
    const [rows] = await c.execute('SELECT MAX(level) AS level FROM player_secondary_professions WHERE character_id=?', [id]);
    const level = Number(rows[0]?.level ?? 0);
    recordAchievement(c, id, [[1, 'ACH_A05'], [3, 'ACH_A18'], [5, 'ACH_A19'], [11, 'ACH_A20']].filter(([n]) => level >= Number(n)).map(([, metric]) => String(metric)));
};
const achievementEquipment = async (c, id, itemId, battle = false) => {
    const [rows] = await c.execute('SELECT pe.slot,i.weapon_type,i.item_category,pe.item_id FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id=?', [id]);
    const facts = [];
    if (rows.some(r => r.item_category === '武器'))
        facts.push({ metric: 'ACH_A03' });
    if (battle && rows.some(r => r.item_category === '武器') && rows.some(r => armorSlot(String(r.slot))))
        facts.push({ metric: 'ACH_A04' });
    if (new Set(rows.map(r => armorSlot(String(r.slot))).filter(Boolean)).size === 5)
        facts.push({ metric: 'ACH_I06' });
    const set = armorSetFromRows(rows);
    if (set)
        facts.push({ metric: 'ACH_I07' });
    if (set?.tier === 5)
        facts.push({ metric: 'ACH_I08' });
    if (itemId)
        facts.push({ metric: 'ACH_E20', distinct: String(itemId), life: true });
    recordAchievement(c, id, facts);
};
const achievementItem = async (c, id, itemId) => {
    const [rows] = await c.execute('SELECT * FROM item_definitions WHERE id=?', [itemId]);
    const item = rows[0];
    if (!item)
        return;
    const facts = [{ metric: 'ACH_E01' }, { metric: 'ACH_E03', distinct: String(itemId) }];
    if (item.rarity === '普通')
        facts.push({ metric: 'ACH_E02', distinct: String(itemId) });
    if (item.item_type === 'material')
        facts.push({ metric: 'ACH_E04', distinct: String(itemId) });
    if (item.item_category === '武器' && item.weapon_type)
        facts.push({ metric: 'ACH_E07', distinct: String(item.weapon_type) });
    if (['布甲', '皮甲', '轻甲', '重甲', '板甲'].includes(String(item.weapon_type)))
        facts.push({ metric: 'ACH_E08', distinct: String(item.weapon_type) });
    const rarity = { 优秀: 'ACH_E09', 精良: 'ACH_E10', 稀有: 'ACH_E11', 神器: 'ACH_E13' };
    if (rarity[item.rarity])
        facts.push({ metric: rarity[item.rarity] });
    if (item.rarity === '史诗' && item.item_type === 'equipment') {
        const [instances] = await c.execute('SELECT id FROM player_item_instances WHERE character_id=? AND item_id=? LIMIT 1', [id, itemId]);
        if (instances.length)
            facts.push({ metric: 'ACH_E12' });
    }
    if (item.item_category === '锻材')
        facts.push({ metric: 'ACH_E15', distinct: String(itemId) });
    if (item.item_category === '炼材')
        facts.push({ metric: 'ACH_E16', distinct: String(itemId) });
    if (['wood', 'metal', 'water', 'ice', 'dark', 'fire', 'thunder', 'light', 'wind'].some(e => item.code === e + '_element_dust'))
        facts.push({ metric: 'ACH_E18', distinct: String(item.code) });
    if (['blood_residue', 'energy_ember', 'magic_unit'].includes(item.code))
        facts.push({ metric: 'ACH_E19', distinct: String(item.code) });
    if (achievementRegionalMaterials.includes(item.code))
        facts.push({ metric: 'ACH_E17', distinct: String(item.code) });
    const effect = typeof item.effect_json === 'string' ? JSON.parse(item.effect_json) : item.effect_json ?? {};
    if (effect.skillBook)
        facts.push({ metric: 'ACH_E23', distinct: String(itemId) });
    if (['heal', 'restoreMp', 'healPct', 'restoreMpPct'].some(key => Number(effect[key]) > 0) && item.item_type === 'consumable')
        facts.push({ metric: 'ACH_E21', distinct: String(itemId) });
    recordAchievement(c, id, facts);
};
const achievementNpcState = async (c, id, npc, effective = true) => {
    const [rows] = await c.execute('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?', [id, npc]);
    const facts = [];
    if (Number(rows[0]?.affinity) >= 200)
        facts.push({ metric: 'ACH_F07' }, { metric: 'ACH_F08', distinct: npc, life: true });
    if (effective)
        facts.push({ metric: 'ACH_F09', distinct: npc });
    recordAchievement(c, id, facts);
};

export { achievementActivity, achievementEquipment, achievementItem, achievementLevel, achievementNpcState, achievementSecondary, achievementSecondaryLevel, normalSkillSpecializationFacts };
