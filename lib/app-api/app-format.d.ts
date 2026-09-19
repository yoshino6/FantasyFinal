import type { Format } from 'alemonjs';
export type AppButton = {
    label: string;
    command: string;
};
export type AppMessage = {
    text: string;
    buttons: AppButton[];
    petReply?: string;
};
export declare const formatValueToText: (formatValue: unknown) => string;
export declare const formatValueToButtons: (formatValue: unknown) => AppButton[];
export declare const formatToAppMessage: (format: Format, petReply?: string) => AppMessage;
export declare const plainAppMessage: (text: string, buttons?: AppButton[], petReply?: string) => AppMessage;
