import { type DynamicWorldNpc } from './world-dynamics.content';
type Relation = 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'confidant';
type DynamicNpcProfile = DynamicWorldNpc & {
    displayName: string;
    regionName: string;
    homeName: string;
    homeSiteCode: string;
    meeting: string;
};
export declare const dynamicNpcProfile: (code: string) => DynamicNpcProfile | null;
export declare const dynamicNpcVoiceAnchor: (code: string, affinity?: number, variant?: number) => {
    displayName: string;
    role: string;
    gesture: string;
    catchphrase: string;
    caution: string;
    warmth: string;
    trust: string;
    relation: Relation;
    personalNote: string;
} | null;
export declare const dynamicNpcChatDialogue: (code: string, affinity: number, now?: Date, variant?: number) => string | null;
export declare const auditDynamicNpcDialogues: () => {
    profileCount: number;
    missingVoices: string[];
    missingHabits: string[];
    missingNotes: string[];
    duplicateSamples: string[];
    duplicateNotes: string[];
    forbiddenSamples: string[];
    sampleCount: number;
};
export {};
