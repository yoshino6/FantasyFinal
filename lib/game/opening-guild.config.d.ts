export declare const rootGuildPeople: readonly [{
    readonly code: "root_guild_clerk";
    readonly name: "鹿族书记官·维萝";
    readonly role: "登记柜台";
    readonly first: "我是维萝，负责这里的登记。不会写这里的字也没关系，告诉我读音；名字是你的，不该由表格替你决定。";
    readonly again: "我记得你的名字。今天要登记新的路，还是先歇一会儿？";
}, {
    readonly code: "root_guild_commissioner";
    readonly name: "獾族委托官·砾秋";
    readonly role: "委托板";
    readonly first: "我叫砾秋，管委托板。先看委托要求；报酬写得越大，越要把下面的小字看完。";
    readonly again: "你上次按时回来了。这比你少花了多久更值得写进记录。";
}, {
    readonly code: "root_guild_appraiser";
    readonly name: "鸮族鉴物员·澄叶";
    readonly role: "见闻与地图";
    readonly first: "我是澄叶，负责鉴物和地图。我能告诉你我知道的，也会把不知道的地方留空；空白比乱写可靠。";
    readonly again: "你的见闻我留了副本。不是不信你，是好线索不该只存一份。";
}, {
    readonly code: "root_guild_cook";
    readonly name: "蜜獾厨娘·朵菈";
    readonly role: "餐厅";
    readonly first: "朵菈，管厨房的。坐下，想逞强也先把汤喝了；饿着肚子想出来的主意，多半不怎么样。";
    readonly again: "还是上次那个口味？不急，我给你把烫的那一口晾一晾。";
}, {
    readonly code: "root_guild_shopkeeper";
    readonly name: "狐族掌柜·斐珞";
    readonly role: "公会商店";
    readonly first: "我叫斐珞，看着这间商店。这件贵，是因为多了你暂时用不到的功能；今天买旁边那件就够。";
    readonly again: "你会比较价格了。不错，以后我就不必每笔都替你再算一遍。";
}, {
    readonly code: "root_guild_keeper";
    readonly name: "人类契兽员·温槐";
    readonly role: "随从兽栏";
    readonly first: "温槐，契兽员。先别叫它做什么；让它知道待在你旁边不会受伤，才谈得上同行。";
    readonly again: "它听见你的脚步就抬头了。这个，可不是我教得出来的。";
}, {
    readonly code: "root_guild_builder";
    readonly name: "木灵工匠·木芽";
    readonly role: "工艺练习";
    readonly first: "我是木芽，负责工艺练习。歪一点能修，少一根承重柱可不能靠祝福；来，先认这个。";
    readonly again: "你上次那张凳子还稳着呢。我坐过，替你验过了。";
}, {
    readonly code: "root_guild_gatekeeper";
    readonly name: "半精灵值守·岑渡";
    readonly role: "门口接引";
    readonly first: "我叫岑渡，守这道门。进来以后，就不用再赶路了。";
    readonly again: "回来就好。那张空椅子，还在老地方。";
}];
export declare const rootGuildScenes: Record<string, string>;
export declare const guildLessons: readonly [{
    readonly code: "supply";
    readonly title: "把药箱安放妥当";
    readonly text: "接引员将空药瓶、标签与软布放在桌上。你先将瓶底垫稳，再让标签朝向取药的人。最上面留给急用的药，不必为了看着整齐，把每样东西都压得紧紧的。";
    readonly reward: "healing_herb";
    readonly quantity: 2;
}, {
    readonly code: "contract";
    readonly title: "等它愿意靠近";
    readonly text: "契兽员把一只木制球兔放在桌上，演示如何辨认戒备和信任。\n\n“礼物只能在开战之前送。先观察它喜欢什么；拒收的东西收回来，不要硬塞。交涉成功，也要等它自己愿意同行。”\n\n你在练习册上勾选“留出退路”。这是模拟练习，没有扣除真实礼物。";
    readonly reward: "opening_companion_feed";
    readonly quantity: 1;
}, {
    readonly code: "craft";
    readonly title: "第一道稳妥的榫口";
    readonly text: "工匠递来削好的短木。你沿标线压住边角，试着将两块木头扣在一起。第一次歪了，拆开重来；第二次，木件终于稳稳立住。\n\n“做得慢不要紧。会检查的人，才敢让别人放心用。”";
    readonly reward: "opening_practice_stool";
    readonly quantity: 1;
}, {
    readonly code: "map";
    readonly title: "认清回来的路";
    readonly text: "鉴物员压平地图，先请你指出自己所在的公会，再找最近的安全出口。你把来时的方向画在纸边，确认图上没有把高危野外误写成新手练习场。\n\n“去哪里都可以先问。还有，回程也要一起看。”";
    readonly reward: "healing_herb";
    readonly quantity: 1;
}];
