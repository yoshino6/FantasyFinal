import { openingTierWeights } from './opening-world.config.js';

const openingRouteDrawSchema = `CREATE TABLE IF NOT EXISTS opening_route_draw_state (
  id TINYINT NOT NULL PRIMARY KEY,cycle_no BIGINT UNSIGNED NOT NULL DEFAULT 1,
  used_routes_json JSON NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB`;
const chooseWeighted = (entries, random = Math.random) => {
    if (!entries.length || entries.some(e => !Number.isFinite(e.weight) || e.weight <= 0))
        throw new Error('没有可用的随机候选。');
    let point = random() * entries.reduce((sum, e) => sum + e.weight, 0);
    for (const entry of entries) {
        point -= entry.weight;
        if (point < 0)
            return entry.value;
    }
    return entries[entries.length - 1].value;
};
const openingRouteWeights = (candidates) => {
    const tiers = [...new Set(candidates.map(c => c.tier))];
    const tierTotal = tiers.reduce((sum, tier) => sum + openingTierWeights[tier], 0);
    return candidates.map(candidate => {
        const regionCount = new Set(candidates.filter(c => c.tier === candidate.tier).map(c => c.regionCode)).size;
        const routeCount = candidates.filter(c => c.regionCode === candidate.regionCode).length;
        return { value: candidate.code, weight: openingTierWeights[candidate.tier] / tierTotal / regionCount / routeCount };
    });
};
const drawOpeningRoute = async (connection, candidates, random = Math.random) => {
    const weighted = openingRouteWeights(candidates);
    if (!weighted.length || new Set(candidates.map(c => c.code)).size !== candidates.length || weighted.some(c => !Number.isFinite(c.weight) || c.weight <= 0)) {
        throw new Error('初行路线抽取配置无效，请稍后重试。');
    }
    const goddess = weighted.find(c => c.value === 'A01');
    if (goddess && random() < goddess.weight / weighted.reduce((sum, c) => sum + c.weight, 0))
        return goddess.value;
    const ordinary = weighted.filter(c => c.value !== 'A01');
    if (!ordinary.length)
        throw new Error('暂时没有可抽取的普通初行路线。');
    await connection.execute("INSERT INTO opening_route_draw_state (id,used_routes_json) VALUES (1,'[]') ON DUPLICATE KEY UPDATE id=id");
    const [rows] = await connection.execute('SELECT cycle_no,used_routes_json FROM opening_route_draw_state WHERE id=1 FOR UPDATE');
    if (!rows[0])
        throw new Error('初行路线抽取记录暂不可用。');
    const raw = typeof rows[0].used_routes_json === 'string' ? JSON.parse(rows[0].used_routes_json) : rows[0].used_routes_json;
    if (!Array.isArray(raw) || raw.some(code => typeof code !== 'string'))
        throw new Error('初行路线抽取记录异常，请联系管理员。');
    const used = new Set(raw);
    let cycle = Number(rows[0].cycle_no);
    let remaining = ordinary.filter(c => !used.has(c.value));
    if (!remaining.length) {
        cycle++;
        used.clear();
        remaining = ordinary;
    }
    const chosen = chooseWeighted(remaining, random);
    used.add(chosen);
    await connection.execute('UPDATE opening_route_draw_state SET cycle_no=?,used_routes_json=? WHERE id=1', [cycle, JSON.stringify([...used])]);
    return chosen;
};

export { chooseWeighted, drawOpeningRoute, openingRouteDrawSchema, openingRouteWeights };
