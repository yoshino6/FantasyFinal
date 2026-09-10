import { useMessage } from 'alemonjs';
export declare const withoutAutomatonInteractions: <T extends {
    send: (params: any) => any;
}>(message: T) => T;
export declare const separateAutomatonBattleQuotes: (source: unknown) => {
    source: unknown;
    quotes: string[];
};
export declare const useGameMessage: typeof useMessage;
