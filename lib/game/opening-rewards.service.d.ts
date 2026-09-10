import type { PoolConnection } from 'mysql2/promise';
import type { OpeningChoice, OpeningRoute } from './opening.types';
export declare const grantOpeningRouteReward: (c: PoolConnection, id: number, route: OpeningRoute, choice: OpeningChoice) => Promise<string>;
