export const openingHubs = {
  baina_town: { name: '百纳镇', guild: 'guild_counter', guildName: '冒险者公会', host: '莫妮卡', x: -2, y: -181, z: 0, description: '公会的木门敞着，食物与纸墨的气味一同飘出来。莫妮卡抬起头，先确认你没有受伤，再将登记册转过来。' },
  world_tree: { name: '世界树', guild: 'world_tree_adventurer_guild', guildName: '冒险者公会·根冠分会', host: '维萝', x: -5, y: -3, z: 0, description: '巨根托起挂满风铃的木厅。维萝将窗边的空椅拉开：“坐稳了再说。你的名字，值得慢慢写清楚。”' },
  floating_leaf_town: { name: '浮叶镇', guild: 'windbranch_guild', guildName: '风枝会馆', host: '菈芮', x: 12, y: 0, z: 30, description: '云从花桥下缓缓流过，活藤柜台降到合适高度。菈芮铺开长纸：“名字不用为我们改短。”' },
  snowlamp_hollow: { name: '雪灯坳', guild: 'snowlamp_guild', guildName: '雪灯公会驿所', host: '温棠', x: 0, y: 330, z: 1, description: '暖黄的雪灯绕着温泉，屋檐挂着化开的水珠。温棠把烘热的登记板交来：“墨冻住了可以再化，人先暖起来。”' },
  frost_dragon_inn: { name: '霜龙客舍', guild: 'dragon_inn_counter', guildName: '龙舍公会驻点', host: '格琳达', x: 18, y: 335, z: 1, description: '格琳达扶正角上的阅读镜，小心收好尾巴：“登记免费，踩坏椅子另算。算了，新来的，先坐那张结实的。”' },
  sleepwhale_market: { name: '眠鲸旅市', guild: 'whale_guild', guildName: '眠鲸移动公会', host: '滴算', x: 180, y: 190, z: 40, description: '鲸的呼吸让窗边风铃轻轻晃动。滴算将账簿压好：“登记不收费。刚才那一句是说明，不是订单。”' }
} as const;
export type OpeningHubCode = keyof typeof openingHubs;
export const openingSpawnRegions = {
  dark_forest: { prefix: 'F', tier: 1 }, worldtree_meadow: { prefix: 'M', tier: 1 }, morningdew_riverbank: { prefix: 'R', tier: 1 },
  gravelwind_shore: { prefix: 'S', tier: 2 }, dark_forest_deep: { prefix: 'D', tier: 2 }, ridge_foothills: { prefix: 'H', tier: 2 },
  rediron_pass: { prefix: 'I', tier: 2 }, mistalgae_marsh: { prefix: 'W', tier: 2 },
  fallenstar_swamp: { prefix: 'A', tier: 3 }, frostcrown_plateau: { prefix: 'C', tier: 3 }, thundercliff: { prefix: 'T', tier: 3 }, eclipse_ruins: { prefix: 'E', tier: 3 },
  baina_town: { prefix: 'B', tier: 0 }, world_tree: { prefix: 'Y', tier: 0 }
} as const;
export const openingTierWeights = [10, 55, 25, 10] as const;
export const hubForRegion = (code: string) => openingHubs[code as OpeningHubCode];
