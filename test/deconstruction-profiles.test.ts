import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deconstructionBlockReason,
  deconstructionPreviewFor,
  deconstructionPreviewText,
  deconstructionProfileFor,
  particleCodes,
  particleNames,
  rareParticleChance,
  rollDeconstructionProfile,
  type DeconstructionItem
} from '../src/game/deconstruction-profiles';
import { constructionRecipes, constructionValueByCode } from '../src/game/deconstructor-catalog';
import { worldSurfaceMonsters } from '../src/config/world-surface';
import { monsterCraftMaterialCode, monsterCraftMaterialKinds, monsterCraftMaterialName } from '../src/game/monster-crafting-material.service';

const EPSILON = 1e-12;
const ordinaryElements = new Set([
  'wood_element_dust', 'metal_element_dust', 'water_element_dust', 'ice_element_dust',
  'fire_element_dust', 'thunder_element_dust', 'wind_element_dust'
]);

const material = (overrides: Partial<DeconstructionItem> = {}): DeconstructionItem => ({
  code: 'arbitrary_crystal',
  name: '未知晶块',
  description: '一种尚未归类的普通生产材料。',
  item_category: '素材',
  item_type: 'material',
  trade_price: 100,
  ...overrides
});

const requireProfile = (item: DeconstructionItem) => {
  const profile = deconstructionProfileFor(item);
  assert.ok(profile, `${item.code} 应当具有分解规则`);
  return profile;
};

const assertPreviewCoversRoll = (item: DeconstructionItem) => {
  const profile = requireProfile(item);
  const preview = deconstructionPreviewFor(profile, 1);
  const previewByCode = new Map(preview.map(output => [output.code, output]));
  const rolled = rollDeconstructionProfile(profile, 1, () => 0);
  assert.ok(preview.length > 0, `${item.code} 的分解预览不应为空`);
  assert.ok(rolled.size > 0, `${item.code} 在最低随机值下应有实际产出`);
  for (const [code, quantity] of rolled) {
    const output = previewByCode.get(code);
    assert.ok(output, `${item.code} 实际产出了预览中不存在的 ${code}`);
    assert.ok(Number.isInteger(quantity) && quantity > 0);
    assert.ok(quantity <= output.max, `${code} 的实际产出 ${quantity} 超过预览上限 ${output.max}`);
  }
};

const monsterMaterial = (name: string, kind = 'hair', monsterClass = 'normal', level = 1) => material({
  code: `monster_test_${kind}_${name}`,
  name,
  trade_price: 0,
  effect_json: {
    monster_craft_material: kind,
    material_monster_class: monsterClass,
    material_monster_level: level
  }
});

test('土元素沿用内部 metal code，所有玩家预览都不出现“金元素”', () => {
  assert.equal(particleNames.metal_element_dust, '土元素微尘');
  const profile = requireProfile(material({
    code: 'heavy_ore_chunk',
    name: '厚重岩矿',
    description: '沉重而坚硬的矿石材料。',
    trade_price: 500
  }));
  const text = deconstructionPreviewText(profile);
  assert.doesNotMatch(text, /金元素/);
  assert.match(text, /均值约/u);
});

test('光暗稀有概率同时受候选值、普通元素概率和 15% 上限约束', () => {
  const cases = [
    { candidate: .4, ordinary: .8, expected: .1 },
    { candidate: 1, ordinary: .8, expected: .15 },
    { candidate: 1, ordinary: .2, expected: .05 },
    { candidate: 0, ordinary: .8, expected: 0 }
  ];
  for (const current of cases) {
    const actual = rareParticleChance(current.candidate, current.ordinary);
    assert.ok(Math.abs(actual - current.expected) <= EPSILON);
    assert.ok(actual <= current.candidate * .25 + EPSILON);
    assert.ok(actual <= current.ordinary * .25 + EPSILON);
    assert.ok(actual <= .15 + EPSILON);
    if (current.ordinary > 0) assert.ok(actual < current.ordinary);
  }
});

