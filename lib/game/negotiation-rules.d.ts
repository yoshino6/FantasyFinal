export declare const negotiationVersion = 1;
export declare const moodScale = 1000000;
export declare const moodBands: readonly [{
    readonly code: "furious";
    readonly name: "暴怒";
    readonly min: -1000000;
}, {
    readonly code: "resentful";
    readonly name: "愤懑";
    readonly min: -500000;
}, {
    readonly code: "hostile";
    readonly name: "敌意";
    readonly min: -200000;
}, {
    readonly code: "wary";
    readonly name: "戒备";
    readonly min: 0;
}, {
    readonly code: "hesitant";
    readonly name: "迟疑";
    readonly min: 400000;
}, {
    readonly code: "receptive";
    readonly name: "缓和";
    readonly min: 600000;
}, {
    readonly code: "pleased";
    readonly name: "欣悦";
    readonly min: 800000;
}, {
    readonly code: "trusting";
    readonly name: "信任";
    readonly min: 1000000;
}];
export type MoodBand = typeof moodBands[number]['code'];
export type Preference = 'like' | 'neutral' | 'dislike';
export declare const clamp: (value: number, min: number, max: number) => number;
export declare const moodBand: (ppm: number) => {
    readonly code: "furious";
    readonly name: "暴怒";
    readonly min: -1000000;
} | {
    readonly code: "resentful";
    readonly name: "愤懑";
    readonly min: -500000;
} | {
    readonly code: "hostile";
    readonly name: "敌意";
    readonly min: -200000;
} | {
    readonly code: "wary";
    readonly name: "戒备";
    readonly min: 0;
} | {
    readonly code: "hesitant";
    readonly name: "迟疑";
    readonly min: 400000;
} | {
    readonly code: "receptive";
    readonly name: "缓和";
    readonly min: 600000;
} | {
    readonly code: "pleased";
    readonly name: "欣悦";
    readonly min: 800000;
} | {
    readonly code: "trusting";
    readonly name: "信任";
    readonly min: 1000000;
};
export declare const negotiationProbability: (ppm: number, charm?: number) => number;
export declare const moodDropMultiplier: (ppm: number) => number;
export declare const giftAggression: (ppm: number, preference: Preference) => number;
export declare const talkAggression: (ppm: number, failures: number) => number;
export declare const secureRandom: () => number;
export declare const normalWeights: readonly number[];
export declare const drawHiddenAttribute: (random?: () => number) => number;
export declare const luckWeight: (luck: number) => number;
export declare const teamLuckMultiplier: (values: number[]) => number;
export declare const weightedRecipient: <T>(members: T[], luck: (member: T) => number, random?: () => number) => T;
export declare const dropBatches: (baseProbability: number, multiplier: number, random?: () => number) => number;
export declare const scaledDropEntries: <T extends {
    chance?: number;
    group?: string;
}>(entries: T[], probability: (entry: T) => number, multiplier: number, random?: () => number) => T[];
export type NegotiationState = {
    mood: number;
    remainder: number;
    failures: number;
    neutralCount: number;
    dislikeCount: number;
    goodwill: number;
    protection: number;
    companionGiftUsed?: boolean;
    achievementGiftRefusedBy?: number[];
};
export declare const initialNegotiationState: (mood?: number) => NegotiationState;
export type NegotiationMove = {
    type: 'talk';
    charm: number;
} | {
    type: 'gift';
    preference: Preference;
    value: number;
    capacity: number;
};
export type NegotiationOutcome = {
    state: NegotiationState;
    result: 'ongoing' | 'success' | 'combat';
    protected: boolean;
    earned: boolean;
    refused: boolean;
};
export declare const resolveNegotiationMove: (before: NegotiationState, move: NegotiationMove, random?: () => number) => NegotiationOutcome;
export declare const synchronizeNegotiation: (shared: NegotiationState, memories: Array<Pick<NegotiationState, "mood" | "failures" | "neutralCount" | "dislikeCount">>) => {
    mood: number;
    goodwill: number;
    remainder: number;
    failures: number;
    neutralCount: number;
    dislikeCount: number;
    protection: number;
    companionGiftUsed?: boolean;
    achievementGiftRefusedBy?: number[];
};
