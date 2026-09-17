import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export type EquippedEnchantment = {
  instanceId: number;
  revision: number;
  slot: string;
  cardCode: string;
  cardName: string;
  effectText: string;
  effects: Record<string, any>;
};

const object = (value: unknown): Record<string, any> => {
  if (!value) return {};
  if (typeof value !== 'string') return value as Record<string, any>;
  try { return JSON.parse(value) as Record<string, any>; } catch { return {}; }
};

export const equippedEnchantments = async (connection: Pool | PoolConnection, characterId: number): Promise<EquippedEnchantment[]> => {
  const [rows] = await connection.execute<(RowDataPacket & { instance_id: number; revision: number; slot: string; card_code: string; card_name: string; effect_text: string; effects_json: unknown; allowed_slots_json: unknown })[]>(`SELECT ee.instance_id,ee.revision,pe.slot,ee.card_code,card.name AS card_name,ee.effect_text,ee.effects_json,ee.allowed_slots_json
    FROM player_equipment pe JOIN equipment_enchantments ee ON ee.instance_id=pe.instance_id
    JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    JOIN item_definitions card ON card.id=ee.card_item_id
    WHERE pe.character_id=? ORDER BY pe.slot`, [characterId]);
  return rows.flatMap(row => {
    const allowedSlots = Array.isArray(row.allowed_slots_json) ? row.allowed_slots_json.map(String) : (() => {
      try { const parsed = JSON.parse(String(row.allowed_slots_json ?? '[]')); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
    })();
    return allowedSlots.includes(String(row.slot))
      ? [{ instanceId: Number(row.instance_id), revision: Number(row.revision), slot: String(row.slot), cardCode: String(row.card_code), cardName: String(row.card_name), effectText: String(row.effect_text), effects: object(row.effects_json) }]
      : [];
  });
};

const probabilityKeys = new Set(['hitCorrectionPct', 'evasionCorrectionPct', 'critAvoidanceCorrectionPct', 'critDamageCorrectionPct']);
const reductionKeys = new Set(['cardDamageReductionPct', 'cardPhysicalDamageReductionPct', 'cardMagicDamageReductionPct']);
const combineRemaining = (values: number[]) => (1 - values.reduce((remaining, value) => remaining * (1 - Math.max(0, Math.min(100, value)) / 100), 1)) * 100;
const boundedPercent = (value: unknown, maximum = 100) => Math.max(0, Math.min(maximum, Number(value ?? 0))) / 100;

/** 卡片减伤始终作为独立乘余层；不与人物原有减伤字段相加。 */
export const cardIncomingDamageMultiplier = (effects: Record<string, any> | undefined, magic: boolean, element = '无') => {
  const card = effects ?? {};
  return (1 - boundedPercent(card.cardDamageReductionPct, 90))
    * (1 - boundedPercent(card[magic ? 'cardMagicDamageReductionPct' : 'cardPhysicalDamageReductionPct'], 90))
    * (1 - boundedPercent(card[`elementDamageReductionPct_${element}`], 90));
};

export const applyCardIncomingDamageReduction = (damage: number, effects: Record<string, any> | undefined, magic: boolean, element = '无') =>
  Math.max(0, Math.floor(Math.max(0, Number(damage)) * cardIncomingDamageMultiplier(effects, magic, element)));

/** 指定元素伤害只放大持卡者本人的匹配元素直击。 */
export const cardElementDamageMultiplier = (effects: Record<string, any> | undefined, element: string) =>
  1 + boundedPercent(effects?.[`elementDamageBonusPct_${element}`]);

/** 普通治疗增幅与卡片主动治疗增幅是两个独立乘算层。 */
export const activeHealingMultiplier = (healingBonusPct: number, cardActiveHealingBonusPct: number) =>
  (1 + Number(healingBonusPct || 0) / 100) * (1 + Math.max(0, Number(cardActiveHealingBonusPct || 0)) / 100);

export const aggregateEnchantmentEffects = (enchantments: readonly Pick<EquippedEnchantment, 'effects'>[]) => {
  const aggregate: Record<string, any> = {};
  const grouped = new Map<string, number[]>();
  for (const enchantment of enchantments) for (const [key, raw] of Object.entries(enchantment.effects)) {
    if (typeof raw === 'number') {
      if (probabilityKeys.has(key) || reductionKeys.has(key) || key.startsWith('elementDamageReductionPct_')) grouped.set(key, [...(grouped.get(key) ?? []), raw]);
      else aggregate[key] = Number(aggregate[key] ?? 0) + raw;
    } else if (typeof raw === 'boolean') aggregate[key] = Boolean(aggregate[key]) || raw;
    else if (key === 'trackingMaxTier') {
      const order = { normal: 0, large: 1, elite: 2, boss: 3 } as Record<string, number>;
      if (order[String(raw)] > order[String(aggregate[key] ?? 'normal')]) aggregate[key] = raw;
    } else if (!(key in aggregate)) aggregate[key] = raw;
  }
  for (const [key, values] of grouped) aggregate[key] = combineRemaining(values);
  aggregate.actualHitRatePct = Math.min(12, Number(aggregate.actualHitRatePct ?? 0));
  aggregate.actualCritRatePct = Math.min(12, Number(aggregate.actualCritRatePct ?? 0));
  aggregate.negotiationActualBonusPct = Math.min(10, Number(aggregate.negotiationActualBonusPct ?? 0));
  aggregate.mapPerceptionBonus = Math.min(3, Number(aggregate.mapPerceptionBonus ?? 0));
  return aggregate;
};

export const equippedEnchantmentEffects = async (connection: Pool | PoolConnection, characterId: number) => aggregateEnchantmentEffects(await equippedEnchantments(connection, characterId));

export const cardIndependentPanelPercent = (effects: Record<string, any>) => ({ hpPct: Number(effects.hpIndependentPct ?? 0) });
