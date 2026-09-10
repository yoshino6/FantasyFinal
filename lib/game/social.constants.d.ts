export type AffinityStage = {
    min: number;
    max: number | null;
    title: string;
    description: string;
};
export declare const AFFINITY_STAGES: AffinityStage[];
export declare const AFFINITY_REQUEST_TTL_MINUTES: number;
export declare const OATH_REQUEST_TTL_MINUTES = 10;
export declare const FRIEND_INTERACTION_DAILY_LIMIT = 3;
export declare const FRIEND_GIFT_DAILY_LIMIT = 3;
export declare const BOUQUET_DAILY_LIMIT = 3;
export declare const FRUIT_DAILY_LIMIT = 1;
export declare const OATH_MEMORY_DAILY_LIMIT = 1;
export declare const OATH_MIN_AFFINITY = 500;
export declare const relationshipStage: (affinity: number) => {
    value: number;
    nextMin: number;
    toNext: number;
    min: number;
    max: number | null;
    title: string;
    description: string;
};
export declare const relationshipDisplayStage: (status: "friend" | "oath" | "ended", affinity: number) => {
    value: number;
    nextMin: number;
    toNext: number;
    min: number;
    max: number | null;
    title: string;
    description: string;
} | {
    value: number;
    nextMin: null;
    toNext: number;
    min: number;
    max: number | null;
    title: string;
    description: string;
};
export declare const pairOf: (left: number, right: number) => {
    low: number;
    high: number;
};
