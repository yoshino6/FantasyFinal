export type WorldSurfaceRegion = {
  code: string;
  name: string;
  description: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  danger: number;
  terrain: { code: string; name: string; description: string; priority: number; tags: string[] };
};

export type WorldSurfaceMonster = {
  code: string;
  name: string;
  regionCode: string;
  level: number;
  monsterClass: 'normal' | 'large' | 'elite' | 'boss';
  skillCodes: string[];
  materialCode: string;
  weakness: string;
  resistance: string;
  element?: string;
};


export const worldSurfaceRegions: WorldSurfaceRegion[] = [
  { code: 'worldtree_meadow', name: '世界树草原环带', description: '环抱世界树的清亮草原，晨露和风声仍守护着旅人的第一段路。', minX: -60, maxX: 60, minY: -60, maxY: 60, danger: 1, terrain: { code: 'tree_meadow', name: '世界树草原', description: '柔软的草叶覆在世界树根系旁，微光草药在晨雾中舒展。', priority: 10, tags: ['草地', '草药'] } },
  { code: 'morningdew_riverbank', name: '晨露河岸', description: '晨露河在世界树东北侧绕成 L 形河岸，河雾中藏着潮湿而活跃的生态。', minX: -60, maxX: 160, minY: -60, maxY: 160, danger: 3, terrain: { code: 'morningdew_river', name: '晨露河', description: '由碎石和浅滩拼成的河道，水栖生物会随潮声出现。', priority: 20, tags: ['浅水', '河流'] } },
  { code: 'gravelwind_shore', name: '砾风石滩', description: '世界树西侧的河口沉积着白砾，潮池与断岩间有危险的拾荒者。', minX: -220, maxX: -61, minY: -60, maxY: 160, danger: 4, terrain: { code: 'gravelwind_beach', name: '砾风石滩', description: '潮水冲刷出层层砾石，风元素在裸露的石脊间流动。', priority: 20, tags: ['石滩', '潮池'] } },
  { code: 'ridge_foothills', name: '岩脊山麓', description: '世界树西侧的碎岩坡延伸至峡谷，矿脉与山兽共同守住山口。', minX: -360, maxX: -221, minY: -160, maxY: 160, danger: 5, terrain: { code: 'ridge_stone', name: '岩脊碎岩坡', description: '松动岩层下藏有辉石矿脉，陡坡会拖慢长途移动。', priority: 20, tags: ['山地', '矿脉'] } },
  { code: 'rediron_pass', name: '赤铁山道', description: '世界树北侧通往山腹熔洞的赤铁道路，炽热裂隙让空气也带着金属味。', minX: -220, maxX: 160, minY: 161, maxY: 300, danger: 6, terrain: { code: 'rediron_vein', name: '赤铁矿道', description: '赤铁矿脉贴着熔岩裂隙延伸，火与土的元素十分活跃。', priority: 20, tags: ['山地', '高温', '矿脉'] } },
  { code: 'mistalgae_marsh', name: '雾藻湿地', description: '世界树东侧的芦苇与浮岛被终年白雾掩盖，水木生物在泥潭间伏行。', minX: 161, maxX: 360, minY: -160, maxY: 160, danger: 7, terrain: { code: 'mistalgae_bog', name: '雾藻湿地', description: '雾藻覆盖的浅沼会拖慢脚步，也孕育了稀有的药性材料。', priority: 20, tags: ['湿地', '水', '木'] } },
  { code: 'fallenstar_swamp', name: '沉星沼泽', description: '陨星坠落形成的深沼，位于深林以南的更远处。', minX: 161, maxX: 360, minY: -400, maxY: -301, danger: 8, terrain: { code: 'fallenstar_mire', name: '沉星深沼', description: '星泥在水面下闪烁，未点亮引灯的人难以辨清安全的路。', priority: 20, tags: ['深沼', '暗', '陨星'] } },
  { code: 'frostcrown_plateau', name: '霜冠高原', description: '赤铁山道以北的高原被冰雪覆盖，冻松与冰湖共同构成漫长的雪线。', minX: -220, maxX: 160, minY: 301, maxY: 400, danger: 9, terrain: { code: 'frostcrown_snow', name: '霜冠雪原', description: '积雪没过靴面，冰元素在冻土和冰湖之间持续凝结。', priority: 20, tags: ['雪原', '冰'] } },
  { code: 'thundercliff', name: '雷鸣断崖', description: '湿地东北侧的绝壁被雷云常年包围，悬桥另一端通往更古老的遗迹。', minX: 161, maxX: 360, minY: 161, maxY: 400, danger: 10, terrain: { code: 'thundercliff_ledge', name: '雷鸣断崖', description: '雷云在绝壁上滚动，风与雷的生物会在暴雨前变得更为活跃。', priority: 20, tags: ['断崖', '风', '雷'] } },
  { code: 'eclipse_ruins', name: '月蚀遗迹', description: '世界树东侧更远处的月蚀神殿早已坍塌，月井仍在光暗交替时发出低鸣。', minX: 361, maxX: 400, minY: -160, maxY: 160, danger: 11, terrain: { code: 'eclipse_masonry', name: '月蚀遗迹', description: '古老砖石浸在月光中，光与暗的抗性会随月相轮替。', priority: 20, tags: ['遗迹', '光', '暗'] } }
];

