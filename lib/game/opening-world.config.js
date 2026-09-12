const openingHubs = {
    baina_town: { name: '百纳镇', guild: 'guild_counter', guildName: '冒险者公会', host: '莫妮卡', x: -2, y: -181, z: 0, description: '公会的木门敞着，食物与纸墨的气味一同飘出来。莫妮卡抬起头，先确认你没有受伤，再将登记册转过来。' },
    world_tree: { name: '世界树', guild: 'world_tree_adventurer_guild', guildName: '冒险者公会·根冠分会', host: '维萝', x: -5, y: -3, z: 0, description: '巨根托起挂满风铃的木厅。维萝将窗边的空椅拉开：“坐稳了再说。你的名字，值得慢慢写清楚。”' },
    floating_leaf_town: { name: '浮叶镇', guild: 'windbranch_guild', guildName: '风枝会馆', host: '菈芮', x: 12, y: 0, z: 30, description: '云从花桥下缓缓流过，活藤柜台降到合适高度。菈芮铺开长纸：“名字不用为我们改短。”' },
    frost_dragon_inn: { name: '霜龙客舍', guild: 'dragon_inn_counter', guildName: '龙舍公会驻点', host: '格琳达', x: 18, y: 335, z: 1, description: '格琳达扶正角上的阅读镜，小心收好尾巴：“登记免费，踩坏椅子另算。算了，新来的，先坐那张结实的。”' },
};
const openingSpawnRegions = {
    dark_forest: { tier: 1 }, worldtree_meadow: { tier: 1 },
    gravelwind_shore: { tier: 2 },
    fallenstar_swamp: { tier: 3 }, frostcrown_plateau: { tier: 3 }
};
const openingTierWeights = [10, 55, 25, 10];
const hubForRegion = (code) => openingHubs[code];

export { hubForRegion, openingHubs, openingSpawnRegions, openingTierWeights };
