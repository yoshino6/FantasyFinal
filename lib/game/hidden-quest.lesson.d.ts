import type { HiddenProfessionCode } from './hidden-profession.config';
export type LessonStep = {
    prompt: string;
    choices: string[];
    correct: number;
    feedback: string;
};
export declare const hiddenLessonSteps: (profession: HiddenProfessionCode, stage: number) => readonly LessonStep[];
export type HiddenLessonState = {
    cursor: number;
    attempts: number;
    last: string;
    complete: boolean;
};
export declare const newHiddenLesson: () => HiddenLessonState;
export declare const advanceHiddenLesson: (profession: HiddenProfessionCode, stage: number, previous: HiddenLessonState, choice: number) => HiddenLessonState;
