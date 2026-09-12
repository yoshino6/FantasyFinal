export declare const openingHubs: {
    readonly baina_town: {
        readonly name: "百纳镇";
        readonly guild: "guild_counter";
        readonly guildName: "冒险者公会";
        readonly host: "莫妮卡";
        readonly x: -2;
        readonly y: -181;
        readonly z: 0;
        readonly description: "公会的木门敞着，食物与纸墨的气味一同飘出来。莫妮卡抬起头，先确认你没有受伤，再将登记册转过来。";
    };
    readonly world_tree: {
        readonly name: "世界树";
        readonly guild: "world_tree_adventurer_guild";
        readonly guildName: "冒险者公会·根冠分会";
        readonly host: "维萝";
        readonly x: -5;
        readonly y: -3;
        readonly z: 0;
        readonly description: "巨根托起挂满风铃的木厅。维萝将窗边的空椅拉开：“坐稳了再说。你的名字，值得慢慢写清楚。”";
    };
    readonly floating_leaf_town: {
        readonly name: "浮叶镇";
        readonly guild: "windbranch_guild";
        readonly guildName: "风枝会馆";
        readonly host: "菈芮";
        readonly x: 12;
        readonly y: 0;
        readonly z: 30;
        readonly description: "云从花桥下缓缓流过，活藤柜台降到合适高度。菈芮铺开长纸：“名字不用为我们改短。”";
    };
    readonly frost_dragon_inn: {
        readonly name: "霜龙客舍";
        readonly guild: "dragon_inn_counter";
        readonly guildName: "龙舍公会驻点";
        readonly host: "格琳达";
        readonly x: 18;
        readonly y: 335;
        readonly z: 1;
        readonly description: "格琳达扶正角上的阅读镜，小心收好尾巴：“登记免费，踩坏椅子另算。算了，新来的，先坐那张结实的。”";
    };
};
export type OpeningHubCode = keyof typeof openingHubs;
export declare const openingSpawnRegions: {
    readonly dark_forest: {
        readonly tier: 1;
    };
    readonly worldtree_meadow: {
        readonly tier: 1;
    };
};
export declare const openingStartRouteCodes: ReadonlySet<string>;
export declare const openingTierWeights: readonly [10, 55, 25, 10];
export declare const hubForRegion: (code: string) => {
    readonly name: "百纳镇";
    readonly guild: "guild_counter";
    readonly guildName: "冒险者公会";
    readonly host: "莫妮卡";
    readonly x: -2;
    readonly y: -181;
    readonly z: 0;
    readonly description: "公会的木门敞着，食物与纸墨的气味一同飘出来。莫妮卡抬起头，先确认你没有受伤，再将登记册转过来。";
} | {
    readonly name: "世界树";
    readonly guild: "world_tree_adventurer_guild";
    readonly guildName: "冒险者公会·根冠分会";
    readonly host: "维萝";
    readonly x: -5;
    readonly y: -3;
    readonly z: 0;
    readonly description: "巨根托起挂满风铃的木厅。维萝将窗边的空椅拉开：“坐稳了再说。你的名字，值得慢慢写清楚。”";
} | {
    readonly name: "浮叶镇";
    readonly guild: "windbranch_guild";
    readonly guildName: "风枝会馆";
    readonly host: "菈芮";
    readonly x: 12;
    readonly y: 0;
    readonly z: 30;
    readonly description: "云从花桥下缓缓流过，活藤柜台降到合适高度。菈芮铺开长纸：“名字不用为我们改短。”";
} | {
    readonly name: "霜龙客舍";
    readonly guild: "dragon_inn_counter";
    readonly guildName: "龙舍公会驻点";
    readonly host: "格琳达";
    readonly x: 18;
    readonly y: 335;
    readonly z: 1;
    readonly description: "格琳达扶正角上的阅读镜，小心收好尾巴：“登记免费，踩坏椅子另算。算了，新来的，先坐那张结实的。”";
};
