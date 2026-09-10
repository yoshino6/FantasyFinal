type Context = {
    Platform?: string;
    BotId?: string;
    UserId?: string;
    ChannelId?: string;
    GuildId?: string;
    IsPrivate?: boolean;
};
export declare const portraitScope: (event: Context) => string;
export declare const beginPortraitUpload: (user: string, scope: string, id: number) => Promise<{
    token: string;
    name: string;
    id: number;
}>;
export declare const reservePortraitUpload: (user: string, scope: string) => Promise<{
    expired: true;
    busy?: undefined;
    characterId?: undefined;
    scope?: undefined;
    token?: undefined;
    id?: undefined;
} | {
    busy: true;
    expired?: undefined;
    characterId?: undefined;
    scope?: undefined;
    token?: undefined;
    id?: undefined;
} | {
    characterId: number;
    scope: string;
    token: string;
    id: number;
    expired?: undefined;
    busy?: undefined;
} | null>;
export type PortraitUpload = Extract<NonNullable<Awaited<ReturnType<typeof reservePortraitUpload>>>, {
    token: string;
}>;
export declare const retryPortraitUpload: (upload: PortraitUpload) => Promise<void>;
export declare const submitPortraitReview: (user: string, upload: PortraitUpload, portrait: {
    key: string;
    width: number;
    height: number;
}) => Promise<{
    name: string;
}>;
export declare const portraitReviewStatus: (user: string, id: number) => Promise<{
    status: string;
    reason: string;
} | null>;
export declare const cancelPortraitUpload: (user: string, scope: string, id: number, token: string) => Promise<void>;
export declare const resetPortrait: (user: string, id: number) => Promise<{
    name: string;
    oldKey: string | undefined;
    pendingKeys: string[];
}>;
export {};
