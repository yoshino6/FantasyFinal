import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolConnection } from 'mysql2/promise';
import { recordCharacterOperation } from '../src/game/character-operation.service';

test('同一业务来源只生成一笔 player_events 行迹并发放一次六维积分', async () => {
  const facts = new Map<string, { id: number; effective: number }>();
  let earned: Record<string, number> = {};
  let changes = 0;
  const connection = { execute: async (sql: string, params: unknown[] = []): Promise<[any[], any[]] | [any, any[]]> => {
    if (sql.startsWith('SELECT player_id FROM characters')) return [[{ player_id: 7 }], []];
    if (sql.startsWith('INSERT IGNORE INTO player_events')) {
      const hash = String(params[9]);
      if (facts.has(hash)) return [{ affectedRows: 0, insertId: 0 }, []];
      facts.set(hash, { id: 31, effective: 0 });
      return [{ affectedRows: 1, insertId: 31 }, []];
    }
    if (sql.startsWith('SELECT id,effective_points_units FROM player_events')) {
      const fact = facts.get(String(params[1]));
      return [fact ? [{ id: fact.id, effective_points_units: fact.effective }] : [], []];
    }
    if (sql.startsWith('INSERT IGNORE INTO character_tendency_balances')) return [{ affectedRows: 1 }, []];
    if (sql.startsWith('SELECT * FROM character_tendency_balances')) return [[{ earned_json: earned }], []];
    if (sql.startsWith('SELECT COALESCE(SUM(effective_points_units)')) return [[{ total: 0 }], []];
    if (sql.startsWith('UPDATE player_events SET effective_points_units')) {
      const fact = [...facts.values()][0]; fact.effective = Number(params[0]);
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith('UPDATE character_tendency_balances SET earned_json')) {
      earned = JSON.parse(String(params[0]));
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith('INSERT INTO character_tendency_changes')) { changes++; return [{ affectedRows: 1 }, []]; }
    throw new Error(`未预期 SQL: ${sql}`);
  } } as unknown as PoolConnection;
  const input = { characterId: 9, kind: 'bounty.completed', source: { system: 'bounty_instance', id: 'bounty-1', step: 'completed' }, outcome: '完成', summary: '完成悬赏', detail: { bountyId: 1 } };
  const first = await recordCharacterOperation(connection, input);
  const repeated = await recordCharacterOperation(connection, input);
  assert.deepEqual([first.duplicate, repeated.duplicate, first.factId, repeated.factId], [false, true, 31, 31]);
  assert.equal(facts.size, 1);
  assert.equal(changes, 1);
  assert.equal(earned.strength + earned.perception, 30);
});

test('原有 player_events 事件在同一行补齐行迹并保留原 payload', async () => {
  let savedPayload = '';
  const connection = { execute: async (sql: string, params: unknown[] = []): Promise<[any, any[]]> => {
    if (sql.startsWith('SELECT player_id FROM characters')) return [[{ player_id: 7 }], []];
    if (sql.startsWith('SELECT id,character_id,event_type,payload,source_hash')) return [[{ id: 42, character_id: null, event_type: 'character.created', payload: { x: 3, giftCode: 'gift' }, source_hash: null, effective_points_units: 0 }], []];
    if (sql.startsWith('UPDATE player_events SET')) { savedPayload = String(params[0]); return [{ affectedRows: 1 }, []]; }
    throw new Error(`未预期 SQL: ${sql}`);
  } } as unknown as PoolConnection;
  const result = await recordCharacterOperation(connection, { characterId: 9, kind: 'character.created', existingEventId: 42, source: { system: 'character', id: 9, step: 'created' }, outcome: '创建', summary: '创建角色', detail: { characterId: 9, region: '百纳镇' } });
  assert.equal(result.factId, 42);
  assert.equal(result.effectiveUnits, 0);
  assert.deepEqual(JSON.parse(savedPayload), { x: 3, giftCode: 'gift', characterId: 9, region: '百纳镇' });
});

test('同目标短时重复仍保留事实，但不增加六维积分', async () => {
  let effective = -1;
  let changedBalance = false;
  const connection = { execute: async (sql: string, params: unknown[] = []): Promise<[any, any[]]> => {
    if (sql.startsWith('SELECT player_id FROM characters')) return [[{ player_id: 7 }], []];
    if (sql.startsWith('INSERT IGNORE INTO player_events')) return [{ affectedRows: 1, insertId: 91 }, []];
    if (sql.startsWith('INSERT IGNORE INTO character_tendency_balances')) return [{ affectedRows: 0 }, []];
    if (sql.startsWith('SELECT * FROM character_tendency_balances')) return [[{ earned_json: {} }], []];
    if (sql.startsWith('SELECT id FROM player_events WHERE character_id=? AND event_type=? AND score_key=?')) return [[{ id: 77 }], []];
    if (sql.startsWith('UPDATE player_events SET effective_points_units')) { effective = Number(params[0]); return [{ affectedRows: 1 }, []]; }
    if (sql.startsWith('UPDATE character_tendency_balances') || sql.startsWith('INSERT INTO character_tendency_changes')) { changedBalance = true; return [{ affectedRows: 1 }, []]; }
    throw new Error(`未预期 SQL: ${sql}`);
  } } as unknown as PoolConnection;
  const result = await recordCharacterOperation(connection, { characterId: 9, kind: 'combat.pve.victory', source: { system: 'combat_session', id: 'fight-2', step: 'settled' }, outcome: '胜利', summary: '战胜同类魔物', detail: { spawnId: 3 }, scoreKey: 'monster:slime' });
  assert.deepEqual(result, { factId: 91, duplicate: false, effectiveUnits: 0 });
  assert.equal(effective, 0);
  assert.equal(changedBalance, false);
});

test('系统派生结果保留行迹但不能产生可领取积分', async () => {
  let inserted = false;
  const connection = { execute: async (sql: string, params: unknown[] = []): Promise<[any, any[]]> => {
    if (sql.startsWith('SELECT player_id FROM characters')) return [[{ player_id: 7 }], []];
    if (sql.startsWith('INSERT IGNORE INTO player_events')) {
      inserted = true;
      assert.equal(params[11], 'system');
      assert.equal(params[16], 0);
      return [{ affectedRows: 1, insertId: 101 }, []];
    }
    throw new Error(`系统派生结果不应进入积分账：${sql}`);
  } } as unknown as PoolConnection;
  const result = await recordCharacterOperation(connection, { characterId: 9, kind: 'bounty.completed', source: { system: 'quest_state', id: 5, step: 'derived' }, actorRole: 'system', outcome: '完成', summary: '系统同步完成状态', detail: { questId: 5 } });
  assert.equal(inserted, true);
  assert.deepEqual(result, { factId: 101, duplicate: false, effectiveUnits: 0 });
});
