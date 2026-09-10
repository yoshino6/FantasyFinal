import type { DerivedStats } from './types';
export declare const panelPercentKeys: Record<keyof DerivedStats, string>;
export declare const calculatePanelStats: (base: DerivedStats, flat: Partial<DerivedStats>, additivePercent: Record<string, number>, independentPercent?: readonly Record<string, number>[]) => DerivedStats;
