import { monsterCombatStats } from './adventure.service.js';
import { attributes } from './types.js';

const ENEMY_STAT_BALANCE_VERSION = 4;
const enemyBalanceJson = (raw) => typeof raw === 'string' ? JSON.parse(raw) : raw;
const previousMonsterHpMax = (row) => {
    const legacy = { ...row };
    for (const key of attributes) {
        legacy[key] = Number(row[key]) + Number(row[`${key}_growth`]) * Math.max(0, Number(row.level) - 1);
        legacy[`${key}_growth`] = 0;
    }
    legacy.traits_json = (enemyBalanceJson(row.traits_json) ?? []).filter((trait) => trait.code !== 'main_quest_evolution' || trait.name);
    return monsterCombatStats(legacy).hpMax;
};
const migratedEnemyHp = (current, oldMax, newMax) => current <= 0 ? 0
    : Math.min(newMax, Math.max(1, Math.floor(Math.min(1, current / Math.max(1, oldMax)) * newMax)));

export { ENEMY_STAT_BALANCE_VERSION, enemyBalanceJson, migratedEnemyHp, previousMonsterHpMax };
