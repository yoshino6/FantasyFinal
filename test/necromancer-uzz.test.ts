import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyBossSummonTrait } from '../src/game/boss-summon-inheritance';
import { uzzDomainMagicMultiplier, uzzNextSummonSlot, uzzPhaseTwoTransition, uzzPhaseTwoTransitionDue, uzzRotationSkill, uzzSoulDrainTransfer, uzzSpeedFactor, uzzSummonDue, uzzUndeadConstitutionMultiplier } from '../src/game/necromancer-uzz.config';

test('乌兹共用召唤槽严格保留六个间隔槽和清场五槽冷却', () => {
  assert.equal(uzzNextSummonSlot(1), 8);
  assert.equal(uzzSummonDue(7, 1), false);
  assert.equal(uzzSummonDue(8, 1), true);
  assert.equal(uzzNextSummonSlot(8, 10), 16);
});

test('阶段切换保留四槽指针，只替换对应槽技能', () => {
  assert.deepEqual(uzzRotationSkill(false, 0), { slot: 1, code: 'uzz_soul_blast' });
  assert.deepEqual(uzzRotationSkill(false, 1), { slot: 2, code: 'uzz_dark_decay' });
  assert.deepEqual(uzzRotationSkill(true, 2), { slot: 3, code: 'uzz_soul_blast' });
  assert.deepEqual(uzzRotationSkill(true, 3), { slot: 4, code: 'uzz_soul_drain' });
});

test('二阶段转场仅在首次低于50%生命时触发', () => {
  assert.equal(uzzPhaseTwoTransitionDue(false, 500, 1000), false);
  assert.equal(uzzPhaseTwoTransitionDue(false, 499, 1000), true);
  assert.equal(uzzPhaseTwoTransitionDue(true, 200, 1000), false);
  assert.match(uzzPhaseTwoTransition.effect, /骷髅召唤永久替换为死灵召唤/);
});

test('亡灵体质、凛冬领域和叠加减速使用设计倍率', () => {
  assert.equal(uzzUndeadConstitutionMultiplier(true, '暗'), .65);
  assert.equal(uzzUndeadConstitutionMultiplier(true, '光'), 1.5);
  assert.equal(uzzUndeadConstitutionMultiplier(false, '无'), 1.25);
  assert.equal(uzzUndeadConstitutionMultiplier(false, '光'), 1.875);
  assert.equal(uzzDomainMagicMultiplier(true, '火'), .75);
  assert.equal(uzzDomainMagicMultiplier(true, '冰'), 1);
  assert.equal(uzzDomainMagicMultiplier(false, '火'), 1);
  assert.equal(uzzSpeedFactor(true, 0, 25), .55);
  assert.equal(uzzSpeedFactor(true, 80, 25), .3);
});

test('Boss召唤物只继承非生命词条，生命不进入继承面板', () => {
  const base = { hpMax: 1000, mpMax: 100, physicalAttack: 200, magicAttack: 300, physicalDefense: 150, magicDefense: 180, accuracy: 90, evasion: 80, crit: 500, critResist: 400, critDamage: 1500, critReduction: 200, tenacity: 50, tenacityPierce: 40, speed: 120, perception: 60 };
  const inherited = applyBossSummonTrait(base, { statMultiplier: 1.5, statMultipliers: { hp: 12.8, tenacity: 20, evasion: 2.5 } });
  assert.equal(inherited.hpMax, 1000);
  assert.equal(inherited.mpMax, 150);
  assert.equal(inherited.physicalAttack, 300);
  assert.equal(inherited.evasion, 200);
  assert.equal(inherited.tenacity, 1000);
  assert.equal(inherited.speed, 180);
});

test('灵魂汲取抽取当前MP的50%，魔力溢出按1:1治疗乌兹', () => {
  assert.deepEqual(uzzSoulDrainTransfer(800, 900, 1000, 5000, 6000), {
    drained: 400,
    restoredMp: 100,
    overflowMp: 300,
    restoredHp: 300,
    victimMp: 400,
    bossMp: 1000,
    bossHp: 5300
  });
  assert.deepEqual(uzzSoulDrainTransfer(121, 980, 1000, 5990, 6000), {
    drained: 60,
    restoredMp: 20,
    overflowMp: 40,
    restoredHp: 10,
    victimMp: 61,
    bossMp: 1000,
    bossHp: 6000
  });
});

test('服务重启的越界刷新点清理会保留战斗中的召唤物', () => {
  const source = readFileSync(new URL('../src/database/bootstrap.ts', import.meta.url), 'utf8');
  const cleanup = source.match(/\/\/ 旧的单矩形刷新点[\s\S]*?await pool\.execute\(`UPDATE resource_spawns/)?.[0] ?? '';
  assert.match(cleanup, /NOT EXISTS \(SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs\.id=ct\.session_id WHERE ct\.spawn_id=s\.id AND cs\.state='active'\)/);
});
