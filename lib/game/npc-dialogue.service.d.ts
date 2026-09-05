export type NpcDialogueCode = 'pear_guide' | 'guild_counter' | 'saint_church' | 'blacksmith' | 'alchemy_sweetshop' | 'oddworkshop' | 'hunter_lodge' | 'bookshop';
export declare const npcChatDialogue: (code: NpcDialogueCode, affinity: number) => string;
