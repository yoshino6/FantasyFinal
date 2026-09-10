import type { HiddenProfessionCode } from './hidden-profession.config';
export type HiddenQuestDefinition = {
    profession: HiddenProfessionCode;
    stage: number;
    name: string;
    dialogue: string;
    objective: string;
    result: string;
    materials: {
        code: string;
        name: string;
        quantity: number;
    }[];
};
export declare const hiddenQuests: HiddenQuestDefinition[];
export declare const hiddenQuest: (profession: string, stage: number) => HiddenQuestDefinition | undefined;
