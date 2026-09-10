import type { Pool } from 'mysql2/promise';
export declare const openingSchema: string[];
export declare const initializeOpening: (pool: Pool) => Promise<void>;