test('全部旧光暗来源和新增代表来源均为零保底、单种至多 15%', () => {
  const sources = [
    material({ code: 'healing_herb', name: '微光草药', item_type: 'consumable', item_category: '药剂', trade_price: 2 }),
    material({ code: 'sky_dust', name: '天空粉尘', item_category: '特殊', trade_price: 0 }),
    material({ code: 'moon_silver', name: '月银', trade_price: 0 }),
    material({ code: 'sun_gold', name: '曜金', trade_price: 0 }),
    material({ code: 'star_mud_core', name: '星泥核心', trade_price: 0 }),
    material({ code: 'eclipse_core', name: '月蚀核心', trade_price: 0 }),
    material({ code: 'purple_slime_gel', name: '紫色凝胶', trade_price: 3 }),
    material({ code: 'black_slime_gel', name: '黑色凝胶', trade_price: 3 }),
    material({ code: 'magic_eye', name: '魔瞳晶核', trade_price: 0 }),
    material({ code: 'goblin_shadowcloth', name: '暗幕布', trade_price: 0 }),
    material({ code: 'goblin_totem_shard', name: '沼影图腾片', trade_price: 0 }),
    material({ code: 'duskvein_crystal', name: '幽纹黑晶', trade_price: 0 }),
    material({ code: 'crown_hunt_seal', name: '王冠狩印', trade_price: 0 }),
    material({ code: 'pure_dark_crystal', name: '纯暗晶', trade_price: 100 }),
    monsterMaterial('浮灯胶', 'gel_skin'),
    monsterMaterial('沼火膜', 'gel_skin')
  ];
  for (const source of sources) {
    const preview = deconstructionPreviewFor(requireProfile(source), 1.5);
    const rare = preview.filter(output => output.rare);
    assert.ok(rare.length > 0, `${source.code} 应包含光或暗产物`);
    const ordinaryChances = preview
      .filter(output => ordinaryElements.has(output.code))
      .map(output => Math.min(1, output.expected));
    for (const output of rare) {
      assert.equal(output.min, 0);
      assert.equal(output.max, 1);
      assert.ok(output.expected <= .15 + EPSILON, `${source.code}/${output.code} 超过 15%`);
      if (ordinaryChances.length) {
        assert.ok(output.expected <= Math.min(...ordinaryChances) * .25 + EPSILON, `${source.code}/${output.code} 未低于普通元素`);
      }
    }
  }
});

test('六类代表材料的实际产出均受同一份预览规则约束', () => {
  const representatives = [
    material({ code: 'beast_meat', name: '兽肉', trade_price: 3 }),
    material({ code: 'magic_wool', name: '魔力绒毛', trade_price: 12 }),
    material({ code: 'moon_silver', name: '月银', trade_price: 400 }),
    material({ code: 'purple_slime_gel', name: '紫色凝胶', trade_price: 3 }),
    monsterMaterial('苜蓿绒'),
    material({ code: 'arbitrary_crystal', name: '未知晶块', trade_price: 100 })
  ];
  for (const item of representatives) assertPreviewCoversRoll(item);
});

test('旧提纯兽材逐 code 固化，不因描述中的“幽影”误出暗元素', () => {
  const codes = [
    'refined_beast_bone', 'refined_beast_hide', 'refined_beast_tendon', 'refined_beast_core',
    'refined_magic_wool', 'refined_magic_tusk', 'refined_magic_scale', 'refined_magic_claw', 'refined_magic_heartcore'
  ];
  for (const code of codes) {
    const profile = requireProfile(material({ code, name: code, description: '提纯后的材料，仍有幽影般的魔力回响。', trade_price: 0 }));
    assert.ok(!deconstructionPreviewFor(profile).some(output => output.code === 'dark_element_dust'), `${code} 不应由描述猜出暗元素`);
  }
});

