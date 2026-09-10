import { Format } from 'alemonjs';
import type { LamplightView } from '../game/lamplight.types';
export declare const lamplightFormat: (view: LamplightView) => Format;
export declare const lamplightHandler: () => Promise<void>;
export declare const lamplightActionHandler: () => Promise<void>;
export declare const lamplightHistoryHandler: () => Promise<void>;
export declare const lamplightLegacyHandler: () => Promise<void>;
export declare const lamplightGrowthHandler: () => Promise<void>;
export declare const lamplightPersonHandler: () => Promise<void>;
