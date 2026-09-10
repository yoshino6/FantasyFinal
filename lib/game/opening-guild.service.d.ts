import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export declare const grantOpeningService: (c: PoolConnection, id: number, code: string, uses: number) => Promise<void>;
export declare const openingGuildView: (user: string) => Promise<{
    hub: {
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
        readonly name: "雪灯坳";
        readonly guild: "snowlamp_guild";
        readonly guildName: "雪灯公会驿所";
        readonly host: "温棠";
        readonly x: 0;
        readonly y: 330;
        readonly z: 1;
        readonly description: "暖黄的雪灯绕着温泉，屋檐挂着化开的水珠。温棠把烘热的登记板交来：“墨冻住了可以再化，人先暖起来。”";
    } | {
        readonly name: "霜龙客舍";
        readonly guild: "dragon_inn_counter";
        readonly guildName: "龙舍公会驻点";
        readonly host: "格琳达";
        readonly x: 18;
        readonly y: 335;
        readonly z: 1;
        readonly description: "格琳达扶正角上的阅读镜，小心收好尾巴：“登记免费，踩坏椅子另算。算了，新来的，先坐那张结实的。”";
    } | {
        readonly name: "眠鲸旅市";
        readonly guild: "whale_guild";
        readonly guildName: "眠鲸移动公会";
        readonly host: "滴算";
        readonly x: 180;
        readonly y: 190;
        readonly z: 40;
        readonly description: "鲸的呼吸让窗边风铃轻轻晃动。滴算将账簿压好：“登记不收费。刚才那一句是说明，不是订单。”";
    };
    code: "floating_leaf_town" | "world_tree" | "snowlamp_hollow" | "frost_dragon_inn" | "sleepwhale_market" | "baina_town";
    at: boolean;
    inside: boolean;
    place: RowDataPacket;
    services: RowDataPacket[];
    maps: {
        id: number | null;
        code: string | null;
        name: string;
        regionCode: string;
        regionName: string;
        description: string;
        codexId: string | null;
        minLevel: number | null;
        maxLevel: number | null;
        risk: string;
        safeTown: boolean;
        canExchange: boolean;
    }[];
    registered: boolean;
    world: RowDataPacket;
}>;
export declare const enterOpeningGuild: (user: string, inside?: boolean) => Promise<void>;
export declare const openingGuildAction: (user: string, action: string, value?: string) => Promise<string>;
export declare const openingKeepsakes: (user: string) => Promise<{
    items: {
        name: string;
        use: string;
        future: string;
        code: string;
        used: boolean;
        archived: boolean;
        recordOnly: boolean;
        route: string;
    }[];
    events: RowDataPacket[];
}>;
export declare const openingTransport: (user: string, destination: string) => Promise<string>;
