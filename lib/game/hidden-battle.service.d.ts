import type { PoolConnection } from 'mysql2/promise';
import { type HiddenChoice, type HiddenDevice, type HiddenWeapon } from './hidden-combat-state';
import type { RuleUnit } from './combat-rule-registry';
export declare const initializeHiddenBattleUnits: (connection: Pick<PoolConnection, "execute">, units: Pick<RuleUnit, "key" | "cooldowns">[]) => Promise<void>;
export declare const hiddenOwnedWeapons: (connection: PoolConnection, characterId: number) => Promise<HiddenWeapon[]>;
export declare const hiddenBattleContext: (connection: PoolConnection, characterId: number, sessionId: string, kind: "pve" | "pvp" | "setup") => Promise<{
    weapons: HiddenWeapon[];
    devices: HiddenDevice[];
    activeCodes: string[];
    autoChoice: (code: string) => HiddenChoice | undefined;
    payParticles: (particles: string[]) => Promise<void>;
    saveDevices: () => Promise<void>;
}>;
export declare const hiddenLoadout: (user: string, type?: "weapons" | "devices", toggle?: number) => Promise<{
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
    config: Record<string, any>;
    weapons: HiddenWeapon[];
    devices: {
        id: number;
        code: string;
        name: string;
    }[];
}>;
export declare const hiddenDraft: (user: string, code: string, revision?: number, operation?: string, value?: string) => Promise<{
    code: string;
    mana: number;
    spec: {
        power: number;
        mana: number;
        cooldown: number;
        chant: number;
        powerFactor: number;
        effectFactor: number;
        supportFactor: number;
        damageFactor: number;
        timeChange: number;
        timeFactor: number;
        manaFactor: number;
        manaPenaltyFactor: number;
        efficientFactor: number;
        durationChange: number;
        controlChanceFactor: number;
    };
    catalyst: "stable" | "excite" | undefined;
    skillId: number;
    choice: HiddenChoice;
    revision: number;
    battleKey: string;
    turn: number;
    kind: string;
    ctx: {
        weapons: HiddenWeapon[];
        devices: HiddenDevice[];
    };
    stocks: any;
    remainingStocks: {
        [k: string]: number;
    };
}>;
export type HiddenTicket = {
    battleKey: string;
    turn: number;
    revision: number;
};
export declare const submitHiddenDraft: (connection: PoolConnection, characterId: number, sessionId: string, turn: number, kind: "pve" | "pvp", code: string, ticket?: HiddenTicket) => Promise<HiddenChoice>;
export declare const saveHiddenAuto: (user: string, code: string, revision: number) => Promise<string>;
