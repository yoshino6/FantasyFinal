import type { Allocation, DerivedStats } from './types';
export declare const SESSION_TTL_MINUTES = 30;
export declare const realmNames: readonly ["初心", "窥尘", "开化", "明道", "破晓", "通灵", "造化", "掌控", "主宰", "通玄"];
export declare const realmNameForStage: (stage: number) => "初心" | "窥尘" | "开化" | "明道" | "破晓" | "通灵" | "造化" | "掌控" | "主宰" | "通玄";
export declare const realmLevelCap: (stage: number) => number;
export declare const realmEnergyDissipationText = "\u7CBE\u7EAF\u7684\u80FD\u91CF\u51B2\u5165\u4F60\u7684\u4F53\u58F3\uFF0C\u7136\u540E\u5411\u5916\u56DB\u6EA2\uFF0C\u6D88\u6563\u5728\u4E86\u7A7A\u4E2D\u3002\u3002\u3002";
export declare const staminaMaxForRealm: (stage: number) => number;
export declare const STAMINA_RECOVERY_MS: number;
export declare const experienceRequiredForLevel: (level: number) => 0 | 1000 | 25 | 50 | 100 | 200 | 300 | 450 | 600 | 800 | 5200 | 5600 | 6000 | 6400 | 6800 | 7200 | 7600 | 8000 | 8400 | 8800 | 18000 | 20500 | 23100 | 25700 | 28300 | 30900 | 33500 | 36100 | 38700 | 41200 | 46693 | 52187 | 57876 | 64154 | 71021 | 78476 | 86716 | 95937 | 106139 | 117714 | 121638 | 127524 | 133410 | 141257 | 149105 | 156952 | 164800 | 172648 | 184419 | 202076;
export declare const attributeNames: Record<keyof Allocation, string>;
export declare const attributeAliases: Record<string, keyof Allocation>;
export declare const calculateDerivedStats: (value: Allocation) => DerivedStats;
export declare const forgeRarityMultiplier: Record<string, number>;
export declare const equipmentQualityMultiplier: (quality: number) => number;
export declare const forgedEquipmentBase: (level: number, category: "\u6B66\u5668" | "\u9632\u5177") => number;
export declare const forgedAffixCap: (category: "\u6B66\u5668" | "\u9632\u5177", key: string, level: number, rarity: string) => number;
export declare const forgedEquipmentCaps: (category: "\u6B66\u5668" | "\u9632\u5177", level: number, rarity: string, primaryKeys: readonly string[]) => Record<string, number>;
export type VirtualEquipmentTier = 'normal' | 'large' | 'elite' | 'boss';
export type VirtualEquipmentLoadout = {
    rarity: string;
    quality: number;
    secondaryAffixes: number;
};
export declare const virtualEquipmentStats: (level: number, tier: VirtualEquipmentTier, physicalAttack: number, magicAttack: number, customLoadout?: VirtualEquipmentLoadout) => DerivedStats;
export declare const gifts: {
    readonly holy_sword_shirulu: {
        readonly name: "圣剑·希尔露";
        readonly category: "artifact";
        readonly summary: "由星辉铸成的圣洁长剑。";
    };
    readonly demon_sword_aphia: {
        readonly name: "魔剑·阿菲娅";
        readonly category: "artifact";
        readonly summary: "寄宿深渊意志的漆黑魔剑。";
    };
    readonly saint_staff_istaria: {
        readonly name: "圣杖·伊斯塔利亚";
        readonly category: "artifact";
        readonly summary: "以晨星为芯的祝圣法杖，令光属性术式更为耀眼。";
    };
    readonly death_dagger_azra: {
        readonly name: "死刺·阿兹拉";
        readonly category: "artifact";
        readonly summary: "短刃所向之处，连濒死的命运也会被割开。";
    };
    readonly godfist_chronos: {
        readonly name: "天刃·克罗诺斯";
        readonly category: "artifact";
        readonly summary: "铭刻古神战纹的拳刃，令双攻恒取更高的一方。";
    };
    readonly oracle_grimoire_sophia: {
        readonly name: "神谕·索芙拉";
        readonly category: "artifact";
        readonly summary: "书页自行翻动，低声诵读尚未发生的咒文。";
    };
    readonly prayer_orb_lumia: {
        readonly name: "祈祷法球·露弥娅";
        readonly category: "artifact";
        readonly summary: "凝固的祈愿之光，会将施术者的意志推向远方。";
    };
    readonly immortal_shield_auges: {
        readonly name: "不灭圣盾·奥格斯";
        readonly category: "artifact";
        readonly summary: "历经无数冲击仍无裂痕的古老圣盾。";
    };
    readonly star_crown_selene: {
        readonly name: "星冠·塞勒涅";
        readonly category: "artifact";
        readonly summary: "繁星垂落于冠冕，守望佩戴者的每一次远行。";
    };
    readonly sky_robe_asteia: {
        readonly name: "天穹法衣·阿斯忒雅";
        readonly category: "artifact";
        readonly summary: "如天空般轻盈的法衣，织入了守护的法则。";
    };
    readonly wind_girdle_hermes: {
        readonly name: "风行腰封·赫尔墨斯";
        readonly category: "artifact";
        readonly summary: "流风被束进细密的纹路，步伐与咒文都变得轻快。";
    };
    readonly time_greaves_chronos: {
        readonly name: "时隙护腿·克罗诺斯";
        readonly category: "artifact";
        readonly summary: "行走时仿佛踩在时间的缝隙之间。";
    };
    readonly gale_boots_sif: {
        readonly name: "逐风战靴·西芙";
        readonly category: "artifact";
        readonly summary: "靴底从不沾尘，疾风会替佩戴者踏出下一步。";
    };
    readonly oath_necklace_norn: {
        readonly name: "守誓项链·诺恩";
        readonly category: "artifact";
        readonly summary: "承诺会化为温热的光，护住仍愿前行的人。";
    };
    readonly fate_bracelet_clotho: {
        readonly name: "命运手镯·克洛托";
        readonly category: "artifact";
        readonly summary: "银线缠绕腕间，仿佛能将断裂的命运重新缝合。";
    };
    readonly eternal_ring_aurora: {
        readonly name: "永恒戒指·奥罗拉";
        readonly category: "artifact";
        readonly summary: "黎明色的微光永不熄灭，指向每一场可能的胜利。";
    };
    readonly growth_blessing: {
        readonly name: "成长祝福";
        readonly category: "ability";
        readonly summary: "【绑定】所有获得的经验值翻倍。";
    };
    readonly mana_affinity: {
        readonly name: "魔力亲和";
        readonly category: "ability";
        readonly summary: "【绑定】技能魔力消耗降低 30%。";
    };
    readonly lucky_favor: {
        readonly name: "幸运眷顾";
        readonly category: "ability";
        readonly summary: "【绑定】战利品掉落概率提高 20%。";
    };
    readonly war_god_favor: {
        readonly name: "战神眷顾";
        readonly category: "ability";
        readonly summary: "【绑定】造成的最终伤害提高 16%。";
    };
    readonly arcane_revelation: {
        readonly name: "奥术启示";
        readonly category: "ability";
        readonly summary: "【绑定】魔法伤害提高 16%。";
    };
    readonly crimson_recovery: {
        readonly name: "猩红复苏";
        readonly category: "ability";
        readonly summary: "【绑定】普攻与刺击伤害的 16% 转化为生命。";
    };
    readonly seer_instinct: {
        readonly name: "先知直觉";
        readonly category: "ability";
        readonly summary: "【绑定】命中与暴击属性在战斗中提高 16%。";
    };
    readonly hunter_blessing: {
        readonly name: "猎人恩典";
        readonly category: "ability";
        readonly summary: "【绑定】战利品掉落概率提高 35%。";
    };
};
export declare const artifactGiftSlots: {
    readonly holy_sword_shirulu: "weapon";
    readonly demon_sword_aphia: "weapon";
    readonly saint_staff_istaria: "weapon";
    readonly death_dagger_azra: "weapon";
    readonly godfist_chronos: "weapon";
    readonly oracle_grimoire_sophia: "weapon";
    readonly prayer_orb_lumia: "weapon";
    readonly immortal_shield_auges: "offhand";
    readonly star_crown_selene: "shoulder";
    readonly sky_robe_asteia: "upper";
    readonly wind_girdle_hermes: "waist";
    readonly time_greaves_chronos: "lower";
    readonly gale_boots_sif: "feet";
    readonly oath_necklace_norn: "necklace";
    readonly fate_bracelet_clotho: "bracelet";
    readonly eternal_ring_aurora: "ring";
};
export type GiftCode = keyof typeof gifts;
export type GiftCategory = (typeof gifts)[GiftCode]['category'];
export declare const isGiftCode: (value: string) => value is GiftCode;
