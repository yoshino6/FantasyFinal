import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatRules, emptyRuleState, ruleManaCost, maskRuleBattleLog, type RuleUnit } from '../src/game/combat-rule-registry';
import { finishNpcSparring, sparBusinessDate } from '../src/game/npc-sparring.service';
import { initializeResidentSkills } from '../src/database/resident-skills';
import { residentSkills, residentSkillByCode } from '../src/game/resident-skill.config';
import { buildNpcSparProfile, carriedSparSkills, sparRegionBands } from '../src/game/npc-sparring.config';
import { worldTreeAdvancedProfessions, cachedAdvancedPassiveEffectFor } from '../src/game/advanced-profession.config';
import { calculateDerivedStats, virtualEquipmentStats } from '../src/game/constants';
import { applyEvolutionBaseStats } from '../src/game/evolution.service';
import { calculatePanelStats } from '../src/game/panel-stat-formula';

const unit = (key: string, side = 'member'): RuleUnit => ({ key, name: key, side, level: 30, boss: false, hp: 6000, hpMax: 10000, mp: 2000, mpMax: 3000, attack: 700, magic: 800, defense: 400, magicDefense: 450, accuracy: 100, evasion: 30, speed: 100, crit: 100, critResist: 100, critDamage: 100, critReduction: 100, pierce: 100, tenacity: 100, state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {} });
const fixture = (rng = () => .01) => {
  const source = unit('member:1'); const friend = unit('member:2'); const target = unit('target:3', 'target'); const other = unit('target:4', 'target');
  let extra = 0;
  const rules = new CombatRules([source, friend, target, other], 1, [], { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => {}, extraAction: () => { extra++; }, swapThreat: async () => {} }, '雷雨·断崖', [25, 35], rng);
  return { source, friend, target, other, rules, extra: () => extra };
};
const cast = (f: ReturnType<typeof fixture>, id: string, target = f.target) => f.rules.cast(f.source, target, residentSkillByCode(id)!, residentSkillByCode(id)!.mana);

test('104 skills are unique and restricted to the three pre-50 tiers', () => {
  assert.equal(residentSkills.length, 104);
  assert.equal(new Set(residentSkills.map(s => s.code)).size, 104);
  assert.deepEqual(Object.fromEntries(['基础', '下位', '中位'].map(tier => [tier, residentSkills.filter(s => s.tier === tier).length])), { 基础: 13, 下位: 56, 中位: 35 });
  for (const skill of residentSkills) { assert.ok(skill.mana >= 0 && skill.cooldown <= 7); if (skill.chant) assert.equal(skill.tier, '中位'); if (skill.category === 'magic' && skill.element === '无') assert.equal(skill.damageType, '奥术'); }
});

for (const skill of residentSkills.filter(s => s.category !== 'passive')) test(`active executor ${skill.id} ${skill.name}`, async () => {
  const f = fixture(); f.rules.add(f.target, 'armor_shatter', 10, 3, f.source, true).stacks = 2; f.rules.add(f.target, 'shield', 300, 3, f.target);
  f.source.cooldowns.fireball = 3;
  await cast(f, skill.id, ['ally', 'allies', 'self'].includes(skill.scope) ? f.friend : f.target);
  for (const u of f.rules.units) { assert.ok(Number.isFinite(u.hp) && u.hp >= 0 && u.hp <= u.hpMax); assert.ok(Number.isFinite(u.mp) && u.mp >= 0 && u.mp <= u.mpMax); assert.ok(u.state.statuses.every(s => Number.isFinite(s.value))); }
  assert.ok(f.rules.log.some(line => line.includes(skill.name)));
});

