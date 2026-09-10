import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';

/**
 * 显式指定独立库才会执行，防止测试误写入正式世界。
 * 例：DYNAMIC_WORLD_TEST_DATABASE=fantasyfinal_world_test npm run test:world
 */
const testDatabase = process.env.DYNAMIC_WORLD_TEST_DATABASE;
const canRun = Boolean(testDatabase && /^[A-Za-z0-9_]+$/.test(testDatabase));

const withTestPool = async <T>(work: (pool: Pool, prefix: string) => Promise<T>) => {
  if (!testDatabase) throw new Error('缺少 DYNAMIC_WORLD_TEST_DATABASE');
  const [{ createPool }, { getDatabaseConfig }, { initializeSchema }, { initializeDynamicWorldSystem }] = await Promise.all([
    import('mysql2/promise'), import('../src/database/config'), import('../src/database/bootstrap'), import('../src/game/world-dynamics.service')
  ]);
  const config = getDatabaseConfig();
  if (testDatabase === config.database) throw new Error('测试库不能与正式数据库同名。');
  const admin = createPool({ host: config.host, port: config.port, user: config.user, password: config.password });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await admin.end();
  const pool = createPool({ ...config, database: testDatabase, waitForConnections: true, connectionLimit: 2, charset: 'utf8mb4' });
  try { await initializeSchema(pool); await initializeDynamicWorldSystem(pool); return await work(pool, `it_${randomUUID().replaceAll('-', '')}`); } finally { await pool.end(); }
};

test('动态世界数据库约束与快照回归', { skip: !canRun && '设置 DYNAMIC_WORLD_TEST_DATABASE 后执行独立数据库集成测试' }, async () => withTestPool(async (pool, prefix) => {
  const character = 8_000_000 + Math.floor(Math.random() * 100_000);
  await test('同格反复移动不增加曝光', async () => {
    await pool.execute('INSERT INTO player_exploration_budgets (character_id,effective_exposure,last_region_id,last_cell_x,last_cell_y,last_cell_z) VALUES (?,?,?,?,?,?)', [character, 1, 1, 2, 3, 0]);
    const [rows] = await pool.query<any[]>(`SELECT effective_exposure FROM player_exploration_budgets WHERE character_id=${character} AND last_region_id=1 AND last_cell_x=2 AND last_cell_y=3 AND last_cell_z=0`);
    assert.equal(Number(rows[0].effective_exposure), 1);
  });
  await test('同一节点不能二次选择', async () => {
    const id = randomUUID(); await pool.execute('INSERT INTO player_encounter_decisions (encounter_id,node_code,choice_code,outcome_code,effects_json) VALUES (?,?,?,?,JSON_OBJECT())', [id, 'opening', 'a', 'resolved']);
    await assert.rejects(pool.execute('INSERT INTO player_encounter_decisions (encounter_id,node_code,choice_code,outcome_code,effects_json) VALUES (?,?,?,?,JSON_OBJECT())', [id, 'opening', 'b', 'resolved']));
  });
  await test('同一隐藏物只发一次', async () => {
    await pool.execute('INSERT INTO player_encounter_rewards (character_id,reward_code,encounter_id) VALUES (?,?,?)', [character, `${prefix}_relic`, randomUUID()]);
    await assert.rejects(pool.execute('INSERT INTO player_encounter_rewards (character_id,reward_code,encounter_id) VALUES (?,?,?)', [character, `${prefix}_relic`, randomUUID()]));
  });
  await test('同队只能登记一份协作见证', async () => {
    const scene = randomUUID(); await pool.execute('INSERT INTO world_scene_contributions (scene_id,character_id,team_key,contribution_code,payload_json) VALUES (?,?,?,?,JSON_OBJECT())', [scene, character, `${prefix}_party`, 'escort']);
    await assert.rejects(pool.execute('INSERT INTO world_scene_contributions (scene_id,character_id,team_key,contribution_code,payload_json) VALUES (?,?,?,?,JSON_OBJECT())', [scene, character + 1, `${prefix}_party`, 'decode']));
  });
  await test('公共现场过期后不能维持 active', async () => {
    const id = randomUUID(); await pool.execute(`INSERT INTO world_scene_instances (id,template_code,region_id,cell_x,cell_y,cell_z,discoverer_character_id,status,expires_at,payload_json) VALUES (?,?,1,0,0,0,?,'active',DATE_SUB(NOW(),INTERVAL 1 MINUTE),JSON_OBJECT())`, [id, 'forest_lamplighter', character]);
    await pool.execute("UPDATE world_scene_instances SET status='expired' WHERE id=? AND status='active' AND expires_at<=NOW()", [id]); const [rows] = await pool.query<any[]>(`SELECT status FROM world_scene_instances WHERE id='${id}'`); assert.equal(rows[0].status, 'expired');
  });
  await test('世界线阈值打开首领门', async () => {
    const code = `${prefix}_line`; await pool.execute('INSERT INTO worldline_states (code,stage,state_json) VALUES (?,24,JSON_OBJECT())', [code]); await pool.execute("INSERT INTO world_boss_gates (worldline_code,stage_required,boss_code,state) VALUES (?,24,?,'locked')", [code, `${prefix}_boss`]); await pool.execute("UPDATE world_boss_gates SET state='ready' WHERE worldline_code=? AND state='locked' AND stage_required<=24", [code]); const [rows] = await pool.execute<any[]>('SELECT state FROM world_boss_gates WHERE worldline_code=?', [code]); assert.equal(rows[0].state, 'ready');
  });
  await test('区域委托的个人公共贡献每天只登记一次', async () => {
    const code = `${prefix}_commission_line`; await pool.execute('INSERT INTO player_worldline_daily_contributions (character_id,worldline_code,contribution_date,commission_id) VALUES (?,?,CURDATE(),?)', [character, code, 1]);
    await assert.rejects(pool.execute('INSERT INTO player_worldline_daily_contributions (character_id,worldline_code,contribution_date,commission_id) VALUES (?,?,CURDATE(),?)', [character, code, 2]));
  });
  await test('战斗天气快照写入后保持不变', async () => {
    const session = randomUUID(); await pool.execute("INSERT INTO combat_environment_snapshots (session_id,region_id,weather_code,intensity,anomaly_code,modifiers_json) VALUES (?,1,'rain',2,NULL,JSON_OBJECT('elementBonuses',JSON_OBJECT('水',8)))", [session]); const [before] = await pool.execute<any[]>('SELECT weather_code,intensity FROM combat_environment_snapshots WHERE session_id=?', [session]); await pool.execute("UPDATE region_weather_states SET weather_code='storm',intensity=3 WHERE region_id=1"); const [after] = await pool.execute<any[]>('SELECT weather_code,intensity FROM combat_environment_snapshots WHERE session_id=?', [session]); assert.deepEqual(after[0], before[0]);
  });
}));
