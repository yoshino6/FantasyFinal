import type { PoolConnection } from 'mysql2/promise';
import { type TravelPoint, type TravelLeg } from './travel-path';
export type TravelPlan = {
    leaderId: number;
    start: TravelPoint;
    target: TravelPoint;
    members: {
        id: number;
        user: string;
    }[];
    legs: TravelLeg[];
    seconds: number;
    destinationKind: 'normal' | 'home';
};
export declare const parseTravelPlan: (value: unknown) => TravelPlan;
export declare const travelPlanSignature: (plan: TravelPlan) => string;
export declare const planConnectedTravel: (c: PoolConnection, id: number, start: TravelPoint, target: TravelPoint, partyId?: string | number) => Promise<TravelPlan>;
export declare const saveTravelConfirmation: (c: PoolConnection, id: number, plan: TravelPlan) => Promise<{
    kind: "travel_confirmation";
    token: `${string}-${string}-${string}-${string}-${string}`;
    plan: TravelPlan;
}>;
export declare const confirmTravelTarget: (user: string, token: string) => Promise<TravelPlan>;
export declare const executeTravelTransfers: (c: PoolConnection, plan: TravelPlan) => Promise<string[]>;
