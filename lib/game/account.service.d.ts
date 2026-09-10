export declare const requestAccountDeletion: (qqUserId: string) => Promise<{
    characterName: string;
    code: string;
    expiresMinutes: number;
}>;
export declare const deletePlayerAccount: (qqUserId: string, confirmationCode: string) => Promise<{
    characterName: string;
    endedCombats: number;
    transferredParties: number;
    disbandedParties: number;
}>;
