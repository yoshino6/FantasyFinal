import { Format } from 'alemonjs';
export declare const giftSelectionFormat: (character: {
    giftName: string | null;
    regionName: string;
}) => Format;
export declare const completedRegistrationFormat: (user: string) => Promise<Format>;
