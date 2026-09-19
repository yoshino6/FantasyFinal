import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';
import { formatValueToText, formatValueToButtons } from '../src/app-api/app-format';

const load = (path: string, mocks: Record<string, unknown>) => {
  const module = { exports: {} as any };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (id: string) => {
      if (!(id in mocks)) throw new Error('Unexpected dependency: ' + id);
      return mocks[id];
    },
    module,
    module.exports
  );
  return module.exports;
};

test('App 格式转换：标题、正文、引用、按钮与换行', () => {
  const format = Format.create()
    .addMarkdown(
      Format.createMarkdown()
        .addTitle('角色')
        .addNewline()
        .addText('昵称：测试')
        .addNewline()
        .addBlockquote('当前位置：百纳镇')
    )
    .addButtonGroup(
      Format.createButtonGroup()
        .addRow()
        .addButton('详情', '/角色详情', { type: 'command', autoEnter: true })
    );
  const text = formatValueToText(format.value);
  assert.match(text, /【角色】/);
  assert.match(text, /昵称：测试/);
  assert.match(text, /当前位置：百纳镇/);
  const buttons = formatValueToButtons(format.value);
  assert.deepEqual(buttons, [{ label: '详情', command: '/角色详情' }]);
});

test('App 网关命令解析：角色、背包、状态与未知命令', async () => {
  const character = {
    name: '旅人',
    gender: '男',
    professionName: '战士',
    level: 3,
    experience: 120,
    currentHp: 80,
    hpMax: 100,
    currentMp: 30,
    mpMax: 50,
    stamina: 60,
    staminaMax: 120,
    regionName: '百纳镇',
    x: 1,
    y: 2,
    z: 0,
    giftName: '风行旅途'
  };
  const service = load('src/app-api/app-command.service.ts', {
    '../game/character.service': {
      getCharacter: async () => character
    },
    '../game/adventure.service': {
      inventoryView: async () => ({ stacked: [{ name: '草药', quantity: 3 }], instances: [], recent: [{ name: '微光药水' }] }),
      explore: async () => ({ text: '四周只有风声。', spawns: [] }),
      move: async () => ({ text: '你向北方移动。' }),
      moveToMap: async () => ({ character, kind: 'event', text: '你抵达了百纳镇。' }),
      travelStatus: async () => null,
      currentEncounter: async () => null,
      battleStatus: async () => ({ targets: [], playerHp: 80, playerHpMax: 100, playerMp: 30, playerMpMax: 50, turn: 1 }),
      combatAction: async () => ({ log: '你发动攻击，造成 10 点伤害。' }),
      startRest: async () => ({ resting: true, message: '你开始休息。' }),
      resumeAction: async () => ({ message: '你结束休息。' })
    },
    '../game/message': { messageFormat: (title: string, content: string) => Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addText(content)) },
    '../game/divine-message': { registrationScene: async () => Format.create().addMarkdown(Format.createMarkdown().addTitle('序章')) },
    './app-format': { formatToAppMessage: (format: Format, petReply?: string) => ({ text: formatValueToText(format.value), buttons: formatValueToButtons(format.value), petReply }), plainAppMessage: (text: string, buttons: unknown[] = [], petReply?: string) => ({ text, buttons, petReply }) }
  });

  const characterMessage = await service.executeAppCommand({ qqUserId: 'user1', command: '/角色' });
  assert.match(characterMessage.text, /Lv\.3/);
  assert.match(characterMessage.text, /百纳镇/);

  const inventoryMessage = await service.executeAppCommand({ qqUserId: 'user1', command: '/背包' });
  assert.match(inventoryMessage.text, /草药/);

  const statusMessage = await service.executeAppCommand({ qqUserId: 'user1', command: '/状态' });
  assert.match(statusMessage.text, /角色：旅人/);

  const unknownMessage = await service.executeAppCommand({ qqUserId: 'user1', command: '/炼金' });
  assert.match(unknownMessage.text, /暂未接入/);
});

