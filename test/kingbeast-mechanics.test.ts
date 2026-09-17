import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeSkillBalance } from '../src/game/combat-skill-balance.config';
import { bossPhaseTransitionLogsAfterRound, isHiddenFusedKing, kingbeastCombatMultipliers, kingbeastCoreDamageMultiplier, kingbeastForcedSingleTarget, kingbeastPanelSummary, kingbeastPassiveDamageMultiplier, kingbeastPassiveSummary, kingbeastPhaseTransition, kingbeastPhaseTransitionLog, kingbeastSelectableTargets, kingbeastSummonDue, kingbeastSymbiosisActive, kingbeastTransition, withoutKingbeastPhaseTransitionLogs } from '../src/game/kingbeast.config';

const unit = (id: number, role: string, cooldowns: Record<string, unknown> = {}, is_defeated = 0) => ({
  id, current_hp: is_defeated ? 0 : 100, hp_max: 100, is_defeated, cooldowns,
  traits_json: [{ code: 'kingbeast_encounter', name: '', groupId: 'court', role }]
});

test('合体期只从可选列表隐藏国王，原始战斗目标仍保留国王供全体伤害结算', () => {
  const king = unit(1, 'king'); const dragon = unit(2, 'dragon'); const guard = unit(3, 'guard'); const targets = [king, dragon, guard];
  assert.equal(isHiddenFusedKing(king, targets), true);
  assert.deepEqual(kingbeastSelectableTargets(targets).map(target => target.id), [2, 3]);
  assert.deepEqual(targets.map(target => target.id), [1, 2, 3]);
});

test('王座分离后国王恢复可选，王车易位期间所有单体选择强制落到哈巴龙', () => {
  const king = unit(1, 'king', { kingbeast_phase_two: 1 });
  const dragon = unit(2, 'dragon', { kingbeast_phase_two: 1, kingbeast_castling_turns: 3 });
  const guard = unit(3, 'guard'); const targets = [king, dragon, guard];
  assert.deepEqual(kingbeastSelectableTargets(targets).map(target => target.id), [1, 2, 3]);
  assert.equal(kingbeastForcedSingleTarget(targets)?.id, 2);
});

test('状态优先级先判死亡；只有哈巴龙低于50%才分离，双低血可在分离时触发一次易位', () => {
  const king = unit(1, 'king'); const dragon = unit(2, 'dragon');
  king.current_hp = 49; assert.equal(kingbeastTransition([king, dragon]).split, false);
  dragon.current_hp = 49; assert.deepEqual(kingbeastTransition([king, dragon]), { phaseRequired: true, split: true, castling: false, enrage: undefined });
  king.current_hp = 19; assert.equal(kingbeastTransition([king, dragon]).castling, true);
  dragon.is_defeated = 1; dragon.current_hp = 0;
  const death = kingbeastTransition([king, dragon]); assert.equal(death.split, false); assert.equal(death.castling, false); assert.equal(death.enrage?.id, 1);
});

test('矛盾共生要求至少一名存活雷矛侍卫和一名存活盾卫，同类可无限叠加但不改变开关规则', () => {
  const targets = [unit(1, 'king'), unit(2, 'dragon'), unit(3, 'guard'), unit(4, 'spearman'), unit(5, 'spearman')];
  assert.equal(kingbeastSymbiosisActive(targets), true);
  targets[3]!.is_defeated = 1; targets[3]!.current_hp = 0;
  assert.equal(kingbeastSymbiosisActive(targets), true);
  targets[4]!.is_defeated = 1; targets[4]!.current_hp = 0;
  assert.equal(kingbeastSymbiosisActive(targets), false);
});

test('王庭征召在清场时立即触发，或恰满十回合触发，并且不读取累计召唤次数', () => {
  assert.equal(kingbeastSummonDue(1, 0, 0), true);
  assert.equal(kingbeastSummonDue(9, 0, 2), false);
  assert.equal(kingbeastSummonDue(10, 0, 2), true);
  assert.equal(kingbeastSummonDue(20, 10, 99), true);
  assert.equal(kingbeastSummonDue(20, 10, 0, true), false);
});

