import type { HiddenProfessionCode } from './hidden-profession.config';
export type HiddenQuestStory = {
    scene: string;
    speech: string;
    completed: string;
};
export declare const hiddenMentorVoices: {
    readonly magical_scholar: {
        readonly mentor: "晴儿";
        readonly source: "src/game/npc-dialogue.service.ts:97";
        readonly voice: "轻柔体贴，先照看人再做实验；偶有不吓人的玩笑。认真辨认风险，不以训斥证明专业。";
        readonly arc: "请玩家帮忙校准，逐渐放手让玩家判断，最后因其愿意善后而交付信任。";
        readonly avoid: "冷冰冰的实验官、赌徒式失控崇拜、无依据的神秘身世揭露。";
    };
    readonly weapon_master: {
        readonly mentor: "漠北（小北）";
        readonly source: "src/game/npc-dialogue.service.ts:83";
        readonly voice: "话短、直接，以落锤、接缝和成品说话；年少但手艺稳，重视别人凭作品认可他。";
        readonly arc: "从一起听器，到让玩家独立修补，再到承认玩家做成的攻守演练。";
        readonly avoid: "老宗师腔、强硬家长腔、反复自曝混血遭遇、用年龄装可爱。";
    };
    readonly inventor: {
        readonly mentor: "唯薇安";
        readonly source: "src/game/npc-dialogue.service.ts:111";
        readonly voice: "语速轻快，爱给机器拟人，敢承认自己接错；笑闹时有经验，危险到来先断电或急停。";
        readonly arc: "邀请玩家抓故障，逐步交出启动与调配权，最后把可扩展的接入规范交给新同道。";
        readonly avoid: "只会爆炸的莽撞少女、每环重复“大概安全”、将成熟经验写成无所不知。";
    };
    readonly tactician: {
        readonly mentor: "洛文·赫斯特";
        readonly source: "src/game/npc-dialogue.service.ts:125";
        readonly voice: "慈和、耐心、谦逊；借书页与棋局讲清问题，承认未知，尊重同伴自己的选择。";
        readonly arc: "请玩家辨别旧证据，认可亲历与诚实报告，最后鼓励其走入书中没有的新局。";
        readonly avoid: "阴谋家、操纵所有人的棋手、突然公开王都旧身份、句句抽象说教。";
    };
};
export declare const hiddenQuestStory: (profession: HiddenProfessionCode, stage: number) => HiddenQuestStory;
export declare const hiddenQuestRetry: (profession: HiddenProfessionCode) => string;
