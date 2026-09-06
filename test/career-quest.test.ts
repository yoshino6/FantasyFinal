import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { advancedProfessionByCode, worldTreeAdvancedProfessions } from '../src/game/advanced-profession.config';

// 执行实际服务/任务栏声明，注入只读数据库替身，避免启动机器人或初始化真实数据库。
const loadDeclarations = (path: string, names: string[], dependencies: Record<string, unknown>) => {
  const file = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = file.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(file))));
  assert.equal(declarations.length, names.length);
  const source = declarations.map(declaration => declaration.getText(file).replace(/^export\s+/, '')).join('\n');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
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
  const career = loadDeclarations('../src/game/career-quest.service.ts', ['baseProfessionNames', 'careerCharacterFor', 'guildCareerQuestFor', 'guildCareerMainQuest', 'advancedProfessionMainQuest'], { getPool: async () => pool, advancedProfessionByCode, worldTreeAdvancedProfessions });
  const main = loadDeclarations('../src/game/main-quest.service.ts', ['currentMainQuest'], {
    getPool: async () => pool, guildCareerMainQuest: career.guildCareerMainQuest,
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

test('二转只列出当前主职业适用的导师，抵达后可直接查看职业', async () => {
  for (const [code, name] of Object.entries({ warrior: '战士', mage: '法师', rogue: '盗贼', priest: '牧师' })) {
    const service = setup({ profession_code: code });
    const expected = worldTreeAdvancedProfessions.filter(route => route.baseProfession === name);
    const quest = await service.advancedProfessionMainQuest('player');
    assert.equal(quest.actions.length, expected.length);
    assert.deepEqual(quest.actions.map((action: { command: string }) => action.command), expected.map(route => `/前往 ${route.mentor.x} ${route.mentor.y}`));
    const route = expected[0];
    Object.assign(service.state.character, { region_code: 'world_tree', pos_x: route.mentor.x, pos_y: route.mentor.y });
    assert.equal((await service.advancedProfessionMainQuest('player')).actions[0].command, `/二转职业 ${route.mentor.code}`);
  }
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
});
