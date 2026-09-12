import type { OpeningRoute } from './opening.types';
export declare const retainedOpeningRouteCodes: readonly ["F01", "F02", "F03", "S03", "M01", "M02", "A01", "C02"];
export declare const retainOpeningRoute: (route: OpeningRoute) => OpeningRoute | null;
