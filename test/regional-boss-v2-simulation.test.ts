import assert from 'node:assert/strict';
import test from 'node:test';
import { monsterCombatStats } from '../src/game/adventure.service';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { RegionalBossBattle, installRegionalV2Damage, newRegionalState, type RegionalV2Code } from '../src/game/regional-boss-v2';
import { planRegionalAuto, regionalActionKind } from '../src/game/regional-boss-auto';
import { regionalV2Resistance } from '../src/game/regional-boss-v2.config';

const row = (code: RegionalV2Code, difficulty: string, cooldowns = {}) => ({
  template_code: code, monster_class: 'boss', name: code, level: 32,
  constitution: code === 'gruen_mountainheart' ? 96 : 74, spirit: code === 'gruen_mountainheart' ? 52 : 70,
  strength: code === 'gruen_mountainheart' ? 82 : 70, intelligence: code === 'gruen_mountainheart' ? 42 : 105,
  agility: code === 'gruen_mountainheart' ? 46 : 64, perception: code === 'gruen_mountainheart' ? 57 : 72,
  constitution_growth: code === 'gruen_mountainheart' ? 1 : .8, spirit_growth: code === 'gruen_mountainheart' ? .6 : .9,
  strength_growth: code === 'gruen_mountainheart' ? 1 : .75, intelligence_growth: code === 'gruen_mountainheart' ? .5 : 1.15,
  agility_growth: code === 'gruen_mountainheart' ? .5 : .7, perception_growth: code === 'gruen_mountainheart' ? .65 : .85,
  traits_json: [{ code: difficulty, name: difficulty }], cooldowns
});
const player = (id: number): RuleUnit => ({
  key: `member:${id}`, name: `测试成员${id}`, side: 'member', level: 32, boss: false,
  hp: 6000, hpMax: 6000, mp: 1000, mpMax: 1000, attack: 900, magic: 900, defense: 500, magicDefense: 500,
  accuracy: 1000, evasion: 100, speed: 100, crit: 0, critResist: 100, critDamage: 100, critReduction: 100,
  pierce: 100, tenacity: 100, state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {}
});
test('普通/强大/梦幻采用原Boss属性派生，V2开场不另乘生命攻击防御', () => {
  for (const code of ['gruen_mountainheart', 'valk_forge_overseer'] as const) for (const difficulty of ['ordinary', 'powerful', 'dreamlike']) {
    assert.deepEqual(monsterCombatStats(row(code, difficulty)), monsterCombatStats(row(code, difficulty, { regional_encounter_v2: newRegionalState(code) })));
  }
  const normal = monsterCombatStats(row('gruen_mountainheart', 'ordinary'));
  const dream = monsterCombatStats(row('gruen_mountainheart', 'dreamlike'));
  assert.ok(dream.hpMax > normal.hpMax * 3.9); assert.ok(dream.physicalAttack > normal.physicalAttack * 1.9);
});
test('总罢工后的双防修正在派生属性读取中只应用一次', () => {
  const state = newRegionalState('valk_forge_overseer'); state.revoltWon = true;
  const base = monsterCombatStats(row('valk_forge_overseer', 'ordinary'));
  const source = row('valk_forge_overseer', 'ordinary', { regional_encounter_v2: state });
  const after = monsterCombatStats(source);
  assert.equal(after.physicalDefense, Math.floor(base.physicalDefense * .8));
  assert.equal(after.magicDefense, Math.floor(base.magicDefense * .8));
  assert.deepEqual(monsterCombatStats(source), after);
});

// 这是固定参数角色的机制回合模拟，不冒充真实史诗装备、真实数据库或玩家胜率测试。
for (const code of ['gruen_mountainheart', 'valk_forge_overseer'] as const) for (const difficulty of ['ordinary', 'powerful', 'dreamlike']) for (let count = 1; count <= 4; count++) {
  test(`${code}/${difficulty}/${count}人：真实属性派生与自动策略连续回合无状态越界`, async t => {
    const stats = monsterCombatStats(row(code, difficulty)); const players = Array.from({ length: count }, (_, i) => player(i + 1));
    const boss: RuleUnit = { ...player(100), key: 'target:100', name: code, side: 'target', boss: true,
      hp: stats.hpMax, hpMax: stats.hpMax, attack: stats.physicalAttack, magic: stats.magicAttack, defense: stats.physicalDefense,
      magicDefense: stats.magicDefense, accuracy: stats.accuracy, evasion: stats.evasion, crit: stats.crit, critResist: stats.critResist,
      critDamage: stats.critDamage, critReduction: stats.critReduction, resistance: regionalV2Resistance[code],
      bossEffects: difficulty === 'dreamlike' ? code === 'gruen_mountainheart' ? ['mountainheart_resonance', 'leyline_recast'] : ['everburning_embers', 'soul_chain_forging'] : [] };
    let seed = 7; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const rules = new CombatRules([...players, boss], 1, [], { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => {}, swapThreat: async () => {} }, '', undefined, random);
    const events: string[] = []; const battle = new RegionalBossBattle(rules, boss, code, event => events.push(event.code));
    installRegionalV2Damage(rules, [battle]); let rounds = 0;
    for (let turn = 1; turn <= 60 && boss.hp > 0 && players.some(p => p.hp > 0); turn++) {
      rules.turn = turn; battle.beginRound(); rounds++;
      const living = players.filter(p => p.hp > 0);
      const planned = planRegionalAuto(battle.state, living.map(p => ({ key: p.key, hp: p.hp, hpMax: p.hpMax, shield: rules.shieldValue(p), automatic: true, controlled: false, preferred: { type: 'attack' as const }, skill: { id: 1, damaging: true } })), turn);
      for (const p of living) {
        if (!await rules.beforeAction(p) || p.hp <= 0) continue;
        const action = planned.get(p.key)!;
        if (action.type === 'defend') rules.add(p, 'reduction', 50, 1, p);
        else await rules.strike(p, boss, action.type === 'skill' ? 150 : 100, code === 'gruen_mountainheart' ? '风' : '水', false);
        await battle.playerAction(p, regionalActionKind(action));
      }
      const victim = players.find(p => p.hp > 0);
      if (victim && boss.hp > 0 && await rules.beforeAction(boss)) await battle.bossTurn(victim);
      await battle.endRound();
      assert.ok(battle.state.pressure >= 0 && battle.state.pressure <= 100); assert.ok(battle.state.heat >= 0 && battle.state.heat <= (battle.state.revoltWon ? 80 : 100));
      assert.ok(Object.values(battle.state.scars).every(n => n >= 0 && n <= 4));
      assert.ok([...players, boss].every(unit => Number.isFinite(unit.hp) && unit.hp >= 0));
      // 模拟进程重载的存储边界，不使用全局变量保存战斗进度。
      assert.deepEqual(JSON.parse(JSON.stringify(boss.cooldowns.regional_encounter_v2)), battle.state);
    }
    t.diagnostic(`回合=${rounds}，BossHP=${boss.hp}/${boss.hpMax}，存活=${players.filter(p => p.hp > 0).length}，事件=${events.length}（固定参数测试角色，非装备验收）`);
  });
}
