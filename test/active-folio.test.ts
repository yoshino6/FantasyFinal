import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatRules, emptyRuleState, type RuleUnit } from '../src/game/combat-rule-registry';
import { folioSkills, folioSkillByCode } from '../src/game/active-folio-skills.config';
import { folioEndTurn, folioTargets, folioBenefit, folioDuration, folioStat, addFolioStatus, validateFolioCast, resolveFolioStrike } from '../src/game/folio-combat';
import { skillSpecialization, specializationOptions } from '../src/game/skill-specialization';
import { leafRouteScenes, leafRouteLevel } from '../src/game/leaf-route.config';
import { leafEnemyScale } from '../src/game/leaf-route-battle.service';
import { contractSpiritBaseMana } from '../src/game/advanced-dynamic-cost';
import { initializeActiveFolioSkills } from '../src/database/active-folio-skills';
import { folioBuffs, folioDebuffs, folioEffectPreview } from '../src/game/folio-effect.config';
import { initializeLeafRoute } from '../src/database/leaf-route';
import { assertLeafDestination, leafRoutePoint } from '../src/game/leaf-route.service';
const unit = (key: string, side = 'member'): RuleUnit => ({ key, name: key, side, level: 30, boss: false, hp: 50000, hpMax: 100000, mp: 3000, mpMax: 3000, attack: 700, magic: 800, defense: 400, magicDefense: 450, accuracy: 100, evasion: 30, speed: 100, crit: 0, critResist: 100, critDamage: 100, critReduction: 100, pierce: 100, tenacity: 100, state: emptyRuleState(), cooldowns: {}, passives: [], resistance: {}, mastery: {} });
const fixture = () => { const source = unit('member:1'), friend = unit('member:2'), target = unit('target:3', 'target'), other = unit('target:4', 'target'), third = unit('target:5', 'target'); const rules = new CombatRules([source, friend, target, other, third], 1, [], { absorb: async () => 0, legacyEffects: () => [], removeLegacy: async () => { }, extraAction: () => { }, swapThreat: async () => { } }, '', [], () => .01); return { source, friend, target, other, third, rules }; };
test('72 distinct active folios, three shops 24 each, basic direct power95', () => {
    assert.equal(folioSkills.length, 72);
    assert.equal(new Set(folioSkills.map(s => s.code)).size, 72);
    for (const shop of ['bookshop', 'worldtree_skill_shop', 'leaf_skill_shop'])
        assert.equal(folioSkills.filter(s => s.shop === shop).length, 24);
    for (const s of folioSkills) {
        assert.ok(['基础', '下位', '中位'].includes(s.tier));
        if (s.category !== 'utility') {
            assert.equal(s.power, s.parts.reduce((a, b) => a + b, 0));
            if (s.tier === '基础')
                assert.equal(s.power, 95);
        }
        else
            assert.equal(s.power, 0);
    }
});
for (const skill of folioSkills)
    test('executes ' + skill.code + ' ' + skill.name, async () => {
        const f = fixture();
        for (const u of [f.source, f.friend]) {
            f.rules.add(u, 'blind', 1, 3, f.target, true);
            f.rules.add(u, 'poison', 2, 3, f.target, true);
        }
        const friendly = ['ally', 'allies', 'self'].includes(skill.scope);
        await f.rules.cast(f.source, friendly ? f.friend : f.target, skill, skill.mana);
        if (!friendly) {
            assert.ok(f.target.hp < 50000);
            const hit = f.rules.enemies(f.source).filter(u => u.hp < 50000);
            assert.equal(hit.length, skill.targetCount || 3);
        }
        else
            assert.ok(f.friend.hp > 50000 || f.friend.state.statuses.some(s => !s.debuff) || !f.rules.status(f.friend, 'blind') || !f.rules.status(f.friend, 'poison'));
        assert.ok(f.rules.log.length > 1, 'must not only print the name');
    });
