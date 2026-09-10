import type { Pool } from 'mysql2/promise';
export declare const negotiationSchema: string[];
export declare const initializeNegotiation: (pool: Pool) => Promise<void>;
export declare const closeLegacyCombatNegotiations: (pool: Pick<Pool, "execute">) => Promise<void>;