const group = (regionCode: string, materialCode: string, entries: Array<[string, string, number, WorldSurfaceMonster['monsterClass'], string[], string, string, string?]>): WorldSurfaceMonster[] =>
  entries.map(([code, name, level, monsterClass, skillCodes, weakness, resistance, element]) => ({ code, name, regionCode, level, monsterClass, skillCodes, materialCode, weakness, resistance, element }));

export const worldSurfaceMonsters: WorldSurfaceMonster[] = [
  ...group('worldtree_meadow', 'root_heart', [
    ['dew_slime', '露珠史莱姆', 1, 'normal', ['slime_bash', 'regenerate_slime'], '刺击', '打击', '水'], ['clover_rabbit', '苜蓿兔', 1, 'normal', ['hop', 'scratch'], '刺击', '打击'], ['sprout_rat', '根芽鼠', 2, 'normal', ['bite', 'scratch'], '斩击', '刺击'], ['pollen_bee', '花粉蜂', 2, 'normal', ['wind_blade', 'scratch'], '打击', '风'], ['grass_antler_deer', '草角鹿', 3, 'normal', ['charge', 'scratch'], '斩击', '刺击'], ['mossback_turtle', '苔背龟', 3, 'normal', ['shield_counter', 'bite'], '打击', '刺击', '木'], ['windchime_bird', '风铃鸟', 4, 'normal', ['wind_blade', 'piercing_thrust'], '雷', '风', '风'], ['vine_puppet', '蔓藤傀儡', 4, 'normal', ['root_bind', 'thorn_burst'], '火', '木', '木'], ['dawn_fox', '晨光狐', 5, 'large', ['mist_pounce', 'bite'], '打击', '暗'], ['grassroot_guard', '草原守根', 6, 'elite', ['root_bind', 'verdant_bolt', 'shield_counter'], '火', '木', '木'], ['rootcrown_ram', '根冠公羊', 6, 'boss', ['charge', 'thorn_burst', 'shield_counter'], '火', '木', '木']
  ]),
  ...group('morningdew_riverbank', 'river_shell', [
    ['bubble_slime', '水泡史莱姆', 4, 'normal', ['slime_bash', 'regenerate_slime'], '雷', '水', '水'], ['mudfin_murloc', '泥鳍鱼人', 4, 'normal', ['piercing_thrust', 'scratch'], '风', '水', '水'], ['river_shell_crab', '河壳蟹', 5, 'normal', ['shield_counter', 'heavy_strike'], '打击', '刺击'], ['watergrass_snake', '水草蛇', 5, 'normal', ['constrict', 'vine_hex'], '火', '木', '木'], ['floatlight_jelly', '浮灯水母', 6, 'normal', ['thunder_lance', 'arcane_bolt'], '土', '雷', '雷'], ['reed_spirit', '湿苇精', 6, 'normal', ['healing_prayer', 'vine_bolt'], '火', '木', '木'], ['rapid_otter', '急流獭', 7, 'normal', ['mist_pounce', 'bite'], '雷', '水', '水'], ['ironbeak_heron', '铁嘴鹭', 7, 'normal', ['piercing_thrust', 'wind_blade'], '雷', '风', '风'], ['mire_toad', '泥潭蟾王', 8, 'large', ['acid_spray', 'slime_bash'], '冰', '水', '水'], ['river_scavenger', '河道拾荒者', 8, 'elite', ['goblin_slash', 'goblin_fire', 'shield_counter'], '打击', '刺击'], ['dawntide_crocodile', '晨潮鳄王', 10, 'boss', ['mist_pounce', 'bite', 'constrict', 'shield_counter'], '雷', '水', '水']
  ]),
  ...group('gravelwind_shore', 'tide_shell', [
    ['shard_hermit', '碎壳寄居蟹', 7, 'normal', ['shield_counter', 'scratch'], '打击', '刺击'], ['salt_urchin', '盐刺海胆', 7, 'normal', ['thorn_burst', 'shield_counter'], '打击', '刺击'], ['sandrunner_lizard', '沙行蜥', 8, 'normal', ['mist_pounce', 'bite'], '冰', '火'], ['tide_slime', '潮汐史莱姆', 8, 'normal', ['slime_bash', 'acid_spray'], '雷', '水', '水'], ['shell_gull', '拾贝鸥盗', 9, 'normal', ['wind_blade', 'piercing_thrust'], '雷', '风', '风'], ['rockarm_crab', '岩甲蟹', 9, 'normal', ['shield_counter', 'heavy_strike'], '打击', '刺击', '土'], ['headwind_sharkdog', '逆风鲨犬', 10, 'normal', ['charge', 'bite'], '雷', '风', '风'], ['tidewraith', '潮痕幽灵', 10, 'normal', ['moonbolt', 'arcane_shackle'], '光', '暗', '暗'], ['shore_giant_lizard', '石滩巨蜥', 11, 'large', ['heavy_strike', 'sweeping_slash'], '冰', '土', '土'], ['ebb_acolyte', '退潮祭徒', 12, 'elite', ['healing_prayer', 'water_bolt', 'shield_counter'], '雷', '水', '水'], ['shattertide_crab', '碎潮巨蟹', 14, 'boss', ['shield_counter', 'heavy_strike', 'sweeping_slash'], '打击', '刺击', '水']
  ]),
  ...group('ridge_foothills', 'ridge_core', [
    ['rubble_beast', '碎岩兽', 20, 'normal', ['heavy_strike', 'shield_counter'], '打击', '土', '土'], ['canyon_jackal', '峡谷豺', 21, 'normal', ['bite', 'mist_pounce'], '打击', '刺击'], ['ironfeather_vulture', '铁羽秃鹫', 22, 'normal', ['piercing_thrust', 'wind_blade'], '雷', '风', '风'], ['mountain_beetle', '山甲虫', 23, 'normal', ['shield_counter', 'heavy_strike'], '打击', '刺击'], ['cliff_ram', '峭壁羊怪', 24, 'normal', ['charge', 'heavy_strike'], '斩击', '刺击'], ['stonevein_golem', '石脉傀儡', 25, 'normal', ['shield_counter', 'warrior_taunt'], '打击', '土', '土'], ['ember_bat', '火绒蝠', 24, 'normal', ['ember_burst', 'wind_blade'], '水', '火', '火'], ['mine_goblin', '矿道哥布林', 25, 'normal', ['goblin_fire', 'goblin_slash'], '打击', '刺击'], ['fault_centipede', '断层蜈蚣', 28, 'large', ['toxic_edge', 'constrict'], '冰', '土', '土'], ['canyon_overseer', '峡谷监工', 30, 'elite', ['heavy_strike', 'shield_counter', 'warrior_taunt'], '暗', '打击'], ['gruen_mountainheart', '山脉心核·格鲁恩', 32, 'boss', ['gruen_fault_sunder', 'gruen_stoneward', 'gruen_riftfall', 'gruen_tectonic_call', 'gruen_corequake'], '打击', '土', '土']
  ]),
  ...group('rediron_pass', 'fire_crystal', [
    ['rediron_wisp', '赤铁矿灵', 20, 'normal', ['ember_burst', 'arcane_bolt'], '水', '火', '火'], ['moltenscorpion', '熔洞蝎', 21, 'normal', ['toxic_edge', 'ember_burst'], '冰', '火', '火'], ['ash_lizard', '灰烬蜥', 22, 'normal', ['ember_burst', 'bite'], '水', '火', '火'], ['magnet_golem', '磁石傀儡', 23, 'normal', ['arcane_shackle', 'shield_counter'], '土', '金'], ['cinder_boar', '焦岩野猪', 24, 'normal', ['charge', 'ember_burst'], '水', '火', '火'], ['mine_hexer', '矿坑咒师', 24, 'normal', ['moonbolt', 'arcane_shackle'], '光', '暗', '暗'], ['furnace_beetle', '炉心甲虫', 25, 'normal', ['shield_counter', 'ember_burst'], '水', '火', '火'], ['ore_raider', '盗矿团弩手', 25, 'normal', ['piercing_thrust', 'goblin_fire'], '打击', '刺击'], ['lava_rockbeast', '熔岩岩兽', 28, 'large', ['heavy_strike', 'ember_burst'], '水', '火', '火'], ['rediron_torchbearer', '赤铁执炬官', 30, 'elite', ['ember_burst', 'shield_counter', 'sweeping_slash'], '水', '火', '火'], ['valk_forge_overseer', '熔炉监工·瓦尔克', 32, 'boss', ['valk_slag_brand', 'valk_chain_draw', 'valk_anvil_sentence', 'valk_furnace_stoke', 'valk_furnace_overdrive'], '水', '火', '火']
  ]),
  ...group('mistalgae_marsh', 'marsh_heart', [
    ['mistalgae_mass', '雾藻团', 20, 'normal', ['vine_hex', 'shield_counter'], '火', '木', '木'], ['marsh_crocodile', '沼泽鳄', 21, 'normal', ['mist_pounce', 'bite'], '雷', '水', '水'], ['bog_midge', '毒沼蜉蝣', 22, 'normal', ['toxic_edge', 'wind_blade'], '火', '暗'], ['reed_walker', '芦苇行尸', 23, 'normal', ['moonbolt', 'slow'], '光', '暗', '暗'], ['watermirror_siren', '水镜妖', 24, 'normal', ['arcane_shackle', 'water_bolt'], '雷', '水', '水'], ['blackfeather_stork', '黑羽鹳', 24, 'normal', ['piercing_thrust', 'wind_blade'], '雷', '风', '风'], ['bogfire_wisp', '沼火鬼灯', 25, 'normal', ['ember_burst', 'moonbolt'], '水', '火', '火'], ['mudarmor_rhino', '泥甲犀', 25, 'normal', ['charge', 'shield_counter'], '冰', '土', '土'], ['rottedroot_python', '腐根巨蟒', 28, 'large', ['constrict', 'vine_hex'], '火', '木', '木'], ['reed_shaman', '芦荡巫医', 30, 'elite', ['healing_prayer', 'vine_hex', 'arcane_shackle'], '火', '木', '木'], ['threehead_mother', '三首雾沼蛇母', 32, 'boss', ['threehead_venom_fang', 'threehead_mist_lash', 'threehead_rootcoil', 'threehead_swallow', 'threehead_brood_regrow'], '火', '木', '木']
  ]),
  ...group('fallenstar_swamp', 'star_mud_core', [
    ['starmud_slime', '星泥史莱姆', 36, 'normal', ['slime_bash', 'arcane_shackle'], '光', '暗', '暗'], ['crater_toad', '陨坑蟾蜍', 36, 'normal', ['charge', 'acid_spray'], '冰', '水', '水'], ['darkbog_snake', '暗沼水蛇', 37, 'normal', ['bite', 'moonbolt'], '光', '暗', '暗'], ['fallenstar_murloc', '沉星鱼人', 37, 'normal', ['piercing_thrust', 'sweeping_slash'], '雷', '水', '水'], ['mud_parasite', '泥星寄生虫', 38, 'normal', ['toxic_edge', 'arcane_shackle'], '光', '暗', '暗'], ['faceless_bogspirit', '无面沼灵', 38, 'normal', ['arcane_shackle', 'moonbolt'], '光', '暗', '暗'], ['meteor_carapace', '坠星甲兽', 39, 'normal', ['shield_counter', 'heavy_strike'], '打击', '刺击'], ['lost_lamplighter', '迷航灯使', 39, 'normal', ['moonbolt', 'ember_burst'], '光', '暗', '暗'], ['crater_eel', '陨潭巨鳗', 40, 'large', ['thunder_lance', 'bite'], '土', '雷', '雷'], ['fallenstar_warden', '沉星看守', 40, 'elite', ['arcane_shackle', 'shield_counter', 'moonbolt'], '光', '暗', '暗'], ['fallingstar_mudid', '坠星泥偶', 40, 'boss', ['arcane_shackle', 'shield_counter', 'thunder_lance', 'moonbolt'], '光', '暗', '暗']
  ]),
  ...group('frostcrown_plateau', 'frost_crystal', [
    ['tundra_wolf', '冻原狼', 40, 'normal', ['mist_pounce', 'frost_bind'], '火', '冰', '冰'], ['snowplush_bear', '雪绒熊', 40, 'normal', ['maul', 'warrior_taunt'], '火', '冰', '冰'], ['ice_spike_sprite', '冰棱精', 41, 'normal', ['frost_bind', 'arcane_bolt'], '火', '冰', '冰'], ['coldpine_ent', '寒松树精', 41, 'normal', ['root_bind', 'frost_barrier'], '火', '冰', '冰'], ['whiteantler_guard', '白角鹿王卫', 42, 'normal', ['charge', 'war_cry'], '火', '冰', '冰'], ['snowblind_eagle', '雪盲鹰', 42, 'normal', ['wind_blade', 'piercing_thrust'], '雷', '风', '风'], ['icelake_spirit', '冰湖水灵', 43, 'normal', ['frost_barrier', 'water_bolt'], '火', '冰', '冰'], ['frostarmored_rider', '霜甲骑尸', 43, 'normal', ['shield_counter', 'frost_bind'], '火', '冰', '冰'], ['permafrost_giant', '冻土巨人', 45, 'large', ['heavy_strike', 'frost_bind'], '火', '冰', '冰'], ['snowline_hunter', '雪线猎官', 45, 'elite', ['piercing_thrust', 'frost_bind', 'backstab'], '火', '冰', '冰'], ['frostking_whiteantler', '白角霜王', 45, 'boss', ['charge', 'frost_bind', 'shield_counter', 'sweeping_slash'], '火', '冰', '冰']
  ]),
  ...group('thundercliff', 'thunder_core', [
    ['thunderhawk', '雷羽隼', 45, 'normal', ['thunder_lance', 'wind_blade'], '土', '雷', '雷'], ['cliff_ram_thunder', '峭壁雷羊', 45, 'normal', ['charge', 'thunder_lance'], '土', '雷', '雷'], ['storm_gargoyle', '风暴石像', 46, 'normal', ['shield_counter', 'thunder_lance'], '土', '雷', '雷'], ['cloudsplit_bat', '裂云蝠', 46, 'normal', ['wind_blade', 'arcane_shackle'], '雷', '风', '风'], ['thundercopper_golem', '雷铜傀儡', 47, 'normal', ['thunder_lance', 'shield_counter'], '土', '雷', '雷'], ['bridge_raider', '悬桥掠夺者', 47, 'normal', ['piercing_thrust', 'backstab'], '打击', '刺击'], ['windblade_elemental', '风刃元素', 48, 'normal', ['wind_blade', 'sweeping_slash'], '雷', '风', '风'], ['storm_priest', '雷暴祭司', 48, 'normal', ['thunder_lance', 'healing_prayer'], '土', '雷', '雷'], ['clifftop_lizard', '崖顶雷蜥', 49, 'large', ['thunder_lance', 'sweeping_slash'], '土', '雷', '雷'], ['cliff_arbiter', '断崖裁断者', 50, 'elite', ['heavy_strike', 'thunder_lance', 'arcane_shackle'], '土', '雷', '雷'], ['askr_stormroc', '风暴巨隼·阿斯克', 50, 'boss', ['thunder_lance', 'wind_blade', 'sweeping_slash', 'shield_counter'], '土', '雷', '雷']
  ]),
  ...group('eclipse_ruins', 'eclipse_core', [
    ['moon_dust_wraith', '月尘幽魂', 48, 'normal', ['moonbolt', 'arcane_shackle'], '光', '暗', '暗'], ['ruin_stoneguard', '遗迹石卫', 48, 'normal', ['shield_counter', 'warrior_taunt'], '打击', '刺击'], ['solar_eclipse_priest', '日蚀祭司', 49, 'normal', ['healing_prayer', 'sanctified_bolt'], '暗', '光', '光'], ['lunar_eclipse_assassin', '月蚀刺客', 49, 'normal', ['backstab', 'moonbolt'], '光', '暗', '暗'], ['starchart_doll', '星图魔偶', 49, 'normal', ['arcane_bolt', 'thunder_lance'], '土', '雷', '雷'], ['well_wraith', '古井怨灵', 50, 'normal', ['moonbolt', 'arcane_shackle'], '光', '暗', '暗'], ['lost_inquisitor', '失落审判官', 50, 'normal', ['sanctified_bolt', 'shield_counter'], '暗', '光', '光'], ['broken_armillary', '破损天仪', 50, 'normal', ['arcane_bolt', 'wind_blade'], '土', '雷', '雷'], ['moonwheel_tombbeast', '月轮守墓兽', 50, 'large', ['sweeping_slash', 'shield_counter'], '打击', '刺击'], ['keykeeper_ruin', '遗迹执钥人', 50, 'elite', ['arcane_shackle', 'sanctified_bolt', 'shield_counter'], '暗', '光', '光'], ['seles_eclipse_watcher', '月蚀守望者·塞勒斯', 50, 'boss', ['moonbolt', 'sanctified_bolt', 'shield_counter', 'arcane_shackle'], '暗', '光', '光']
  ])
];

export const worldSurfaceMaterials = [
  ['root_heart', '根心', '草原守根与根冠公羊的生命核心，适合制作木系药剂和护具辅材。'], ['river_shell', '河壳', '晨露河水冲刷出的坚硬外壳，带着稳定的水元素。'], ['tide_shell', '潮壳', '砾风石滩的潮池生物留下的半透明硬壳。'], ['ridge_core', '岩脊核心', '山麓岩兽体内凝成的土元素核心。'], ['fire_crystal', '炉心赤晶', '沿熔岩岩脉生长的赤色晶矿，可作为高温锻造结合剂。'], ['marsh_heart', '雾沼心', '湿地生物吸收雾藻后形成的药性结晶。'], ['star_mud_core', '星泥核心', '沉星沼泽的星泥浓缩而成，带有暗水魔力。'], ['frost_crystal', '霜晶', '霜冠高原的冰元素结晶。'], ['thunder_core', '鸣雷石', '雷鸣断崖的导雷矿石。'], ['eclipse_core', '月蚀核心', '月蚀遗迹光暗交汇处形成的稀有核心。']
] as const;


export const lockedWorldSurfaceRegionCodes = new Set(worldSurfaceRegions.map(region => region.code));
