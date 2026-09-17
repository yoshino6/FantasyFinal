import { Format } from 'alemonjs';
import type { TravelPlan } from '../game/connected-travel.service';
export declare const travelConfirmationFormat: (result: {
    token: string;
    plan: TravelPlan;
}) => Format;
