import type { RowDataPacket } from 'mysql2';
export declare const codexKinds: readonly ["装备", "道具", "材料", "怪物", "技能"];
export type CodexKind = (typeof codexKinds)[number];
type CodexCategory = {
    label: string;
    value: string;
};
export declare const codexCategories: (kind: CodexKind) => CodexCategory[];
export declare const codexList: (qqUserId: string, kind: CodexKind, category?: string, page?: number, keyword?: string) => Promise<{
    kind: "装备" | "道具" | "材料" | "怪物" | "技能";
    category: string;
    keyword: string;
    entries: {
        id: number;
        name: string;
        category: string;
        detailId: string;
    }[];
    page: number;
    totalPages: number;
}>;
export declare const skillCodexDetail: (qqUserId: string, skillId: number) => Promise<RowDataPacket & {
    id: number;
    code: string;
    codex_id: string;
    name: string;
    category: string;
    skill_kind: string;
    element: string;
    range_type: string;
    target_scope: string;
    power: number;
    mana_cost: number;
    cooldown_turns: number;
    chant_turns: number;
    description: string;
    effects: string | null;
}>;
export declare const monsterCodexDetail: (qqUserId: string, templateId: number) => Promise<{
    name: string;
    category: string;
    level: number;
    inRange: boolean;
    informationLevel: number;
    skills: string[];
    weaknesses: string[];
    resistances: string[];
}>;
export {};