test('App 网关注册剧情：/注册 继续 <stage> 走继续分支', async () => {
  let expectedStage: string | undefined;
  const service = load('src/app-api/app-command.service.ts', {
    '../game/character.service': {
      getCharacter: async () => null,
      beginRegistration: async () => ({ alreadyRegistered: false, stage: 'story' }),
      continueRegistration: async (_user: string, stage?: string) => { expectedStage = stage; return 'audience'; }
    },
    '../game/adventure.service': {
      inventoryView: async () => ({ stacked: [], instances: [], recent: [] }),
      explore: async () => ({ text: '', spawns: [] }),
      move: async () => ({ text: '' }),
      moveToMap: async () => ({ text: '' }),
      travelStatus: async () => null,
      currentEncounter: async () => null,
      battleStatus: async () => ({ targets: [], playerHp: 1, playerHpMax: 1, playerMp: 1, playerMpMax: 1, turn: 1 }),
      combatAction: async () => ({ log: '' }),
      startRest: async () => ({ message: '' }),
      resumeAction: async () => ({ message: '' })
    },
    '../game/message': { messageFormat: (title: string, content: string) => Format.create().addMarkdown(Format.createMarkdown().addTitle(title).addNewline().addText(content)) },
    '../game/divine-message': { registrationScene: async () => Format.create().addMarkdown(Format.createMarkdown().addTitle('序章')) },
    './app-format': { formatToAppMessage: (format: Format, petReply?: string) => ({ text: formatValueToText(format.value), buttons: formatValueToButtons(format.value), petReply }), plainAppMessage: (text: string, buttons: unknown[] = [], petReply?: string) => ({ text, buttons, petReply }) }
  });

  const message = await service.executeAppCommand({ qqUserId: 'user1', command: '/注册 继续 story' });
  assert.equal(expectedStage, 'story');
  assert.match(message.text, /序章/);
});

test('App 身份服务使用纯 MySQL，不依赖 QQ 事件', async () => {
  const service = load('src/game/app-channel.service.ts', {
    'node:crypto': { createHash: () => ({ update: () => ({ digest: () => 'hash' }) }), randomBytes: (n: number) => Buffer.alloc(n, 1) },
    '../database/pool': {
      getPool: async () => ({ execute: async () => [[]] }),
      withTransaction: async (work: (c: unknown) => unknown) => work({ execute: async () => [[]] })
    }
  });
  assert.equal(typeof service.createAppUser, 'function');
  assert.equal(typeof service.issueBindingCode, 'function');
  assert.equal(typeof service.bindAppUser, 'function');
  assert.equal(typeof service.sessionForApp, 'function');
});

test('App 路由：健康检查、鉴权失败与命令接口', async () => {
  let loggedIn = false;
  let executedCommand = '';
  const router = load('src/app-api/router.ts', {
    '../config/app-api': { getAppApiConfig: () => ({ enabled: true, allowInsecurePublicHttp: true }) },
    '../game/app-channel.service': {
      sessionForApp: async (token: string) => loggedIn && token ? { appUserId: 'app_1', displayName: '旅人', qqUserId: 'app_1', playerId: 1, characterId: null } : null,
      bindAppUser: async () => ({ qqUserId: 'qq_1', characterId: null }),
      createAppUser: async (name: string) => ({ appUserId: 'app_1', token: 'token', qqUserId: 'app_1' }),
      appSessionQqUser: async (session: any) => session.qqUserId
    },
    './app-command.service': {
      executeAppCommand: async (input: any) => { executedCommand = input.command; return { text: '角色面板', buttons: [], petReply: '你好' }; },
      appQuickPanel: () => ({ text: '桌宠待命', buttons: [], petReply: '去哪？' })
    }
  });
  const routes = new Map<string, any>();
  const register: any = {};
  for (const method of ['get', 'post']) register[method] = (path: string, fn: any) => routes.set(method + ' ' + path, fn);
  router.registerAppApiRoutes(register);

  const healthCtx: any = {};
  await routes.get('get /app-api/v1/health')(healthCtx);
  assert.equal(healthCtx.body.ok, true);

  const ctx: any = {
    req: { socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() {} },
    get: (name: string) => name === 'authorization' ? 'Bearer token' : '',
    set: () => {}
  };
  await routes.get('post /app-api/v1/command')(ctx);
  assert.equal(ctx.status, 401);

  loggedIn = true;
  const commandCtx: any = { ...ctx, get: (name: string) => name === 'authorization' ? 'Bearer token' : '' };
  commandCtx.req = { socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ command: '/角色' })); } };
  await routes.get('post /app-api/v1/command')(commandCtx);
  assert.equal(executedCommand, '/角色');
  assert.equal(commandCtx.body.text, '角色面板');
});
