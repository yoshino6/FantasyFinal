import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { encumbrance } from '../src/game/encumbrance';

const attributes={constitution:20,strength:30,spirit:10,intelligence:20,agility:30,perception:40};
test('六维承载公式与超重比例：低于及等于上限无惩罚，超重20%减速20%',()=>{
  for(const weight of [0,99,100]){
    const burden=encumbrance(attributes,weight);
    assert.equal(burden.capacity,100);assert.equal(burden.speedPenaltyPct,0);assert.equal(burden.applySpeed(8),8);
  }
  const burden=encumbrance(attributes,120);
  assert.equal(burden.overloadPct,20);assert.equal(burden.speedPenaltyPct,20);assert.equal(burden.applySpeed(8),6.4);
  assert.equal(encumbrance({...attributes,constitution:21,strength:32,spirit:11,intelligence:21,agility:31,perception:41},100).capacity,105);
});

test('极端超重保留最低速度，神器免除惩罚但不改变实际超重',()=>{
  const burden=encumbrance(attributes,300);
  assert.equal(burden.overloadPct,200);assert.equal(burden.speedPenaltyPct,100);assert.equal(burden.applySpeed(8),1);
  const ignored=encumbrance(attributes,300,true);
  assert.equal(ignored.overloadPct,200);assert.equal(ignored.speedPenaltyPct,0);assert.equal(ignored.applySpeed(8),8);
});

test('背包结算使用最终六维、实际库存和装备效果，每次读取重新计算',async()=>{
  const source=readFileSync('src/game/adventure.service.ts','utf8');
  const start=source.indexOf('export const inventory =');const end=source.indexOf('\n};',start)+3;
  const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let quantity=12,ignoreWeightPenalty=false;const final={...attributes};
  const pool={execute:async(sql:string)=>sql.includes('FROM player_inventory')?[[{quantity,weight:10}]]:[[{effect_json:{ignoreWeightPenalty,moveSpeedBonus:2}}]]};
  const module={exports:{} as any};
  new Function('exports','characterFor','getPool','effectiveCharacterAttributes','jsonObject','encumbrance','movementSpeedFrom',compiled)(module.exports,async()=>({id:1,speed:100,level:30}),async()=>pool,async()=>final,(value:unknown)=>value,encumbrance,()=>6);
  const read=()=>module.exports.inventory('test');
  const heavy=await read();assert.equal(heavy.weight,120);assert.equal(heavy.capacity,100);assert.equal(heavy.speed,80);assert.equal(heavy.movementSpeed,6.4);
  final.constitution+=20;const stronger=await read();assert.equal(stronger.capacity,120);assert.equal(stronger.speedPenaltyPct,0);assert.equal(stronger.movementSpeed,8);
  quantity=24;ignoreWeightPenalty=true;assert.equal((await read()).movementSpeed,8);
  ignoreWeightPenalty=false;assert.equal((await read()).movementSpeed,1);
});
