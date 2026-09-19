import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createPool } from 'mysql2/promise';

const database = process.env.FF_APP_API_DB_TEST;

test('App 网关：注册、绑定码、会话、绑定与角色命令整链路（隔离库）', { skip: !database && '设置 FF_APP_API_DB_TEST 后运行隔离库测试' }, async t => {
  assert.match(database!, /^fantasyfinal_app_api_test_[a-z0-9_]+$/);
  const require = createRequire(import.meta.url);
  const yaml = require('yaml');
  const config = yaml.parse(readFileSync('alemon.config.yaml', 'utf8'));
  const original = config.FantasyFinal?.database ?? config.mysql;
  assert.notEqual(database, original.database);

  const admin = createPool({ host: original.host, port: original.port, user: original.user, password: original.password, connectTimeout: 5000 });
  const [existing] = await admin.query<any[]>('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [database]);
  assert.equal(existing.length, 0, '测试库已存在，拒绝覆盖');
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const pool = createPool({ ...original, database, connectionLimit: 4, charset: 'utf8mb4' });
  const cache = new Map<string, any>();
  const load = (relative: string): any => {
    const path = resolve(relative.endsWith('.ts') ? relative : relative + '.ts');
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} as any };
    cache.set(path, module);
    const local = (id: string): any => {
      if (id === 'alemonjs') return {};
      if (id.endsWith('/pool')) {
        return {
          getPool: async () => pool,
          withTransaction: async (work: any) => {
            const connection = await pool.getConnection();
            try {
              await connection.beginTransaction();
              const result = await work(connection);
              await connection.commit();
              return result;
            } catch (error) {
              await connection.rollback();
              throw error;
            } finally {
              connection.release();
            }
          }
        };
      }
      if (id.startsWith('.')) return load(resolve(dirname(path), id));
      return require(id);
    };
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    new Function('require', 'module', 'exports', compiled)(local, module, module.exports);
    return module.exports;
  };

  try {
    await pool.query(`CREATE TABLE players (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, qq_user_id VARCHAR(32) NOT NULL, qq_nickname VARCHAR(128) NULL,
      status ENUM('registering','active','banned') NOT NULL DEFAULT 'registering',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uk_players_qq_user_id (qq_user_id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE characters (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, player_id BIGINT UNSIGNED NULL,
      PRIMARY KEY (id), UNIQUE KEY uk_characters_player (player_id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE app_users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, app_user_id VARCHAR(64) NOT NULL, display_name VARCHAR(32) NOT NULL,
      status ENUM('active','disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uk_app_users_app_id (app_user_id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE app_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, app_user_id VARCHAR(64) NOT NULL, token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uk_app_sessions_token (token_hash), KEY idx_app_sessions_user (app_user_id,expires_at)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE app_binding_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, qq_user_id VARCHAR(32) NOT NULL, code CHAR(6) NOT NULL,
      expires_at DATETIME NOT NULL, used_by_app_user VARCHAR(64) NULL, used_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uk_binding_codes_code (code), KEY idx_binding_codes_user (qq_user_id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE player_app_bindings (
      player_id BIGINT UNSIGNED NOT NULL, app_user_id VARCHAR(64) NOT NULL,
      bound_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (player_id), UNIQUE KEY uk_player_app_binding_app (app_user_id),
      CONSTRAINT fk_app_binding_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    const service = load('src/game/app-channel.service');
    const appUser = await service.createAppUser('测试旅人');
    assert.match(appUser.appUserId, /^app_[a-f0-9]+$/);
    assert.ok(appUser.token.length >= 32);

    const session = await service.sessionForApp(appUser.token);
    assert.equal(session?.appUserId, appUser.appUserId);
    assert.equal(session?.qqUserId, appUser.appUserId);

    const [players] = await pool.execute<any[]>('SELECT id,qq_user_id FROM players WHERE qq_user_id=?', [appUser.appUserId]);
    assert.equal(players.length, 1);

    await t.test('绑定码一次性生效，重复使用失败', async () => {
      const code = await service.issueBindingCode('qq_bind_test');
      assert.match(code, /^\d{6}$/);
      await pool.execute("INSERT INTO players (qq_user_id) VALUES ('qq_bind_test') ON DUPLICATE KEY UPDATE qq_user_id=qq_user_id");
      const result = await service.bindAppUser(appUser.appUserId, code);
      assert.equal(result.qqUserId, 'qq_bind_test');
      await assert.rejects(service.bindAppUser(appUser.appUserId, code), /已使用/);
    });

  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  }
});
