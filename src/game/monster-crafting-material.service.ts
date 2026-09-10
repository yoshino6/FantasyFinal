export type MonsterCraftMaterialKind = 'hair' | 'gel_skin' | 'bone' | 'shell' | 'scale';

/** 其他材料价值计算仍按来源每跨 10 级累乘；提纯怪材本身改为每 20 级产出一档新材料。 */
export const materialValueMultiplierForLevel = (level: number) => Math.pow(1.2, Math.floor((Math.max(1, Math.floor(level)) - 1) / 10));
/** 提纯成功产量只在 Lv.11 时提升一次，之后固定为 1.2 倍。 */
export const purificationOutputMultiplierForLevel = (level: number) => Math.max(1, Math.floor(level)) <= 10 ? 1 : 1.2;

const kindMeta: Record<MonsterCraftMaterialKind, { basicSuffix: string; refinedCode: string; refinedNames: readonly string[]; materialClass: string; armorType: string }> = {
  hair: { basicSuffix: '毛', refinedCode: 'spellcloth_bolt', refinedNames: ['灵麻布卷', '灵纺布匹', '灵纹法绢', '星辉秘帛', '月华天绫'], materialClass: '布料', armorType: '布甲' },
  gel_skin: { basicSuffix: '皮', refinedCode: 'tanned_spirit_leather', refinedNames: ['兽鞣皮革', '韧鞣灵革', '玄鞣魔革', '星纹战革', '月蚀龙革'], materialClass: '皮革', armorType: '皮甲' },
  bone: { basicSuffix: '骨', refinedCode: 'bone_steel_plate', refinedNames: ['碎骨钢片', '轻质骨钢片', '精锻骨钢板', '星锻骨钢甲', '月银骨钢甲'], materialClass: '骨钢', armorType: '轻甲' },
  shell: { basicSuffix: '甲壳', refinedCode: 'cast_shell_plate', refinedNames: ['硬甲壳片', '铸纹甲壳板', '玄铸甲壳板', '星铸玄壳板', '月铸灵壳板'], materialClass: '甲壳', armorType: '重甲' },
  scale: { basicSuffix: '鳞', refinedCode: 'laminated_scale_plate', refinedNames: ['粗鳞甲片', '叠锻鳞甲片', '重叠鳞甲板', '星纹鳞甲', '月华玄鳞甲'], materialClass: '鳞甲', armorType: '板甲' }
};
/** Lv.21–40 的第二套材料沿用既定价值；前一套减半，后续每套翻倍。 */
const purifiedTierTwoValues: Record<MonsterCraftMaterialKind, number> = { hair: 32, gel_skin: 32, bone: 34, shell: 36, scale: 38 };
export const purifiedCraftMaterialTierForLevel = (level: number) => Math.min(5, Math.max(1, Math.ceil(Math.max(1, Math.floor(level)) / 20)));

