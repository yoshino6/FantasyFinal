import { createHash } from 'node:crypto';

const alchemyRuleVersion = 'alchemy-v2-20260906';
const alchemyCombinationKey = (items) => items.map(item => item.id).join(':');
const alchemyFingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const alchemyBaseCode = (code) => code.replace(/_q[12]$/, '');
const alchemyGroupKey = (snapshot) => alchemyFingerprint({
    kind: snapshot.kind, ingredients: snapshot.ingredients.map(item => [item.id, item.quantity]),
    level: snapshot.level, craftsmanship: snapshot.craftsmanship, version: snapshot.version, conditions: snapshot.conditions
});
const emptyAlchemyStatistics = () => ({ settlements: 0, batches: 0, successes: 0, outcomes: {}, quantities: {}, qualities: {} });
const updateAlchemyStatistics = (previous, batches) => {
    const stats = JSON.parse(JSON.stringify(previous));
    stats.settlements++;
    for (const batch of batches) {
        stats.batches++;
        if (!batch.success)
            continue;
        stats.successes++;
        const totals = new Map();
        for (const item of batch.outputs) {
            const code = alchemyBaseCode(item.code);
            totals.set(code, (totals.get(code) ?? 0) + item.quantity);
            stats.qualities[item.code] = (stats.qualities[item.code] ?? 0) + item.quantity;
        }
        const outcome = [...totals.keys()].sort().join('+');
        stats.outcomes[outcome] = (stats.outcomes[outcome] ?? 0) + 1;
        for (const [code, quantity] of totals) {
            const old = stats.quantities[code];
            stats.quantities[code] = { min: Math.min(old?.min ?? quantity, quantity), max: Math.max(old?.max ?? quantity, quantity), total: (old?.total ?? 0) + quantity };
        }
    }
    return stats;
};
const alchemyStability = (stats) => {
    const [outcome, count] = Object.entries(stats.outcomes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ['', 0];
    return { outcome, count, stable: stats.settlements >= 5 && stats.batches >= 10 && stats.successes / stats.batches >= .6 && count >= 5 && count / stats.successes >= .8 };
};
const validAlchemyCombination = (ids, available) => {
    const demand = new Map();
    ids.forEach(id => demand.set(id, (demand.get(id) ?? 0) + 1));
    return ids.length === 3 && [...demand].every(([id, count]) => (available.get(id) ?? 0) >= count);
};
const scanAlchemyCombinations = (ids, available, tried, previous = { cursor: 0, selected: null, eligible: 0 }, budget = 50000, random = Math.random) => {
    const state = { ...previous };
    const n = ids.length;
    const total = n ** 3;
    const decode = (index) => [ids[Math.floor(index / (n * n))], ids[Math.floor(index / n) % n], ids[index % n]];
    const end = Math.min(total, state.cursor + budget);
    for (; state.cursor < end; state.cursor++) {
        const combination = decode(state.cursor);
        if (!validAlchemyCombination(combination, available) || tried.has(combination.join(':')))
            continue;
        state.eligible++;
        if (random() < 1 / state.eligible)
            state.selected = state.cursor;
    }
    return { state, done: state.cursor >= total, combination: state.selected === null ? null : decode(state.selected) };
};

export { alchemyBaseCode, alchemyCombinationKey, alchemyFingerprint, alchemyGroupKey, alchemyRuleVersion, alchemyStability, emptyAlchemyStatistics, scanAlchemyCombinations, updateAlchemyStatistics, validAlchemyCombination };
