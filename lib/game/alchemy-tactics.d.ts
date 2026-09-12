export declare const alchemyTactics: readonly [{
    readonly code: "emergency";
    readonly name: "凝血救急剂";
    readonly tags: readonly ["生机", "凝胶"];
    readonly enemy: false;
    readonly description: "回复最大生命的30%；使用前生命低于30%时额外回复15%。";
}, {
    readonly code: "overflow";
    readonly name: "满溢琥珀露";
    readonly tags: readonly ["生机", "韧护"];
    readonly enemy: false;
    readonly description: "回复30%最大生命；溢出治疗的70%转为护盾，上限15%最大生命，持续2回合。";
}, {
    readonly code: "clean_shield";
    readonly name: "涤垢护心液";
    readonly tags: readonly ["潮汐", "光辉"];
    readonly enemy: false;
    readonly description: "净化最多3个普通减益，每个转为5%最大生命护盾，持续2回合。";
}, {
    readonly code: "last_life";
    readonly name: "灰烬续生剂";
    readonly tags: readonly ["生机", "炎性"];
    readonly enemy: false;
    readonly description: "3回合内承受致命伤时保留1生命并回复15%最大生命；每人每场只能触发一次。";
}, {
    readonly code: "mana_spring";
    readonly name: "静息魔泉";
    readonly tags: readonly ["灵能", "潮汐"];
    readonly enemy: false;
    readonly description: "立即恢复25%最大魔力，之后两回合结束各恢复10%。";
}, {
    readonly code: "blood_mana";
    readonly name: "血蓝交换液";
    readonly tags: readonly ["生机", "灵能"];
    readonly enemy: false;
    readonly description: "支付12%最大生命，恢复40%最大魔力；支付后必须存活。";
}, {
    readonly code: "berserk";
    readonly name: "脆壳狂战剂";
    readonly tags: readonly ["锋锐", "炎性"];
    readonly enemy: false;
    readonly description: "双攻提高40%，双防降低15%，持续3回合。";
}, {
    readonly code: "thorns";
    readonly name: "铁木反刺膏";
    readonly tags: readonly ["韧护", "锋锐"];
    readonly enemy: false;
    readonly description: "双防提高25%，持续2回合；每回合首次受到直击反刺35%标准投掷伤害。";
}, {
    readonly code: "shed";
    readonly name: "蝉蜕雾露";
    readonly tags: readonly ["暗蚀", "迅捷"];
    readonly enemy: false;
    readonly description: "PVE已有仇恨降低40%；闪避提高25%，持续2回合。PVP只提供闪避。";
}, {
    readonly code: "lure";
    readonly name: "引敌标记瓶";
    readonly tags: readonly ["光辉", "凝胶"];
    readonly enemy: true;
    readonly description: "造成70%标准投掷伤害，PVE增加自身仇恨；PVP使目标命中降低20%，持续1回合。";
}, {
    readonly code: "wind_charge";
    readonly name: "借风蓄势剂";
    readonly tags: readonly ["迅捷", "锋锐"];
    readonly enemy: false;
    readonly description: "3回合内下一次主动伤害技能的直伤总量提高45%；多段与群体各按该段原伤害计算，同一行动只消费一次。";
}, {
    readonly code: "quick_chant";
    readonly name: "凝时速咏露";
    readonly tags: readonly ["灵能", "霜寒"];
    readonly enemy: false;
    readonly description: "3回合内下一次有吟唱的技能缩短1回合吟唱，不重置冷却、不增加行动。";
}, {
    readonly code: "thunder_seed";
    readonly name: "蓄雷引爆瓶";
    readonly tags: readonly ["雷鸣", "凝胶"];
    readonly enemy: true;
    readonly description: "造成65%标准投掷伤害；投掷本身计第一次；后续2回合内第三次直击触发90%标准伤害，每回合只计一次。";
}, {
    readonly code: "oil";
    readonly name: "油膜燃烧瓶";
    readonly tags: readonly ["炎性", "凝胶"];
    readonly enemy: true;
    readonly description: "造成50%标准投掷伤害，附油膜3回合；下一次火直击引爆80%标准伤害并灼烧。";
}, {
    readonly code: "frost_crack";
    readonly name: "霜裂蚀甲瓶";
    readonly tags: readonly ["霜寒", "锋锐"];
    readonly enemy: true;
    readonly description: "造成60%标准投掷伤害并降低双防25%，持续2回合；已束缚目标追加35%标准伤害。";
}, {
    readonly code: "chain";
    readonly name: "雷水导流瓶";
    readonly tags: readonly ["雷鸣", "潮汐"];
    readonly enemy: true;
    readonly description: "主目标承受80%标准投掷伤害，最多两个其他目标各承受35%，不重复传导。";
}, {
    readonly code: "antiheal";
    readonly name: "封疗苦胆液";
    readonly tags: readonly ["凝胶", "暗蚀"];
    readonly enemy: true;
    readonly description: "造成60%标准投掷伤害，受到治疗降低40%，持续2回合。";
}, {
    readonly code: "echo_damage";
    readonly name: "回声蓄伤瓶";
    readonly tags: readonly ["灵能", "雷鸣"];
    readonly enemy: true;
    readonly description: "记录2回合内实际受到的直伤，期满追加20%，上限120%标准投掷伤害，不递归记录。";
}, {
    readonly code: "steal_light";
    readonly name: "夺辉剥离剂";
    readonly tags: readonly ["光辉", "暗蚀"];
    readonly enemy: true;
    readonly description: "驱散最多2个普通增益，每个转为自身6%最大生命护盾，持续2回合。";
}, {
    readonly code: "reflect";
    readonly name: "镜面折光露";
    readonly tags: readonly ["光辉", "灵能"];
    readonly enemy: false;
    readonly description: "2回合内首次魔法直击减免35%，反射减免量的一半，上限80%标准投掷伤害。";
}, {
    readonly code: "resistance";
    readonly name: "逆相抗性剂";
    readonly tags: readonly ["霜寒", "韧护"];
    readonly enemy: false;
    readonly description: "火抗性增加25点，冰抗性降低10点，持续3回合。";
}, {
    readonly code: "rescue";
    readonly name: "共鸣救援雾";
    readonly tags: readonly ["生机", "潮汐", "迅捷"];
    readonly enemy: false;
    readonly description: "生命比例最低的最多3名存活队员各恢复18%最大生命。";
}, {
    readonly code: "chaos";
    readonly name: "混沌骰瓶";
    readonly tags: readonly ["暗蚀", "雷鸣", "灵能"];
    readonly enemy: true;
    readonly description: "等概率触发：140%标准直伤；80%标准直伤及1回合减速；自身回复25%生命及50%标准直伤。";
}, {
    readonly code: "defer";
    readonly name: "延迟偿伤剂";
    readonly tags: readonly ["韧护", "霜寒", "灵能"];
    readonly enemy: false;
    readonly description: "2回合内将直伤的30%延后偿还，延迟池上限20%最大生命；到期偿伤，不可净化欠伤。";
}];
export type AlchemyTactic = typeof alchemyTactics[number]['code'];
export declare const alchemyTacticByCode: Map<"quick_chant" | "defer" | "resistance" | "rescue" | "emergency" | "overflow" | "clean_shield" | "last_life" | "mana_spring" | "blood_mana" | "berserk" | "thorns" | "shed" | "lure" | "wind_charge" | "thunder_seed" | "oil" | "frost_crack" | "chain" | "antiheal" | "echo_damage" | "steal_light" | "reflect" | "chaos", {
    readonly code: "emergency";
    readonly name: "凝血救急剂";
    readonly tags: readonly ["生机", "凝胶"];
    readonly enemy: false;
    readonly description: "回复最大生命的30%；使用前生命低于30%时额外回复15%。";
} | {
    readonly code: "overflow";
    readonly name: "满溢琥珀露";
    readonly tags: readonly ["生机", "韧护"];
    readonly enemy: false;
    readonly description: "回复30%最大生命；溢出治疗的70%转为护盾，上限15%最大生命，持续2回合。";
} | {
    readonly code: "clean_shield";
    readonly name: "涤垢护心液";
    readonly tags: readonly ["潮汐", "光辉"];
    readonly enemy: false;
    readonly description: "净化最多3个普通减益，每个转为5%最大生命护盾，持续2回合。";
} | {
    readonly code: "last_life";
    readonly name: "灰烬续生剂";
    readonly tags: readonly ["生机", "炎性"];
    readonly enemy: false;
    readonly description: "3回合内承受致命伤时保留1生命并回复15%最大生命；每人每场只能触发一次。";
} | {
    readonly code: "mana_spring";
    readonly name: "静息魔泉";
    readonly tags: readonly ["灵能", "潮汐"];
    readonly enemy: false;
    readonly description: "立即恢复25%最大魔力，之后两回合结束各恢复10%。";
} | {
    readonly code: "blood_mana";
    readonly name: "血蓝交换液";
    readonly tags: readonly ["生机", "灵能"];
    readonly enemy: false;
    readonly description: "支付12%最大生命，恢复40%最大魔力；支付后必须存活。";
} | {
    readonly code: "berserk";
    readonly name: "脆壳狂战剂";
    readonly tags: readonly ["锋锐", "炎性"];
    readonly enemy: false;
    readonly description: "双攻提高40%，双防降低15%，持续3回合。";
} | {
    readonly code: "thorns";
    readonly name: "铁木反刺膏";
    readonly tags: readonly ["韧护", "锋锐"];
    readonly enemy: false;
    readonly description: "双防提高25%，持续2回合；每回合首次受到直击反刺35%标准投掷伤害。";
} | {
    readonly code: "shed";
    readonly name: "蝉蜕雾露";
    readonly tags: readonly ["暗蚀", "迅捷"];
    readonly enemy: false;
    readonly description: "PVE已有仇恨降低40%；闪避提高25%，持续2回合。PVP只提供闪避。";
} | {
    readonly code: "lure";
    readonly name: "引敌标记瓶";
    readonly tags: readonly ["光辉", "凝胶"];
    readonly enemy: true;
    readonly description: "造成70%标准投掷伤害，PVE增加自身仇恨；PVP使目标命中降低20%，持续1回合。";
} | {
    readonly code: "wind_charge";
    readonly name: "借风蓄势剂";
    readonly tags: readonly ["迅捷", "锋锐"];
    readonly enemy: false;
    readonly description: "3回合内下一次主动伤害技能的直伤总量提高45%；多段与群体各按该段原伤害计算，同一行动只消费一次。";
} | {
    readonly code: "quick_chant";
    readonly name: "凝时速咏露";
    readonly tags: readonly ["灵能", "霜寒"];
    readonly enemy: false;
    readonly description: "3回合内下一次有吟唱的技能缩短1回合吟唱，不重置冷却、不增加行动。";
} | {
    readonly code: "thunder_seed";
    readonly name: "蓄雷引爆瓶";
    readonly tags: readonly ["雷鸣", "凝胶"];
    readonly enemy: true;
    readonly description: "造成65%标准投掷伤害；投掷本身计第一次；后续2回合内第三次直击触发90%标准伤害，每回合只计一次。";
} | {
    readonly code: "oil";
    readonly name: "油膜燃烧瓶";
    readonly tags: readonly ["炎性", "凝胶"];
    readonly enemy: true;
    readonly description: "造成50%标准投掷伤害，附油膜3回合；下一次火直击引爆80%标准伤害并灼烧。";
} | {
    readonly code: "frost_crack";
    readonly name: "霜裂蚀甲瓶";
    readonly tags: readonly ["霜寒", "锋锐"];
    readonly enemy: true;
    readonly description: "造成60%标准投掷伤害并降低双防25%，持续2回合；已束缚目标追加35%标准伤害。";
} | {
    readonly code: "chain";
    readonly name: "雷水导流瓶";
    readonly tags: readonly ["雷鸣", "潮汐"];
    readonly enemy: true;
    readonly description: "主目标承受80%标准投掷伤害，最多两个其他目标各承受35%，不重复传导。";
} | {
    readonly code: "antiheal";
    readonly name: "封疗苦胆液";
    readonly tags: readonly ["凝胶", "暗蚀"];
    readonly enemy: true;
    readonly description: "造成60%标准投掷伤害，受到治疗降低40%，持续2回合。";
} | {
    readonly code: "echo_damage";
    readonly name: "回声蓄伤瓶";
    readonly tags: readonly ["灵能", "雷鸣"];
    readonly enemy: true;
    readonly description: "记录2回合内实际受到的直伤，期满追加20%，上限120%标准投掷伤害，不递归记录。";
} | {
    readonly code: "steal_light";
    readonly name: "夺辉剥离剂";
    readonly tags: readonly ["光辉", "暗蚀"];
    readonly enemy: true;
    readonly description: "驱散最多2个普通增益，每个转为自身6%最大生命护盾，持续2回合。";
} | {
    readonly code: "reflect";
    readonly name: "镜面折光露";
    readonly tags: readonly ["光辉", "灵能"];
    readonly enemy: false;
    readonly description: "2回合内首次魔法直击减免35%，反射减免量的一半，上限80%标准投掷伤害。";
} | {
    readonly code: "resistance";
    readonly name: "逆相抗性剂";
    readonly tags: readonly ["霜寒", "韧护"];
    readonly enemy: false;
    readonly description: "火抗性增加25点，冰抗性降低10点，持续3回合。";
} | {
    readonly code: "rescue";
    readonly name: "共鸣救援雾";
    readonly tags: readonly ["生机", "潮汐", "迅捷"];
    readonly enemy: false;
    readonly description: "生命比例最低的最多3名存活队员各恢复18%最大生命。";
} | {
    readonly code: "chaos";
    readonly name: "混沌骰瓶";
    readonly tags: readonly ["暗蚀", "雷鸣", "灵能"];
    readonly enemy: true;
    readonly description: "等概率触发：140%标准直伤；80%标准直伤及1回合减速；自身回复25%生命及50%标准直伤。";
} | {
    readonly code: "defer";
    readonly name: "延迟偿伤剂";
    readonly tags: readonly ["韧护", "霜寒", "灵能"];
    readonly enemy: false;
    readonly description: "2回合内将直伤的30%延后偿还，延迟池上限20%最大生命；到期偿伤，不可净化欠伤。";
}>;
