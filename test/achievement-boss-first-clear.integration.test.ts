import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createConnection } from 'mysql2/promise';
import { achievementSchema } from '../src/database/achievements';
import { achievementBossTargets, bossAchievementDefinition, bossAchievementDifficulties, ensureBossAchievement } from '../src/game/achievement-boss';
import { bossAchievementFlavours } from '../src/game/achievement-boss-flavour';
import { achievementCombatVictory } from '../src/game/achievement-combat';
import { takeAchievementEvents } from '../src/game/achievement-events';
import { flushAchievements } from '../src/game/achievement.service';

const runDatabaseTest = process.env.FF_ACHIEVEMENT_DB_TEST === '1';
const bossNames: Record<string, string> = {
  rootcrown_ram: '根冠公羊', forest_slime: '森林史莱姆', black_slime: '黑暗史莱姆', dawntide_crocodile: '晨潮鳄王',
  shadow_wolf_king: '幽影狼王', shattertide_crab: '碎潮巨蟹', death_knight: '死灵骑士', skeleton_general: '骷髅将军',
  goblin_king: '横冲直撞的哥布林国王', gruen_mountainheart: '山脉心核·格鲁恩', necromancer_uz: '死灵法师·乌兹', threehead_mother: '三首雾沼蛇母',
  valk_forge_overseer: '熔炉监工·瓦尔克', fallingstar_mudid: '坠星泥偶', frostking_whiteantler: '白角霜王', askr_stormroc: '风暴巨隼·阿斯克',
  seles_eclipse_watcher: '月蚀守望者·塞勒斯'
};

const combatMember = (id: number, damage = 1) => ({
  id, level: 60, current_hp: 100, hp_max: 100, current_mp: 50, mp_max: 50, stamina_eligible: true,
  cooldowns: { __rules: { memory: { achievement: { damage, healed: 0, playerSupport: 0, kills: [], elements: [], crit: false, dodged: false, shield: false, received: 0, receivedHits: 0, lowHeal: false } } } }
});