test('specializations select meaningful options and fixed targets do not grow', () => {
    for (const s of folioSkills) {
        const base = { code: s.code, category: s.category, tier: s.tier, power: s.power, mana_cost: s.mana, cooldown_turns: s.cooldown, chant_turns: s.chant };
        const opts = specializationOptions(base);
        assert.equal(opts.includes('overcharge'), s.power > 0);
        const max = skillSpecialization(base, { overcharge: 40, potent: 40, efficient: 40, instant: 40 });
        assert.ok(max.mana >= 1);
        assert.ok(Number.isFinite(max.power));
    }
});
test('locked multi targets die without retargeting; all targets release-time enumerated', () => {
    const f = fixture(), skill = folioSkillByCode('folio_p03')!;
    f.target.hp = 0;
    assert.deepEqual(folioTargets(f.rules, f.source, f.other, skill, ['target:3', 'target:4']).map(u => u.key), ['target:4']);
    assert.equal(folioTargets(f.rules, f.source, f.other, folioSkillByCode('folio_m03')!).length, 2);
});
test('ordinary cleanse preserves mechanism, petrification, charm and nightmare', async () => {
    const f = fixture();
    for (const code of ['petrify', 'charm', 'nightmare'])
        f.rules.add(f.friend, code, 1, 3, f.target, true);
    assert.throws(() => validateFolioCast(f.rules, f.source, f.friend, folioSkillByCode('folio_s01')!));
    f.rules.add(f.friend, 'blind', 1, 3, f.target, true);
    await f.rules.cast(f.source, f.friend, folioSkillByCode('folio_s01')!, 30);
    assert.equal(f.rules.status(f.friend, 'blind'), undefined);
    for (const code of ['petrify', 'charm', 'nightmare'])
        assert.ok(f.rules.status(f.friend, code));
});
test('strong-short and weak-long statuses do not splice together', () => {
    const f = fixture();
    addFolioStatus(f.rules, f.source, f.friend, 'folio_attack', 30, 1);
    addFolioStatus(f.rules, f.source, f.friend, 'folio_attack', 18, 4);
    assert.equal(f.rules.status(f.friend, 'folio_attack')?.value, 30);
    assert.equal(f.rules.status(f.friend, 'folio_attack')?.until, 1);
});
test('regen starts after acted recipient, ends after exactly three ticks', async () => {
    const f = fixture();
    f.friend.state.memory.actedTurn = 1;
    addFolioStatus(f.rules, f.source, f.friend, 'folio_regen', 3, 3);
    await folioEndTurn(f.rules);
    assert.equal(f.friend.hp, 50000);
    for (let turn = 2; turn <= 4; turn++) {
        f.rules.turn = turn;
        await folioEndTurn(f.rules);
        await folioEndTurn(f.rules);
        f.rules.end();
    }
    assert.equal(f.friend.hp, 59000);
});
test('new caps, flat accuracy and native attack interoperability', () => {
    const f = fixture();
    f.source.castSpecialization = skillSpecialization({ code: 'folio_s07', category: 'utility', tier: '中位', power: 0, mana_cost: 50, cooldown_turns: 3 }, { potent: 40 });
    assert.equal(folioBenefit(f.source, 18, 30), 30);
    assert.equal(folioDuration(f.source, 3), 4);
    addFolioStatus(f.rules, f.source, f.source, 'folio_accuracy', 10, 3);
    assert.equal(folioStat(f.source, 'accuracy', 100, 1), 110);
    resolveFolioStrike(f.rules, f.source, f.target, false, 100, 100, 100, 100, 0, 100, 100, 100, true);
    assert.equal(f.rules.status(f.source, 'folio_accuracy'), undefined);
});
test('leaf plot and conservative second job values', () => {
    assert.equal(leafRouteScenes.length, 12);
    assert.deepEqual([leafRouteLevel(1), leafRouteLevel(80)], [6, 10]);
    assert.equal(leafEnemyScale(8, 1).hp, 2);
    assert.deepEqual([0, 1, 2, 3, 4].map(contractSpiritBaseMana), [0, 120, 180, 240, 240]);
});
test('seed placeholders match, physical base cost does not get discounted twice', async () => {
    const inserts: any[][] = [];
    const db = { query: async () => [[], []], execute: async (sql: string, args: any[]) => { assert.equal((sql.match(/\?/g) || []).length, args.length, sql); if (sql.includes('INSERT INTO skill_definitions'))
            inserts.push(args); return [[], []]; } };
    await initializeActiveFolioSkills(db as any);
    assert.equal(inserts.length, 72);
    assert.equal(inserts[0][10], inserts[0][9] / .4);
});
for (const [id, effects] of Object.entries(folioBuffs))
    test('buff values and targets ' + id, async () => {
        const f = fixture(), s = folioSkillByCode('folio_' + id)!;
        await f.rules.cast(f.source, f.friend, s, s.mana);
        for (const [code, value] of effects) {
            assert.equal(f.rules.status(f.friend, 'folio_' + code)?.value, value);
            assert.equal(f.rules.status(f.friend, 'folio_' + code)?.until, 3);
        }
        if (s.targetCount === 1)
            assert.equal(f.source.state.statuses.length, 0);
    });
for (const [id, [code, value, , duration]] of Object.entries(folioDebuffs))
    test('on-hit secondary values ' + id, async () => {
        const f = fixture(), s = folioSkillByCode('folio_' + id)!;
        await f.rules.cast(f.source, f.target, s, s.mana);
        assert.ok((f.rules.status(f.target, 'folio_' + code)?.value ?? 0) > 0);
        assert.ok((f.rules.status(f.target, 'folio_' + code)?.value ?? Infinity) <= value);
        assert.equal(f.rules.status(f.target, 'folio_' + code)?.until, duration);
        if (['p20', 'm14', 'm23'].includes(id))
            assert.equal(f.rules.status(f.other, 'folio_' + code), undefined);
    });
