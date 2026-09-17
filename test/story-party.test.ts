import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';

const forestChoiceForTest = (connection: any) => {
  const file = ts.createSourceFile('adventure.ts', readFileSync('src/game/adventure.service.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const statement = file.statements.find(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(file) === 'forestGuideChoice'))!;
  const code = ts.transpileModule(statement.getText(file).replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('withTransaction', 'characterFor', 'ensureActionAvailable', 'randomMonsterBaseAttributes', 'monsterCombatStats', 'recordCharacterOperation', `${code};return forestGuideChoice;`)(
    (fn: any) => fn(connection), async () => ({ id: 7, current_region_id: 1, pos_x: 0, pos_y: 0, pos_z: 0 }), () => {}, () => ({}), () => ({ hpMax: 10 }), async () => {}
  );
};

test('三人路线开战失败后复用本人队伍，兼容旧版重置进度，不重复创建队伍或 NPC', async () => {
  for (const status of ['met', 'joined', 'declined']) {
    const writes: string[] = [];
    const connection = { execute: async (sql: string) => {
      if (sql.startsWith('SELECT status,stage')) return [[{ status, stage: 5 }]];
      if (sql.startsWith('SELECT party_id')) return [[{ party_id: 'existing-story-party' }]];
      if (sql.startsWith('SELECT c.id,c.npc_code')) return [[{ id: 7 }, ...['warrior', 'mage', 'priest'].map((role, i) => ({ id: i + 10, npc_code: `npc_forest_${role}_7` }))]];
      if (sql.startsWith('SELECT t.id AS template_id')) return [[{ template_id: 3 }]];
      if (sql.startsWith('SELECT id FROM monster_spawns')) return [[{ id: 99 }]];
      writes.push(sql); return [{ affectedRows: 1 }];
    } };
    const result = await forestChoiceForTest(connection)('user', status === 'declined' ? 'depart' : 'join');
    assert.equal(result.spawnId, 99);
    assert.ok(writes.some(sql => sql.startsWith('UPDATE player_story_progress')));
    assert.ok(writes.every(sql => !sql.startsWith('INSERT')));
  }
});

test('恢复剧情不接管普通玩家队伍或其他玩家的剧情 NPC', async () => {
  for (const members of [[{ id: 7 }, { id: 8 }], [{ id: 7 }, ...['warrior', 'mage', 'priest'].map((role, i) => ({ id: i + 10, npc_code: `npc_forest_${role}_8` }))]]) {
    const connection = { execute: async (sql: string) => {
      if (sql.startsWith('SELECT status,stage')) return [[{ status: 'met', stage: 5 }]];
      if (sql.startsWith('SELECT party_id')) return [[{ party_id: 'other-party' }]];
      if (sql.startsWith('SELECT c.id,c.npc_code')) return [members];
      throw new Error(`unexpected write: ${sql}`);
    } };
    await assert.rejects(forestChoiceForTest(connection)('user', 'join'), /请先离开当前队伍/);
  }
});

test('剧情队伍页显示状态与继续剧情，普通队伍保留退出和队长管理',async()=>{
  const file=ts.createSourceFile('party.ts',readFileSync('src/response/party-info.ts','utf8'),ts.ScriptTarget.Latest,true);
  const declaration=file.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(file)==='partyFormat'))!;
  const code=ts.transpileModule(declaration.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const story of [true,false]){
    const partyInfo=async()=>({story,name:'小队',ownId:1,leaderId:1,leader:{name:'旅人',gameId:1001},members:[{name:'莱昂',gameId:1002}]});
    const format=await new Function('Format','partyInfo',`${code};return partyFormat;`)(Format,partyInfo)('u');
    const result=JSON.stringify(format.value);
    if(story){assert.match(result,/主线剧情队伍/);assert.match(result,/\/继续剧情/);assert.doesNotMatch(result,/\/退出队伍|\/委任队长|\/修改队伍名|\/组队 加入/);}
    else{assert.match(result,/\/退出队伍/);assert.match(result,/\/委任队长/);assert.match(result,/\/修改队伍名/);}
  }
});
