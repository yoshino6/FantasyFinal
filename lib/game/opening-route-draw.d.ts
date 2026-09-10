import type { OpeningConnection } from './opening-state';
export declare const openingRouteDrawSchema = "CREATE TABLE IF NOT EXISTS opening_route_draw_state (\n  id TINYINT NOT NULL PRIMARY KEY,cycle_no BIGINT UNSIGNED NOT NULL DEFAULT 1,\n  used_routes_json JSON NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)\n) ENGINE=InnoDB";
export declare const chooseWeighted: <T>(entries: readonly {
    value: T;
    weight: number;
}[], random?: () => number) => T;
export type OpeningRouteCandidate = {
    code: string;
    regionCode: string;
    tier: number;
};
export declare const openingRouteWeights: (candidates: readonly OpeningRouteCandidate[]) => {
    value: string;
    weight: number;
}[];
export declare const drawOpeningRoute: (connection: OpeningConnection, candidates: readonly OpeningRouteCandidate[], random?: () => number) => Promise<string>;