test('动态怪材覆盖表体现已确认的名称性质', () => {
  const expectedCodes = new Map([
    ['藤心木', ['wood_element_dust', 'energy_ember']],
    ['浮灯胶', ['water_element_dust', 'light_element_dust', 'energy_ember']],
    ['风铃翎', ['wind_element_dust', 'blood_residue', 'energy_ember']],
    ['砾岩芯', ['metal_element_dust', 'energy_ember']],
    ['赤铁灵膜', ['fire_element_dust', 'metal_element_dust', 'energy_ember']],
    ['磁石芯', ['metal_element_dust', 'thunder_element_dust', 'energy_ember']],
    ['雾藻膜', ['wood_element_dust', 'water_element_dust', 'energy_ember']],
    ['沼火膜', ['dark_element_dust', 'fire_element_dust', 'energy_ember']]
  ] as const);
  for (const [name, codes] of expectedCodes) {
    const actual = new Set(deconstructionPreviewFor(requireProfile(monsterMaterial(name))).map(output => output.code));
    assert.deepEqual(actual, new Set(codes), name);
  }
});
test('当前世界生态的280种动态怪材逐code通过档案与光暗上限审计', () => {
  const auditedCodes = new Set<string>();
  for (const monster of worldSurfaceMonsters) {
    const kinds = monsterCraftMaterialKinds(monster.name, monster.monsterClass);
    for (const [materialIndex, kind] of kinds.entries()) {
      const code = monsterCraftMaterialCode(monster.code, kind);
      const name = monsterCraftMaterialName(monster.code, monster.name, kind, materialIndex);
      auditedCodes.add(code);
      const profile = requireProfile(material({
        code, name, description: `${monster.name}独有的部位怪材，可由炼金师提纯为通用甲材。`,
        item_category: '怪材', trade_price: 0,
        effect_json: { monster_craft_material: kind, material_monster: monster.code, material_monster_class: monster.monsterClass, material_monster_level: monster.level }
      }));
      for (const bonusMultiplier of [1, 1.5]) {
        const preview = deconstructionPreviewFor(profile, bonusMultiplier);
        const ordinaryChances = preview.filter(output => ordinaryElements.has(output.code)).map(output => Math.min(1, output.expected));
        for (const output of preview.filter(candidate => candidate.rare)) {
          assert.equal(output.min, 0, `${code}/${output.code} 不应有保底`);
          assert.equal(output.max, 1, `${code}/${output.code} 每件至多1粒`);
          assert.ok(output.expected <= .15 + EPSILON, `${code}/${output.code} 超过15%`);
          if (ordinaryChances.length) assert.ok(output.expected <= Math.min(...ordinaryChances) * .25 + EPSILON, `${code}/${output.code} 未低于普通元素`);
        }
      }
    }
  }
  assert.equal(worldSurfaceMonsters.length, 110, '怪物目录变化时必须重新审核动态怪材');
  assert.equal(auditedCodes.size, 280, '动态怪材目录变化时必须重新审核规则');
});

test('25 种现代提纯锻材与已审计静态材料都有规则', () => {
  const bases = ['spellcloth_bolt', 'tanned_spirit_leather', 'bone_steel_plate', 'cast_shell_plate', 'laminated_scale_plate'];
  for (const base of bases) for (let tier = 1; tier <= 5; tier += 1) {
    const code = tier === 1 ? base : `${base}_t${tier}`;
    requireProfile(material({ code, name: code, trade_price: 0 }));
  }
  const staticCodes = [
    'beast_meat', 'beast_hide', 'beast_bone', 'beast_tendon',
    'magic_wool', 'magic_tusk', 'magic_scale', 'magic_claw', 'magic_heartcore',
    'living_wood', 'meteor_iron', 'star_copper', 'moon_silver', 'sun_gold', 'root_heart', 'river_shell', 'tide_shell',
    'ridge_core', 'fire_crystal', 'marsh_heart', 'star_mud_core', 'frost_crystal', 'thunder_core', 'eclipse_core',
    'red_slime_gel', 'orange_slime_gel', 'yellow_slime_gel', 'green_slime_gel', 'cyan_slime_gel', 'blue_slime_gel', 'purple_slime_gel', 'black_slime_gel',
    'wolf_fang', 'beast_core', 'meat_chunk', 'slime_gel', 'goblin_ear', 'magic_blood', 'magic_eye', 'magic_horn',
    'herbal_extract', 'mana_dust', 'magic_branch', 'goblin_scrap_iron', 'goblin_whetstone', 'goblin_bowstring',
    'goblin_blast_core', 'goblin_drumhide', 'goblin_shadowcloth', 'goblin_totem_shard', 'goblin_earth_crystal',
    'goblin_command_seal', 'goblin_colonel_insignia', 'duskvein_crystal', 'riot_aura', 'sky_dust',
    'mountainheart_seal', 'forge_warden_brand', 'threehead_molt_sigel', 'crown_hunt_seal',
    'home_wood', 'home_stone', 'home_metal'
  ];
  for (const code of staticCodes) requireProfile(material({ code, name: code, trade_price: 0 }));
});

