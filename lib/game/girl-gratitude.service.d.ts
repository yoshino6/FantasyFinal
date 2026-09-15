export declare const girlGratitudeMainQuest: (qqUserId: string) => Promise<{
    title: string;
    description: string;
    action?: undefined;
} | {
    title: string;
    description: string;
    action: {
        label: string;
        command: string;
    };
} | null>;
export declare const girlGratitudePending: (qqUserId: string) => Promise<boolean>;
export declare const girlGratitudeStage: (qqUserId: string) => Promise<number>;
export declare const startGirlGratitude: (qqUserId: string) => Promise<string>;
export declare const teleportToWorldTree: (qqUserId: string) => Promise<"界门的银蓝色光纹从脚边升起。片刻后，你已站在世界树的根桥旁，返程界门就在身后。" | "界门驿站中央的环形门框亮起柔和的银蓝色。梨子喵本想潇洒地跨进去，尾巴却先扫到了门槛，整个人一头栽倒。我眼疾手快地一把搂住。\n\n“哎哟喵。”\n\n“你没事吧？”\n\n“这、这是第一次带人跨界门，紧张是正常的喵！”\n\n下一瞬，脚下的街道化作星点。等光芒散去，一株几乎看不见尽头的巨树已擎起天空。根须如山脉般在远处起伏，叶间垂下无数淡金色光丝。\n\n梨子喵悄悄看我一眼，终于笑了。\n\n“欢迎来到世界树喵。先收下这张地图，别一会儿被我带丢了……”\n\n获得【地图·世界树】。">;
export declare const returnToBainaTown: (qqUserId: string) => Promise<string>;
export declare const continueGirlGratitude: (qqUserId: string) => Promise<{
    chapter: number;
    exchange: boolean;
    text: string;
}>;
export declare const receiveGirlGratitudeGift: (qqUserId: string) => Promise<string>;
