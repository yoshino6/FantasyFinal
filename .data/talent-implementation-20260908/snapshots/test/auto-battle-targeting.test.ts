import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// 执行实际源码声明，隔离机器人启动与真实数据库，不复制自动选敌/出招实现。
const loadDeclarations = (path: string, names: string[], dependencies: Record<string, unknown>) => {
  const file = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = file.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(file))));
  assert.equal(declarations.length, names.length);
  const source = declarations.map(declaration => declaration.getText(file).replace(/^export\s+/, '')).join('\n');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn { ${names.join(',')} };`)(...Object.values(dependencies));
};

const target = (id: number, part?: string, defeated = false) => ({
  spawn_id: id, is_defeated: Number(defeated), cooldowns: {},
  traits_json: part ? [{ code: 'boss_component', body_spawn_id: 100, part_key: part }] : []
});
const makeSelection = (targets: ReturnType<typeof target>[], selected = 101) => {
  const member = { character_id: 1, qq_user_id: 'player', selected_target_id: selected, turn_no: 1, cooldowns: {}, auto_potion_enabled: 0 };
  const rotation = [{ sequence_no: 1, skill_id: 7, learned_skill_id: 7, code: 'test_skill' }];
  const pool = { execute: async (sql: string) => {
    assert.match(sql.trim(), /^SELECT\b/); // 读取出招时不允许修改保存配置。
    if (sql.includes('FROM player_auto_battle_actions')) return [rotation];
    if (sql.includes('SELECT ct.spawn_id')) return [targets];
    return [[member]];
  } };
  const service = loadDeclarations('../src/game/auto-battle.service.ts', ['availableAutoPotion', 'configuredAutoAction', 'pendingPartyAutoBattleActions'], {
    characterIdFor: async () => 1, getPool: async () => pool,
    readRuleState: () => ({}), visibleResidentBuff: () => false
  });
  return { pending: () => service.pendingPartyAutoBattleActions('player'), member, rotation };
};

test('自动战斗击破当前部位后改选存活部位，全部击破后技能继续攻击本体', async () => {
  const targets = [target(100), target(101, 'gruen_armor'), target(102, 'gruen_arm'), target(103, 'gruen_horn')];
  const selection = makeSelection(targets);
  for (const expected of [101, 102, 103, 100]) {
    const [entry] = await selection.pending();
    assert.equal(entry.targetId, expected);
    assert.deepEqual(entry.action, { type: 'skill', skillId: 7 });
    selection.member.selected_target_id = expected;
    targets.find(row => row.spawn_id === expected)!.is_defeated = 1;
  }
  assert.equal(selection.rotation[0].skill_id, 7);
});

test('普通目标被击败、移除或选中值为零时，也只改选存活敌人', async () => {
  for (const selected of [101, 999, 0]) {
    const [entry] = await makeSelection([target(100), target(101, undefined, true)], selected).pending();
    assert.equal(entry.targetId, 100);
    assert.equal(entry.action.type, 'skill');
  }
  const [entry] = await makeSelection([target(100, undefined, true)]).pending();
  assert.equal(entry.targetId, undefined);
});

test('存活的已选目标与 Boss 紧急部位优先级不受修复影响', async () => {
  const [selected] = await makeSelection([target(100), target(101)]).pending();
  assert.equal(selected.targetId, 101);
  const targets = [target(100), target(101, 'gruen_armor'), target(102, 'gruen_horn')];
  targets[0].cooldowns = { boss_component_gruen_horn_charge: 1 };
  const [urgent] = await makeSelection(targets).pending();
  assert.equal(urgent.targetId, 102);
});

const loadResolution = (dependencies: Record<string, unknown>) => loadDeclarations('../src/response/adventure.ts', [
  'resolvePartyAutoBattleActions', 'resolveFullAutoBattle'
], { continueCombatChant: async () => null, ...dependencies });

test('切换目标时部位已失效，不应跳过原技能；最后自动战斗日志保留技能行动', async () => {
  const calls: string[] = [];
  const resolution = loadResolution({
    pendingPartyAutoBattleActions: async () => [{ qqUserId: 'player', targetId: 101, action: { type: 'skill', skillId: 7 } }],
    switchCombatTarget: async () => { throw new Error('该目标已被击败或不在本场战斗中。'); },
    combatAction: async (_user: string, type: string, _slot: unknown, skillId: number) => {
      calls.push(type);
      if (type === 'skill') assert.equal(skillId, 7);
      return { ended: true, waiting: false, log: type === 'skill' ? '战斗<2>回合\n技能命中本体。' : '战斗<2>回合\n普通攻击。' };
    }
  });
  const full = await resolution.resolveFullAutoBattle('player');
  assert.deepEqual(calls, ['skill']);
  assert.match(full.log, /技能命中本体/);
  assert.doesNotMatch(full.log, /普通攻击/);
});

test('仅本次技能确实不可释放才回退普攻，下次仍按原配置施放', async () => {
  const calls: string[] = [];
  let attempts = 0;
  const resolution = loadResolution({
    pendingPartyAutoBattleActions: async () => [{ qqUserId: 'player', targetId: 100, action: { type: 'skill', skillId: 7 } }],
    switchCombatTarget: async () => 100,
    combatAction: async (_user: string, type: string) => {
      calls.push(type);
      if (type === 'skill' && attempts++ === 0) throw new Error('自动战斗技能冷却中。');
      return { ended: false, waiting: false, log: type };
    }
  });
  await resolution.resolvePartyAutoBattleActions('player');
  await resolution.resolvePartyAutoBattleActions('player');
  assert.deepEqual(calls, ['skill', 'attack', 'skill']);
});

test('战斗已结束等非目标失效异常不可误当作技能不可用', async () => {
  let submitted = false;
  const resolution = loadResolution({
    pendingPartyAutoBattleActions: async () => [{ qqUserId: 'player', targetId: 100, action: { type: 'skill', skillId: 7 } }],
    switchCombatTarget: async () => { throw new Error('当前不在战斗中。'); },
    combatAction: async () => { submitted = true; return { ended: true }; }
  });
  await assert.rejects(resolution.resolvePartyAutoBattleActions('player'), /当前不在战斗中/);
  assert.equal(submitted, false);
});
