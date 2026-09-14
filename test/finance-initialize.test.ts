import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'mysql2/promise';
import { initializeFinance } from '../src/database/finance';

test('域民投资资本只初始化一次，且本金与来源账本在同一事务', async () => {
  const actions: string[] = [];
  let seeded = false;
  const connection = {
    beginTransaction: async () => { actions.push('BEGIN'); },
    commit: async () => { actions.push('COMMIT'); },
    rollback: async () => { actions.push('ROLLBACK'); },
    release: () => { actions.push('RELEASE'); },
    query: async (sql: string) => {
      actions.push(sql);
      if (sql.includes("VALUES ('npc_capital',12000000)")) { const affectedRows = seeded ? 0 : 1; seeded = true; return [{ affectedRows }]; }
      return [[]];
    },
    execute: async (sql: string) => { actions.push(sql); return [[]]; }
  };
  const pool = {
    query: async (sql: string) => { actions.push(sql); return [[]]; },
    execute: async (sql: string) => { actions.push(sql); return [[]]; },
    getConnection: async () => connection
  } as unknown as Pool;
  await initializeFinance(pool);
  await initializeFinance(pool);
  const ledgerWrites = actions.filter(action => action.includes("'npc_endowment'")).length;
  assert.equal(ledgerWrites, 1);
  assert.equal(actions.filter(action => action === 'BEGIN').length, 2);
  assert.equal(actions.filter(action => action === 'COMMIT').length, 2);
  assert.ok(actions.findIndex(action => action.startsWith('CREATE TABLE IF NOT EXISTS finance_instruments (')) < actions.findIndex(action => action.startsWith('CREATE TABLE IF NOT EXISTS finance_npc_portfolio (')));
  assert.ok(actions.some(action => action.includes("ALTER TABLE finance_news ADD COLUMN price_status ENUM('pending','matched','blocked')")));
  assert.ok(actions.some(action => action.includes('ALTER TABLE finance_news ADD COLUMN price_reason')));
});