test('MP pricing uses overload, discounts, pain focus and caps consistently', () => {
  const f = fixture(); f.source.passives = ['resident_d02'];
  assert.equal(f.rules.manaCost(f.source, 100), 150);
  f.rules.add(f.source, 'mana_discount', 35, 2, f.source);
  assert.equal(ruleManaCost(f.source.state, f.source.passives, 100, 1), 98);
  f.source.state.memory.focus = 1; assert.equal(f.rules.manaCost(f.source, 100), 78);
  assert.equal(f.rules.manaCost(f.source, 0), 0);
});
test('extra action is a bounded callback, never a free recursive attack', async () => {
  const f = fixture(); const hp = f.target.hp;
  await cast(f, 'C01', f.friend); await cast(f, 'C01', f.friend);
  assert.equal(f.extra(), 1); assert.equal(f.target.hp, hp);
  await f.rules.cast(f.source, f.source, residentSkillByCode('C01')!, 0, '风', true); assert.equal(f.extra(), 1);
});
test('sleep wakes on direct damage; protected controls cannot be replaced by ordinary controls; bosses resist charm', async () => {
  const f = fixture(); await f.rules.control(f.source, f.target, 'sleep', 100, 3);
  assert.equal(await f.rules.beforeAction(f.target), false);
  await f.rules.incoming(f.source, f.target, 100, '火', true, true); assert.equal(f.rules.status(f.target, 'sleep'), undefined);
  await f.rules.control(f.source, f.target, 'petrify', 100, 3); await f.rules.control(f.source, f.target, 'sleep', 100, 3);
  assert.ok(f.rules.status(f.target, 'petrify'));
  f.target.boss = true; assert.equal(await f.rules.control(f.source, f.target, 'charm', 100, 3), false);
});
test('reflection cannot recurse and does not erase incoming damage', async () => {
  const f = fixture(); f.rules.add(f.source, 'mirror', 75, 2, f.source); f.rules.add(f.target, 'mirror', 75, 2, f.target);
  const before = f.source.hp; const dealt = await f.rules.incoming(f.source, f.target, 100, '无', true, true);
  assert.equal(dealt, 100); assert.equal(f.source.hp, before - 75); assert.ok(f.rules.status(f.source, 'mirror')); assert.equal(f.rules.status(f.target, 'mirror'), undefined);
});
test('expansion hits secondary targets without consuming blood twice', async () => {
  const f = fixture(); await cast(f, 'A01', f.source); const before = f.source.hp;
  await cast(f, 'I02'); assert.equal(f.source.hp, before - Math.floor(before * .1)); assert.ok(f.target.hp < 6000 && f.other.hp < 6000); assert.equal(f.rules.status(f.source, 'expand'), undefined);
});
test('NPC damage-only advancement effects are actually used in damage and healing', async () => {
  const f = fixture(); f.source.modifiers = { magicDamagePct: 4 }; f.target.modifiers = { damageReductionPct: 4 };
  assert.equal(await f.rules.incoming(f.source, f.target, 1000, '火', true, true), 998);
  f.source.modifiers = { healingBonusPct: 5 }; const before = f.friend.hp; await f.rules.restore(f.source, f.friend, 1000); assert.equal(f.friend.hp - before, 1050);
});
test('NPC profiles use the player formula once, including equipment, evolution and first/second advancement', () => {
  for (const profession of worldTreeAdvancedProfessions) {
    const profile = buildNpcSparProfile({ code: profession.mentor.code, name: profession.mentor.name, description: profession.role, region_code: 'world_tree' }, 42, 12);
    assert.ok(profile.level >= 30); assert.equal(profile.advancedCode, profession.code); assert.ok(profile.profession); assert.ok(profile.injections > 0);
    let expected = applyEvolutionBaseStats(calculateDerivedStats(profile.trainedAttributes), profile.evolution);
    const gear = virtualEquipmentStats(profile.equipment.level, 'normal', expected.physicalAttack, expected.magicAttack, profile.equipment);
    expected = calculatePanelStats(calculatePanelStats(calculateDerivedStats(profile.trainedAttributes), gear, profile.evolution), {}, cachedAdvancedPassiveEffectFor(profile.advancedCode)); assert.deepEqual(profile.stats, expected);
  }
});
test('low-level NPCs have low rarity, no evolution/second advancement; high-level rarity is varied and stable', () => {
  const rarities = new Set<string>(); let advanced = 0;
  for (let i = 0; i < 60; i++) {
    const npc = { code: `resident_fixture_${i}`, name: '守卫', description: '', region_code: 'worldtree_meadow' };
    const low = buildNpcSparProfile(npc, 50, 100); assert.ok(low.level <= 6); assert.equal(low.equipment.rarity, '普通'); assert.equal(low.injections, 0); assert.equal(low.profession, ''); assert.equal(low.advancedCode, undefined);
    npc.region_code = 'frostcrown_plateau'; const high = buildNpcSparProfile(npc, 45, 5); assert.deepEqual(high, buildNpcSparProfile(npc, 45, 5)); rarities.add(high.equipment.rarity); if (high.advancedCode) advanced++;
  }
  assert.ok(rarities.size > 2); assert.ok(advanced > 0 && advanced < 60); assert.ok(sparRegionBands.gravelwind_shore);
});

