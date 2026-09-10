import { alchemyMaterialValue } from './alchemy-balance.js';

const particleTypes = {
    wood_element_dust: '木', metal_element_dust: '土', water_element_dust: '水', ice_element_dust: '冰', dark_element_dust: '暗',
    fire_element_dust: '火', thunder_element_dust: '雷', light_element_dust: '光', wind_element_dust: '风',
    blood_residue: '血肉', energy_ember: '能量', magic_unit: '魔力'
};
const negotiationItemObject = (raw) => {
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) ?? {};
        }
        catch {
            return {};
        }
    }
    return raw && typeof raw === 'object' ? raw : {};
};
const categories = { 怪材: '兽材', 建材: '木石', 锻材: '金属', 稀有锻材: '金属', 区域锻材: '金属', 基材: '零件', 构件: '零件', 炼材: '炼材', 食材: '鲜肉', 草药: '草药' };
const protectedCategories = new Set(['地图', '图纸', '技能书', '任务', '剧情', '货币', '世界印记', 'Boss部件', '育成', '礼物']);
const protectedCodes = new Set(['sky_dust', 'evolution_seed', 'adventurer_card', 'celestial_judicator_imitation', 'demon_breaker_teleporter']);
const plantCodes = new Set(['healing_herb', 'herbal_extract', 'living_wood', 'magic_branch']);
const negotiationReferenceValue = (item) => {
    const effects = negotiationItemObject(item.effect_json);
    const fixed = Number(effects.negotiationValue ?? effects.referencePrice ?? item.trade_price);
    if (Number.isFinite(fixed) && fixed > 0)
        return fixed;
    const special = { sky_dust: 100, copper_coin: 1, silver_coin: 100, gold_coin: 10000 }[item.code];
    if (special)
        return special;
    if (/^meat_chunk(?:_lv\d+)?$/.test(item.code))
        return 4;
    const level = Math.max(1, Number(effects.material_monster_level ?? effects.material_level ?? /_l(\d+)$/.exec(item.code)?.[1] ?? 1));
    const value = alchemyMaterialValue(item.code, level, item.item_category);
    return value !== null && Number.isFinite(value) && value > 0 ? value : 0;
};
const classifyNegotiationItem = (item) => {
    const effects = negotiationItemObject(item.effect_json);
    const deny = (reason) => ({ usable: false, category: item.item_category || '未分类', subtype: '禁止', reason, value: Number(item.trade_price) || 0 });
    if (item.source === 'instance' || ['equipment', 'device'].includes(item.item_type) || !Number(item.stackable))
        return deny('实例物品不能用于交涉');
    if (protectedCategories.has(item.item_category) || protectedCodes.has(item.code) || /^(blueprint_|relic_)/.test(item.code)
        || effects.map || effects.quest || effects.questItem || effects.important || effects.worldInsight || effects.evolutionMaterial || effects.evolutionSeed || effects.adventurerCard || effects.epic_boss_part || effects.epic_blueprint || effects.constructionBlueprint || effects.npcGift)
        return deny('地图、任务重要物品与解锁凭证不能用于交涉');
    let subtype = plantCodes.has(item.code) ? '草药' : categories[item.item_category];
    if (['beast_meat', 'meat_chunk'].includes(item.code) || effects.meat_chunk)
        subtype = '鲜肉';
    if (item.code === 'pure_soul_trace')
        subtype = '魂性';
    if (item.code === 'beast_bone' || effects.monster_craft_material === 'bone')
        subtype = '骨质';
    if (item.code === 'beast_core' || effects.beast_core)
        subtype = '兽核';
    if (item.item_category === '粒子') {
        if (!particleTypes[item.code])
            return deny('此粒子尚未完成元素分类');
        subtype = `粒子·${particleTypes[item.code]}`;
    }
    if (!subtype)
        return deny('此类物品不在普通交涉材料清单中');
    const value = negotiationReferenceValue(item);
    if (!Number.isFinite(value) || value <= 0)
        return deny('尚无有效交涉参考价值');
    return { usable: true, category: item.item_category, subtype, reason: '普通堆叠材料', value };
};
const negotiationInventoryPage = (items, requestedPage = 1, keyword = '') => {
    const query = keyword.trim().slice(0, 50);
    const filtered = items.map(item => ({ ...item, policy: classifyNegotiationItem(item), available: Math.max(0, Number(item.quantity) - Number(item.trade_bound_quantity ?? 0) - Number(item.personal_bound_quantity ?? 0)) }))
        .filter(item => item.policy.usable && item.available > 0 && (!query || item.name.includes(query) || item.policy.subtype.includes(query) || item.item_category.includes(query) || item.code === query || String(item.id) === query))
        .sort((a, b) => a.policy.subtype.localeCompare(b.policy.subtype, 'zh-CN') || a.code.localeCompare(b.code));
    const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
    const page = Math.max(1, Math.min(Number.isSafeInteger(requestedPage) ? requestedPage : 1, totalPages));
    return { page, totalPages, total: filtered.length, keyword: query, items: filtered.slice((page - 1) * 10, page * 10) };
};

export { classifyNegotiationItem, negotiationInventoryPage, negotiationItemObject, negotiationReferenceValue, particleTypes };
