import { monsterCombatStats } from './adventure.service';
export declare const ENEMY_STAT_BALANCE_VERSION = 4;
export declare const enemyBalanceJson: (raw: unknown) => any;
export declare const previousMonsterHpMax: (row: Parameters<typeof monsterCombatStats>[0]) => number;
export declare const migratedEnemyHp: (current: number, oldMax: number, newMax: number) => number;