test('首领首通矩阵：17组首领的12档难度均经正式PVE胜利结算、事务落库与首发账本验收', { skip: !runDatabaseTest }, async () => {
  const { parse, stringify } = createRequire(import.meta.url)('yaml');
  const document = parse(readFileSync('alemon.config.yaml', 'utf8'));
  const db = parse(stringify(document.FantasyFinal?.database ?? document.mysql));
  const database = `ff_boss_first_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^ff_boss_first_[a-f0-9]{32}$/);
  const connection = await createConnection({ host: db.host, port: Number(db.port ?? 3306), user: db.user, password: db.password, charset: 'utf8mb4', connectTimeout: 8000 });
  let created = false;
  try {
    await connection.query(`CREATE DATABASE \`${database}\``); created = true; await connection.query(`USE \`${database}\``);
    await connection.query('CREATE TABLE players(id INT PRIMARY KEY,qq_user_id VARCHAR(128) NOT NULL)');
    await connection.query('CREATE TABLE characters(id INT PRIMARY KEY,player_id INT NOT NULL,name VARCHAR(128) NOT NULL,npc_code VARCHAR(64) NULL,current_region_id INT NOT NULL)');
    await connection.query('CREATE TABLE map_regions(id INT PRIMARY KEY,name VARCHAR(64) NOT NULL)');
    await connection.query('CREATE TABLE combat_sessions(id VARCHAR(80) PRIMARY KEY,character_id INT NOT NULL)');
    await connection.query('CREATE TABLE monster_templates(id INT PRIMARY KEY,code VARCHAR(64) NOT NULL,name VARCHAR(64) NOT NULL)');
    await connection.query('CREATE TABLE player_equipment(character_id INT NOT NULL,instance_id INT NOT NULL)');
    await connection.query('CREATE TABLE player_item_instances(id INT PRIMARY KEY,character_id INT NOT NULL,item_id INT NOT NULL)');
    await connection.query('CREATE TABLE item_definitions(id INT PRIMARY KEY,item_category VARCHAR(32) NOT NULL)');
    await connection.query('CREATE TABLE player_companions(id INT PRIMARY KEY,character_id INT NOT NULL,is_out TINYINT NOT NULL,released_at DATETIME NULL)');
    await connection.query('CREATE TABLE bot_group_channels(bot_id VARCHAR(128),group_openid VARCHAR(128))');
    for (const sql of achievementSchema) await connection.query(sql);
    await connection.query("INSERT INTO players VALUES (1,'matrix-one'),(2,'matrix-two'),(3,'matrix-idle')");
    await connection.query("INSERT INTO characters VALUES (1,1,'首通甲',NULL,1),(2,2,'首通乙',NULL,1),(3,3,'旁观丙',NULL,1)");
    await connection.query("INSERT INTO map_regions VALUES (1,'首通验收场')");

    const bossCodes = Object.keys(bossAchievementFlavours);
    assert.equal(bossCodes.length, 17);
    assert.deepEqual(bossCodes.sort(), Object.keys(bossNames).sort());
    assert.equal(bossAchievementDifficulties.length, 12);
    await connection.query(`INSERT INTO monster_templates(id,code,name) VALUES ${bossCodes.map(() => '(?,?,?)').join(',')}`,
      bossCodes.flatMap((code, index) => [index + 100, code, bossNames[code]!]) as any);

    // 入口接线必须仍经过正式PVE胜利结算；不会从交涉、测试或管理操作补发首通。
    const adventureSource = readFileSync('src/game/adventure.service.ts', 'utf8');
    assert.ok(adventureSource.includes('await achievementCombatVictory(connection,sessionId,members,rewardTargets.filter(target=>!isBossComponent(target)));'));

    const targetFor = (code: string, difficulty: string, id: number) => ({ id, template_id: bossCodes.indexOf(code) + 100, level: 60, monster_class: 'boss', traits_json: difficulty === 'fixed' ? [] : [{ code: difficulty }] });
    const settle = async (session: string, members: Record<string, unknown>[], target: Record<string, unknown>, createSession = true) => {
      if (createSession) await connection.execute('INSERT INTO combat_sessions VALUES (?,1)', [session]);
      await achievementCombatVictory(connection as any, session, members, [target]);
      await flushAchievements(connection as any, takeAchievementEvents(connection as any));
    };
    const count = async (table: string, where = '', params: unknown[] = []) => Number((await connection.execute<any[]>(`SELECT COUNT(*) AS n FROM ${table}${where}`, params))[0][0].n);

    const rollbackCode = 'seles_eclipse_watcher'; const rollbackDifficulty = 'dreamlike';
    const rollbackId = bossAchievementDefinition(rollbackCode, bossNames[rollbackCode]!, rollbackDifficulty).id;
    await connection.beginTransaction();
    await settle('boss-rollback', [combatMember(1)], targetFor(rollbackCode, rollbackDifficulty, 1));
    await connection.rollback();
    assert.equal(await count('achievement_boss_definitions', ' WHERE id=?', [rollbackId]), 0);
    assert.equal(await count('achievement_completions', ' WHERE achievement_id=?', [rollbackId]), 0);
    assert.equal(await count('achievement_announcements', ' WHERE achievement_id=?', [rollbackId]), 0);

    const excluded = targetFor('rootcrown_ram', 'ordinary', 2);
    excluded.traits_json = [{ code: 'ordinary' }, { code: 'boss_test' }];
    assert.deepEqual(await achievementBossTargets(connection as any, [excluded]), []);
    assert.deepEqual(await achievementBossTargets(connection as any, [{ ...excluded, traits_json: JSON.stringify(excluded.traits_json) }]), []);
    await connection.beginTransaction();
    assert.equal(await ensureBossAchievement(connection as any, excluded), null);
    await connection.rollback();

    const noContributionCode = 'black_slime'; const noContributionDifficulty = 'powerful';
    const noContributionId = bossAchievementDefinition(noContributionCode, bossNames[noContributionCode]!, noContributionDifficulty).id;
    await connection.beginTransaction();
    await settle('boss-no-contribution', [combatMember(2, 0), combatMember(3, 0)], targetFor(noContributionCode, noContributionDifficulty, 3));
    await connection.commit();
    assert.equal(await count('achievement_boss_definitions', ' WHERE id=?', [noContributionId]), 0);
    assert.equal(await count('achievement_completions', ' WHERE achievement_id=?', [noContributionId]), 0);

    // 组队首领胜利由至少一名有效贡献者成立后，同场真人成员共享首通、首发与道具匣；NPC不计。
    const sharedCode = 'rootcrown_ram'; const sharedDifficulty = 'ordinary';
    const sharedId = bossAchievementDefinition(sharedCode, bossNames[sharedCode]!, sharedDifficulty).id;
    await connection.beginTransaction();
    await settle('boss-shared-first', [combatMember(1), combatMember(2), combatMember(3, 0)], targetFor(sharedCode, sharedDifficulty, 4));
    await connection.commit();
    assert.equal(await count('achievement_completions', ' WHERE achievement_id=?', [sharedId]), 3);
    assert.equal(await count('achievement_first_members', ' WHERE achievement_id=?', [sharedId]), 3);
    assert.equal(await count('achievement_announcements', ' WHERE achievement_id=?', [sharedId]), 1);
    assert.equal(await count('achievement_completions', " WHERE identity_key='matrix-idle' AND achievement_id=?", [sharedId]), 1);
    assert.equal(await count('achievement_box_rewards', " WHERE identity_key='matrix-idle' AND achievement_id=?", [sharedId]), 1);

    await connection.beginTransaction();
    let index = 0;
    for (const code of bossCodes) for (const [difficulty] of bossAchievementDifficulties) {
      index++;
      await settle(`boss-matrix-${index}`, [combatMember(1)], targetFor(code, difficulty, 1000 + index));
    }
    await connection.commit();

    assert.equal(await count('achievement_boss_definitions'), 204);
    assert.equal(await count('achievement_completions', " WHERE identity_key='matrix-one' AND achievement_id LIKE 'ACH_BOSS_%'"), 204);
    assert.equal(await count('achievement_announcements', " WHERE achievement_id LIKE 'ACH_BOSS_%'"), 204);
    assert.equal(await count('achievement_first_members', " WHERE achievement_id LIKE 'ACH_BOSS_%'"), 206);
    assert.equal(await count('achievement_box_rewards', " WHERE identity_key='matrix-one' AND achievement_id LIKE 'ACH_BOSS_%'"), 204);

    for (const code of bossCodes) for (const [difficulty, label, rarity, points] of bossAchievementDifficulties) {
      const definition = bossAchievementDefinition(code, bossNames[code]!, difficulty);
      const [definitions] = await connection.execute<any[]>('SELECT boss_code,difficulty,definition_json FROM achievement_boss_definitions WHERE id=?', [definition.id]);
      const [completions] = await connection.execute<any[]>('SELECT ordinal,rarity,reward_points FROM achievement_completions WHERE identity_key=? AND achievement_id=?', ['matrix-one', definition.id]);
      assert.equal(definitions.length, 1, `${code}/${label} definition`);
      assert.equal(definitions[0].boss_code, code); assert.equal(definitions[0].difficulty, difficulty);
      const saved = typeof definitions[0].definition_json === 'string' ? JSON.parse(definitions[0].definition_json) : definitions[0].definition_json;
      assert.equal(saved.name, bossAchievementFlavours[code]![difficulty]!.name);
      assert.equal(saved.description, bossAchievementFlavours[code]![difficulty]!.description);
      assert.equal(completions.length, 1, `${code}/${label} completion`);
      assert.equal(completions[0].rarity, rarity); assert.equal(Number(completions[0].reward_points), points);
      assert.ok(Number(completions[0].ordinal) >= 1);
      assert.equal(await count('achievement_counters', ' WHERE achievement_id=? AND completed_count>=1', [definition.id]), 1);
      assert.equal(await count('achievement_announcements', ' WHERE achievement_id=?', [definition.id]), 1);
    }

    const beforeReplay = {
      completions: await count('achievement_completions', " WHERE achievement_id LIKE 'ACH_BOSS_%'"),
      firstMembers: await count('achievement_first_members', " WHERE achievement_id LIKE 'ACH_BOSS_%'"),
      rewards: await count('achievement_box_rewards', " WHERE identity_key='matrix-one' AND achievement_id LIKE 'ACH_BOSS_%'")
    };
    await connection.beginTransaction();
    await settle('boss-shared-first', [combatMember(1), combatMember(2), combatMember(3, 0)], targetFor(sharedCode, sharedDifficulty, 5000), false);
    await connection.commit();
    assert.deepEqual({
      completions: await count('achievement_completions', " WHERE achievement_id LIKE 'ACH_BOSS_%'"),
      firstMembers: await count('achievement_first_members', " WHERE achievement_id LIKE 'ACH_BOSS_%'"),
      rewards: await count('achievement_box_rewards', " WHERE identity_key='matrix-one' AND achievement_id LIKE 'ACH_BOSS_%'")
    }, beforeReplay);
  } finally {
    if (created) await connection.query(`DROP DATABASE \`${database}\``);
    await connection.end();
  }
});
