export type ChestReward = {
    code: string;
    min: number;
    max: number;
    equipment?: boolean;
};
export type ChestTable = {
    code: string;
    version: number;
    fixed: ChestReward[];
    groups: {
        draws: number;
        entries: {
            weight: number;
            rewards: ChestReward[];
        }[];
    }[];
    independent: {
        chance: number;
        reward: ChestReward;
    }[];
};
export declare const dawnWeapons: readonly [readonly ["sword", "长剑", "初晓·拾光长剑"], readonly ["dagger", "匕首", "初晓·露痕短刃"], readonly ["knuckle", "拳刃", "初晓·轻跃拳刃"], readonly ["staff", "法杖", "初晓·晨枝法杖"], readonly ["book", "法书", "初晓·未写之页"], readonly ["orb", "法球", "初晓·掌心微日"]];
export declare const crimsonArmor: readonly [readonly ["shoulder", "头肩", "猩红王冠·断角肩饰"], readonly ["upper", "上装", "猩红王冠·余烬礼衣"], readonly ["waist", "腰部", "猩红王冠·王印束带"], readonly ["lower", "下装", "猩红王冠·夜宴裙甲"], readonly ["feet", "脚部", "猩红王冠·归火短靴"]];
export declare const goldenChestTable: ChestTable;
export declare const openingThemeChests: readonly [readonly ["opening_tide_chest", "封潮维护匣"], readonly ["opening_birthday_chest", "迟到的生日礼匣"]];
export declare const openingChestName: (code: string) => "黄金宝箱" | "封潮维护匣" | "迟到的生日礼匣" | "宝箱";
export declare const openingChestContents: (code: string) => "每只黄金宝箱固定获得微光草药 ×2，另独立抽取一组：\n初晓 Lv.1 史诗武器 20%\nLv.1 稀有武器 30%\nLv.1 稀有防具 20%\n微光草药 ×3、新手魔力药水（小）×2：15%\n公会补给券 ×1：15%\n\n武器六类等概率，防具五个部位等概率；每箱独立开奖，奖励个人绑定。" | "每只宝箱独立抽取一件：\n初晓 Lv.1 史诗武器：20%，六类武器等概率\nLv.1 稀有装备：80%，六类武器与五个防具部位共十一类等概率\n\n没有额外草药或补给券，没有空箱。奖励个人绑定，不附加地图 Boss 词条；支持一次开启 1～100 只。";
export declare const chestTables: Record<string, ChestTable>;
export declare const chestTableForVersion: (code: string, version: number) => ChestTable | undefined;
export declare const rollChest: (table: ChestTable, count: number, random?: () => number) => {
    code: string;
    quantity: number;
    equipment: boolean;
}[];
