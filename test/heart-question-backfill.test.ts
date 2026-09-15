import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { PoolConnection } from 'mysql2/promise';
import { applyHeartGrowthToRow, ensureHeartQuestionsForCurrentLevel } from '../src/game/heart-question.service';
import { playerGrowthShares } from '../src/game/growth-rules';

test('问心成长使用最新成长率追溯当前等级且忽略旧历史补偿', async () => {
  const connection = { execute: async (sql: string): Promise<[any, any[]]> => {
    if (sql.startsWith('SELECT delta_json,birth_json FROM character_heart_growth')) return [[{
      birth_json: {},
      delta_json: { intelligence: 1, strength: -1 },
      offset_json: { intelligence: -999, strength: 999 }
    }], []];
    throw new Error(`未预期 SQL: ${sql}`);
  } } as unknown as PoolConnection;
  const level = 12;
  const row = await applyHeartGrowthToRow(connection, 9, {
    level,
    intelligence: 5,
    intelligence_growth: 2,
    strength: 5,
    strength_growth: 2
  });
  assert.equal(row.intelligence, 5);
  assert.equal(row.intelligence_growth, 3);
  assert.equal(row.strength, 5);
  assert.equal(row.strength_growth, 1);
  assert.equal(Number(row.intelligence) + Number(row.intelligence_growth) * playerGrowthShares(level), 5 + 3 * playerGrowthShares(level));
});

test('旧角色只补齐 Lv.11 到 Lv.20 问心，重复打开面板不重复生成', async () => {
  const tickets = new Map<number, { id: number; event_code: string; status: string }>();
  const connection = { execute: async (sql: string, params: unknown[] = []): Promise<[any, any[]]> => {
    if (sql.startsWith('SELECT c.id,c.level,c.realm_stage')) return [[{ id: 9, level: 25, realm_stage: 3 }], []];
    if (sql.startsWith('SELECT * FROM character_heart_growth')) return [[{ birth_json: {}, delta_json: {}, offset_json: {} }], []];
    if (sql.startsWith('SELECT event_code FROM character_heart_questions')) return [[...tickets.values()].reverse(), []];
    if (sql.includes("status='active' LIMIT 1")) return [[...tickets.values()].filter(row => row.status === 'active').slice(0, 1), []];
    if (sql.startsWith('SELECT id FROM character_heart_questions WHERE character_id=? AND to_level=?')) {
      const row = tickets.get(Number(params[1]));
      return [row ? [{ id: row.id }] : [], []];
    }
    if (sql.startsWith('INSERT INTO character_heart_questions')) {
      const level = Number(params[1]);
      tickets.set(level, { id: level, event_code: String(params[2]), status: String(params[4]) });
      return [{ affectedRows: 1, insertId: level }, []];
    }
    if (sql.startsWith('SELECT id,event_code,event_snapshot FROM character_heart_questions')) return [[...tickets.values()].map(row => ({ ...row, event_snapshot: JSON.stringify({ version: 3 }) })), []];
    throw new Error(`未预期 SQL: ${sql}`);
  } } as unknown as PoolConnection;

  await ensureHeartQuestionsForCurrentLevel(connection, 'player');
  await ensureHeartQuestionsForCurrentLevel(connection, 'player');
  assert.deepEqual([...tickets.keys()], [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(tickets.get(11)?.status, 'active');
  assert.ok([...tickets.values()].slice(1).every(ticket => ticket.status === 'queued'));
});

test('题库升级后只刷新未回答票的旧快照', async () => {
  let refreshed = 0;
  const connection = { execute: async (sql: string, params: unknown[] = []): Promise<[any, any[]]> => {
    if (sql.startsWith('SELECT c.id,c.level,c.realm_stage')) return [[{ id: 9, level: 11, realm_stage: 2 }], []];
    if (sql.startsWith('SELECT * FROM character_heart_growth')) return [[{ birth_json: {}, delta_json: {}, offset_json: {} }], []];
    if (sql.startsWith('SELECT event_code FROM character_heart_questions')) return [[{ event_code: 'WQ-001' }], []];
    if (sql.includes("status='active' LIMIT 1")) return [[{ id: 1 }], []];
    if (sql.startsWith('SELECT id FROM character_heart_questions WHERE character_id=? AND to_level=?')) return [[{ id: 1 }], []];
    if (sql.startsWith('SELECT id,event_code,event_snapshot FROM character_heart_questions')) return [[{ id: 1, event_code: 'WQ-001', event_snapshot: JSON.stringify({ version: 2 }) }], []];
    if (sql.startsWith('UPDATE character_heart_questions SET event_snapshot=')) {
      refreshed++;
      const snapshot = JSON.parse(String(params[0]));
      assert.equal(snapshot.version, 3);
      assert.equal(snapshot.code, 'WQ-001');
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`未预期 SQL: ${sql}`);
  } } as unknown as PoolConnection;
  await ensureHeartQuestionsForCurrentLevel(connection, 'player');
  assert.equal(refreshed, 1);
});

test('尚未升到 Lv.11 的角色不补问心', async () => {
  let queryCount = 0;
  const connection = { execute: async (sql: string): Promise<[any, any[]]> => {
    queryCount++;
    if (sql.startsWith('SELECT c.id,c.level,c.realm_stage')) return [[{ id: 9, level: 10, realm_stage: 2 }], []];
    throw new Error(`Lv.10 不应继续查询问心：${sql}`);
  } } as unknown as PoolConnection;
  await ensureHeartQuestionsForCurrentLevel(connection, 'player');
  assert.equal(queryCount, 1);
});

test('角色面板可在待答状态下打开，并在等级同行显示问心入口', () => {
  const middleware = readFileSync('src/middleware/heart-question.ts', 'utf8');
  const panel = readFileSync('src/response/character.ts', 'utf8');
  assert.match(middleware, /\(\?:角色\|角色详情\|我\|窥尘问心/);
  assert.match(panel, /addText\(`等级：Lv\$\{character\.level\}`\);\s*if \(pendingHeartQuestions\) markdown\.addButton\('\[窥尘问心\]'/);
});
