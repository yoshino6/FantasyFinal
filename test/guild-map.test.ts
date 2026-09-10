import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {guildMapRisk} from '../src/game/guild-map.service';

test('地图危险按实际等级划分，20与50边界属于中危，未知等级不可作为低危',()=>{
  assert.deepEqual([null,0,1,19,20,32,50,51].map(guildMapRisk),['待勘测','待勘测','低危','低危','中危','中危','中危','高危']);
});

test('旧兑换指令无法领取外地、中危或关闭的地图，失败不消耗额度',async()=>{
  const statements=ts.createSourceFile('guild.ts',readFileSync('src/game/opening-guild.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const source=statements.statements.filter(s=>ts.isImportDeclaration(s)||ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>['openingGuildAction','useService'].includes(d.name.getText(statements)))).map(s=>s.getText(statements)).join('\n');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const calls:string[]=[],catalogHubs:string[]=[],grants:string[]=[];
  const connection={execute:async(sql:string)=>{calls.push(sql);return sql.startsWith('UPDATE')?[{affectedRows:1}]:[[]];}};
  const mocks:Record<string,unknown>={
    '../database/pool':{withTransaction:(work:any)=>work(connection)},
    './opening.service':{openingCharacter:async()=>({id:1}),grantOpeningItem:async(_c:any,_id:number,item:string)=>grants.push(item)},
    './guild-context':{requireGuildService:async()=>({code:'baina_town'})},
    './opening-pack.service':{repairClaimedOpeningPack:async()=>{}},
    './guild-map.service':{guildMapCatalog:async(_c:any,hub:string)=>{catalogHubs.push(hub);return [{id:1,code:'map_dark_forest',name:'地图·幽暗密林',canExchange:true},{id:2,code:'map_dark_forest_deep',name:'地图·幽暗密林深处',canExchange:false}];}}
  };
  const module={exports:{} as any};new Function('require','module','exports',code)((name:string)=>mocks[name]??{},module,module.exports);
  for(const value of ['map_worldtree_meadow','map_dark_forest_deep','map_closed'])await assert.rejects(module.exports.openingGuildAction('u','map_exchange',value),/当前公会周边已开放的低危地图/);
  assert.deepEqual(calls,[]);assert.deepEqual(grants,[]);
  await module.exports.openingGuildAction('u','map_exchange','map_dark_forest');
  assert.ok(catalogHubs.every(hub=>hub==='baina_town'));
  assert.equal(calls.filter(sql=>sql.startsWith('UPDATE player_opening_services')).length,1);
  assert.deepEqual(grants,['map_dark_forest']);
});
