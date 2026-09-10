import { monsterCombatStats } from './adventure.service';
import { attributes } from './types';

export const ENEMY_STAT_BALANCE_VERSION = 4;
export const enemyBalanceJson = (raw: unknown): any => typeof raw === 'string' ? JSON.parse(raw) : raw;
/** 迁移专用旧生命上限：将旧线性成长展开为出生值，再走相同派生/虚拟装备/词条公式。 */
export const previousMonsterHpMax = (row: Parameters<typeof monsterCombatStats>[0]) => {
  const legacy = {...row};
  for (const key of attributes) {
    legacy[key] = Number(row[key]) + Number(row[`${key}_growth`]) * Math.max(0, Number(row.level) - 1);
    legacy[`${key}_growth`] = 0;
  }
  // 旧实现会过滤无展示名的进化试炼标记，出生血量与实战上限不一致。
  legacy.traits_json = (enemyBalanceJson(row.traits_json) ?? []).filter((trait: any) => trait.code !== 'main_quest_evolution' || trait.name);
  return monsterCombatStats(legacy).hpMax;
};
export const migratedEnemyHp = (current: number, oldMax: number, newMax: number) => current <= 0 ? 0
  : Math.min(newMax, Math.max(1, Math.floor(Math.min(1, current / Math.max(1, oldMax)) * newMax)));
