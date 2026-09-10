import { Format } from 'alemonjs';
import type { NegotiationResult } from '../game/negotiation.service';
export declare const negotiationFormat: (result: NegotiationResult) => Format;
export declare const negotiationHandler: (mode?: "open" | "page" | "search" | "item" | "action" | "gift") => () => Promise<void>;
