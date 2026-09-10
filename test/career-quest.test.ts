import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { openingHubs } from '../src/game/opening-world.config';
import { advancedProfessionByCode, worldTreeAdvancedProfessions } from '../src/game/advanced-profession.config';

// 执行实际服务/任务栏声明，注入只读数据库替身，避免启动机器人或初始化真实数据库。
const loadDeclarations = (path: string, names: string[], dependencies: Record<string, unknown>) => {
  const file = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = file.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(file))));
  assert.equal(declarations.length, names.length);
  const source = declarations.map(declaration => declaration.getText(file).replace(/^export\s+/, '')).join('\n');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn { ${names.join(',')} };`)(...Object.values(dependencies));
};

const setup = (overrides: Record<string, unknown> = {}) => {
  const state = {
    character: { id: 7, level: 25, adventurer_registered: 1, profession_code: 'warrior', current_region_id: 1, region_code: 'baina_town', pos_x: 0, pos_y: -170, pos_z: 0,
      has_appraisal: 1, forest_status: 'completed', owns_forest_map: 1, realm_stage: 3, evolution_stage: 8, evolution_cap: 25, experience: 2500, ...overrides },
    guild: { region_id: 1, pos_x: -2, pos_y: -161, pos_z: 0 },
    active: null as null | { profession_code: string; stage: number; story_kills: number; proof_kills: number },
    completed: null as null | { profession_code: string },
    cores: 0
  };
  const pool = { execute: async (sql: string) => {
    assert.match(sql.trim(), /^SELECT\b/, '查看指引不允许写入状态');
    if (sql.includes('FROM characters c')) return [[state.character]];
    if (sql.includes('FROM map_npcs n')) return [[state.guild]];
    if (sql.includes('FROM player_advanced_profession_quests')) {
      assert.match(sql, /stage IN \(1,2,3\)/);
      return [state.active ? [state.active] : []];
    }
    if (sql.includes('FROM player_advanced_professions')) return [state.completed ? [state.completed] : []];
    if (sql.includes('FROM player_inventory')) return [[{ quantity: state.cores }]];
    throw new Error(`意外查询：${sql}`);
  } };
  const career = loadDeclarations('../src/game/career-quest.service.ts', ['careerCharacterFor', 'guildCareerQuestFor', 'guildCareerMainQuest', 'advancedProfessionMainQuest'], { getPool: async () => pool, advancedProfessionByCode, worldTreeAdvancedProfessions, openingHubs });
  const main = loadDeclarations('../src/game/main-quest.service.ts', ['currentMainQuest'], {
    getPool: async () => pool, guildCareerMainQuest: career.guildCareerMainQuest,
    require: (path: string) => {
      assert.equal(path, './lamplight.service');
      return { lamplightMainQuest: async () => null };
    },
    openingMainQuest: async () => null,
    girlGratitudeMainQuest: async () => ({ description: '世界树的叶影已记下这次同行。' }),
    experienceRequiredForLevel: (level: number) => level * 100
  });
  return { state, ...career, ...main };
};

test('森林战斗后直到梨子喵带路完成，指引先继续剧情', async () => {
  for (const forest_status of ['awaiting_arrival', 'arrival_story', 'guild_story']) {
    const service = setup({ level: 5, forest_status, adventurer_registered: 0, profession_code: null });
    assert.equal((await service.currentMainQuest('player')).action.command, '/继续剧情');
  }
});

test('主线依次为公会注册、主职业选择、地图准备，并跳过已完成步骤', async () => {
  const service = setup({ level: 5, adventurer_registered: 0, profession_code: null, owns_forest_map: 0 });
  assert.equal((await service.currentMainQuest('player')).title, '【主线·成为冒险者】');
  service.state.character.adventurer_registered = 1;
  assert.equal((await service.currentMainQuest('player')).title, '【主线·选择主职业】');
  service.state.character.profession_code = 'mage';
  assert.equal((await service.currentMainQuest('player')).title, '【主线·探索的准备】');
});

test('主线不再要求花技能点学习女神赠送的鉴识', async () => {
  const service = setup({ level: 5, has_appraisal: 0, adventurer_registered: 0, profession_code: null });
  assert.equal((await service.currentMainQuest('player')).title, '【主线·成为冒险者】');
});

test('公会导航读取实际位置，并在抵达后提供前台与选职操作', async () => {
  const service = setup({ adventurer_registered: 0, profession_code: null });
  assert.equal((await service.guildCareerMainQuest('player')).action.command, '/前往 -2 -161');
  Object.assign(service.state.character, { pos_x: -2, pos_y: -161 });
  assert.equal((await service.guildCareerMainQuest('player')).action.command, '/建筑区域 guild_counter 前台');
  service.state.character.adventurer_registered = 1;
  assert.equal((await service.guildCareerMainQuest('player')).action.command, '/职业选择');
});

test('二转在25级开放，且不依赖生长结或其他剧情的进度', async () => {
  const service = setup({ level: 24, forest_status: null, realm_stage: 1, evolution_stage: 0 });
  assert.equal(await service.advancedProfessionMainQuest('player'), null);
  service.state.character.level = 25;
  assert.equal((await service.advancedProfessionMainQuest('player')).title, '【主线·二转之路】');
});

test('四种一转职业均列出全部普通二转导师，抵达后可直接查看职业', async () => {
  for (const code of ['warrior', 'mage', 'rogue', 'priest']) {
    const service = setup({ profession_code: code });
    const expected = worldTreeAdvancedProfessions;
    const quest = await service.advancedProfessionMainQuest('player');
    assert.equal(quest.actions.length, expected.length);
    assert.match(quest.description, /不受一转职业限制/);
    assert.deepEqual(quest.actions.map((action: { command: string }) => action.command), expected.map(route => `/前往 ${route.mentor.x} ${route.mentor.y}`));
    const route = expected[0];
    Object.assign(service.state.character, { region_code: 'world_tree', pos_x: route.mentor.x, pos_y: route.mentor.y });
    assert.equal((await service.advancedProfessionMainQuest('player')).actions[0].command, `/二转职业 ${route.mentor.code}`);
  }
});

const trialSetup = (base: string | null, code: string) => {
  const profession = advancedProfessionByCode(code)!;
  const character = { id: 7, level: 25, profession: base, region_code: 'world_tree', pos_x: profession.mentor.x, pos_y: profession.mentor.y };
  const state = { character, completed: null as null | { profession_code: string; completed_at: Date }, active: [] as { profession_code: string; stage: number }[] };
  const writes: { sql: string; values: unknown[] }[] = [];
  const connection = { execute: async (sql: string, values: unknown[]) => {
    if (sql.includes('FROM characters c')) return [[state.character]];
    if (sql.startsWith('SELECT') && sql.includes('FROM player_advanced_professions')) return [state.completed ? [state.completed] : []];
    if (sql.startsWith('SELECT') && sql.includes('FROM player_advanced_profession_quests')) return [state.active];
    assert.match(sql, /^(INSERT INTO|DELETE FROM) player_advanced_profession_quests/);
    writes.push({ sql, values }); return [{ affectedRows: 1 }];
  } };
  const service = loadDeclarations('../src/game/advanced-profession.service.ts', ['advancedProfessionRetrainCooldownMs', 'characterFor', 'assertAtMentor', 'beginAdvancedProfession'], {
    withTransaction: (action: (connection: unknown) => unknown) => action(connection), advancedProfessionByCode, durationText: () => '24小时'
  });
  return { ...service, state, writes };
};

test('四种一转职业都能通过真实服务接取全部普通二转，保留原一转职业', async () => {
  for (const base of ['warrior', 'mage', 'rogue', 'priest']) for (const profession of worldTreeAdvancedProfessions) {
    const service = trialSetup(base, profession.code);
    assert.equal((await service.beginAdvancedProfession('player', profession.code)).code, profession.code);
    assert.equal(service.state.character.profession, base);
    assert.equal(service.writes.length, 1);
    assert.deepEqual(service.writes[0].values, [7, profession.code]);
  }
});

test('跨系二转仍检查等级、初始职业、导师位置、冷却与任务切换确认', async () => {
  const target = advancedProfessionByCode('elementalist')!;
  for (const [patch, expected] of [
    [{ level: 24 }, /Lv.25/], [{ profession: null }, /初始职业/], [{ pos_x: 999 }, /请前往世界树/]
  ] as const) {
    const service = trialSetup('warrior', target.code);
    Object.assign(service.state.character, patch);
    await assert.rejects(service.beginAdvancedProfession('player', target.code), expected);
    assert.equal(service.writes.length, 0);
  }
  const service = trialSetup('warrior', target.code);
  service.state.completed = { profession_code: 'bulwark_guard', completed_at: new Date() };
  await assert.rejects(service.beginAdvancedProfession('player', target.code), /冷却/);
  assert.equal(service.writes.length, 0);
  service.state.completed.completed_at = new Date(Date.now() - 86400001);
  service.state.active = [{ profession_code: 'bulwark_guard', stage: 2 }];
  await assert.rejects(service.beginAdvancedProfession('player', target.code), /确认中断/);
  assert.equal(service.writes.length, 0);
  await service.beginAdvancedProfession('player', target.code, true);
  assert.equal(service.writes.length, 2);
  assert.match(service.writes[0].sql, /^DELETE/);
  assert.deepEqual(service.writes[1].values, [7, target.code]);
  assert.equal(service.state.completed.profession_code, 'bulwark_guard');
});

test('副职业隐藏二转仍要求十环资格及对应副职业', async () => {
  const state = { profession: { code: 'hidden-test', secondary: 'blacksmith' }, character: { id: 7, profession_code: 'mage', adventurer_registered: 1, level: 25, secondary_profession_code: 'alchemist' }, row: { qualified_at: new Date(), stage: 11 } };
  const service = loadDeclarations('../src/game/hidden-quest.service.ts', ['becomeHiddenProfession'], {
    withTransaction: (action: (connection: unknown) => unknown) => action({ execute: () => assert.fail('资格检查不通过时不得写入或继续查询') }),
    context: async () => state, assertCombatLoadoutMutable: async () => {}
  });
  await assert.rejects(service.becomeHiddenProfession('player', 'hidden-test'), /对应的副职业/);
  state.row.stage = 10;
  await assert.rejects(service.becomeHiddenProfession('player', 'hidden-test'), /十环委托/);
});

test('25级尚未选择主职业时，二转引导回公会补齐前置', async () => {
  const service = setup({ profession_code: null });
  const quest = await service.advancedProfessionMainQuest('player');
  assert.equal(quest.title, '【主线·二转之路】');
  assert.match(quest.description, /主职业选择/);
  assert.equal(quest.action.command, '/前往 -2 -161');
});

test('二转三段进度分别引导讨伐、交付与挑战导师，凭证需击杀和材料同时满足', async () => {
  const service = setup({ region_code: 'ridge_foothills' });
  const route = worldTreeAdvancedProfessions[0];
  const mentorCommand = `/前往 ${route.mentor.x} ${route.mentor.y}`;
  service.state.active = { profession_code: route.code, stage: 1, story_kills: 0, proof_kills: 0 };
  assert.equal((await service.advancedProfessionMainQuest('player')).action.command, '/寻怪');
  service.state.active.story_kills = route.first.requiredKills;
  assert.equal((await service.advancedProfessionMainQuest('player')).action.command, mentorCommand);
  service.state.active.stage = 2;
  service.state.cores = route.second.materialCount;
  assert.equal((await service.advancedProfessionMainQuest('player')).action.command, '/寻怪');
  service.state.active.proof_kills = route.second.requiredKills;
  service.state.cores = route.second.materialCount - 1;
  assert.equal((await service.advancedProfessionMainQuest('player')).action.command, '/寻怪');
  service.state.cores++;
  assert.equal((await service.advancedProfessionMainQuest('player')).action.command, mentorCommand);
  service.state.active.stage = 3;
  const trial = await service.advancedProfessionMainQuest('player');
  assert.match(trial.description, /导师试炼/);
  assert.equal(trial.action.command, mentorCommand);
});

test('二转完成后收起引导，重新二转仍追踪新任务', async () => {
  const service = setup();
  service.state.completed = { profession_code: worldTreeAdvancedProfessions[0].code };
  assert.equal(await service.advancedProfessionMainQuest('player'), null);
  const next = worldTreeAdvancedProfessions[1];
  service.state.active = { profession_code: next.code, stage: 1, story_kills: 0, proof_kills: 0 };
  const quest = await service.advancedProfessionMainQuest('player');
  assert.match(quest.title, new RegExp(next.name));
  assert.match(quest.description, /仍保留当前二转职业/);
});

test('任务栏同时呈现生长结与二转，主线分类和搜索保留二转操作', async () => {
  const service = setup();
  const hidden = [{ title: '【二转·魔学者 1/10】四份对照药', description: '目标：交付药剂，回店找晴儿。', action: { label: '[返回导师]', command: '/前往 12 34' } }];
  const texts: string[] = []; const commands: string[] = [];
  const markdown: any = {};
  for (const method of ['addTitle', 'addText', 'addBlockquote']) markdown[method] = (value: string) => { texts.push(value); return markdown; };
  markdown.addNewline = () => markdown;
  markdown.addButton = (_label: string, options: { data: string }) => { commands.push(options.data); return markdown; };
  const format: any = { addMarkdown: () => format, addButtonGroup: () => format };
  const emptyQuest = async () => ({});
  const task = loadDeclarations('../src/response/bounty.ts', ['taskFormat'], {
    ...service, playerBounties: async () => [], blacksmithQuest: emptyQuest, alchemistQuest: emptyQuest,
    deconstructorQuest: emptyQuest, omniscientQuest: emptyQuest, dungeonSecretProgress: emptyQuest,
    secondaryProfessionGuide: async () => false, evolutionObservationDashboard: async () => null,
    alchemyCreationQuest: emptyQuest, currentDynamicEncounter: async () => null, hiddenTrackedQuests: async () => hidden,
    playerWorldSiteCommissions: async () => [], sequence: '①②③④⑤', taskButtons: () => ({}),
    Format: { createMarkdown: () => markdown, create: () => format }
  });
  await task.taskFormat('player', '主线');
  assert.match(texts.join('\n'), /主线·开化·生长结/);
  assert.match(texts.join('\n'), /主线·二转之路/);
  assert.ok(commands.includes('/前往 -8 -7'));
  texts.length = 0; commands.length = 0;
  await task.taskFormat('player', undefined, 1, '二转');
  assert.doesNotMatch(texts.join('\n'), /主线·开化·生长结/);
  assert.match(texts.join('\n'), /主线·二转之路/);
  assert.ok(commands.includes('/前往 -8 -7'));
  texts.length = 0; commands.length = 0;
  await task.taskFormat('player', '支线', 1, '魔学者');
  assert.match(texts.join('\n'), /四份对照药/);
  assert.doesNotMatch(texts.join('\n'), /主线·二转之路/);
  assert.deepEqual(commands, ['/前往 12 34']);
});
