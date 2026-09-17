import type { MappedTravelArea } from './mapped-travel-route';
export type TravelPoint = {
    x: number;
    y: number;
    z: number;
    regionId: number;
};
export type TravelLeg = {
    kind: 'walk' | 'portal' | 'guild';
    from: TravelPoint;
    to: TravelPoint;
    distance: number;
    fromCode?: string;
    toCode?: string;
    name?: string;
    seconds?: number;
};
export type TravelLink = TravelLeg & {
    kind: 'portal' | 'guild';
};
export declare const shortestMappedWalk: (areas: MappedTravelArea[], owned: ReadonlySet<number>, from: TravelPoint, to: TravelPoint) => number | null;
export declare const connectedTravelPath: (areas: MappedTravelArea[], maps: ReadonlySet<number>, start: TravelPoint, target: TravelPoint, links: TravelLink[]) => TravelLeg[] | null;
export declare const samePoint: (a: TravelPoint, b: TravelPoint) => boolean;