test('dead primary does not pass its special effect to the next selected target', async () => {
    const f = fixture();
    f.target.hp = 0;
    f.source.state.memory.folioTargets = 'target:3|target:4';
    await f.rules.cast(f.source, f.other, folioSkillByCode('folio_m23')!, 110);
    assert.ok(f.other.hp < 50000);
    assert.equal(f.rules.status(f.other, 'folio_evasion_down'), undefined);
});
test('all-target dispel applies only to original primary, never protected or secondary units', async () => {
    const f = fixture();
    f.rules.add(f.target, 'attack', 10, 3, f.target);
    f.rules.add(f.other, 'attack', 10, 3, f.other);
    f.source.state.memory.folioPrimary = f.target.key;
    f.target.hp = 0;
    await f.rules.cast(f.source, f.other, folioSkillByCode('folio_m09')!, 180);
    assert.ok(f.rules.status(f.other, 'attack'));
    const g = fixture();
    g.target.state.memory.folioTargetable = 0;
    await g.rules.cast(g.source, g.other, folioSkillByCode('folio_m09')!, 180);
    assert.equal(g.target.hp, 50000);
    assert.ok(g.other.hp < 50000);
});
test('burn caps both maximum-HP percent and magic-based tick, even at full potency', async () => {
    const f = fixture();
    f.target.boss = true;
    f.source.castSpecialization = skillSpecialization({ code: 'folio_m03', category: 'magic', tier: '中位', power: 96, mana_cost: 160, cooldown_turns: 4 }, { potent: 40 });
    await f.rules.cast(f.source, f.target, folioSkillByCode('folio_m03')!, 160);
    const effect = f.rules.status(f.target, 'folio_burn')!;
    assert.ok(effect.value <= 1);
    assert.ok(effect.until <= 3);
    const hp = f.target.hp;
    await folioEndTurn(f.rules);
    assert.ok(hp - f.target.hp <= f.source.magic * .4);
    assert.ok(folioEffectPreview(folioSkillByCode('folio_m03')!, 20).some(t => t.includes('该项已达上限')));
});
test('folio attack buff survives high/low attack unification', async () => {
    const a = fixture(), b = fixture();
    a.source.passives = ['resident_g01'];
    b.source.passives = ['resident_g01'];
    addFolioStatus(a.rules, a.source, a.source, 'folio_attack', 18, 3);
    await a.rules.strike(a.source, a.target, 100, '无', false);
    await b.rules.strike(b.source, b.target, 100, '无', false);
    assert.ok(a.target.hp < b.target.hp);
});
test('leaf migration gives old access once; repeated startup cannot grandfather new arrivals', async () => {
    let migration = false;
    const calls: string[] = [];
    const c = { beginTransaction: async () => { }, commit: async () => { }, rollback: async () => { }, release: () => { }, query: async (sql: string) => { calls.push(sql); return [[]]; }, execute: async (sql: string) => { calls.push(sql); const fresh = !migration; migration = true; return [{ affectedRows: fresh ? 1 : 0 }]; } };
    const db = { query: async () => [[]], getConnection: async () => c };
    await initializeLeafRoute(db as never);
    await initializeLeafRoute(db as never);
    assert.equal(calls.filter(s => s.includes("SELECT c.id,'legacy_access'")).length, 1);
    assert.equal(calls.filter(s => s.includes("SELECT character_id,'opening_origin'")).length, 2);
    assert.ok(calls.some(s => s.includes('player_home_storage_items')));
    assert.ok(!calls.some(s => /UPDATE characters|UPDATE map_regions/.test(s)));
});
test('leaf permit checked for every party member; trial valid only inside town', async () => {
    const allowed = new Set<number>([1]);
    let trial = false;
    const db = { execute: async (sql: string, args: number[]) => {
            if (sql === 'SELECT code FROM map_regions WHERE id=?')
                return [[{ code: 'floating_leaf_town' }]];
            if (sql.includes('FROM party_members'))
                return [[{ character_id: 1 }, { character_id: 2 }]];
            if (sql.includes('FROM player_leaf_permits'))
                return [allowed.has(args[0]) ? [{}] : []];
            if (sql.includes('FROM player_leaf_route_progress'))
                return [trial ? [{}] : []];
            throw Error(sql);
        } };
    await assert.rejects(assertLeafDestination(db as never, 1, 9, 3), /个人浮叶航路许可/);
    allowed.add(2);
    await assertLeafDestination(db as never, 1, 9, 3);
    allowed.delete(2);
    trial = true;
    await assertLeafDestination(db as never, 1, 9, 3);
    assert.deepEqual([leafRoutePoint(3, 0), leafRoutePoint(3, 1), leafRoutePoint(3, 2)].map(p => [p.x, p.y]), [[0, -12], [8, -16], [16, -12]]);
});
