import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { skillSpecialization } from '../src/game/skill-specialization';
import { specializationPerLevelLines, specializationTotalLines, specializationNumberText, passiveSpecializationPerLevelLine, passiveSpecializationTotalLine } from '../src/game/skill-specialization-presentation';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';

// 直接执行源码中的指定函数，隔离机器人启动、图片导入和真实数据库；不复制被测实现。
const loadDeclarations = (path: string, names: string[], dependencies: Record<string, unknown> = {}) => {
  const file = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = file.statements.filter(statement => ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(file)))
    : ts.isExportAssignment(statement) && names.includes('defaultHandler'));
  assert.equal(declarations.length, names.length, `未找到 ${path} 的全部被测声明`);
  const source = declarations.map(declaration => ts.isExportAssignment(declaration)
    ? `const defaultHandler = ${declaration.expression.getText(file)};`
    : declaration.getText(file).replace(/^export\s+/, '')).join('\n');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn { ${names.join(',')} };`)(...Object.values(dependencies));
};
const presentation = loadDeclarations('../src/response/adventure.ts', [
  'battleButtons', 'appendBattleState', 'appendCombatLog', 'battleRoundTitle', 'battleRoundHeader', 'battleFormat', 'battleOperationFormat', 'battleStartFormat', 'finalBattleFormat'
], { Format });
const nodes = (format: ReturnType<typeof Format.create>) => format.value.find(item => item.type === 'Markdown')!.value as any[];
const title = (format: ReturnType<typeof Format.create>) => nodes(format).find(item => item.type === 'MD.title')?.value;
// 使用已安装 QQ 适配器的实际 Markdown 拼接器，覆盖标题与首行被拼到同一行的问题。
const qqMarkdown = loadDeclarations('../node_modules/@alemonjs/qq-bot/lib/sends.js', ['mdFormatters', 'createMarkdownText']);
const rendered = (format: ReturnType<typeof Format.create>) => qqMarkdown.createMarkdownText(nodes(format)) as string;
const battle = (mode = 'spar', turn = 1) => ({
  mode, turn, canAct: true, selectedTargetId: 9, selectedAllyId: null, readySkillSlots: [1], itemSlots: [1], deviceSlots: [], spirits: [], appraisal: { learned: false },
  members: [{ id: 1, name: '旅行者', hp: 90, hpMax: 100, mp: 40, mpMax: 50, statusText: '护盾(2)', defeated: false }],
  targets: [{ id: 9, name: '漠北', hp: 200, hpMax: 250, statusText: '目盲(2)' }]
});

test('切磋开战、操作、回合日志与结束日志统一标题，普通战斗保持原样', () => {
  assert.equal(title(presentation.battleStartFormat('与漠北切磋', battle())), '切磋＜1＞回合');
  assert.equal(title(presentation.battleOperationFormat('目标已切换', battle('spar', 2))), '切磋＜2＞回合');
  for (const header of ['切磋＜2＞回合', '切磋<2>回合', '战斗<2>回合']) {
    const format = presentation.battleFormat('', `${header}\n➤【漠北】普通攻击`, battle('spar', 3));
    assert.equal(title(format), '切磋＜2＞回合');
    assert.ok(!nodes(format).some(item => item.type === 'MD.blockquote' && item.value === header));
  }
  assert.equal(title(presentation.finalBattleFormat('切磋＜5＞回合\n切磋结束。')), '切磋＜5＞回合');
  assert.equal(title(presentation.battleStartFormat('遭遇敌人', battle('pve'))), '战斗开始');
  assert.equal(title(presentation.battleOperationFormat('', battle('pve', 3))), '战斗<3>回合');
  assert.equal(title(presentation.finalBattleFormat('战斗<5>回合\n战斗结束。')), '战斗<5>回合');
});

test('双方血蓝与状态使用单层引用，并保留双方名称的切换目标按钮', () => {
  const md = presentation.appendBattleState(Format.createMarkdown(), battle());
  const items = md.value.value;
  const buttons = items.filter((item: any) => item.type === 'MD.button');
  assert.deepEqual(buttons.map((item: any) => item.options.data), ['/切换目标 1 友方', '/切换目标 9']);
  for (const button of buttons) assert.deepEqual(items[items.indexOf(button) - 1], { type: 'MD.text', value: '> ' });
  assert.deepEqual(items.filter((item: any) => item.type === 'MD.blockquote').map((item: any) => item.value), ['状态：护盾(2)', '状态：目盲(2)']);
  assert.ok(!items.some((item: any) => item.type === 'MD.bold' || item.type === 'MD.title' || String(item.value).includes('>>')));
  const down = battle(); down.members[0].defeated = true;
  const downItems = presentation.appendBattleState(Format.createMarkdown(), down).value.value;
  const labelIndex = downItems.findIndex((item: any) => item.type === 'MD.text' && item.value === '友方1 旅行者');
  assert.equal(downItems[labelIndex - 1].value, '> ');
});

test('切磋操作按钮不出现道具，认输与友方瞄准在重开面板后保留', () => {
  const format = presentation.battleOperationFormat('', battle());
  const group = format.value.find((item: any) => item.type === 'BT.group')!;
  const labels = group.value.flatMap((row: any) => row.value.map((button: any) => button.value));
  assert.ok(labels.includes('认输'));
  assert.ok(!labels.some((label: string) => label.startsWith('道具') || label === '逃跑'));
  const panel = readFileSync(new URL('../src/response/panel.ts', import.meta.url), 'utf8');
  assert.match(panel, /return battleOperationFormat\('', battle\)/);
  assert.match(panel, /await battlePanel\(battle\)/);
});

test('空名称切磋内部标记不会被丢弃，实体化保留域民真名和快照属性', () => {
  const service = loadDeclarations('../src/game/adventure.service.ts', ['jsonObject', 'jsonArray', 'traitList', 'monsterCombatStats', 'materializeMonster'], {
    isBossComponent: () => false, kingbeastRole: () => ''
  });
  const traits = [{ code: 'npc_sparring', name: '', profile: { name: '漠北', stats: { hpMax: 1234, mpMax: 567, physicalAttack: 89, speed: 30 } } }];
  for (const traits_json of [traits, JSON.stringify(traits)]) {
    assert.equal(service.traitList(traits_json).length, 1);
    const raw = { name: '切磋域民', level: 12, traits_json };
    for (const reveal of [false, true]) {
      const shown = service.materializeMonster(raw, reveal);
      assert.equal(shown.name, '漠北');
      assert.equal(shown.hp_max, 1234);
      assert.equal(shown.attack, 89);
      assert.equal(service.materializeMonster(shown, reveal).name, '漠北');
    }
  }
  assert.equal(service.traitList([{ code: 'unrelated', name: '' }]).length, 0);
  assert.equal(service.traitList([{ code: 'fierce', name: '凶猛的' }])[0].name, '凶猛的');
});

test('天气不随回合或切换目标重复显示', () => {
  const state = { ...battle(), environment: { name: '雷雨', hint: '雷元素增强' } };
  for (const format of [presentation.battleFormat('', '切磋＜1＞回合\n➤【漠北】普通攻击', state), presentation.battleOperationFormat('目标已切换', state)]) {
    assert.doesNotMatch(rendered(format), /区域天气|雷雨|雷元素增强/);
  }
});

test('QQ Markdown 中回合标题与首行被动、行动、吟唱均明确换行', () => {
  for (const firstLine of ['#凝神#获得护盾', '$目盲$命中下降', '&回复&恢复生命', '➤【漠北】普通攻击', '【漠北】开始了技能吟唱。。。']) {
    for (const separator of ['\n', '\r\n']) {
      const log = `切磋＜2＞回合${separator}${firstLine}`;
      for (const format of [presentation.battleFormat('', log, battle('spar', 3)), presentation.finalBattleFormat(log)]) {
        const text = rendered(format);
        assert.equal(text.split('\n')[0].trim(), '# 切磋＜2＞回合');
        assert.match(text, /^# 切磋＜2＞回合 *\n\n/);
        assert.equal((text.match(/切磋＜2＞回合/g) ?? []).length, 1);
      }
    }
  }
});

const showSkill = async (overrides: Record<string, unknown> = {}) => {
  let result: ReturnType<typeof Format.create> | undefined;
  const skill = {
    id: 1, code: 'resident_a01', name: '万象折页', category: 'utility', tier: '中位', skill_kind: '奥术', element: '无', range_type: '远程', target_scope: '自身',
    description: '下一次技能效果全体化。', actualPower: 0, actualManaCost: 100, actualCooldown: 5, actualChant: 1,
    power: 0, mana_cost: 100, cooldown_turns: 5, chant_turns: 1,
    specializationResult: skillSpecialization({ code: 'resident_a01', category: 'utility', tier: '中位', power: 0, mana_cost: 100, cooldown_turns: 5, chant_turns: 1 }),
    specializationUpgradeCosts: { overcharge: 1, potent: 2, instant: 3, efficient: 4 }, specializationChoices: ['overcharge', 'instant', 'efficient', 'potent'],
    learned: false, level: 1, max_level: 1, learn_cost: 5, effectDetails: [], specializations: {}, specializationMaxLevel: 1, specializationUpgradeCost: null, nextUpgradeCost: null, skillPoints: 10,
    ...overrides
  };
  const { skillDetailHandler } = loadDeclarations('../src/response/skill-list.ts', ['categoryNames', 'effectValueText', 'effectDescription', 'appendSkillEffectDetails', 'skillDetailHandler'], {
    Format, skillDetail: async () => skill,
    balancedSkillDescription: (_code: string, text: string) => text,
    specializationPerLevelLines, specializationTotalLines, specializationNumberText, passiveSpecializationPerLevelLine, passiveSpecializationTotalLine,
    useEvent: () => [{ current: { UserId: 'test' } }], useRoute: () => [{ param: () => 1 }],
    useMessage: () => [{ send: async ({ format }: { format: ReturnType<typeof Format.create> }) => { result = format; } }],
    advancedSkillDescriptions: { advanced_test: '二转技能的完整效果。' }, advancedResourceRequirementForSkill: () => undefined, advancedResourceForProfession: () => undefined,
    isAdvancedProfessionSkillCode: (code: string) => code === 'advanced_test', advancedProfessionPassiveCodes: new Set(), advancedBoundSkillDefinitions: [],
    messageFormat: (_title: string, error: string) => { throw new Error(error); }
  });
  await skillDetailHandler(); assert.ok(result); return result;
};

test('已学与未学主动效果都置于效果栏，冷却下一行显示吟唱数值', async () => {
  for (const learned of [false, true]) for (const actualChant of [0, 1]) {
    const format = await showSkill({ learned, actualChant });
    const text = rendered(format); const fields = nodes(format).filter(item => item.type === 'MD.blockquote').map(item => item.value);
    assert.deepEqual(fields.slice(fields.indexOf('冷却：5'), fields.indexOf('冷却：5') + 2), ['冷却：5', `吟唱：${actualChant}`]);
    assert.ok(fields.includes('效果：下一次技能效果全体化。'));
    assert.equal((text.match(/下一次技能效果全体化。/g) ?? []).length, 1);
    assert.ok(!nodes(format).some(item => item.type === 'MD.text' && String(item.value).includes('下一次技能效果全体化')));
    assert.ok(!fields.includes('无'));
  }
});

test('专精只显示适用方向，删除重复说明并保留收益和独立价格', async () => {
  const format = await showSkill({ learned: true, specializationChoices: ['instant'], specializationMaxLevel: 40 });
  const text = rendered(format);
  assert.doesNotMatch(text, /过充|强效|节能|不适用|总体变化|衰减|尚未加点/);
  assert.ok(text.includes(specializationPerLevelLines('中位').instant[0]));
  assert.match(text, /升级\(SP3\)/);
});

test('各阶详情展示当前数值、固定收益和四个独立升级价格', async () => {
  for (const [tier, maximum] of [['基础', 10], ['下位', 20], ['中位', 40]] as const) {
    const base = { code: 'test', category: 'magic', tier, power: 150, mana_cost: 300, cooldown_turns: 3, chant_turns: 0 };
    const specializations = { overcharge: 2, potent: 3, instant: 4, efficient: 5 };
    const current = skillSpecialization(base, specializations);
    const text = rendered(await showSkill({ ...base, learned: true, specializations, specializationUpgradeCosts: specializations, specializationResult: current, actualManaCost: current.mana, actualCooldown: current.cooldown, actualChant: current.chant, specializationMaxLevel: maximum }));
    const order = ['①过充', '②强效', '③瞬息', '④节能'].map(name => text.indexOf(name));
    assert.ok(order.every(index => index >= 0)); assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(text.includes('升至Lv.3：威力+6%'));
    assert.match(text, /效果、可成长时长、控制概率系数\+6%/);
    assert.match(text, /威力：159/);
    assert.ok(text.includes(`蓝耗：${current.mana}`));
    for (const cost of [2, 3, 4, 5]) assert.ok(text.includes(`升级(SP${cost})`));
    assert.doesNotMatch(text, /总体变化|NaN|undefined|衰减/);
  }
});

test('被动强效每级变化与总体变化分区，不套主动成本', async () => {
  const text = rendered(await showSkill({ category: 'passive', learned: true, passiveSpecializable: true, passiveFactor: 1.15, specializationMaxLevel: 40 }));
  assert.match(text, /升至Lv.2：可成长数值\+1.5%/);
  assert.match(text, /可成长数值：\+15%/);
  assert.equal((text.match(/总体变化（仅专精）/g) ?? []).length, 1);
  assert.doesNotMatch(text, /冷却\/吟唱基数|蓝耗：/);
});

test('被动、二转与附加状态技能详情保留效果且不贴在名称之后', async () => {
  for (const learned of [false, true]) {
    const passive = await showSkill({ category: 'passive', learned });
    assert.ok(nodes(passive).some(item => item.value === '效果：下一次技能效果全体化。'));
    const advanced = await showSkill({ code: 'advanced_test', learned });
    assert.ok(nodes(advanced).some(item => item.value === '效果：二转技能的完整效果。'));
    assert.doesNotMatch(rendered(advanced), /下一次技能效果全体化/);
    const status = await showSkill({ learned, effectDetails: [{ code: 'slow', name: '减速', value: 20, duration: 2, trigger_timing: 'on_hit' }] });
    assert.match(rendered(status), /①减速/); assert.match(rendered(status), /速度降低20%/);
  }
});

test('切磋准备面板只显示身份、次数、携带技能与鉴识提示，不读取隐藏属性', async () => {
  let result: ReturnType<typeof Format.create> | undefined;
  const profile = { name: '漠北', level: 12, profession: 'warrior', rotation: ['a'], passives: ['b'],
    get stats() { throw new Error('准备面板不应读取属性'); }, get equipment() { throw new Error('准备面板不应读取装备'); }, get injections() { throw new Error('准备面板不应读取进化'); }
  };
  const { defaultHandler } = loadDeclarations('../src/response/npc-sparring.ts', ['defaultHandler'], {
    Format, useEvent: () => [{ current: { UserId: 'test' } }], useRoute: () => [{ param: (key: string) => key === 'code' ? 'blacksmith' : undefined }],
    useMessage: () => [{ send: async ({ format }: { format: ReturnType<typeof Format.create> }) => { result = format; } }],
    npcSparringView: async () => ({ profile, used: false }), residentSkillByCode: (code: string) => ({ name: code === 'a' ? '淬刃' : '坚守' }),
    messageFormat: (_title: string, error: string) => { throw new Error(error); }
  });
  await defaultHandler(); assert.ok(result);
  const text = rendered(result);
  assert.match(text, /切磋 · 漠北/); assert.match(text, /今日次数 0\/1/); assert.match(text, /鉴识/);
  assert.match(text, /携带主动：淬刃/); assert.match(text, /链接被动：坚守/);
  assert.doesNotMatch(text, /装备：|进化：|生命 \d|魔力 \d|物攻|魔攻|物防|魔防/);
});
