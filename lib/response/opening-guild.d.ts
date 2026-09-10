import { Format } from 'alemonjs';
export declare const openingGuildServiceFormat: (text: string) => Format;
export declare const openingGuildFormat: (user: string, area?: string) => Promise<Format>;
export declare const openingGuildHandler: (mode?: "view" | "enter" | "leave" | "service" | "keepsakes" | "transport") => () => Promise<void>;
