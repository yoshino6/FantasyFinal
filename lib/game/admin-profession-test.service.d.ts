export declare const professionTestOptions: ({
    code: string;
    name: string;
    group: "战士" | "法师" | "盗贼" | "牧师";
    role: string;
} | {
    code: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
    name: "魔学者" | "御器师" | "发明家" | "执奕者";
    group: string;
    role: "十二粒子调配、风险与大成功" | "器阵组合、攻守与多器合击" | "异械驱动、供能与能力协同" | "公开信息、保护预案与行动次序";
})[];
export declare const adminTestProfession: (user: string, code: string) => Promise<{
    characterId: number;
    name: string;
    profession: string;
    code: string;
    previousCode: string;
    changed: boolean;
    restoredPoints: number;
    skillCount: number;
}>;
