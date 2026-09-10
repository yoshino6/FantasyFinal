import type { PoolConnection } from 'mysql2/promise';
import type { LamplightView } from './lamplight.types';
export declare const lampJson: (value: unknown) => Record<string, any>;
export declare const assertLamplightIdle: (c: PoolConnection, id: number) => Promise<void>;
export declare const assertLamplightBoarding: (c: PoolConnection, regionId: number) => Promise<void>;
export declare const lamplightInvestigationStep: (seen: number, atTarget: boolean) => LamplightView["buttons"][number] | null;
export declare const lamplightView: (user: string) => Promise<LamplightView>;
export declare const lamplightAction: (user: string, revision: number, action: string) => Promise<LamplightView>;
export declare const lamplightMainQuest: (user: string) => Promise<{
    title: string;
    description: string;
    action: {
        label: string;
        command: string;
    };
} | null>;
export declare const lamplightHistory: (user: string, page?: number) => Promise<{
    title: string;
    npc: string;
    revision: number;
    text: string;
    buttons: {
        label: string;
        action?: string;
        command?: string;
    }[];
}>;
export declare const lamplightGrowthView: (user: string) => Promise<{
    title: string;
    npc: string;
    text: string;
    revision: number;
    buttons: {
        label: string;
        action?: string;
        command?: string;
    }[];
}>;
export declare const lamplightPersonView: (user: string) => Promise<{
    title: string;
    npc: string;
    text: string;
    revision: number;
    buttons: {
        label: string;
        command: string;
    }[];
}>;
