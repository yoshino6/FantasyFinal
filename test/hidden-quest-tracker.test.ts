import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { hiddenProfession } from '../src/game/hidden-profession.config';
import { hiddenQuest } from '../src/game/hidden-quest.config';
import { hiddenLessonSteps } from '../src/game/hidden-quest.lesson';

const setup = (rows: Record<string,any>[]) => {
  const file=ts.createSourceFile('tracker.ts',readFileSync('src/game/hidden-quest.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const declarations=file.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>['parse','hiddenTrackedQuests'].includes(d.name.getText(file))));
  const code=ts.transpileModule(declarations.map(s=>s.getText(file).replace(/^export\s+/, '')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const queries:string[]=[];
  const pool={execute:async(sql:string,args:unknown[])=>{
    queries.push(sql);assert.match(sql.trim(),/^SELECT\b/);assert.doesNotMatch(sql,/FOR UPDATE/);
    if(sql.includes('FROM player_hidden_profession_quests')) {assert.deepEqual(args,['player']);assert.match(sql,/accepted_at IS NOT NULL/);assert.match(sql,/qualified_at IS NULL/);return [rows];}
    if(sql.includes('FROM player_inventory')) {assert.deepEqual(args.slice(1),[args[1],`${args[1]}_q1`,`${args[1]}_q2`]);return [[{quantity:3}]];}
    if(sql.includes('FROM map_npcs')) return [[{region_id:1,pos_x:12,pos_y:34,pos_z:0,region_name:'百纳镇'}]];
    throw new Error(sql);
  }};
  const run=new Function('getPool','hiddenProfessionsReleased','hiddenProfession','hiddenQuest','hiddenLessonSteps',`${code}\nreturn hiddenTrackedQuests;`)(async()=>pool,true,hiddenProfession,hiddenQuest,hiddenLessonSteps);
  return {run:()=>run('player'),queries};
};
const row=(patch:Record<string,unknown>={})=>({character_id:7,profession_code:'magical_scholar',stage:1,accepted_at:'2026-09-07',qualified_at:null,materials_paid:0,evidence_json:{},current_region_id:2,pos_x:0,pos_y:0,pos_z:0,...patch});

test('未接取、下一环尚未接取和已获资格不出现在任务栏，查看只读',async()=>{
  const {run,queries}=setup([row({accepted_at:null}),row({stage:2,accepted_at:null}),row({stage:11,qualified_at:'2026-09-07'})]);
  assert.deepEqual(await run(),[]);assert.equal(queries.length,1);
});
test('已接取环展示目标和品质不限的材料库存，异地只能导航回导师',async()=>{
  const tasks=await setup([row()]).run();assert.equal(tasks.length,1);assert.match(tasks[0].title,/魔学者 1\/10/);assert.match(tasks[0].description,/微愈液：3\/2/);assert.match(tasks[0].description,/晴儿.*百纳镇/);assert.equal(tasks[0].action.command,'/前往 12 34');assert.doesNotMatch(JSON.stringify(tasks),/委托操作|隐藏二转 magical_scholar/);
});
test('操作完成后只提示回店交付，到店按钮仅打开已有委托面板',async()=>{
  const tasks=await setup([row({materials_paid:1,evidence_json:JSON.stringify({lesson:{complete:true,cursor:3}}),current_region_id:1,pos_x:12,pos_y:34})]).run();
  assert.match(tasks[0].description,/记录齐全/);assert.equal(tasks[0].action.command,'/店内委托 magical_scholar');
});
test('四职业可同时追踪，观察按真实目标记录，最终演练须有获胜证据',async()=>{
  const tasks=await setup(['magical_scholar','weapon_master','inventor','tactician'].map(profession_code=>row({profession_code,stage:profession_code==='tactician'?2:10,materials_paid:1,evidence_json:{lesson:{complete:true,cursor:1},observations:[{code:'forest_slime'}]}}))).run();
  assert.equal(tasks.length,4);for(const task of tasks) {assert.match(task.title,/^【二转·/);assert.doesNotMatch(task.title,/隐藏/);}assert.match(tasks[3].description,/森林史莱姆观察：已记录/);assert.match(tasks[3].description,/幽影狼王观察：未记录/);assert.doesNotMatch(tasks[0].description,/记录齐全/);
});
