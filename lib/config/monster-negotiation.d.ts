import { type Preference } from '../game/negotiation-rules';
export type NegotiationFamily = keyof typeof creatureVoices;
type Voice = {
    likes: string[];
    dislikes: string[];
    particles: [string[], string[]];
    approach: [string, string];
    reactions: Record<Preference, [string, string]>;
    protection: [string, string];
};
export declare const creatureVoices: {
    readonly rat: Voice;
    readonly urchin: Voice;
    readonly arthropod: Voice;
    readonly worm: Voice;
    readonly elemental: Voice;
    readonly quadruped: Voice;
    readonly slime: Voice;
    readonly rabbit: Voice;
    readonly boar: Voice;
    readonly snake: Voice;
    readonly bear: Voice;
    readonly wolf: Voice;
    readonly goblin: Voice;
    readonly tree: Voice;
    readonly skeleton: Voice;
    readonly ghost: Voice;
    readonly human: Voice;
    readonly construct: Voice;
    readonly bird: Voice;
    readonly crab: Voice;
    readonly turtle: Voice;
    readonly insect: Voice;
    readonly fish: Voice;
    readonly lizard: Voice;
    readonly frog: Voice;
    readonly ungulate: Voice;
    readonly bat: Voice;
    readonly jelly: Voice;
    readonly giant: Voice;
    readonly dragon: Voice;
};
export declare const negotiationFamily: (code: string, name: string) => NegotiationFamily;
export declare const monsterNegotiationOverrides: Record<string, {
    initialMood?: number;
    likes?: string[];
    dislikes?: string[];
    items?: Record<string, Preference>;
    particles?: Record<string, Preference>;
}>;
export declare const monsterNegotiationProfile: (code: string, name: string) => {
    code: string;
    family: "goblin" | "skeleton" | "rat" | "urchin" | "arthropod" | "worm" | "elemental" | "quadruped" | "slime" | "rabbit" | "boar" | "snake" | "bear" | "wolf" | "tree" | "ghost" | "human" | "construct" | "bird" | "crab" | "turtle" | "insect" | "fish" | "lizard" | "frog" | "ungulate" | "bat" | "jelly" | "giant" | "dragon";
    initialMood: number;
    likes: string[];
    dislikes: string[];
    particles: {
        [x: string]: Preference;
    };
    items: {
        [x: string]: Preference;
    };
    voice: Voice;
};
export declare const monsterItemPreference: (profile: ReturnType<typeof monsterNegotiationProfile>, subtype: string, itemCode?: string) => Preference;
export {};