test('insight pool is exactly this encounter loadout, never the role library or an old broad pool', () => {
  for (const level of [5, 15, 29, 30, 50]) for (let index = 0; index < 30; index++) {
    const p = buildNpcSparProfile({ code: `loadout_${index}`, name: '学者', description: '', region_code: level < 10 ? 'worldtree_meadow' : 'frostcrown_plateau' }, level, 0);
    assert.deepEqual(p.pool, carriedSparSkills(p)); assert.ok(p.rotation.length <= 4); assert.ok(p.passives.length <= 2); assert.ok(p.pool.length <= 6);
    assert.equal(new Set(p.passives.map(code => residentSkillByCode(code)!.id[0])).size, p.passives.length);
  }
  const snapshot = { rotation: ['resident_a03'], passives: ['resident_d02'], pool: residentSkills.map(s => s.code) };
  assert.deepEqual(carriedSparSkills(snapshot), ['resident_a03', 'resident_d02']);
});

test('legacy effects can be removed by ID even when the adapter returns fresh objects', async () => {
  const f = fixture(); const deleted: number[] = [];
  f.rules.hooks.legacyEffects = u => u === f.target && !deleted.includes(42) ? [{ legacyId: 42, code: 'poison', value: 2, stacks: 1, source: f.source.key, until: 3, debuff: true }] : [];
  f.rules.hooks.removeLegacy = async id => { deleted.push(id); };
  await cast(f, 'E06'); assert.deepEqual(deleted, [42]); assert.equal(f.rules.status(f.target, 'poison')?.stacks, 2);
  await f.rules.control(f.source, f.target, 'sleep', 100, 3);
  const hp = f.target.hp; assert.equal(await f.rules.beforeAction(f.target), false); assert.equal(f.target.hp, hp - 400);
  await f.rules.beforeAction(f.target); assert.equal(f.target.hp, hp - 400); assert.ok(f.rules.status(f.target, 'sleep'));
});

test('support echo copies half of actual gains without paying blood twice', async () => {
  const f = fixture(); const third = unit('member:5'); third.hp = 1000; f.rules.units.push(third);
  f.rules.add(f.source, 'echo', 50, 2, f.source);
  const beforeHp = f.source.hp; const beforeFriend = f.friend.hp;
  await cast(f, 'I04', f.friend);
  assert.equal(f.source.hp, beforeHp - Math.floor(beforeHp * .15));
  assert.equal(f.friend.hp - beforeFriend, 1800); assert.equal(third.hp, 1900);
  assert.equal(f.rules.status(f.source, 'echo'), undefined);
});

test('roots has a shared team limit of three even with two owners', async () => {
  const f = fixture(); f.rules.add(f.source, 'roots', 1, 3, f.source); f.rules.add(f.friend, 'roots', 1, 3, f.friend);
  const hp = f.source.hp + f.friend.hp;
  for (let i = 0; i < 8; i++) await f.rules.rootEcho(i % 2 ? f.friend : f.source);
  assert.equal(f.source.hp + f.friend.hp - hp, 900);
});

test('half-strength refraction really halves reduction and reflected damage', async () => {
  const f = fixture(); f.rules.add(f.target, 'refraction', 17.5, 2, f.target);
  const hp = f.source.hp; assert.equal(await f.rules.incoming(f.source, f.target, 1000, '火', true, true), 825);
  assert.equal(f.source.hp, hp - 100);
});

test('indexed dispel prioritizes the revealed buff and consumes the mark', async () => {
  const f = fixture(() => .99); f.rules.add(f.target, 'defense', 15, 3, f.target); f.rules.add(f.target, 'magic_defense', 15, 3, f.target);
  await cast(f, 'K04'); const removed = await f.rules.dispel(f.source, f.target, false, 1);
  assert.equal(removed[0].code, 'defense'); assert.ok(f.rules.status(f.target, 'magic_defense')); assert.equal(f.rules.status(f.target, 'indexed'), undefined);
});

test('confused direct skills attach their status to the unit actually hit', async () => {
  const f = fixture(); f.rules.add(f.source, 'confusion', 1, 3, f.target, true);
  const hp = f.source.hp; await cast(f, 'A04');
  assert.ok(f.source.hp < hp); assert.ok(f.rules.status(f.source, 'conductive')); assert.equal(f.rules.status(f.target, 'conductive'), undefined);
});

test('silence interruption refunds once and removes the queued cast', async () => {
  const f = fixture(); f.target.state.cast = { code: 'resident_b02', skillId: 10, paid: 294, releaseTurn: 2, cooldown: 5 };
  const mp = f.target.mp; await cast(f, 'L04'); assert.equal(f.target.mp, mp + 147); assert.equal(f.target.state.cast, undefined);
  await cast(f, 'L04'); assert.equal(f.target.mp, mp + 147); assert.equal(f.target.cooldowns.resident_b02, undefined);
});

