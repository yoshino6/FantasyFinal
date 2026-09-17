import assert from 'node:assert/strict';
import test from 'node:test';
import { collectBossBattleAnnouncements } from '../src/game/boss-battle-announcements';
import { withoutKingbeastPhaseTransitionLogs, type BossPhaseTransition } from '../src/game/kingbeast.config';

test('独首转换与两种大招吟唱抽离正文，普通行动和状态保留且不重复入队', () => {
  const logs = ['战斗<4>回合', '玩家击破蛇首', '&独劫焚身·血脉同源&蛇首狂啸', '&灾劫预兆&力量汇聚', '乌兹\n　$骨龙咏唱$召唤阵凝结', '本轮灼烧结算'];
  const events: BossPhaseTransition[] = []; const separated = new Set<string>();
  collectBossBattleAnnouncements(logs, events, separated);
  collectBossBattleAnnouncements(logs, events, separated);
  assert.deepEqual(events.map(event => event.code), ['mother_solo', 'mother_disaster_chant', 'uzz_dragon_chant']);
  assert.deepEqual(events.map(event => event.kind), ['phase', 'chant', 'chant']);
  assert.deepEqual(withoutKingbeastPhaseTransitionLogs(logs, separated), ['战斗<4>回合', '玩家击破蛇首', '本轮灼烧结算']);
  assert.ok(events.every(event => !event.effect && !/硬控|回合窗口|35%/.test(event.description)));
});
