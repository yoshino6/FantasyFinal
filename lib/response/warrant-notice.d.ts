import { Format } from 'alemonjs';
export type WarrantNotice = {
    warrantId: number;
    name: string;
    gameId: number;
    x: number;
    y: number;
    regionName: string;
};
export declare const warrantNoticeFormat: (wanted: WarrantNotice, options?: {
    independent?: boolean;
    passive?: boolean;
}) => Format;
