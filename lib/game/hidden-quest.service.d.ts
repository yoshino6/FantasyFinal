import { type HiddenTrial } from './hidden-trial';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { type HiddenLessonState } from './hidden-quest.lesson';
type Observation = {
    code: string;
    name: string;
    fact: string;
    observedAt: string;
    sourceId: number;
};
type Evidence = {
    trial?: HiddenTrial;
    shown?: string[];
    lesson?: HiddenLessonState;
    observations?: Observation[];
};
export declare const hiddenQuestCharacter: (connection: PoolConnection, user: string) => Promise<RowDataPacket>;
export declare const hiddenQuestView: (user: string, code: string) => Promise<{
    profession: {
        readonly code: "magical_scholar";
        readonly name: "魔学者";
        readonly npc: "alchemy_sweetshop";
        readonly mentor: "晴儿";
        readonly secondary: "alchemist";
        readonly resource: "实验值";
        readonly cap: 35;
        readonly topic: "后屋的响声";
        readonly passive: "奇釜实验";
        readonly inheritance: "善后笔记";
        readonly role: "十二粒子调配、风险与大成功";
    } | {
        readonly code: "weapon_master";
        readonly name: "御器师";
        readonly npc: "blacksmith";
        readonly mentor: "小北";
        readonly secondary: "blacksmith";
        readonly resource: "器鸣";
        readonly cap: 30;
        readonly topic: "不肯安静的剑";
        readonly passive: "百器共鸣";
        readonly inheritance: "归鞘余响";
        readonly role: "器阵组合、攻守与多器合击";
    } | {
        readonly code: "inventor";
        readonly name: "发明家";
        readonly npc: "oddworkshop";
        readonly mentor: "唯薇安";
        readonly secondary: "deconstructor";
        readonly resource: "灵感";
        readonly cap: 30;
        readonly topic: "没完成的机组";
        readonly passive: "异械主脑";
        readonly inheritance: "验收合格";
        readonly role: "异械驱动、供能与能力协同";
    } | {
        readonly code: "tactician";
        readonly name: "执奕者";
        readonly npc: "bookshop";
        readonly mentor: "洛文·赫斯特";
        readonly secondary: "omniscient";
        readonly resource: "筹策";
        readonly cap: 30;
        readonly topic: "棋盘上的空位";
        readonly passive: "全局视野";
        readonly inheritance: "留下一手";
        readonly role: "公开信息、保护预案与行动次序";
    };
    stage: number;
    revision: number;
    accepted: boolean;
    paid: boolean;
    qualified: boolean;
    quest: import("./hidden-quest.config").HiddenQuestDefinition | undefined;
    story: import("./hidden-quest.story").HiddenQuestStory;
    evidence: Evidence;
    steps: readonly import("./hidden-quest.lesson").LessonStep[];
    observations: Observation[];
}>;
export declare const hiddenQuestTopic: (user: string, npc: string) => Promise<{
    code: "magical_scholar" | "weapon_master" | "inventor" | "tactician";
    label: string;
} | null>;
export declare const hiddenTrackedQuests: (user: string) => Promise<{
    title: string;
    description: string;
    action?: {
        label: string;
        command: string;
    };
}[]>;
export declare const becomeHiddenProfession: (user: string, code: string) => Promise<{
    profession: {
        readonly code: "magical_scholar";
        readonly name: "魔学者";
        readonly npc: "alchemy_sweetshop";
        readonly mentor: "晴儿";
        readonly secondary: "alchemist";
        readonly resource: "实验值";
        readonly cap: 35;
        readonly topic: "后屋的响声";
        readonly passive: "奇釜实验";
        readonly inheritance: "善后笔记";
        readonly role: "十二粒子调配、风险与大成功";
    } | {
        readonly code: "weapon_master";
        readonly name: "御器师";
        readonly npc: "blacksmith";
        readonly mentor: "小北";
        readonly secondary: "blacksmith";
        readonly resource: "器鸣";
        readonly cap: 30;
        readonly topic: "不肯安静的剑";
        readonly passive: "百器共鸣";
        readonly inheritance: "归鞘余响";
        readonly role: "器阵组合、攻守与多器合击";
    } | {
        readonly code: "inventor";
        readonly name: "发明家";
        readonly npc: "oddworkshop";
        readonly mentor: "唯薇安";
        readonly secondary: "deconstructor";
        readonly resource: "灵感";
        readonly cap: 30;
        readonly topic: "没完成的机组";
        readonly passive: "异械主脑";
        readonly inheritance: "验收合格";
        readonly role: "异械驱动、供能与能力协同";
    } | {
        readonly code: "tactician";
        readonly name: "执奕者";
        readonly npc: "bookshop";
        readonly mentor: "洛文·赫斯特";
        readonly secondary: "omniscient";
        readonly resource: "筹策";
        readonly cap: 30;
        readonly topic: "棋盘上的空位";
        readonly passive: "全局视野";
        readonly inheritance: "留下一手";
        readonly role: "公开信息、保护预案与行动次序";
    };
    reset: {
        restoredPoints: number;
        availablePoints: number;
        removedSkills: number;
        mode: "level" | "ledger";
    };
}>;
export declare const hiddenQuestAction: (user: string, code: string, revision: number, action: string, choice?: number) => Promise<{
    receipt: string;
    profession: {
        readonly code: "magical_scholar";
        readonly name: "魔学者";
        readonly npc: "alchemy_sweetshop";
        readonly mentor: "晴儿";
        readonly secondary: "alchemist";
        readonly resource: "实验值";
        readonly cap: 35;
        readonly topic: "后屋的响声";
        readonly passive: "奇釜实验";
        readonly inheritance: "善后笔记";
        readonly role: "十二粒子调配、风险与大成功";
    } | {
        readonly code: "weapon_master";
        readonly name: "御器师";
        readonly npc: "blacksmith";
        readonly mentor: "小北";
        readonly secondary: "blacksmith";
        readonly resource: "器鸣";
        readonly cap: 30;
        readonly topic: "不肯安静的剑";
        readonly passive: "百器共鸣";
        readonly inheritance: "归鞘余响";
        readonly role: "器阵组合、攻守与多器合击";
    } | {
        readonly code: "inventor";
        readonly name: "发明家";
        readonly npc: "oddworkshop";
        readonly mentor: "唯薇安";
        readonly secondary: "deconstructor";
        readonly resource: "灵感";
        readonly cap: 30;
        readonly topic: "没完成的机组";
        readonly passive: "异械主脑";
        readonly inheritance: "验收合格";
        readonly role: "异械驱动、供能与能力协同";
    } | {
        readonly code: "tactician";
        readonly name: "执奕者";
        readonly npc: "bookshop";
        readonly mentor: "洛文·赫斯特";
        readonly secondary: "omniscient";
        readonly resource: "筹策";
        readonly cap: 30;
        readonly topic: "棋盘上的空位";
        readonly passive: "全局视野";
        readonly inheritance: "留下一手";
        readonly role: "公开信息、保护预案与行动次序";
    };
    stage: number;
    revision: number;
    accepted: boolean;
    paid: boolean;
    qualified: boolean;
    quest: import("./hidden-quest.config").HiddenQuestDefinition | undefined;
    story: import("./hidden-quest.story").HiddenQuestStory;
    evidence: Evidence;
    steps: readonly import("./hidden-quest.lesson").LessonStep[];
    observations: Observation[];
}>;
export declare const recordHiddenQuestObservation: (connection: PoolConnection, characterId: number, record: Omit<Observation, "observedAt">) => Promise<void>;
export {};
