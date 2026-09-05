export type AlchemyTag = '生机' | '灵能' | '韧护' | '迅捷' | '锋锐' | '凝胶' | '潮汐' | '炎性' | '霜寒' | '雷鸣' | '光辉' | '暗蚀';
export type AlchemyStatusCode = 'regeneration' | 'mana_regeneration' | 'barrier' | 'battle_cry' | 'precision' | 'critical_focus' | 'sprint' | 'alchemy_guard' | 'alchemy_evasion' | 'burn' | 'bind' | 'stun' | 'exposed' | 'imbalance' | 'alchemy_confusion';
export type AlchemyConsumableEffect = {
    healPct?: number;
    restoreMpPct?: number;
    cleanse?: boolean;
    battleCount?: number;
    experienceBonusPct?: number;
    partyDropBonusPct?: number;
    target?: 'self' | 'enemy';
    targetScope?: 'single' | 'all';
    status?: {
        code: AlchemyStatusCode;
        value: number;
        turns: number;
        chance?: number;
        applicableLevel?: number;
    };
    throwable?: {
        damageScale: number;
        element: string;
    };
    perBattleLimit?: number;
};
export type AlchemyOutputDefinition = {
    code: string;
    name: string;
    description: string;
    level: number;
    tier: '基础' | '下位' | '中位' | '上位' | '超位';
    tags: AlchemyTag[];
    category: '药剂' | '投掷物' | '符咒' | '秘药';
    effect: AlchemyConsumableEffect;
};
export declare const alchemyOutputDefinitions: readonly AlchemyOutputDefinition[];
export declare const alchemyOutputsAtOrBelow: (level: number) => AlchemyOutputDefinition[];
export declare const alchemyStatusDefinitions: readonly [{
    readonly code: "alchemy_guard";
    readonly name: "坚守";
    readonly effectType: "stat_modifier";
    readonly value: 8;
    readonly duration: 2;
    readonly description: "双防提高，效果值为百分比。";
}, {
    readonly code: "alchemy_evasion";
    readonly name: "轻灵";
    readonly effectType: "stat_modifier";
    readonly value: 12;
    readonly duration: 2;
    readonly description: "闪避提高，效果值为百分比。";
}, {
    readonly code: "alchemy_confusion";
    readonly name: "混乱";
    readonly effectType: "stat_modifier";
    readonly value: 1;
    readonly duration: 1;
    readonly description: "行动目标随机化。";
}];
