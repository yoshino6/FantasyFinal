export declare const claimChurchBlessing: (qqUserId: string) => Promise<{
    bouquet: number;
    fruit: number;
    expiresInMinutes: number;
    isOath: boolean;
}>;
