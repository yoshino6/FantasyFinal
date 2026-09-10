import { type AdvancedProfession } from './advanced-profession.config';
type MentorDialogue = {
    introduction: string;
    chats: {
        morning: string;
        afternoon: string;
        evening: string;
    };
    success: string;
};
export declare const mentorDialogues: Record<string, MentorDialogue>;
export declare const mentorChatDialogue: (mentorCode: string, affinity: number) => string;
export declare const mentorSuccessDialogue: (professionCode: string) => string | undefined;
export declare const advancedProfessionReveal: (profession: AdvancedProfession) => string;
export {};
