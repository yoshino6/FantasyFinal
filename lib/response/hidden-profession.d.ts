import { Format } from 'alemonjs';
export declare const hiddenObservationHandler: () => Promise<void>;
export declare const appendHiddenQuestButton: (buttons: ReturnType<typeof Format.createButtonGroup>, user: string, npc: string) => Promise<void>;
export declare const hiddenProfessionFormat: (user: string, code: string, receipt?: string) => Promise<Format>;
export declare const hiddenProfessionHandler: (operation: "view" | "action" | "become" | "story") => () => Promise<void>;
