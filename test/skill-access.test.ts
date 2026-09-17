import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeSkillAccess } from '../src/database/skill-access';
import { bookshopSkillCodes, retiredBookshopSkillCodes, guildContributionPrice, guildContributionReward, guildContributionSalePrice, guildSkillBookContributionPrice, guildSkillCodes, libraryFreeSkillCodes, tierLearningCost } from '../src/game/skill-access.config';
import { residentSkillByCode, residentSkills } from '../src/game/resident-skill.config';
import { discoverLibrarySkillInTransaction } from '../src/game/library-skills.service';
import { skillAllocationPlan } from '../src/game/skill-point-ledger.service';

test('104 域民技能保留公会26、馆藏10，书屋旧10本只下架不删定义', () => {
  assert.equal(residentSkills.length, 104);
  assert.deepEqual([guildSkillCodes.length, bookshopSkillCodes.length, libraryFreeSkillCodes.length], [26, 0, 10]);
  assert.equal(retiredBookshopSkillCodes.length, 10);
  assert.ok(retiredBookshopSkillCodes.every(code => residentSkillByCode(code)));
  const all = [...guildSkillCodes, ...bookshopSkillCodes, ...libraryFreeSkillCodes];
  assert.equal(new Set(all).size, all.length);
  assert.ok(libraryFreeSkillCodes.every(code => residentSkillByCode(code)?.tier === '基础'));
  assert.deepEqual(['基础', '下位', '中位'].map(tier => tierLearningCost(tier, 99)), [1, 2, 3]);
  assert.equal(guildContributionPrice(400), 40);
  assert.equal(guildContributionReward(123), 13);
  assert.equal(guildContributionSalePrice(9), 0);
});

test('旧渠道初始化写入公会26本，不让下架的书屋10本返架，不动玩家 SP', async () => {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const pool = { query: async (sql: string) => { statements.push({ sql, args: [] }); return [[]]; }, execute: async (sql: string, args: unknown[] = []) => { statements.push({ sql, args }); return [[]]; } };
  await initializeSkillAccess(pool as never);
  assert.equal(statements.filter(item => item.sql.startsWith('INSERT INTO item_definitions')).length, 26);
  assert.equal(statements.filter(item => item.sql.startsWith('INSERT INTO guild_shop_items')).length, 26);
  assert.equal(statements.filter(item => item.sql.startsWith('INSERT INTO bookshop_items')).length, 0);
  for (const offer of statements.filter(item => item.sql.startsWith('INSERT INTO guild_shop_items'))) {
    const code = String(offer.args[1]).replace(/^skill_book_/, '');
    assert.equal(offer.args[0], guildSkillBookContributionPrice(residentSkillByCode(code)!.tier, code)! * 10);
  }
  assert.ok(statements.some(item => item.sql.includes('SET learn_cost=CASE tier')));
  assert.ok(!statements.some(item => /UPDATE characters|UPDATE player_skills/.test(item.sql)));
});

test('世界图书馆仅免费领悟：馆内写发现，不写已学技能或扣 SP', async () => {
  const skill = residentSkillByCode(libraryFreeSkillCodes[0])!;
  let atLibrary = false; let discovered = false; const writes: string[] = [];
  const db = { execute: async (sql: string) => {
    if (sql.startsWith('SELECT c.id FROM characters')) return [[{ id: 5 }]];
    if (sql.startsWith('SELECT 1 FROM characters c JOIN map_npcs')) return [atLibrary ? [{ 1: 1 }] : []];
    if (sql.startsWith('SELECT s.code,s.name,s.tier')) return [[{ code: skill.code, name: skill.name, tier: skill.tier, learned: 0, discovered: discovered ? 1 : 0 }]];
    if (sql.startsWith('SELECT player_id FROM characters')) return [[{ player_id: 1 }]];
    if (sql.startsWith('SELECT * FROM character_tendency_balances')) return [[{ earned_json: {} }]];
    if (sql.startsWith('INSERT IGNORE INTO player_events')) return [{ affectedRows: 1, insertId: 1 }];
    if (/player_events|character_tendency/.test(sql)) return [{ affectedRows: 1 }];
    writes.push(sql);
    if (sql.startsWith('INSERT INTO player_skill_discoveries')) discovered = true;
    return [{ affectedRows: 1 }];
  } };
  await assert.rejects(discoverLibrarySkillInTransaction(db as never, 'qq', 1), /先到世界图书馆/);
  assert.deepEqual(writes, []);
  atLibrary = true;
  assert.deepEqual(await discoverLibrarySkillInTransaction(db as never, 'qq', 1), { name: skill.name, learningCost: 1 });
  assert.equal(writes.filter(sql => sql.startsWith('INSERT INTO player_skill_discoveries')).length, 1);
  assert.ok(!writes.some(sql => /player_skills|player_skill_specializations|player_library_free_skills|skill_points/.test(sql)));
  await assert.rejects(discoverLibrarySkillInTransaction(db as never, 'qq', 1), /已经领悟/);
  assert.equal(writes.length, 1);
});

test('旧版图书馆直接赠予技能仍受技能点重置兼容保护', async () => {
  const db = { execute: async (sql: string) => {
    if (sql.startsWith('SELECT level,skill_points')) return [[{ level: 10, skill_points: 10 }]];
    if (sql.startsWith('SELECT ps.*,s.name')) return [[{ skill_id: 7, name: '免费技能', code: 'resident_c05', category: 'physical', learn_cost: 1, level: 1 }]];
    if (sql.startsWith('SELECT skill_id FROM player_library_free_skills')) return [[{ skill_id: 7 }]];
    return [[]];
  } };
  const plan = await skillAllocationPlan(db as never, 5);
  assert.deepEqual(plan.changes, []);
  assert.ok(plan.preserved.includes('免费技能的基础能力'));
});
