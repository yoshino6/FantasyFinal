export type AchievementDeliveryResult = {
    code?: number;
    message?: unknown;
    data?: unknown;
};
export declare const achievementDeliveryOutcome: (results: readonly AchievementDeliveryResult[]) => {
    status: string;
    resultCodes: number[];
    platformCodes: number[];
    messageIds: string[];
};