test('共生、永久狂暴与王车易位使用设计中的乘算倍率', () => {
  assert.deepEqual(kingbeastCombatMultipliers(unit(3, 'guard', { kingbeast_symbiosis: 1 })), { attack: 1, defense: .75, accuracy: 1, speed: 1, tenacity: 1 });
  assert.deepEqual(kingbeastCombatMultipliers(unit(4, 'spearman', { kingbeast_symbiosis: 1 })), { attack: .75, defense: 1, accuracy: 1, speed: 1, tenacity: 1 });
  assert.deepEqual(kingbeastCombatMultipliers(unit(1, 'king', { royal_beast_enrage: 1, kingbeast_castling_attack: 1 })), { attack: 1.56, defense: 1, accuracy: 1.2, speed: 1.15, tenacity: 1.3 });
  assert.ok(Math.abs(kingbeastCoreDamageMultiplier(unit(2, 'dragon', { kingbeast_castling_turns: 3 }), true) - .6) < 1e-10);
});

test('王旗电令按5回合冷却提供2次各自行动的30%命中与速度强化', () => {
  assert.equal(nativeSkillBalance.find(skill => skill.code === 'goblin_royal_signal_flag')?.cooldown, 5);
  assert.deepEqual(kingbeastCombatMultipliers(unit(4, 'spearman', { royal_signal: 2 })), { attack: 1, defense: 1, accuracy: 1.3, speed: 1.3, tenacity: 1 });
});

test('哈巴龙硬皮与国王雷铸王袍形成互补物魔承伤，并与阶段减伤乘算', () => {
  const dragon = unit(2, 'dragon', { kingbeast_castling_turns: 3 }); const king = unit(1, 'king');
  assert.equal(kingbeastPassiveDamageMultiplier(dragon, 'physical'), .70);
  assert.equal(kingbeastPassiveDamageMultiplier(dragon, 'magic'), 1.30);
  assert.equal(kingbeastPassiveDamageMultiplier(king, 'physical'), 1.30);
  assert.equal(kingbeastPassiveDamageMultiplier(king, 'magic'), .70);
  assert.ok(Math.abs(kingbeastCoreDamageMultiplier(dragon, true, 'physical') - .42) < 1e-10);
  assert.ok(Math.abs(kingbeastCoreDamageMultiplier(king, true, 'magic') - .525) < 1e-10);
  assert.match(kingbeastPassiveSummary(dragon), /硬皮/);
  assert.match(kingbeastPassiveSummary(king), /雷铸王袍/);
});

test('机制摘要同时公开合体选取规则、援军计时和共生状态', () => {
  const summary = kingbeastPanelSummary([unit(1, 'king'), unit(2, 'dragon'), unit(3, 'guard'), unit(4, 'spearman')], 4, 0);
  assert.match(summary, /国王不可选中，但会受到全体伤害/);
  assert.match(summary, /硬皮/);
  assert.match(summary, /雷铸王袍/);
  assert.match(summary, /援军最迟6回合后抵达/);
  assert.match(summary, /矛盾共生/);
});

test('每条阶段转换同时提供转场描述、台词、机制结果，并可从手动战斗日志中独立拆出', () => {
  const codes = ['split', 'castling', 'enrage_king', 'enrage_dragon'] as const;
  const transitions = codes.map(kingbeastPhaseTransition);
  for (const transition of transitions) {
    assert.ok(transition.description.length >= 20);
    assert.ok(transition.dialogue.length >= 1);
    assert.ok(transition.dialogue.every(line => line.speaker && line.text));
    assert.ok(transition.effect.length >= 20);
    const rendered = kingbeastPhaseTransitionLog(transition);
    assert.match(rendered, /阶段转换/);
    assert.ok(transition.dialogue.every(line => rendered.includes(`$${line.speaker}$“${line.text}”`)));
  }
  const splitLog = kingbeastPhaseTransitionLog(transitions[0]!); const logs = ['战斗<3>回合', '玩家造成伤害。', splitLog, '敌方开始行动。'];
  assert.deepEqual(withoutKingbeastPhaseTransitionLogs(logs, new Set([splitLog])), ['战斗<3>回合', '玩家造成伤害。', '敌方开始行动。']);
  assert.deepEqual(bossPhaseTransitionLogsAfterRound(logs, new Set([splitLog])), ['战斗<3>回合', '玩家造成伤害。', '敌方开始行动。', splitLog]);
  assert.deepEqual(bossPhaseTransitionLogsAfterRound(logs, new Set([splitLog]), '\n战斗结束。'), ['战斗<3>回合', '玩家造成伤害。', '敌方开始行动。\n战斗结束。', splitLog]);
});
