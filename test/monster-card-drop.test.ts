import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateMonsterCardProbability,
  decideMonsterCardRoll,
  monsterCardCandidatesForTarget,
  recordMonsterCardRolls,
  type MonsterCardEligibleMember
} from '../src/game/monster-card-drop.service';

const member = (characterId: number, luck = 0, dropBonus = 0): MonsterCardEligibleMember => ({
  characterId, name: `玩家${characterId}`, luck, dropBonus
});

test('卡片掉率把T/E/O/A按比例加入乘区，不把20%个人加成误作20个百分点', () => {
  const result = calculateMonsterCardProbability({
    baseProbability: .005,
    members: [member(1, 0, .2)],
    useLuck: true,
    traitBonus: .1,
    elixirBonus: .25,
    omniscientBonus: .5,
    globalMultiplier: 1
  });
  assert.equal(result.partyBonus, 0);
  assert.equal(result.weightedDropBonus, .2);
  assert.ok(Math.abs(result.finalProbability - .01025) < 1e-12);
});

test('关闭隐藏幸运时L为1且归属等权，四人混编按普通算术平均A', () => {
  const result = calculateMonsterCardProbability({
    baseProbability: .03,
    members: [member(4, 100, .2), member(3, 0, .4), member(2, -50, 0), member(1, -100, .2)],
    useLuck: false,
    traitBonus: .25,
    elixirBonus: 1.5,
    omniscientBonus: .5,
    globalMultiplier: 2
  });
  assert.equal(result.partyBonus, 1.5);
  assert.equal(result.weightedDropBonus, .2);
  assert.equal(result.luckMultiplier, 1);
  assert.ok(result.recipientWeights.every(row => row.share === .25));
  assert.ok(Math.abs(result.finalProbability - .297) < 1e-12);
});

test('幸运开启时按权重平均个人加成并逐人乘算，符合100/0/0/-100混编示例', () => {
  const result = calculateMonsterCardProbability({
    baseProbability: .03,
    members: [member(1, 100, .35), member(2), member(3), member(4, -100)],
    useLuck: true,
    traitBonus: 0,
    elixirBonus: 0,
    omniscientBonus: 0,
    globalMultiplier: 1
  });
  assert.ok(Math.abs(result.weightedDropBonus - .105) < 1e-12);
  assert.ok(Math.abs(result.luckMultiplier - .96) < 1e-12);
  assert.ok(Math.abs(result.totalMultiplier - 2.5008) < 1e-12);
  assert.ok(Math.abs(result.finalProbability - .075024) < 1e-12);
});

test('判定严格覆盖概率阈值两侧，100%时即使注入1也掉落且归属最后一人', () => {
  const weights = [{ characterId: 1, weight: 1, share: .5 }, { characterId: 2, weight: 1, share: .5 }];
  assert.equal(decideMonsterCardRoll({ finalProbability: .5, recipientWeights: weights }, () => .5).dropped, false);
  const draws = [.499999, .75];
  assert.equal(decideMonsterCardRoll({ finalProbability: .5, recipientWeights: weights }, () => draws.shift()!).recipientCharacterId, 2);
  assert.deepEqual(decideMonsterCardRoll({ finalProbability: 1, recipientWeights: weights }, () => 1), {
    rollValue: 1, dropped: true, recipientRoll: 1, recipientCharacterId: 2
  });
});

test('零奖励资格在查询账本和随机判定前直接拒绝', async () => {
  let randomCalls = 0;
  const count = await recordMonsterCardRolls({} as never, {
    sessionId: 'session', targets: [{ spawnId: 1, monsterCode: 'ball_rabbit', defeated: true, traits: [] }], members: [],
    useLuck: true, elixirBonus: 0, omniscientBonus: 0, globalMultiplier: 1
  }, () => { randomCalls += 1; return 0; });
  assert.equal(count, 0);
  assert.equal(randomCalls, 0);
});

test('常规、来源Boss和执法者候选严格区分，召唤/部位/试炼/测试不直掉', () => {
  const target = (monsterCode: string, traits: unknown = []) => ({ spawnId: 10, monsterCode, defeated: true, traits });
  assert.deepEqual(monsterCardCandidatesForTarget(target('ball_rabbit')).map(row => row.card.cardCode), ['monster_card_ball_rabbit']);
  assert.equal(monsterCardCandidatesForTarget({ ...target('ball_rabbit'), defeated: false }).length, 0);
  assert.equal(monsterCardCandidatesForTarget(target('habadragon')).length, 0);
  const uzz = monsterCardCandidatesForTarget(target('necromancer_uz'));
  assert.equal(uzz.length, 6);
  assert.equal(uzz.filter(row => row.sourceBossCode === 'necromancer_uz').length, 5);
  const goblinKing = monsterCardCandidatesForTarget(target('goblin_king'));
  assert.equal(goblinKing.length, 4);
  assert.equal(goblinKing.filter(row => row.sourceBossCode === 'goblin_king').length, 3);
  assert.equal(monsterCardCandidatesForTarget(target('uzz_skeleton_mage', [{ code: 'summoned' }])).length, 0);
  for (const code of ['boss_component', 'advanced_profession_trial', 'boss_test', 'npc_sparring']) {
    assert.equal(monsterCardCandidatesForTarget(target('ball_rabbit', [{ code }])).length, 0);
  }
  const pursuit = monsterCardCandidatesForTarget(target('city_marshal_blake', [{ code: 'city_pursuit', pursuit_stars: 3, pursuit_skulls: 0 }]));
  assert.equal(pursuit[0]?.card.cardCode, 'monster_card_city_marshal_blake_s3');
  const skullPursuit = monsterCardCandidatesForTarget(target('city_executioner_arlen', [{ code: 'city_pursuit', pursuit_stars: 5, pursuit_skulls: 1 }]));
  assert.equal(skullPursuit[0]?.card.cardCode, 'monster_card_city_executioner_arlen_k1');
  assert.equal(monsterCardCandidatesForTarget(target('city_marshal_blake', [{ code: 'city_pursuit', pursuit_stars: 2, pursuit_skulls: 0 }])).length, 0);
});