test('nightmare masks enemy skill/resource details but leaves the observer visible', () => {
  const lines = ['战斗<2>回合', '➤【敌人】释放技能「神秘术」', '　➥恢复 80 HP(100→180)', '　➥【玩家】受到 25 点伤害', '➤【玩家】普通攻击', '　➥对【敌人】造成 55 伤害(180→125)'];
  const masked = maskRuleBattleLog(lines, ['敌人'], ['玩家']).join('\n');
  assert.ok(!masked.includes('神秘术') && !masked.includes('180') && !masked.includes('敌人')); assert.ok(masked.includes('【玩家】') && masked.includes('25'));
});

test('daily limit uses Shanghai midnight independent of host timezone', () => {
  assert.equal(sparBusinessDate(new Date('2026-09-04T15:59:59Z')), '2026-09-04');
  assert.equal(sparBusinessDate(new Date('2026-09-04T16:00:00Z')), '2026-09-05');
});

test('settlement SQL contract uses the encounter loadout once and restores only HP/MP', async () => {
  const profile = buildNpcSparProfile({ code: 'test_teacher', name: '老师', description: '学者', region_code: 'thundercliff' }, 45, 0);
  profile.rotation = ['resident_a03']; profile.passives = ['resident_d02']; profile.pool = residentSkills.map(s => s.code);
  const attempt = { id: 'a', state: 'active', character_id: 1, npc_code: profile.code, profile_json: JSON.stringify(profile), snapshot_json: JSON.stringify({ hp: 321, mp: 123 }) };
  const writes: Array<{ sql: string; args: unknown[] }> = []; let rolls = 0;
  const connection = { execute: async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT * FROM player_npc_spar_attempts')) return [[{ ...attempt }]];
    if (sql.startsWith('SELECT affinity')) return [[{ affinity: 500 }]];
    if (sql.startsWith('SELECT level')) return [[{ level: 45 }]];
    if (sql.startsWith('SELECT GREATEST')) return [[{ level: 4 }]];
    if (sql.startsWith('SELECT cooldowns')) return [[{ cooldowns: {} }]];
    if (sql.startsWith('SELECT s.id,s.name')) { assert.deepEqual(args, ['resident_a03', 'resident_d02', 1, 1]); assert.ok(sql.includes('player_skill_discoveries') && sql.includes('player_skills')); return [[{ id: 8, name: '风切回环' }]]; }
    writes.push({ sql, args }); if (sql.startsWith('UPDATE player_npc_spar_attempts')) attempt.state = String(args[0]); return [{ affectedRows: 1 }];
  } };
  const oldRandom = Math.random; Math.random = () => { rolls++; return 0; };
  try {
    assert.ok((await finishNpcSparring(connection as never, 'session', 'victory')).includes('风切回环'));
    assert.equal(await finishNpcSparring(connection as never, 'session', 'victory'), '切磋已经结算。');
    assert.equal(rolls, 2); assert.equal(writes.filter(w => w.sql.startsWith('INSERT IGNORE INTO player_skill_discoveries')).length, 1);
    assert.deepEqual(writes.find(w => w.sql.startsWith('UPDATE characters'))?.args, [321, 123, 1]);
    assert.ok(!writes.some(w => /experience|inventory|stamina|auto_battle|affinity/.test(w.sql)));
  } finally { Math.random = oldRandom; }
});

test('migration SQL contract seeds all 104 rules, is repeatable and leaves player settings alone', async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = []; let modeExists = false;
  const query = async (sql: string, args: unknown[] = []) => { calls.push({ sql, args }); if (sql.includes('information_schema.COLUMNS')) return [modeExists ? [{ COLUMN_NAME: 'mode' }] : []]; if (sql.startsWith('ALTER TABLE combat_sessions')) modeExists = true; return [[], []]; };
  const pool = { query, execute: query }; await initializeResidentSkills(pool as never); await initializeResidentSkills(pool as never);
  const seeds = calls.filter(c => c.sql.startsWith('INSERT INTO skill_definitions'));
  assert.equal(seeds.length, 208); assert.equal(new Set(seeds.map(c => c.args[0])).size, 104);
  assert.equal(calls.filter(c => c.sql.startsWith('ALTER TABLE combat_sessions')).length, 1);
  assert.ok(seeds.every(c => c.sql.includes('ON DUPLICATE KEY UPDATE')));
  assert.ok(calls.some(c => c.sql.includes('UNIQUE KEY uk_npc_spar_daily (character_id,npc_code,business_date)')));
  assert.ok(!calls.some(c => /UPDATE (characters|player_auto)|DELETE FROM player/.test(c.sql)));
  assert.ok(calls.filter(c => /UPDATE player_skills/.test(c.sql)).every(c => c.sql === "UPDATE player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id SET ps.quick_slot=NULL WHERE s.code='resident_l01' AND ps.quick_slot IS NOT NULL"));
});
