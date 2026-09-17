import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  cardEnchantFee,
  monsterCards,
  pursuitRank,
  sourceBossMonsterCards
} from '../src/config/monster-cards';
import {
  calculateMonsterCardProbability,
  decideMonsterCardRoll,
  monsterCardCandidatesForTarget,
  type MonsterCardEligibleMember,
  type MonsterCardRollTarget
} from '../src/game/monster-card-drop.service';
import { activeHealingMultiplier, aggregateEnchantmentEffects, applyCardIncomingDamageReduction, cardElementDamageMultiplier } from '../src/game/equipment-enchantment-effects';
import {
  correctedCritChance,
  resolvedHitChance,
  strikeCorrections
} from '../src/game/combat-math';
import {
  CombatRules,
  emptyRuleState,
  type RuleUnit
} from '../src/game/combat-rule-registry';
import { hasNativeAttackElement, resolveDirectAttackElement } from '../src/game/combat-element';

const almostEqual = (actual: number, expected: number, epsilon = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to equal ${expected}`);
};

const member = (characterId: number, luck = 0, dropBonus = 0): MonsterCardEligibleMember => ({
  characterId,
  name: `玩家${characterId}`,
  luck,
  dropBonus
});

const target = (
  monsterCode: string,
  traits: unknown = [],
  defeated = true
): MonsterCardRollTarget => ({ spawnId: 101, monsterCode, traits, defeated });

test('卡片注册表固定为188张、code唯一，来源策略数量完整', () => {
  assert.equal(monsterCards.length, 188);
  assert.equal(new Set(monsterCards.map(card => card.cardCode)).size, 188);
  assert.deepEqual(
    Object.fromEntries(['kill', 'source_boss', 'city_pursuit'].map(policy => [
      policy,
      monsterCards.filter(card => card.sourcePolicy === policy).length
    ])),
    { kill: 159, source_boss: 8, city_pursuit: 21 }
  );
});

test('普通、大怪、精英、BOSS基础掉率分别为3%、2%、1%、0.5%', () => {
  const expected = { normal: .03, large: .02, elite: .01, boss: .005 } as const;
  for (const card of monsterCards) assert.equal(card.baseDropRate, expected[card.tier], card.cardCode);
  for (const tier of Object.keys(expected)) {
    assert.ok(monsterCards.some(card => card.tier === tier), `${tier}应至少有一张卡片`);
  }
});

test('卡片初始化可重复执行，并完整开放堆叠、图鉴与玩家交易闭环', () => {
  const source = readFileSync('src/database/monster-cards.ts', 'utf8');
  assert.match(source, /CREATE TABLE IF NOT EXISTS equipment_enchantments/);
  assert.match(source, /ON DUPLICATE KEY UPDATE[\s\S]*?trade_price=1[\s\S]*?stack_limit=999[\s\S]*?is_tradeable=1/);
  assert.match(source, /referencePrice:\s*cardEnchantFee\(card\)/);
  assert.match(source, /noNpcSale:\s*true/);
  assert.match(readFileSync('src/response/inventory.ts', 'utf8'), /材料:\s*\[[^\]]*'怪物卡片'/);
  assert.match(readFileSync('src/game/codex.service.ts', 'utf8'), /label:\s*'卡片',\s*value:\s*'怪物卡片'/);
  const market = readFileSync('src/game/market.service.ts', 'utf8');
  assert.match(market, /i\.is_tradeable=1 AND i\.stackable=1 AND i\.trade_price>0/);
  assert.equal(market.match(/JSON_EXTRACT\(i\.effect_json,'\$\.referencePrice'\)/g)?.length, 3);
  assert.match(market, /SELECT JSON_EXTRACT\(effect_json,'\$\.referencePrice'\) reference_price/);
  assert.match(market, /grantInventory\(connection, number\(buy\.character_id\), number\(buy\.item_id\), \{unbound:0,personal:0,trade:quantity\}\)/);
  for (const card of monsterCards) assert.ok(cardEnchantFee(card) > 0, card.cardCode);
});

test('数据库启动链路在依赖表与绑定迁移之后初始化全部卡片表', () => {
  const bootstrap = readFileSync('src/database/bootstrap.ts', 'utf8');
  const pool = readFileSync('src/database/pool.ts', 'utf8');
  const schema = readFileSync('src/database/monster-cards.ts', 'utf8');
  assert.ok(bootstrap.indexOf('CREATE TABLE IF NOT EXISTS player_item_instances') < bootstrap.indexOf("import('./monster-cards')"));
  assert.ok(bootstrap.indexOf("import('./inventory-binding')") < bootstrap.indexOf("import('./monster-cards')"));
  assert.match(pool, /await initializeSchema\(pool\)/);
  for (const table of [
    'equipment_enchantments',
    'equipment_enchantment_quotes',
    'monster_card_rolls',
    'player_card_exploration_states',
    'player_monster_card_reveals'
  ]) assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  assert.match(schema, /fk_equipment_enchantment_instance[\s\S]*?player_item_instances\(id\) ON DELETE CASCADE/);
  assert.match(schema, /fk_enchantment_quote_character[\s\S]*?characters\(id\) ON DELETE CASCADE/);
});

test('铁匠铺与锻造师两套附魔命令完整注册，所有相关QQ按钮只填入命令', () => {
  const index = readFileSync('src/index.ts', 'utf8');
  const shopRoutes = readFileSync('src/secondary-shop-routes.ts', 'utf8');
  const response = readFileSync('src/response/equipment-enchantment.ts', 'utf8');
  const service = readFileSync('src/game/equipment-enchantment.service.ts', 'utf8');
  const blacksmith = readFileSync('src/response/blacksmith.ts', 'utf8');
  const middleware = readFileSync('src/middleware/secondary-shop-service.ts', 'utf8');
  for (const command of ['附魔', '附魔页', '附魔搜索', '附魔放入', '附魔卡片页', '附魔卡片搜索', '附魔预览', '确认附魔']) {
    assert.ok(index.includes(command === '附魔' ? "appGroup.use('附魔'" : `path: '${command}'`), command);
    assert.ok(shopRoutes.includes(command === '附魔' ? "group.use('店铺附魔'" : `path: '店铺${command}'`), `店铺${command}`);
  }
  assert.equal(response.match(/await requireBlacksmith\(/g)?.length, 7);
  assert.equal(service.match(/await blacksmithProgressFor\(connection, owner, true\)/g)?.length, 4);
  for (const [tier, label] of Object.entries({ normal: '普通小怪', large: '大怪', elite: '精英', boss: 'BOSS' })) {
    assert.match(response, new RegExp(`${tier}: '${label}'`));
  }
  assert.match(response, /cardTierNames\[card\.tier\]/);
  assert.doesNotMatch(response, /\$\{card\.tier\}/);
  assert.match(blacksmith, /'装备附魔','\/店铺附魔',[^\n]*autoEnter:false/);
  assert.match(blacksmith, /'装备附魔','\/附魔',[^\n]*autoEnter:false/);
  assert.match(middleware, /requireNpcAtCurrentPosition\(user,shop\)/);
  for (const source of [index, shopRoutes, response, blacksmith]) {
    assert.doesNotMatch(source, /qqbot-cmd-enter/u);
  }
  assert.doesNotMatch(response, /autoEnter\s*:\s*true/u);
});

test('卡片作为材料丢弃时复用绑定感知扣除并递增库存版本', () => {
  const inventory = readFileSync('src/game/inventory.service.ts', 'utf8');
  const binding = readFileSync('src/game/inventory-binding.ts', 'utf8');
  assert.match(inventory, /consumeInventory\(connection, Number\(character\.id\), itemId, quantity\)/);
  assert.match(binding, /trade_bound_quantity=trade_bound_quantity-\?/);
  assert.match(binding, /personal_bound_quantity=personal_bound_quantity-\?/);
  assert.match(binding, /binding_revision=binding_revision\+1/);
});

test('瓦尔克卡片只保留攻击赋火，不再提供火元素精通', () => {
  const valk = monsterCards.find(card => card.cardCode === 'monster_card_valk_forge_overseer');
  assert.ok(valk);
  assert.equal(valk.effectText, '攻击赋予火属性');
  assert.equal(valk.effects.attackElement, '火');
  assert.equal(valk.effects.attackElementAll, true);
  assert.equal(valk.effects.elementMastery_火, undefined);
  assert.equal(valk.version, 3);
  const database = readFileSync('src/database/monster-cards.ts', 'utf8');
  assert.match(database, /UPDATE equipment_enchantments[\s\S]*?card_version=\?,effect_text=\?,effects_json=\?,revision=revision\+1/);
  assert.match(database, /JSON_EXTRACT\(effects_json,'\$\."elementMastery_火"'\) IS NOT NULL/);
  assert.ok(monsterCards.every(card => !card.effectText.includes('评分')));
});

test('来源Boss独立追加召唤物卡，召唤实例自身不进行任何掉落判定', () => {
  assert.deepEqual(sourceBossMonsterCards.necromancer_uz, [
    'uzz_skeleton_berserker',
    'uzz_skeleton_archer',
    'uzz_pain_wraith',
    'uzz_skeleton_mage',
    'uzz_frost_bone_dragon'
  ]);
  assert.deepEqual(sourceBossMonsterCards.goblin_king, [
    'habadragon',
    'goblin_royal_guard',
    'goblin_royal_spearman'
  ]);

  const uzzDrops = monsterCardCandidatesForTarget(target('necromancer_uz'));
  assert.equal(uzzDrops.length, 6);
  assert.equal(uzzDrops.filter(candidate => candidate.sourceBossCode === 'necromancer_uz').length, 5);
  const goblinKingDrops = monsterCardCandidatesForTarget(target('goblin_king'));
  assert.equal(goblinKingDrops.filter(candidate => candidate.sourceBossCode === 'goblin_king').length, 3);

  assert.equal(monsterCardCandidatesForTarget(target('habadragon')).length, 0);
  assert.equal(monsterCardCandidatesForTarget(target('uzz_skeleton_mage', [{ code: 'summoned' }])).length, 0);
  assert.equal(monsterCardCandidatesForTarget(target('necromancer_uz', [{ code: 'summoned' }])).length, 0);
});

test('首领部位、转职试炼、测试对象和未被击败目标不掉卡', () => {
  for (const monsterCode of [
    'valk_blackiron_plate',
    'mentor_trial_elementalist_sen',
    'npc_sparring_dummy'
  ]) assert.equal(monsterCardCandidatesForTarget(target(monsterCode)).length, 0, monsterCode);

  for (const traitCode of ['boss_component', 'advanced_profession_trial', 'boss_test', 'npc_sparring']) {
    assert.equal(monsterCardCandidatesForTarget(target('ball_rabbit', [{ code: traitCode }])).length, 0, traitCode);
  }
  assert.equal(monsterCardCandidatesForTarget(target('ball_rabbit', [], false)).length, 0);
});

test('执法者严格按冻结的星级或骷髅等级选择对应版本', () => {
  assert.equal(pursuitRank(3, 0), 's3');
  assert.equal(pursuitRank(4, 0), 's4');
  assert.equal(pursuitRank(5, 0), 's5');
  assert.equal(pursuitRank(5, 1), 'k1');
  assert.equal(pursuitRank(5, 5), 'k5');
  assert.equal(pursuitRank(5, 99), 'k5');

  const pursuitCards = monsterCards.filter(card => card.sourcePolicy === 'city_pursuit');
  for (const card of pursuitCards) {
    const rank = card.pursuitRank!;
    const value = Number(rank.slice(1));
    const traits = rank.startsWith('k')
      ? [{ code: 'city_pursuit', pursuit_stars: 5, pursuit_skulls: value }]
      : [{ code: 'city_pursuit', pursuit_stars: value, pursuit_skulls: 0 }];
    assert.deepEqual(
      monsterCardCandidatesForTarget(target(card.monsterCode, traits)).map(candidate => candidate.card.cardCode),
      [card.cardCode],
      card.cardCode
    );
  }
  assert.equal(monsterCardCandidatesForTarget(target('city_marshal_blake', [
    { code: 'city_pursuit', pursuit_stars: 2, pursuit_skulls: 0 }
  ])).length, 0);
});

test('最终掉率同时结算组队、怪物词条、药剂、全知、个人词条、幸运与全局倍率', () => {
  const probability = calculateMonsterCardProbability({
    baseProbability: .005,
    members: [member(9, -100, .4), member(2, 100, .2)],
    useLuck: true,
    traitBonus: .1,
    elixirBonus: .25,
    omniscientBonus: .5,
    globalMultiplier: 1.5
  });

  assert.equal(probability.partyBonus, .6);
  almostEqual(probability.weightedDropBonus, .28);
  almostEqual(probability.luckMultiplier, .96);
  almostEqual(probability.totalMultiplier, 3.9312);
  almostEqual(probability.finalProbability, .019656);
  assert.deepEqual(probability.recipientWeights.map(row => row.characterId), [2, 9]);
  almostEqual(probability.recipientWeights[0].share, .6);
  almostEqual(probability.recipientWeights[1].share, .4);
});

test('组队倍率覆盖1至4人，非法队伍被拒绝且最终概率封顶100%', () => {
  const expectedPartyBonus = [0, .6, 1, 1.5];
  for (let size = 1; size <= 4; size += 1) {
    const result = calculateMonsterCardProbability({
      baseProbability: .03,
      members: Array.from({ length: size }, (_, index) => member(index + 1)),
      useLuck: false,
      traitBonus: 0,
      elixirBonus: 0,
      omniscientBonus: 0,
      globalMultiplier: 1
    });
    assert.equal(result.partyBonus, expectedPartyBonus[size - 1]);
  }
  assert.throws(() => calculateMonsterCardProbability({
    baseProbability: .03,
    members: [],
    useLuck: false,
    traitBonus: 0,
    elixirBonus: 0,
    omniscientBonus: 0,
    globalMultiplier: 1
  }), /没有可获得怪物卡片/);
  assert.throws(() => calculateMonsterCardProbability({
    baseProbability: .03,
    members: Array.from({ length: 5 }, (_, index) => member(index + 1)),
    useLuck: false,
    traitBonus: 0,
    elixirBonus: 0,
    omniscientBonus: 0,
    globalMultiplier: 1
  }), /最多支持四名玩家/);

  const capped = calculateMonsterCardProbability({
    baseProbability: .03,
    members: [member(1), member(2), member(3), member(4)],
    useLuck: false,
    traitBonus: 10,
    elixirBonus: 10,
    omniscientBonus: 10,
    globalMultiplier: 10
  });
  assert.equal(capped.finalProbability, 1);
  assert.equal(decideMonsterCardRoll(capped, () => 1).dropped, true);
});

test('掉落成功只抽一次归属，按幸运权重边界选择；失败不抽归属', () => {
  const probability = calculateMonsterCardProbability({
    baseProbability: 1,
    members: [member(9, -100), member(2, 100)],
    useLuck: true,
    traitBonus: 0,
    elixirBonus: 0,
    omniscientBonus: 0,
    globalMultiplier: 1
  });

  let draws = [0, .599999];
  assert.equal(decideMonsterCardRoll(probability, () => draws.shift()!).recipientCharacterId, 2);
  assert.equal(draws.length, 0);
  draws = [0, .6];
  assert.equal(decideMonsterCardRoll(probability, () => draws.shift()!).recipientCharacterId, 9);
  assert.equal(draws.length, 0);

  let calls = 0;
  const missed = decideMonsterCardRoll({ finalProbability: .2, recipientWeights: probability.recipientWeights }, () => {
    calls += 1;
    return .2;
  });
  assert.equal(missed.dropped, false);
  assert.equal(missed.recipientCharacterId, null);
  assert.equal(calls, 1);
});

test('附魔概率修正和减伤按乘余聚合，实际概率及特殊数值遵守上限', () => {
  const effects = aggregateEnchantmentEffects([
    { effects: {
      hitCorrectionPct: 10,
      cardDamageReductionPct: 10,
      elementDamageReductionPct_火: 20,
      actualHitRatePct: 8,
      actualCritRatePct: 9,
      negotiationActualBonusPct: 8,
      mapPerceptionBonus: 2,
      physicalAttack: 5,
      revealPreferenceCategory: true,
      trackingMaxTier: 'large'
    } },
    { effects: {
      hitCorrectionPct: 20,
      cardDamageReductionPct: 20,
      elementDamageReductionPct_火: 25,
      actualHitRatePct: 7,
      actualCritRatePct: 7,
      negotiationActualBonusPct: 7,
      mapPerceptionBonus: 2,
      physicalAttack: 6,
      trackingMaxTier: 'boss'
    } }
  ]);

  almostEqual(effects.hitCorrectionPct, 28);
  almostEqual(effects.cardDamageReductionPct, 28);
  almostEqual(effects.elementDamageReductionPct_火, 40);
  assert.equal(effects.actualHitRatePct, 12);
  assert.equal(effects.actualCritRatePct, 12);
  assert.equal(effects.negotiationActualBonusPct, 10);
  assert.equal(effects.mapPerceptionBonus, 3);
  assert.equal(effects.physicalAttack, 11);
  assert.equal(effects.revealPreferenceCategory, true);
  assert.equal(effects.trackingMaxTier, 'boss');
});

test('实际命中先进入命中倍率和最低命中，再结算乘余修正；实际暴击先加百分点再受暴免', () => {
  // 命中：50% + 10个百分点 = 60%；20%命中修正补足未命中的20%后为68%；再受25%闪避修正得51%。
  almostEqual(resolvedHitChance(.5, 0, 1, 0, {
    actualHitRatePct: 10,
    hitCorrectionPct: 20,
    evasionCorrectionPct: 25
  }), .51);
  // 盲目倍率必须同时折半基础命中和卡片实际命中：(50%+10%)*0.5=30%，再补足20%并削减25%=33%。
  almostEqual(resolvedHitChance(.5, 0, .5, 0, {
    actualHitRatePct: 10,
    hitCorrectionPct: 20,
    evasionCorrectionPct: 25
  }), .33);
  // 最低命中在实际命中与倍率之后取下限，不能再在25%下限之上追加10个百分点。
  almostEqual(resolvedHitChance(.1, 0, .5, 25, { actualHitRatePct: 10 }), .25);
  // 暴击：50% + 10个百分点 = 60%；再受25%暴免修正得45%。
  almostEqual(correctedCritChance(.5, {
    actualCritRatePct: 10,
    critAvoidanceCorrectionPct: 25
  }), .45);

  const combined = strikeCorrections(
    { armorSet: { hitCorrectionPct: 10, actualHitRatePct: 8, actualCritRatePct: 9 }, hitCorrectionPct: 20, actualHitRatePct: 7, actualCritRatePct: 7, cardEffects: { hitCorrectionPct: 30, actualHitRatePct: 50, actualCritRatePct: 50 } },
    { armorSet: { evasionCorrectionPct: 10, critAvoidanceCorrectionPct: 20 }, evasionCorrectionPct: 20, critAvoidanceCorrectionPct: 25, cardEffects: { evasionCorrectionPct: 30, critAvoidanceCorrectionPct: 30 } }
  );
  almostEqual(combined.hitCorrectionPct!, 49.6);
  almostEqual(combined.evasionCorrectionPct!, 49.6);
  almostEqual(combined.critAvoidanceCorrectionPct!, 58);
  assert.equal(combined.actualHitRatePct, 27, '非卡片来源15点保持不变，卡片来源单独封顶12点');
  assert.equal(combined.actualCritRatePct, 28, '非卡片来源16点保持不变，卡片来源单独封顶12点');
});

test('共享CombatRules实际读取卡片命中与暴击层，而非仅保存在cardEffects', async () => {
  const unit = (key: string, side: string): RuleUnit => ({
    key, name: key, side, level: 30, boss: false,
    hp: 1000, hpMax: 1000, mp: 100, mpMax: 100,
    attack: 100, magic: 100, defense: 100, magicDefense: 100,
    accuracy: 100, evasion: 100, speed: 100, crit: 100, critResist: 100,
    critDamage: 100, critReduction: 100, pierce: 0, tenacity: 0,
    state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {}
  });
  const attempt = async (cardEffects: Record<string, any> | undefined, forceHit: boolean, draws: number[]) => {
    const source = unit('member:1', 'member');
    const target = unit('target:1', 'target');
    source.cardEffects = cardEffects;
    const random = () => draws.shift() ?? .5;
    const rules = new CombatRules([source, target], 1, [], {
      absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {}
    }, '', undefined, random);
    const hit = await rules.strike(source, target, 100, '无', false, false, forceHit, 1, { skill: true });
    return { hit, damage: target.hpMax - target.hp };
  };

  assert.equal((await attempt(undefined, false, [.65])).hit, false, '基础50%命中在0.65应未命中');
  assert.equal((await attempt({ actualHitRatePct: 12, hitCorrectionPct: 20 }, false, [.65, .99, .5])).hit, true, '卡片实际命中与命中修正应改变真实判定');
  assert.equal((await attempt(undefined, true, [.55, .5])).damage, 50, '基础50%暴击在0.55不暴击');
  assert.equal((await attempt({ actualCritRatePct: 12 }, true, [.55, .5])).damage, 100, '卡片实际暴击应改变真实判定');
});

test('主动治疗卡作为独立层只放大明确主动HP治疗，不放大被动回响或MP恢复', async () => {
  const unit = (key: string, side: string): RuleUnit => ({
    key, name: key, side, level: 30, boss: false,
    hp: 500, hpMax: 1000, mp: 0, mpMax: 100,
    attack: 100, magic: 100, defense: 100, magicDefense: 100,
    accuracy: 100, evasion: 100, speed: 100, crit: 100, critResist: 100,
    critDamage: 100, critReduction: 100, pierce: 0, tenacity: 0,
    state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {}
  });
  const restore = async (active: boolean, hp: number, mp = 0, healingBonusPct = 0, cardBonusPct = 20) => {
    const source = unit('member:1', 'member');
    const target = unit('member:2', 'member');
    source.modifiers = { healingBonusPct };
    source.cardEffects = { activeHealingBonusPct: cardBonusPct };
    const rules = new CombatRules([source, target], 1, [], {
      absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {}
    });
    await rules.restore(source, target, hp, mp, !active, Infinity, active);
    return { hp: target.hp - 500, mp: target.mp };
  };

  assert.deepEqual(await restore(true, 100), { hp: 120, mp: 0 });
  assert.deepEqual(await restore(false, 100), { hp: 100, mp: 0 });
  assert.deepEqual(await restore(true, 0, 100), { hp: 0, mp: 100 });
  assert.deepEqual(await restore(true, 100, 0, 20, 12), { hp: 134, mp: 0 }, '20%普通治疗与12%卡片治疗应按1.2×1.12结算');
  assert.deepEqual(await restore(false, 100, 0, 20, 12), { hp: 120, mp: 0 }, '非主动治疗只读取原有治疗加成');
  almostEqual(activeHealingMultiplier(20, 12), 1.344);
});

test('共享规则与特殊直击辅助函数使用同一套卡片独立减伤', async () => {
  const unit = (key: string, side: string): RuleUnit => ({
    key, name: key, side, level: 30, boss: false,
    hp: 2000, hpMax: 2000, mp: 100, mpMax: 100,
    attack: 100, magic: 100, defense: 100, magicDefense: 100,
    accuracy: 100, evasion: 100, speed: 100, crit: 100, critResist: 100,
    critDamage: 100, critReduction: 100, pierce: 0, tenacity: 0,
    state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {}
  });
  const source = unit('target:1', 'target');
  const target = unit('member:1', 'member');
  target.cardEffects = { cardDamageReductionPct: 10, cardPhysicalDamageReductionPct: 20, elementDamageReductionPct_火: 25 };
  const rules = new CombatRules([source, target], 1, [], {
    absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {}
  });
  assert.equal(await rules.incoming(source, target, 1000, '火', false, true), 540);
  assert.equal(applyCardIncomingDamageReduction(1000, target.cardEffects, false, '火'), 540);
  assert.equal(applyCardIncomingDamageReduction(1000, target.cardEffects, true, '火'), 675, '物理卡不得误减魔法直击');
});

test('共享CombatRules直击只对匹配元素读取一次卡片元素伤害加成', async () => {
  const unit = (key: string, side: string): RuleUnit => ({
    key,
    name: key,
    side,
    level: 30,
    boss: false,
    hp: 1000,
    hpMax: 1000,
    mp: 100,
    mpMax: 100,
    attack: 100,
    magic: 100,
    defense: 100,
    magicDefense: 100,
    accuracy: 100,
    evasion: 1,
    speed: 100,
    crit: 0,
    critResist: 100,
    critDamage: 100,
    critReduction: 100,
    pierce: 0,
    tenacity: 0,
    state: emptyRuleState(),
    cooldowns: {},
    passives: [],
    resistance: {},
    mastery: {}
  });
  const directDamage = async (element: string, cardEffects?: Record<string, any>, skill = true) => {
    const source = unit('member:1', 'member');
    const target = unit('target:1', 'target');
    source.cardEffects = cardEffects;
    const rules = new CombatRules([source, target], 1, [], {
      absorb: async () => 0,
      legacyEffects: () => [],
      removeLegacy: async () => {},
      extraAction: () => {},
      swapThreat: async () => {}
    }, '', undefined, () => .5);
    await rules.strike(source, target, 100, element, true, false, true, 1, { skill });
    return target.hpMax - target.hp;
  };

  const baseline = await directDamage('火');
  const matched = await directDamage('火', { elementDamageBonusPct_火: 8 });
  const mismatched = await directDamage('水', { elementDamageBonusPct_火: 8 });
  assert.equal(baseline, 50);
  assert.equal(matched, 54, '匹配元素的8%卡片加成应恰好结算一次');
  assert.equal(mismatched, baseline, '非匹配元素不得读取火元素卡片加成');
  almostEqual(cardElementDamageMultiplier({ elementDamageBonusPct_火: 8 }, '火'), 1.08);
  assert.equal(await directDamage('无', { attackElement: '火', elementDamageBonusPct_火: 8 }, false), matched, '无元素普通攻击应先采用卡片赋予元素');
  assert.equal(await directDamage('无', { attackElement: '火', elementDamageBonusPct_火: 8 }, true), baseline, '无元素技能不得继承卡片赋予元素');
});

test('元素来源遵循技能、固定武器与卡片的优先级，中性技能不继承', () => {
  assert.equal(resolveDirectAttackElement({ skill: false, weaponElement: '雷', cardElement: '火' }), '雷');
  assert.equal(resolveDirectAttackElement({ skill: false, weaponElement: '无', cardElement: '火' }), '火');
  assert.equal(resolveDirectAttackElement({ skill: false, weaponElement: '', cardElement: '火' }), '火');
  assert.equal(resolveDirectAttackElement({ skill: true, skillElement: '冰', weaponElement: '雷', cardElement: '火' }), '冰');
  assert.equal(resolveDirectAttackElement({ skill: true, skillElement: '无', weaponElement: '雷', cardElement: '火' }), '无');
  assert.equal(hasNativeAttackElement('火'), true);
  assert.equal(hasNativeAttackElement('无'), false);
  assert.equal(hasNativeAttackElement(''), false);
});

test('共享次生伤害不读取持卡者的元素直击增伤', async () => {
  const unit = (key: string, side: string): RuleUnit => ({
    key, name: key, side, level: 30, boss: false,
    hp: 1000, hpMax: 1000, mp: 100, mpMax: 100,
    attack: 100, magic: 100, defense: 100, magicDefense: 100,
    accuracy: 100, evasion: 1, speed: 100, crit: 0, critResist: 100,
    critDamage: 100, critReduction: 100, pierce: 0, tenacity: 0,
    state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {}
  });
  const secondaryDamage = async (cardEffects?: Record<string, any>) => {
    const source = unit('member:1', 'member');
    const target = unit('target:1', 'target');
    source.cardEffects = cardEffects;
    const rules = new CombatRules([source, target], 1, [], {
      absorb: async () => 0,
      legacyEffects: () => [],
      removeLegacy: async () => {},
      extraAction: () => {},
      swapThreat: async () => {}
    }, '', undefined, () => .5);
    await rules.secondary(source, target, 100, '持续伤害', '火');
    return target.hpMax - target.hp;
  };
  assert.equal(await secondaryDamage({ elementDamageBonusPct_火: 8 }), await secondaryDamage());
});