/** 怪物专属怪材名：按掉落顺序对应其两种材质，均不与其他怪物复用。 */
const uniqueMonsterMaterialNames: Record<string, readonly string[]> = {
  dew_slime: ['露凝胶', '晨露核'], clover_rabbit: ['苜蓿绒', '春芽皮'], sprout_rat: ['根须绒', '芽鼠皮'], pollen_bee: ['花蜡壳', '蜜封膜'], grass_antler_deer: ['草角绒', '鹿纹皮'], mossback_turtle: ['苔甲片', '龟背骨'], windchime_bird: ['风铃翎', '空鸣骨'], vine_puppet: ['藤心木', '蔓节片'], dawn_fox: ['曦狐绒', '晨纹皮', '狐牙骨'], grassroot_guard: ['守根膜', '草心芯', '草根绒', '木瘤甲'], rootcrown_ram: ['冠羊绒', '根纹皮', '螺角骨', '树冠甲', '冠藤鳞'],
  bubble_slime: ['泡凝胶', '涟漪核'], mudfin_murloc: ['泥鳍鳞', '滩鱼骨'], river_shell_crab: ['河纹壳', '钳骨'], watergrass_snake: ['水草鳞', '青蛇骨'], floatlight_jelly: ['浮灯胶', '微光核'], reed_spirit: ['苇露膜', '苇心芯'], rapid_otter: ['急流绒', '獭纹皮'], ironbeak_heron: ['铁翎', '鹭鸣骨'], mire_toad: ['泥沼囊', '蟾骨', '蟾须绒'], river_scavenger: ['河盗革', '拾荒骨', '河盗发', '碎甲扣'], dawntide_crocodile: ['晨潮鬃', '鳄纹皮', '鳄王骨', '潮甲', '王鳞'],
  shard_hermit: ['碎晶壳', '寄居骨'], salt_urchin: ['盐棘壳', '海胆骨'], sandrunner_lizard: ['砂行鳞', '蜥骨'], tide_slime: ['潮凝胶', '海潮核'], shell_gull: ['拾贝翎', '鸥骨'], rockarm_crab: ['岩甲片', '石蟹骨'], headwind_sharkdog: ['逆风鳞', '鲨犬骨'], tidewraith: ['潮痕膜', '幽潮核'], shore_giant_lizard: ['滩岩鳞', '巨蜥骨', '岩鬃'], ebb_acolyte: ['退潮革', '祭徒骨', '海盐发', '潮纹甲'], shattertide_crab: ['蟹须绒', '潮蟹胶', '巨螯骨', '碎潮壳', '潮汐鳞'],
  rubble_beast: ['砾岩芯', '碎岩片'], canyon_jackal: ['峡谷绒', '豺纹皮'], ironfeather_vulture: ['铁羽翎', '秃鹫骨'], mountain_beetle: ['山甲壳', '甲虫骨'], cliff_ram: ['峭羊绒', '岩羊皮'], stonevein_golem: ['石脉芯', '脉岩片'], ember_bat: ['火绒', '蝠骨'], mine_goblin: ['矿纹革', '矿扣骨'], fault_centipede: ['断层甲', '蜈蚣膜', '节须'], canyon_overseer: ['监工革', '峡谷骨', '矿尘发', '钉扣甲'], gruen_mountainheart: ['岩髓绒', '山心膜', '山脉骨', '心岩甲', '脉晶鳞'],
  rediron_wisp: ['赤铁灵膜', '火晶核'], moltenscorpion: ['熔壳', '蝎尾骨'], ash_lizard: ['灰烬鳞', '火蜥骨'], magnet_golem: ['磁石芯', '磁甲片'], cinder_boar: ['焦鬃', '岩猪革'], mine_hexer: ['咒矿革', '咒师骨'], furnace_beetle: ['炉甲', '火甲虫骨'], ore_raider: ['矿盗革', '弩手骨'], lava_rockbeast: ['熔岩芯', '岩兽甲', '火岩绒'], rediron_torchbearer: ['炬官革', '赤铁骨', '炬穗', '火纹甲'], valk_forge_overseer: ['炉灰绒', '熔炉膜', '监工骨', '瓦尔克甲', '赤铁鳞'],
  mistalgae_mass: ['雾藻膜', '藻核'], marsh_crocodile: ['沼鳞', '泽鳄骨'], bog_midge: ['毒翼壳', '雾膜'], reed_walker: ['苇骨', '尸甲'], watermirror_siren: ['水镜膜', '镜湖核'], blackfeather_stork: ['黑羽翎', '鹳骨'], bogfire_wisp: ['沼火膜', '鬼灯核'], mudarmor_rhino: ['泥甲绒', '犀纹皮'], rottedroot_python: ['腐根鳞', '蟒骨', '藤鬃'], reed_shaman: ['芦荡膜', '巫灵核', '苇冠', '巫纹甲'], threehead_mother: ['蛇母绒', '雾沼膜', '三首骨', '蛇冠甲', '雾首鳞'],
  starmud_slime: ['星泥胶', '星泥核'], crater_toad: ['陨泥囊', '坑蟾骨'], darkbog_snake: ['暗沼鳞', '水蛇骨'], fallenstar_murloc: ['沉星鳞', '鱼人骨'], mud_parasite: ['泥星甲', '寄生膜'], faceless_bogspirit: ['无面膜', '沼灵核'], meteor_carapace: ['坠星甲', '星兽骨'], lost_lamplighter: ['灯使革', '迷航骨'], crater_eel: ['陨潭鳞', '鳗骨', '电须'], fallenstar_warden: ['沉星革', '看守骨', '星尘发', '陨铁甲'], fallingstar_mudid: ['星泥绒', '坠泥膜', '星偶核', '陨壳甲', '暮星鳞'],
  tundra_wolf: ['冻原绒', '霜狼皮'], snowplush_bear: ['雪绒', '熊纹皮'], ice_spike_sprite: ['冰棱膜', '寒晶核'], coldpine_ent: ['松露膜', '寒松芯'], whiteantler_guard: ['白角绒', '鹿卫皮'], snowblind_eagle: ['雪盲翎', '鹰骨'], icelake_spirit: ['冰湖膜', '水灵核'], frostarmored_rider: ['霜骑骨', '冻甲片'], permafrost_giant: ['冻土芯', '巨岩片', '霜苔'], snowline_hunter: ['雪线革', '猎官骨', '雪狐领', '猎纹甲'], frostking_whiteantler: ['霜王绒', '王鹿皮', '霜角骨', '冰冠甲', '雪线鳞'],
  thunderhawk: ['雷翎', '隼骨'], cliff_ram_thunder: ['雷羊绒', '雷纹皮'], storm_gargoyle: ['风暴芯', '石像片'], cloudsplit_bat: ['裂云绒', '蝠翼骨'], thundercopper_golem: ['雷铜芯', '铜甲片'], bridge_raider: ['桥盗革', '掠手骨'], windblade_elemental: ['风刃膜', '风核'], storm_priest: ['雷祭膜', '祭司核'], clifftop_lizard: ['崖雷鳞', '雷蜥骨', '电鬃'], cliff_arbiter: ['裁断革', '断崖骨', '裁官发', '断纹甲'], askr_stormroc: ['风暴翎', '雷羽膜', '巨隼骨', '风暴甲', '裂云鳞'],
  moon_dust_wraith: ['月尘膜', '幽魂核'], ruin_stoneguard: ['石卫革', '遗石骨'], solar_eclipse_priest: ['日蚀膜', '圣辉核'], lunar_eclipse_assassin: ['月影革', '刺客骨'], starchart_doll: ['星图芯', '魔偶片'], well_wraith: ['古井膜', '怨灵核'], lost_inquisitor: ['审判革', '律令骨'], broken_armillary: ['天仪芯', '轮环片'], moonwheel_tombbeast: ['月轮革', '墓兽骨', '守墓鬃'], keykeeper_ruin: ['执钥革', '匙纹骨', '钥链发', '锁纹甲'], seles_eclipse_watcher: ['月尘绒', '蚀月革', '守望骨', '遗迹甲', '月轮鳞'],
  ball_rabbit: ['弹绒', '兔韧皮'], spike_boar: ['刺鬃', '猪革'], vine_snake: ['藤鳞', '木蛇骨'], black_bear: ['乌熊绒', '熊掌皮'], mist_wolf: ['雾狼绒', '雾纹皮'], roll_rabbit: ['卷绒', '滚兔皮', '弹兔骨'], tusk_boar: ['獠鬃', '獠猪革', '獠骨'], vine_python: ['青藤鳞', '藤蚺骨', '藤蚺鬃'], pitch_bear: ['漆毛', '黑熊革', '漆熊骨'], shadow_wolf: ['影狼绒', '暗纹皮', '影牙骨'], goblin: ['菌染革', '哥布林骨', '林下发', '菌壳甲'], tree_ent: ['树心皮', '灵木芯', '树冠绒', '树瘤甲'], forest_slime: ['森絮', '森凝胶', '森灵核', '森甲片', '苔鳞'], shadow_wolf_king: ['月影狼绒', '狼王革', '王牙骨', '影铁甲', '暗月鳞'],
  dungeon_raider: ['遗甲革', '劫掠骨', '掠影发', '遗兵甲'], dungeon_wisp: ['幽辉膜', '灵火核', '微光绒', '灵壳'], dungeon_stalker: ['暗猎革', '影骨', '影鬃', '影猎甲'], dungeon_guardian: ['迷宫革', '守卫芯', '卫盔缨', '石门甲'], dungeon_warden: ['镇守绒', '地城膜', '镇守骨', '迷宫甲', '幽邃鳞'],
  slime_red: ['红焰胶', '赤热核'], slime_orange: ['橙砂胶', '暖砂核'], slime_yellow: ['雷浆胶', '辉电核'], slime_green: ['苔蚀胶', '腐蚀核'], slime_cyan: ['青潮胶', '冷潮核'], slime_blue: ['霜蓝胶', '冰雾核'], slime_purple: ['紫暮胶', '幽紫核'], black_slime: ['黑絮', '黑渊胶', '暗渊核', '夜幕甲', '渊影鳞'], skeleton: ['骨刃', '旧甲片', '墓尘'], undead: ['亡灵膜', '魂火核', '幽发'], skeleton_warrior: ['战骨', '残甲', '铁盔缨', '尸衣革'], death_wight: ['苍魂膜', '死灵核', '残魂绒', '冥壳'], skeleton_general: ['将军绒', '冥军膜', '将军骨', '军甲', '军旗鳞'], death_knight: ['冥骑鬃', '骑士革', '骑士骨', '黑铁甲', '夜马鳞'], necromancer_uz: ['乌兹绒', '乌兹魂膜', '冥火核', '骸骨甲', '咒纹鳞'],
  goblin_vanguard: ['先锋革', '角哨骨', '先锋披缨'], goblin_warrior: ['战纹革', '锯刃骨', '战士鬃'], goblin_archer: ['弓弦革', '箭羽骨', '箭羽束'], goblin_bomber: ['爆罐革', '火药骨', '爆绒'], goblin_daredevil: ['血冲革', '敢死骨', '血鬃'], goblin_drummer: ['鼓面革', '战鼓骨', '鼓槌绒'], goblin_shieldbearer: ['盾卫革', '菌壳骨', '盾缨'], goblin_trapper: ['网罗革', '陷阱骨', '网绳束'], goblin_priest: ['祭苔膜', '祷骨', '祭冠', '苔甲'], goblin_mage: ['暗焰膜', '法师核', '星火发', '术式甲'], goblin_assassin: ['潜影革', '匕痕骨', '暗发', '隐鳞甲'], goblin_earthshaper: ['岩行革', '土印骨', '尘发', '岩纹甲'], goblin_colonel: ['校官革', '军徽骨', '将旗穗', '领军甲'], goblin_king: ['王鬃', '王冠革', '王令骨', '王冠甲', '雷旗鳞'], habadragon: ['龙鬃', '龙革', '哈巴龙骨', '铁尾甲', '王载鳞'], goblin_royal_guard: ['王庭革', '盾卫骨', '卫缨', '王庭甲'], goblin_royal_spearman: ['雷矛革', '电纹骨', '雷穗', '矛甲']
};

