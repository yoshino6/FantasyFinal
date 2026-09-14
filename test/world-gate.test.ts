import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('界门在无主线阶段时往返开放，并落在实际登记的门口', async () => {
  const file = ts.createSourceFile('gate.ts', readFileSync('src/game/girl-gratitude.service.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['questCode', 'gateCode', 'worldTreeGateCode', 'characterFor', 'stageFor', 'requireAt', 'writeStage', 'teleportToWorldTree', 'returnToBainaTown'];
  const source = file.statements.filter(statement => ts.isImportDeclaration(statement) || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(file)))).map(statement => statement.getText(file)).join('\n');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const arrivals: unknown[][] = [];
  let stage = 0, mapGrants = 0, stageUpdates = 0;
  let current = { id: 1, current_region_id: 10, pos_x: 14, pos_y: -167, pos_z: 0 };
  const connection = { execute: async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT c.id,c.current_region_id')) return [[current]];
    if (sql.includes('SELECT 1 FROM map_npcs')) return [[{ present: 1 }]];
    if (sql.includes("r.code='world_tree'")) return [[{ id: 20, pos_x: 2, pos_y: -2, pos_z: 0 }]];
    if (sql.includes("r.code='baina_town'")) return [[{ id: 10, pos_x: 14, pos_y: -167, pos_z: 0 }]];
    if (sql.includes('player_opening_stories')) return [[]];
    if (sql.startsWith('SELECT stage FROM player_main_quest_progress')) return [stage ? [{ stage }] : []];
    if (sql.startsWith('INSERT INTO player_main_quest_progress')) { stageUpdates++; return [[]]; }
    if (sql.startsWith('INSERT INTO player_inventory')) { mapGrants++; return [[]]; }
    if (sql.startsWith('UPDATE characters SET current_region_id')) {
      arrivals.push(params);
      current = { ...current, current_region_id: Number(params[0]), pos_x: Number(params[1]), pos_y: Number(params[2]), pos_z: Number(params[3]) };
    }
    return [[]];
  } };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)((name: string) => name === '../database/pool' ? { withTransaction: (work: any) => work(connection) } : {}, module, module.exports);
  const outbound = await module.exports.teleportToWorldTree('u');
  assert.match(outbound, /返程界门就在身后/);
  assert.deepEqual(arrivals[0]?.slice(0, 4), [20, 2, -2, 0]);
  await module.exports.returnToBainaTown('u');
  assert.deepEqual(arrivals[1]?.slice(0, 4), [10, 14, -167, 0]);
  stage = 1;
  assert.match(await module.exports.teleportToWorldTree('u'), /获得【地图·世界树】/);
  assert.equal(mapGrants, 1);
  assert.equal(stageUpdates, 1);
});
