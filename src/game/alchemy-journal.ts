import { createHash } from 'node:crypto';

export const alchemyRuleVersion = 'alchemy-v2-20260906';
export type AlchemyIngredient = { id: number; code: string; name: string; quantity: number; role: string; level?: number; effect?: unknown };
export type AlchemyBatch = { success: boolean; great?: boolean; consumed?: AlchemyIngredient[]; outputs: AlchemyIngredient[] };
export type AlchemySnapshot = { kind: string; source: string; ingredients: AlchemyIngredient[]; level: number; craftsmanship: number; version: string; cost?: number; conditions?: string };
export type AlchemyStatistics = { settlements: number; batches: number; successes: number; outcomes: Record<string, number>; quantities: Record<string, { min: number; max: number; total: number }>; qualities: Record<string, number> };
export const alchemyCombinationKey = (items: readonly Pick<AlchemyIngredient, 'id'>[]) => items.map(item => item.id).join(':');
export const alchemyFingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const alchemyBaseCode = (code: string) => code.replace(/_q[12]$/, '');
export const alchemyGroupKey = (snapshot: AlchemySnapshot) => alchemyFingerprint({
  kind: snapshot.kind, ingredients: snapshot.ingredients.map(item => [item.id, item.quantity]),
  level: snapshot.level, craftsmanship: snapshot.craftsmanship, version: snapshot.version, conditions: snapshot.conditions
});
export const emptyAlchemyStatistics = (): AlchemyStatistics => ({ settlements: 0, batches: 0, successes: 0, outcomes: {}, quantities: {}, qualities: {} });
export const updateAlchemyStatistics = (previous: AlchemyStatistics, batches: readonly AlchemyBatch[]): AlchemyStatistics => {
  const stats: AlchemyStatistics = JSON.parse(JSON.stringify(previous)); stats.settlements++;
  for (const batch of batches) {
    stats.batches++; if (!batch.success) continue; stats.successes++;
    const totals = new Map<string, number>();
    for (const item of batch.outputs) {
      const code = alchemyBaseCode(item.code); totals.set(code, (totals.get(code) ?? 0) + item.quantity);
      stats.qualities[item.code] = (stats.qualities[item.code] ?? 0) + item.quantity;
    }
    const outcome = [...totals.keys()].sort().join('+'); stats.outcomes[outcome] = (stats.outcomes[outcome] ?? 0) + 1;
    for (const [code, quantity] of totals) {
      const old = stats.quantities[code]; stats.quantities[code] = { min: Math.min(old?.min ?? quantity, quantity), max: Math.max(old?.max ?? quantity, quantity), total: (old?.total ?? 0) + quantity };
    }
  }
  return stats;
};
export const alchemyStability = (stats: AlchemyStatistics) => {
  const [outcome, count] = Object.entries(stats.outcomes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ['', 0];
  return { outcome, count, stable: stats.settlements >= 5 && stats.batches >= 10 && stats.successes / stats.batches >= .6 && count >= 5 && count / stats.successes >= .8 };
};
export const validAlchemyCombination = (ids: readonly number[], available: ReadonlyMap<number, number>) => {
  const demand = new Map<number, number>(); ids.forEach(id => demand.set(id, (demand.get(id) ?? 0) + 1));
  return ids.length === 3 && [...demand].every(([id, count]) => (available.get(id) ?? 0) >= count);
};
export type AlchemySearch = { cursor: number; selected: number | null; eligible: number };
/** 完整扫描用蓄水池抽样，可分页继续；未扫完绝不报告耗尽。 */
export const scanAlchemyCombinations = (ids: readonly number[], available: ReadonlyMap<number, number>, tried: ReadonlySet<string>, previous: AlchemySearch = { cursor: 0, selected: null, eligible: 0 }, budget = 50000, random = Math.random) => {
  const state = { ...previous }; const n = ids.length; const total = n ** 3;
  const decode = (index: number) => [ids[Math.floor(index / (n * n))]!, ids[Math.floor(index / n) % n]!, ids[index % n]!];
  const end = Math.min(total, state.cursor + budget);
  for (; state.cursor < end; state.cursor++) {
    const combination = decode(state.cursor);
    if (!validAlchemyCombination(combination, available) || tried.has(combination.join(':'))) continue;
    state.eligible++; if (random() < 1 / state.eligible) state.selected = state.cursor;
  }
  return { state, done: state.cursor >= total, combination: state.selected === null ? null : decode(state.selected) };
};