/** 根据阶级决定部位素材数；基础两种优先贴合身体构造，额外部位补齐其余材质。 */
export const monsterCraftMaterialKinds = (name: string, monsterClass?: string): readonly MonsterCraftMaterialKind[] => {
  const count = monsterClass === 'boss' ? 5 : monsterClass === 'elite' ? 4 : monsterClass === 'large' ? 3 : 2;
  const primary: readonly [MonsterCraftMaterialKind, MonsterCraftMaterialKind] = /蛇|蚺|蟒|蜥|龙|鳄|鳗|鲨|鱼人|蛟/.test(name) ? ['scale', 'bone']
    : /蟹|龟|海胆|甲虫|蝎|甲兽|甲壳/.test(name) ? ['shell', 'bone']
      : /傀儡|石像|魔偶|天仪|岩兽|巨人|骨|行尸|亡灵|骑士/.test(name) ? ['bone', 'shell']
        : /史莱姆|水母|藻团|星泥|泥偶|灵|鬼|幽魂|精|元素|巫医|祭司|法师/.test(name) ? ['gel_skin', 'bone']
          : /蜂|蜉蝣|虫/.test(name) ? ['shell', 'gel_skin']
            : /鸟|隼|鹰|鹭|鹳|鹫|鸥|蝠/.test(name) ? ['hair', 'bone']
              : /蛙|蟾/.test(name) ? ['gel_skin', 'bone']
                : /兔|鼠|鹿|羊|狼|熊|狗|犬|狐|豺|猪|犀|獭|白角/.test(name) ? ['hair', 'gel_skin']
                  : ['gel_skin', 'bone'];
  const allKinds: MonsterCraftMaterialKind[] = ['hair', 'gel_skin', 'bone', 'shell', 'scale'];
  return [...primary, ...allKinds.filter(kind => !primary.includes(kind))].slice(0, count);
};
/** 兼容单类调用，返回该怪最主要的基础怪材。 */
export const monsterCraftMaterialKind = (name: string) => monsterCraftMaterialKinds(name)[0];
export const monsterCraftMaterialCode = (monsterCode: string, kind: MonsterCraftMaterialKind) => `monster_${monsterCode}_${kind}`;
export const beastCoreCode = () => 'beast_core';
export const beastCoreName = () => '兽核';
export const meatChunkCode = () => 'meat_chunk';
export const meatChunkName = () => '新鲜肉块';
/** 仅自然动物与水产类怪物可额外产出肉块，亡灵、构装体、元素生物等不产出。 */
export const monsterDropsMeat = (name: string) => /兔|鼠|鹿|羊|狼|熊|狗|犬|狐|豺|猪|犀|獭|白角|蛙|蟾|蛇|蚺|蟒|蜥|龙|鳄|鳗|鲨|鱼人|蛟|鸟|隼|鹰|鹭|鹳|鹫|鸥|蟹|龟/.test(name);
export const meatChunkQuantity = (monsterClass: 'normal' | 'large' | 'elite' | 'boss') => monsterClass === 'normal' ? 1 : monsterClass === 'large' ? 2 : 3;
export const monsterCraftMaterialName = (monsterCode: string, monsterName: string, kind: MonsterCraftMaterialKind, materialIndex: number) => {
  const named = uniqueMonsterMaterialNames[monsterCode]?.[materialIndex];
  if (named) return named;
  const stem = uniqueMonsterMaterialNames[monsterCode]?.[0]?.replace(/绒|鬃|翎|毛|革|皮|膜|胶|壳|甲|片|鳞|骨|核|芯|囊$/u, '') || monsterName.replace(/[·・].*$/u, '');
  const conciseSuffix: Record<MonsterCraftMaterialKind, string> = { hair: '绒', gel_skin: '革', bone: '骨', shell: '甲', scale: '鳞' };
  if (materialIndex >= 2) return `${stem}${conciseSuffix[kind]}`;
  const magical = /史莱姆|水母|藻团|星泥|泥偶|灵|鬼|幽魂|精|元素/.test(monsterName);
  const shelled = /蟹|龟|海胆|甲虫|蝎|甲兽|甲壳/.test(monsterName);
  const construct = /傀儡|石像|魔偶|天仪|岩兽|巨人|骨|行尸|亡灵|骑士/.test(monsterName);
  const suffix = kind === 'hair' && /鸟|隼|鹰|鹭|鹳|鹫|鸥/.test(monsterName) ? '羽'
    : kind === 'hair' && /蜂|蜉蝣|蝠/.test(monsterName) ? '绒'
      : kind === 'gel_skin' && magical ? '凝胶'
        : kind === 'bone' && magical ? '核石'
          : kind === 'bone' && shelled ? '壳架'
            : kind === 'shell' && construct ? '甲片'
              : kindMeta[kind].basicSuffix;
  return `${monsterName}${suffix}`;
};
export const purifiedCraftMaterialCode = (kind: MonsterCraftMaterialKind, level = 1) => {
  const tier = purifiedCraftMaterialTierForLevel(level);
  return `${kindMeta[kind].refinedCode}${tier === 1 ? '' : `_t${tier}`}`;
};
export const purifiedCraftMaterialTierForCode = (code: string) => {
  const match = code.match(/_t([1-5])$/);
  return Math.max(1, Number(match?.[1] ?? 1));
};
const purifiedCraftMaterialKindForCode = (code: string) => (Object.entries(kindMeta).find(([, meta]) => code === meta.refinedCode || code.startsWith(`${meta.refinedCode}_t`))?.[0] ?? undefined) as MonsterCraftMaterialKind | undefined;
export const purifiedCraftMaterialBaseCode = (code: string) => {
  const kind = purifiedCraftMaterialKindForCode(code);
  return kind ? kindMeta[kind].refinedCode : undefined;
};
export const purifiedCraftMaterialName = (kind: MonsterCraftMaterialKind, level = 1) => {
  const tier = purifiedCraftMaterialTierForLevel(level);
  return kindMeta[kind].refinedNames[tier - 1]!;
};
export const purifiedCraftMaterialDisplayName = (code: string) => {
  const kind = purifiedCraftMaterialKindForCode(code);
  return kind ? purifiedCraftMaterialName(kind, purifiedCraftMaterialTierForCode(code) * 20) : undefined;
};
export const purifiedMaterialForArmor = (armorType: string, equipmentLevel = 1) => {
  const kind = (Object.entries(kindMeta).find(([, meta]) => meta.armorType === armorType)?.[0] ?? 'gel_skin') as MonsterCraftMaterialKind;
  return purifiedCraftMaterialCode(kind, equipmentLevel);
};
export const purifiedCraftMaterialValue = (code: string) => {
  const kind = purifiedCraftMaterialKindForCode(code);
  return kind ? purifiedTierTwoValues[kind] * Math.pow(2, purifiedCraftMaterialTierForCode(code) - 2) : 0;
};
export const purifiedCraftOutputFor = (code: string, sourceLevel = 1) => {
  const match = code.match(/^(?:monster_.+|map_.+)_(hair|gel_skin|bone|shell|scale)(?:_l\d+)?$/);
  return match ? purifiedCraftMaterialCode(match[1] as MonsterCraftMaterialKind, sourceLevel) : undefined;
};
/** 怪材不随怪物生成等级分档；同种怪物始终掉落同一部位材料。 */
export const resolvedMonsterMaterialDropCode = (drop: Record<string, unknown>, _monsterLevel: number) => {
  const kind = String(drop.material_kind ?? '') as MonsterCraftMaterialKind;
  if (['hair', 'gel_skin', 'bone', 'shell', 'scale'].includes(kind) && typeof drop.material_monster === 'string') return monsterCraftMaterialCode(drop.material_monster, kind);
  if (drop.dynamic_material === 'beast_core') return beastCoreCode();
  if (drop.dynamic_material === 'meat_chunk') return meatChunkCode();
  return String(drop.code ?? '');
};
export const allPurifiedCraftMaterials = () => (['hair', 'gel_skin', 'bone', 'shell', 'scale'] as MonsterCraftMaterialKind[]).flatMap(kind => kindMeta[kind].refinedNames.map((_name, index) => {
  const tier = index + 1;
  return {
    code: purifiedCraftMaterialCode(kind, tier * 20), name: purifiedCraftMaterialName(kind, tier * 20), tradePrice: purifiedCraftMaterialValue(purifiedCraftMaterialCode(kind, tier * 20)),
    description: `${kindMeta[kind].materialClass}类通用锻材，由 Lv.${(tier - 1) * 20 + 1}–${tier * 20} 怪物的${kindMeta[kind].basicSuffix}类材料提纯而成，适用于${kindMeta[kind].armorType}。`
  };
}));
export const allBeastCoreMaterials = () => [{ code: beastCoreCode(), name: beastCoreName(), description: '蕴含野性魔力的兽核，可用作基础怪物素材。' }];
export const allMeatChunkMaterials = () => [{ code: meatChunkCode(), name: meatChunkName(), description: '来自可食用怪物的新鲜肉块，可作为食材使用。' }];
