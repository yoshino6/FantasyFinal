import { Format } from 'alemonjs';
type Scene = {
    kind: 'tour' | 'challenge';
    stage: number;
    total: number;
    title: string;
    text: string;
};
export declare const worldtreeWitnessFormat: (scene: Scene) => Format;
export declare const worldtreeWitnessHandler: () => Promise<void>;
export declare const eternalArenaHandler: () => Promise<void>;
export declare const enterEternalArenaHandler: () => Promise<void>;
export declare const leaveEternalArenaHandler: () => Promise<void>;
export declare const aesonDuelHandler: () => Promise<void>;
export {};
