import { armorSlot } from './armor-set';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { EpicSetCode } from '../config/epic-forging';

type EquippedEpicRow = RowDataPacket & { slot: string; effect_json: unknown };

export type EpicLoadout = {
  setCode: EpicSetCode | 'crimson_crown' | null;
  setCount: number;
  weaponEffects: string[];
  /** 残光护持从单件生效，不受其他套装最高件数覆盖。 */
  crimsonCount?: number;
};

const jsonRecord = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value !== 'string') return value as Record<string, unknown>;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
};

/**
 * 史诗套装只读取实际穿戴的防具栏；最高件数优先，平手时按最早防具栏位决定。
 * 武器独立效果与防具套装完全分离，因此可同时装备任意一把史诗武器与一面史诗盾牌。
 */
export const epicLoadoutFor = async (connection: Pool | PoolConnection, characterId: number): Promise<EpicLoadout> => {
  const [rows] = await connection.execute<EquippedEpicRow[]>(`SELECT pe.slot,COALESCE(ii.effect_json,i.effect_json) AS effect_json
    FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id AND ii.character_id=pe.character_id
    WHERE pe.character_id=?
    ORDER BY FIELD(pe.slot,'shoulder','头肩','upper','上装','waist','腰部','lower','下装','feet','脚部','weapon','offhand'),pe.slot`, [characterId]);
  return epicLoadoutFromRows(rows);
};

export const epicLoadoutFromRows = (rows: readonly {slot:string;effect_json:unknown}[]): EpicLoadout => {
  const seen = new Set<string>();
  const counts = new Map<EpicSetCode | 'crimson_crown', { count: number; first: number }>();
  const weaponEffects: string[] = [];
  for (const [index, row] of rows.entries()) {
    const effect = jsonRecord(row.effect_json);
    const setCode = String(effect.epicSetCode ?? '') as EpicSetCode | 'crimson_crown';
    if (['mountainheart_regalia', 'valk_forge_regalia', 'mistmother_cocoon', 'goblin_court_hunt', 'crimson_crown'].includes(setCode)
      && armorSlot(row.slot) && !seen.has(armorSlot(row.slot))) {
      seen.add(armorSlot(row.slot));
      const current = counts.get(setCode) ?? { count: 0, first: index };
      current.count += 1;
      counts.set(setCode, current);
    }
    if (['weapon', 'offhand'].includes(row.slot) && typeof effect.epicWeaponEffect === 'string') weaponEffects.push(effect.epicWeaponEffect);
  }
  const winner = [...counts.entries()].sort((left, right) => right[1].count - left[1].count || left[1].first - right[1].first)[0];
  const crimsonCount = counts.get('crimson_crown')?.count ?? 0;
  return { setCode: winner?.[0] ?? null, setCount: winner?.[1].count ?? 0, weaponEffects, ...(crimsonCount ? { crimsonCount } : {}) };
};

export const hasEpicWeaponEffect = (loadout: EpicLoadout, code: string) => loadout.weaponEffects.includes(code);

/** 只有赤炉监令三件套具备无条件面板数值，重算属性时直接写入生命上限。 */
export const applyEpicSetPanelStats = <T extends { hpMax: number }>(stats: T, loadout: EpicLoadout): T =>
  loadout.setCode === 'valk_forge_regalia' && loadout.setCount >= 3
    ? { ...stats, hpMax: Math.max(1, Math.floor(stats.hpMax * 1.06)) }
    : stats;
