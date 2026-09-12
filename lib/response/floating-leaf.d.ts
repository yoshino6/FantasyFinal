import { Format } from 'alemonjs';
type Scene = {
    kind: 'tour' | 'thanks';
    stage: number;
    total: number;
    title: string;
    text: string;
    x: number;
    y: number;
};
export declare const floatingSceneFormat: (scene: Scene) => Format;
export declare const floatingTourHandler: () => Promise<void>;
export declare const floatingBarrierHandler: () => Promise<void>;
export declare const floatingManorHandler: () => Promise<void>;
export declare const floatingRescueStartHandler: () => Promise<void>;
export declare const floatingRescueReturnHandler: () => Promise<void>;
export declare const floatingRescueReportHandler: () => Promise<void>;
export declare const floatingThanksHandler: () => Promise<void>;
export {};
