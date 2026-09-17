import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTrackMonsterClass,
  explorationCardProfileFromEnchantments,
  highestElementResistance,
  recordCardMovement,
  resetCardMovementCharge,
  trackingTargetForbiddenReason
} from '../src/game/monster-card-exploration.service';
import type { EquippedEnchantment } from '../src/game/equipment-enchantment-effects';

const enchantment = (overrides: Partial<EquippedEnchantment>): EquippedEnchantment => ({
  instanceId: 10,
  revision: 1,
  slot: 'shoulder',
  cardCode: 'monster_card_city_executioner_arlen_k4',
  cardName: '阿伦·天罗观察·卡片',
  effectText: '',
  effects: {},
  ...overrides
});

test('追迹来源签名包含装备实例、附魔版本和卡片，覆盖附魔后签名变化', () => {
  const effects = { trackingMaxTargets: 2, trackingMaxTier: 'elite', trackingMoveDuration: 8 };
  const first = explorationCardProfileFromEnchantments([enchantment({ effects })]).tracking!;
  const overwritten = explorationCardProfileFromEnchantments([enchantment({ revision: 2, effects })]).tracking!;
  assert.equal(first.maxTargets, 2);
  assert.equal(first.maxTier, 'elite');
  assert.equal(first.moveDuration, 8);
  assert.notEqual(first.sourceSignature, overwritten.sourceSignature);
});

test('凯尔移动蓄力读取3次与临时2格，来源签名只包含对应装备', () => {
  const profile = explorationCardProfileFromEnchantments([
    enchantment({ instanceId: 20, slot: 'waist', cardCode: 'monster_card_city_chief_executor_k5', effects: { moveChargeRequired: 3, moveChargeBonus: 2 } }),
    enchantment({ instanceId: 21, slot: 'ring', cardCode: 'other', effects: { revealHighestElementResistance: true } })
  ]).movementCharge!;
  assert.equal(profile.requiredMoves, 3);
  assert.equal(profile.bonus, 2);
  assert.match(profile.sourceSignature, /waist:20:1:monster_card_city_chief_executor_k5/);
  assert.doesNotMatch(profile.sourceSignature, /other/);
});

test('追迹品阶与禁止来源边界', () => {
  assert.equal(canTrackMonsterClass('large', 'elite'), true);
  assert.equal(canTrackMonsterClass('boss', 'elite'), false);
  assert.match(trackingTargetForbiddenReason({ traitsJson: [{ code: 'summoned' }] }) ?? '', /召唤物/);
  assert.match(trackingTargetForbiddenReason({ traitsJson: [{ code: 'boss_component' }] }) ?? '', /虚拟部位/);
  assert.match(trackingTargetForbiddenReason({ traitsJson: [{ code: 'city_pursuit' }] }) ?? '', /执法者/);
  assert.match(trackingTargetForbiddenReason({ traitsJson: [{ code: 'advanced_profession_trial' }] }) ?? '', /转职试炼/);
  assert.equal(trackingTargetForbiddenReason({ traitsJson: [] }), undefined);
});

test('最高元素抗性按数值取最大，同值按固定元素顺序稳定选择', () => {
  assert.deepEqual(highestElementResistance({ 水: 15, 火: 30, 雷: 20 }), { element: '火', value: 30 });
  assert.deepEqual(highestElementResistance({ 水: 30, 火: 30 }), { element: '水', value: 30 });
});

test('传送会清空凯尔蓄力并让跨区域追迹立即失效', async () => {
  const tracking = enchantment({ effects: { trackingMaxTargets: 1, trackingMaxTier: 'large', trackingMoveDuration: 3 } });
  const charge = enchantment({ instanceId: 20, slot: 'waist', cardCode: 'monster_card_city_chief_executor_k5', effects: { moveChargeRequired: 3, moveChargeBonus: 2 } });
  const profile = explorationCardProfileFromEnchantments([tracking, charge]);
  let updated: unknown[] | undefined;
  const connection = {
    execute: async (sql: string, args: unknown[] = []) => {
      if (sql.includes('FROM player_equipment')) return [[
        { instance_id: tracking.instanceId, revision: tracking.revision, slot: tracking.slot, card_code: tracking.cardCode, card_name: tracking.cardName, effect_text: '', effects_json: tracking.effects, allowed_slots_json: [tracking.slot] },
        { instance_id: charge.instanceId, revision: charge.revision, slot: charge.slot, card_code: charge.cardCode, card_name: charge.cardName, effect_text: '', effects_json: charge.effects, allowed_slots_json: [charge.slot] }
      ]];
      if (sql.startsWith('INSERT IGNORE INTO player_card_exploration_states')) return [{ affectedRows: 0 }];
      if (sql.includes('FROM player_card_exploration_states')) return [[{
        legal_move_charge: 3,
        charged_move_ready: 1,
        revision: 4,
        tracked_spawns_json: {
          chargeSourceSignature: profile.movementCharge!.sourceSignature,
          trackedSpawns: [{
            spawnId: 99, name: '测试目标', monsterClass: 'large',
            regionId: 1, x: 2, y: 3, z: 0, remainingMoves: 3,
            sourceSignature: profile.tracking!.sourceSignature, markedAt: '2026-09-17T00:00:00.000Z'
          }]
        }
      }]];
      if (sql.startsWith('UPDATE player_card_exploration_states')) { updated = args; return [{ affectedRows: 1 }]; }
      throw new Error(sql);
    }
  };
  const result = await recordCardMovement(connection as any, 1, { regionId: 2, z: 0 }, { teleport: true });
  assert.equal(result.charge, 0);
  assert.equal(result.ready, false);
  assert.deepEqual(result.tracked, []);
  assert.deepEqual(updated?.slice(0, 2), [0, 0]);
  assert.deepEqual(JSON.parse(String(updated?.[2])).trackedSpawns, []);
});


test('战斗重置只清除凯尔蓄力，不改动追迹 JSON 或其他探索状态', async () => {
  let capturedSql = '';
  let capturedArgs: unknown[] = [];
  const connection = {
    execute: async (sql: string, args: unknown[] = []) => { capturedSql = sql; capturedArgs = args; return [{ affectedRows: 2 }]; }
  };
  await resetCardMovementCharge(connection as any, [11, 22]);
  assert.match(capturedSql, /legal_move_charge=0,charged_move_ready=0/);
  assert.doesNotMatch(capturedSql, /tracked_spawns_json/);
  assert.deepEqual(capturedArgs, [11, 22]);
});
