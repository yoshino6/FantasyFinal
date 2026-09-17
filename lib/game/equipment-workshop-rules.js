const refinementCounts = { 普通: 1, 优秀: 2, 精良: 3, 稀有: 4, 传说: 5, 史诗: 6 };
const rerollRatios = { 优秀: .15, 精良: .2, 稀有: .25, 传说: .3, 史诗: .3 };
const breakthroughs = {
    普通: { next: '优秀', chance: .4, pity: 3, count: 2 }, 优秀: { next: '精良', chance: .35, pity: 4, count: 3 },
    精良: { next: '稀有', chance: .3, pity: 6, count: 4 }, 稀有: { next: '传说', chance: .2, pity: 10, count: 6 }
};
const refinementGain = (random = Math.random) => {
    for (;;) {
        const x = 5 + 1.2 * Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, random()))) * Math.cos(2 * Math.PI * random());
        if (x >= 2 && x <= 8)
            return Math.round(x * 10) / 10;
    }
};
const fusionQualityLoss = (rarity, quality) => Math.min(quality, Math.round(({ 普通: 13, 优秀: 14, 精良: 15, 稀有: 16, 传说: 17 }[rarity] ?? 15) * (.8 + .2 * quality / 100) * 10) / 10);
const qualityDescription = (quality) => quality >= 100 ? '炉火纯青' : quality >= 80 ? '精工细作' : quality >= 60 ? '火候渐佳' : quality >= 30 ? '尚可打磨' : '初具雏形';
const lowForgeMaterials = ['living_wood', 'root_heart', 'river_shell', 'tide_shell'];
const allocateLowMaterials = (stock, required) => {
    const result = [];
    let remaining = required;
    for (const code of lowForgeMaterials) {
        const item = stock.find(r => r.code === code), quantity = Number(item?.selected ?? 0);
        if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > Number(item?.quantity ?? 0) || quantity > remaining)
            throw new Error('指定的主材数量超过需求或库存，请重新分配。');
        if (quantity) {
            result.push({ code, quantity });
            remaining -= quantity;
        }
    }
    for (const code of lowForgeMaterials) {
        const item = stock.find(r => r.code === code), existing = result.find(r => r.code === code), quantity = Math.min(remaining, Math.max(0, Number(item?.quantity ?? 0) - (existing?.quantity ?? 0)));
        if (quantity) {
            if (existing)
                existing.quantity += quantity;
            else
                result.push({ code, quantity });
            remaining -= quantity;
        }
    }
    return { result, remaining };
};
const armorWorkshopNames = {
    布甲: ['兜帽', '风衣', '束腰', '风裤', '轻履'], 皮甲: ['皮帽', '皮衣', '革带', '皮裤', '皮靴'],
    轻甲: ['轻盔', '轻铠', '护腰', '护腿', '战靴'], 重甲: ['重盔', '重铠', '重腰甲', '重腿甲', '重战靴'], 板甲: ['板盔', '板铠', '板腰甲', '板腿甲', '板靴']
};
const verifiedLegacyLayers = (code, base, current, ledger) => {
    if (!/^(crafted_|epic_|reforged_|owner_test_)/.test(code))
        return null;
    const frozen = {};
    for (const row of ledger)
        for (const [key, value] of Object.entries(row))
            if (typeof value === 'number')
                frozen[key] = (frozen[key] ?? 0) + value;
    for (const key of new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(frozen)])) {
        if (typeof base[key] === 'number' || typeof current[key] === 'number' || key in frozen) {
            if (Math.abs(Number(current[key] ?? 0) - Number(base[key] ?? 0) - (frozen[key] ?? 0)) > .00011)
                return null;
        }
        else if (JSON.stringify(base[key]) !== JSON.stringify(current[key]))
            return null;
    }
    return { base: { ...base }, frozen };
};

export { allocateLowMaterials, armorWorkshopNames, breakthroughs, fusionQualityLoss, lowForgeMaterials, qualityDescription, refinementCounts, refinementGain, rerollRatios, verifiedLegacyLayers };
