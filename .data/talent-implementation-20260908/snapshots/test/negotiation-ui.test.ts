import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';
import { negotiationInventoryPage } from '../src/game/negotiation-item-policy';
import type { NegotiationView } from '../src/game/negotiation.service';
import { NegotiationCombatError } from '../src/game/negotiation.service';

// 使用实际 Format 和 QQ 适配器序列化函数，隔离路由及数据库，不向平台发送消息。
const module = { exports: {} as any };
const code = ts.transpileModule(readFileSync('src/response/negotiation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('require', 'module', 'exports', code)((id: string) => id === 'alemonjs' ? { Format } : {}, module, module.exports);
const adapter = readFileSync('node_modules/@alemonjs/qq-bot/lib/sends.js', 'utf8');
const serialize = new Function(adapter.slice(adapter.indexOf('const mdFormatters ='), adapter.indexOf('const formatMention =')) + '\nreturn createMarkdownText;')();
const view: NegotiationView = {
  kind: 'ongoing', actorId: 1, sessionId: 'example-session', revision: 3, spawnId: 10, name: '三首雾沼蛇母', mood: '戒备', goodwill: 0, protection: 0,
  text: '它游开半圈，对你仍托着的「微光草药」没有再看一眼。\n对方未收下：微光草药 ×1（仍在背包）',
  inventory: negotiationInventoryPage(Array.from({ length: 21 }, (_, i) => ({ id: i + 1, code: `test_bone_${i}`, name: `黑铁骨片·Lv.${i + 1}`, item_type: 'material', item_category: '怪材', stackable: 1, trade_price: 10, quantity: 8, effect_json: { monster_craft_material: 'bone' } })))
};

test('QQ 消息：行为引用加粗，收据单独引用，十条物品的加粗与链接同处引用且分类不粘连', () => {
  const format = module.exports.negotiationFormat(view);
  const parts = format.value.find((part: any) => part.type === 'Markdown').value;
  const text = serialize(parts);
  assert.match(text, />\s+\*\*它游开半圈[^\n]+\*\*/);
  assert.match(text, /对方未收下：\n\n> 微光草药 ×1（仍在背包）/);
  const rows = text.split('\n').filter((line: string) => /^\s*>\s+\*\*[①②③④⑤⑥⑦⑧⑨⑩]/.test(line));
  assert.equal(rows.length, 10);
  rows.forEach((line: string, i: number) => {
    assert.ok(line.includes('①②③④⑤⑥⑦⑧⑨⑩'[i]));
    assert.match(line, /\*\*.+ ×8\*\*\s+<qqbot-cmd-input text="\/交涉物品 10 example-session 3 \d+ 1" show="\[交涉\]" \/>/);
  });
  assert.equal(text.split('\n').filter((line: string) => /^> 骨质\s*$/.test(line)).length, 10);
  assert.ok(!/> 骨质[^\n]*[①②③④⑤⑥⑦⑧⑨⑩]/.test(text));
  assert.match(text, /第 1\/3 页｜共 21 种/);
  const buttons = format.value.find((part: any) => part.type === 'BT.group').value.map((row: any) => row.value.map((button: any) => button.value));
  assert.deepEqual(buttons, [['上一页', '搜索', '翻页', '下一页'], ['交谈', '刷新'], ['主动开战', '离开交涉']]);
  const accepted = module.exports.negotiationFormat({ ...view, text: '它把礼物拢在身旁。\n已交付：新鲜肉块 ×1' });
  assert.match(serialize(accepted.value[0].value), /已交付：\n\n> 新鲜肉块 ×1/);
});

test('开战面板不含交涉入口，旧版停战字段也不能隐藏正常战斗按钮', () => {
  const source = readFileSync('src/response/adventure.ts', 'utf8');
  const section = source.slice(source.indexOf('const battleButtons ='), source.indexOf('const encounterButtons ='));
  const script = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const battleButtons = new Function('Format', script + '\nreturn battleButtons;')(Format);
  for (const negotiation of [null, { spawnId: 10 }]) {
    const buttons = battleButtons({ canAct: true, readySkillSlots: [], itemSlots: [], deviceSlots: [], appraisal: { learned: false }, mode: 'pve', targets: [{ id: 10, defeated: false }], negotiation });
    const labels = buttons.value.value.flatMap((row: any) => row.value.map((button: any) => button.value));
    assert.ok(labels.includes('普攻')); assert.ok(!labels.some((label: string) => label.includes('交涉')));
  }
});

test('战斗中点击旧交涉消息，提示只提供战斗面板和操作面板', async () => {
  const sent: any[] = []; const local = { exports: {} as any };
  const mocks: Record<string, unknown> = {
    alemonjs: { Format, useEvent: () => [{ current: { UserId: 'test' } }], useRoute: () => [{ param: (key: string) => key === 'id' ? '10' : '' }] },
    '../game/use-game-message': { useGameMessage: () => [{ send: async ({ format }: any) => { sent.push(format); } }] },
    '../game/adventure.service': { negotiateEncounter: async () => { throw new NegotiationCombatError(); } },
    '../game/negotiation.service': { NegotiationCombatError }
  };
  new Function('require', 'module', 'exports', code)((id: string) => mocks[id] ?? {}, local, local.exports);
  await local.exports.negotiationHandler('open')();
  const labels = sent[0].value.find((part: any) => part.type === 'BT.group').value.flatMap((row: any) => row.value.map((button: any) => button.value));
  assert.deepEqual(labels, ['战斗面板', '操作面板']);
});