test('方案中的代表材料期望值按固定估值和曲线计算', () => {
  const expectedFor = (item: DeconstructionItem, code: string) => {
    const output = deconstructionPreviewFor(requireProfile(item), 1).find(candidate => candidate.code === code);
    assert.ok(output, `${item.code} 缺少 ${code}`);
    return output.expected;
  };
  const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  closeTo(expectedFor(material({ code: 'wolf_fang', trade_price: 0 }), 'blood_residue'), .18);
  closeTo(expectedFor(material({ code: 'wolf_fang', trade_price: 0 }), 'energy_ember'), .42);
  closeTo(expectedFor(material({ code: 'beast_core', trade_price: 0 }), 'energy_ember'), 1.575);
  closeTo(expectedFor(material({ code: 'beast_core', trade_price: 0 }), 'magic_unit'), .21);
  closeTo(expectedFor(material({ code: 'healing_herb', item_type: 'consumable', item_category: '药剂', trade_price: 0 }), 'wood_element_dust'), .16);
  closeTo(expectedFor(material({ code: 'healing_herb', item_type: 'consumable', item_category: '药剂', trade_price: 0 }), 'light_element_dust'), .006);
  closeTo(expectedFor(material({ code: 'goblin_scrap_iron', trade_price: 0 }), 'metal_element_dust'), 4.6 / 3);
  closeTo(expectedFor(material({ code: 'goblin_shadowcloth', trade_price: 0 }), 'dark_element_dust'), (5.75 * .2 / 3) * .25);
  const sky = material({ code: 'sky_dust', item_category: '特殊', trade_price: 0 });
  closeTo(expectedFor(sky, 'wind_element_dust'), 2.45);
  closeTo(expectedFor(sky, 'light_element_dust'), .105);
  closeTo(expectedFor(sky, 'magic_unit'), .105);
});
test('同性质通用材料价值越高总期望越高，零价未知材料不会猜价', () => {
  const base = material({ code: 'unknown_future_material', name: '未知素材', description: '没有元素倾向的普通材料。' });
  const low = deconstructionPreviewFor(requireProfile({ ...base, trade_price: 10 })).reduce((sum, output) => sum + output.expected, 0);
  const high = deconstructionPreviewFor(requireProfile({ ...base, trade_price: 10_000 })).reduce((sum, output) => sum + output.expected, 0);
  assert.ok(high > low);
  assert.equal(deconstructionProfileFor({ ...base, trade_price: 0, rarity: '神器' }), null);
  const unreviewedCategory = { ...base, item_category: '纪念品', trade_price: 100 };
  assert.equal(deconstructionProfileFor(unreviewedCategory), null);
  assert.match(deconstructionBlockReason(unreviewedCategory) ?? '', /未纳入/u);
  for (const item_category of ['基材', '构件']) {
    const untrackedConstructed = { ...base, code: `unknown_${item_category}`, item_category, trade_price: 100 };
    assert.equal(deconstructionProfileFor(untrackedConstructed), null, `${item_category}不能绕过成本账本`);
    assert.match(deconstructionBlockReason(untrackedConstructed) ?? '', /成本账本/u);
  }
});

test('粒子、货币、成长资源、特殊卡片和人工成品均不可分解', () => {
  for (const code of particleCodes) assert.equal(deconstructionProfileFor(material({ code, name: particleNames[code] })), null);
  const excluded = [
    material({ code: 'coin', item_category: '货币' }),
    material({ code: 'order_fragment', item_category: '神材', effect_json: { artifactMaterial: 'order_fragment' } }),
    material({ code: 'world_mark', item_category: '世界印记' }),
    material({ code: 'monster_card', item_category: '怪物卡片', effect_json: { monsterCard: true } }),
    material({ code: 'evolution_new', effect_json: { evolutionMaterial: true } }),
    material({ code: 'automaton_product', effect_json: { automatonProduct: true } }),
    material({ code: 'test_sword', item_type: 'equipment', item_category: '武器' })
  ];
  for (const item of excluded) {
    assert.equal(deconstructionProfileFor(item), null, item.code);
    assert.ok(deconstructionBlockReason(item), `${item.code} 应显示禁止原因`);
  }
  assert.match(deconstructionBlockReason(excluded[0]!) ?? '', /货币/u);
  assert.match(deconstructionBlockReason(excluded[3]!) ?? '', /怪物卡片/u);
  const herb = material({ code: 'healing_herb', item_type: 'consumable', item_category: '药剂', trade_price: 2 });
  assert.ok(deconstructionProfileFor(herb));
  assert.equal(deconstructionBlockReason(herb), null);
  assert.ok(deconstructionProfileFor(material({ code: 'sky_dust', item_category: '特殊', trade_price: 0 })));
});

test('构造目录包含全部 12 基材与 21 构件，并具有正估值', () => {
  const materialRecipes = constructionRecipes.filter(recipe => recipe.outputType === 'material');
  assert.equal(materialRecipes.filter(recipe => recipe.constructionCategory === '基材').length, 12);
  assert.equal(materialRecipes.filter(recipe => recipe.constructionCategory === '构件').length, 21);
  assert.equal(new Set(materialRecipes.map(recipe => recipe.code)).size, 33);
  for (const recipe of materialRecipes) assert.ok((constructionValueByCode.get(recipe.code) ?? 0) > 0, recipe.code);
});