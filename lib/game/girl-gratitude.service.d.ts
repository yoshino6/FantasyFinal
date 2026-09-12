export declare const girlGratitudeMainQuest: (qqUserId: string) => Promise<{
    title: string;
    description: string;
    action?: undefined;
} | {
    title: string;
    description: string;
    action: {
        label: string;
        command: string;
    };
} | null>;
export declare const girlGratitudePending: (qqUserId: string) => Promise<boolean>;
export declare const girlGratitudeStage: (qqUserId: string) => Promise<number>;
export declare const startGirlGratitude: (qqUserId: string) => Promise<string>;
export declare const teleportToWorldTree: (qqUserId: string) => Promise<string>;
export declare const returnToBainaTown: (qqUserId: string) => Promise<string>;
export declare const continueGirlGratitude: (qqUserId: string) => Promise<{
    chapter: number;
    exchange: boolean;
    text: string;
}>;
export declare const receiveGirlGratitudeGift: (qqUserId: string) => Promise<string>;
