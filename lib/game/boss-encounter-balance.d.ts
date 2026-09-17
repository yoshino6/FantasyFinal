import type { BossSummonCombatStats } from './boss-summon-inheritance';
export declare const encounterSummonProfiles: Record<string, Partial<Record<keyof BossSummonCombatStats, number>>>;
export declare const applyEncounterSummonBalance: <T extends BossSummonCombatStats>(stats: T, code: string, story?: boolean) => T;
