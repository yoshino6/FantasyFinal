// 设计测算：只输出同目录 Markdown，不写游戏数据。
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { automatonFeeds as feeds } from '../src/game/automaton-feeds';
import { baseMaterialTradeValues } from '../src/game/deconstructor-catalog';
import { birth, directions, increment, keys, labels, weights } from './机巧成长数值测算';

type Vec = [number, number, number, number, number];
const N: Vec = [1,0,0,0,0];
const themes: Record<string, Vec> = {
  战锋:[0,1,0,0,0], 灵术:[0,0,1,0,0], 守御:[0,0,0,1,0], 灵巧:[0,0,0,0,1],
  支援:[.2,0,.4,.4,0], 干扰:[0,0,.5,0,.5], 持续:[.4,.3,.3,0,0], 应变:[.5,0,0,.25,.25]
};
const mix = (...parts: [number, Vec][]): Vec => N.map((_, i) => parts.reduce((sum,[share,v]) => sum + share * v[i]!, 0)) as Vec;
const unit = (v: Vec) => { assert(v.every(x => Number.isFinite(x) && x >= 0)); assert(Math.abs(v.reduce((a,b)=>a+b,0)-1)<1e-10); };
const floor = (v: number) => Math.floor(v + 1e-9);
const seed = JSON.parse(readFileSync(new URL('./机巧人格与语录种子库V1.json', import.meta.url), 'utf8')) as {personas: {name:string;primary:string;secondary:string}[]};
const cores = seed.personas.map(p => ({ name:p.name, vector:mix([2/3,themes[p.primary]!],[1/3,themes[p.secondary]!]) }));
const personality = (core:Vec, facets:Vec[]) => facets.length ? mix([.7,core],[.3,mix(...facets.map(v=>[1/facets.length,v] as [number,Vec]))]) : core;
const risk = (ordinal:number) => mix([1-(ordinal-1)/9,themes.守御!],[(ordinal-1)/9,themes.战锋!]);
const guard = (ordinal:number) => mix([1-(ordinal-1)/9,N],[(ordinal-1)/9,themes.守御!]);
const tactics = ['战锋','灵术','守御','支援','灵巧','干扰','持续','应变'].map(t=>themes[t]!);
tactics.push(mix([.5,themes.战锋!],[.5,themes.支援!]),mix([.5,themes.守御!],[.5,themes.支援!]));
const cost = (parts: Record<string,number>) => Object.entries(parts).reduce((sum,[code,count]) => {
  assert(code in baseMaterialTradeValues && Number.isInteger(count) && count>0);
  return sum + 2 * baseMaterialTradeValues[code]! * count;
},0);
const initial = (p:Vec) => {
  const a=mix([.8,N],[.2,p]);
  return birth.map((b,i)=>floor(b*directions.reduce((sum,d,k)=>sum+a[k]!*weights[d][i]!,0)));
};
const expectedGain = (level:number,p:Vec,m:Vec) => {
  const a=mix([.15,N],[.25,p],[.60,m]);unit(a);
  return keys.map((_,i)=>directions.reduce((sum,d,k)=>sum+a[k]!*increment(level,d)[i]!,0));
};
// 每一级使用稳定的抽签序列；材料只影响概率，不改变序列或额外抽签。
const unitFor=(level:number)=>increment(Math.ceil(level/10)*10-1,'均衡');
const probabilities=(level:number,p:Vec,m:Vec)=>{
  const base=expectedGain(level,p,m),unit=unitFor(level);
  const score=base.map((v,i)=>v/unit[i]!);
  const budget=score.reduce((a,b)=>a+b,0);
  return {base,unit,budget,prob:score.map(v=>v/budget)};
};
const draws=(level:number,seed:string)=>Array.from({length:level%10===0?120:30},(_,index)=>{
  const bytes=createHmac('sha256',seed).update('growth-v3:'+level+':'+index).digest();
  return bytes.readUInt32BE(0)/2**32;
});
const allocation=(level:number,p:Vec,m:Vec,seed='design-example-only')=>{
  const {unit,budget,prob}=probabilities(level,p,m),u=draws(level,seed),counts=keys.map(()=>0);
  for(const roll of u){let sum=0,index=keys.length-1;for(let i=0;i<keys.length;i++){sum+=prob[i]!;if(roll<sum){index=i;break;}}counts[index]!++;}
  return {counts,prob,budget,values:counts.map((count,i)=>count*budget/u.length*unit[i]!)};
};
const gain=(level:number,p:Vec,m:Vec,seed='design-example-only')=>allocation(level,p,m,seed).values;
const panel=(level:number,p:Vec,m:Vec)=>{
  const values=initial(p);
  for(let l=2;l<=level;l++) gain(l,p,m).forEach((x,i)=>{values[i]!+=x;});
  return values.map(floor);
};
const required=(level:number)=>200+40*level+4*level*level;
// 原液已开瓶后的有序经验流；模拟拆单/跨级，余额保留向量。
const feedStream=(chunks:{xp:number;vector:Vec}[])=>{
  let level=1,used=0;
  let totals=[0,0,0,0,0] as Vec;
  const completed:Vec[]=[];
  for(const chunk of chunks){
    let left=chunk.xp;
    while(left>0){
      const take=Math.min(left,required(level)-used);
      totals=totals.map((v,i)=>v+take*Math.round(chunk.vector[i]!*10000)) as Vec;
      used+=take;left-=take;
      if(used===required(level)){completed.push(totals.map(v=>v/used/10000) as Vec);level++;used=0;totals=[0,0,0,0,0];}
    }
  }
  return {level,used,totals,completed};
};
assert.equal(cores.length,12);assert.equal(feeds.length,12);
for(const f of feeds){unit(f.vector);assert.equal(cost(f.main),60);assert.equal(cost(f.aux),40);}
assert.equal(cost({magic_unit:2}),40);
let checked=0;
for(const core of cores){
  unit(core.vector);assert.deepEqual(personality(core.vector,[]),core.vector);
  const a0=mix([.8,N],[.2,core.vector]);
  const normalized=keys.reduce((sum,_,i)=>sum+directions.reduce((v,d,k)=>v+a0[k]!*weights[d][i]!,0),0);
  assert(Math.abs(normalized-15)<1e-9);
  for(const material of feeds)for(let l=2;l<=50;l++){
    const g=gain(l,core.vector,material.vector);
    assert(g.every(v=>Number.isFinite(v)&&v>=0));
    const distribution=probabilities(l,core.vector,material.vector);
    assert(distribution.prob.every(v=>v>0));
    assert(Math.abs(distribution.prob.reduce((a,b)=>a+b,0)-1)<1e-10);
    const unit=unitFor(l),expected=expectedGain(l,core.vector,material.vector);
    assert(Math.abs(g.reduce((s,v,i)=>s+v/unit[i]!,0)-expected.reduce((s,v,i)=>s+v/unit[i]!,0))<1e-8);
    const allocated=allocation(l,core.vector,material.vector);
    assert.equal(allocated.counts.reduce((a,b)=>a+b,0),l%10===0?120:30);
    if(l%10===0){const normal=probabilities(l-1,core.vector,material.vector);assert(Math.abs(distribution.budget/normal.budget-4)<1e-9);}
    checked++;
  }
  for(let rank=1;rank<=10;rank++) for(const tactical of tactics){
    const p=personality(core.vector,[risk(rank),guard(11-rank),tactical]);unit(p);
    assert(probabilities(10,p,feeds[1]!.vector).prob.every(v=>v>0));
  }
}
const aggressive=cores.find(p=>p.name==='激进')!.vector;
const timid=cores.find(p=>p.name==='胆小')!.vector;
const blade=feeds.find(f=>f.code==='blade')!.vector;
const shell=feeds.find(f=>f.code==='shell')!.vector;
assert(panel(30,aggressive,blade)[2]!>panel(30,aggressive,shell)[2]!);
assert(panel(30,aggressive,shell)[4]!>panel(30,aggressive,blade)[4]!);
assert.notDeepEqual(panel(30,aggressive,blade),panel(30,timid,blade));
const split=feedStream([{xp:100,vector:blade},{xp:100,vector:blade},{xp:100,vector:shell}]);
assert.deepEqual(split,feedStream([{xp:200,vector:blade},{xp:100,vector:shell}]));
assert.equal(split.level,2);assert.equal(split.used,56);
split.completed[0]!.forEach((v,i)=>assert(Math.abs(v-(200*blade[i]!+44*shell[i]!)/244)<1e-10));
split.totals.forEach((v,i)=>assert(Math.abs(v-56*10000*shell[i]!)<1e-8));
assert.deepEqual(gain(10,aggressive,blade,'same-id'),gain(10,aggressive,blade,'same-id'));
assert.notDeepEqual(gain(10,aggressive,blade,'same-id'),gain(10,aggressive,blade,'another-id'));
assert.notDeepEqual(draws(8,'same-id'),draws(9,'same-id'));
assert(Array.from({length:20},(_,i)=>allocation(i+2,aggressive,blade,'zero-case').counts).some(row=>row.some(n=>n===0)));
assert.deepEqual(draws(10,'same-id'),draws(10,'same-id'));
const broad=[{xp:5000,vector:blade},{xp:8000,vector:shell}];
assert.deepEqual(feedStream(broad),feedStream([...Array.from({length:50},()=>({xp:100,vector:blade})),...Array.from({length:80},()=>({xp:100,vector:shell}))]));
const table=(header:string[],rows:(string|number)[][])=>[`| ${header.join(' | ')} |`,`| ${header.map(()=>'---').join(' | ')} |`,...rows.map(r=>`| ${r.join(' | ')} |`)].join('\n');
const parts=(v:Record<string,number>)=>Object.entries(v).map(([code,n])=>`\`${code}\`×${n}`).join('＋');
const percent=(v:Vec)=>v.map(x=>(100*x).toFixed(2)).join(' / ');
let md='# 机巧 · 材料成长测算 V3\n\n状态：设计数值验证，未实装。规则以[性格与材料成长 V3](机巧性格与材料成长设计V3.md)为准；本文件由[测算脚本](机巧材料成长测算V3.ts)生成。\n\n运行：`npx tsx docs/机巧材料成长测算V3.ts`。本工具读取当前粒子价格与人格种子库，并复用 V2 未取整预算函数。\n\n## 1. 十二配方的代码与成本\n\n所有配方额外使用 `magic_unit`×2，价值40；主材60、辅材40，合计140，成功率90%，每瓶100经验，期望成本155.5556、参考售价187。\n\n';
md+=table(['成品代码','名称','主材','辅材','均/锋/术/御/巧%'],feeds.map(f=>['automaton_feed_'+f.code,f.name,parts(f.main),parts(f.aux),percent(f.vector)]));
md+='\n\n## 2. 十二核心的成长向量\n\n本表为未抽到风险/守护/战术兴趣词条的基础性格案例；其他生活词条照常存在。实际出生档案按有效词条修正。\n\n'+table(['核心','均/锋/术/御/巧%'],cores.map(c=>[c.name,percent(c.vector)]));
md+='\n\n## 3. 同性格不同材料、同材料不同性格\n\n样例均持续喂同一种材料，使用固定公开测算种子便于复算；实际人偶各有保密种子，每级按属性概率分配30点，十级分配120点，允许部分属性本级未抽中。没有额外战斗增益。它们是具体食谱的结果，不是所有人偶的固定面板。\n\n';
md+=table(['核心','材料','等级','生命','魔力','物攻','魔攻','物防','魔防','速度'],['激进','胆小','守护','冷静'].flatMap(name=>['blade','shell','arcane','swift'].flatMap(code=>[1,10,30,50].map(level=>{
  const core=cores.find(c=>c.name===name)!,material=feeds.find(f=>f.code===code)!,p=panel(level,core.vector,material.vector);
  return [name,material.name,level,...[0,1,2,3,4,5,14].map(i=>p[i]!)];
}))));
md+='\n\n### 同一锋刃原液的连续普通升级\n\n以下为同一实例、激进核心、持续使用锋刃原液的未取整增量。允许某项为0，显示面板还会包含此前累计的小数。\n\n'+table(['到达等级','物攻','魔攻','命中','暴击','破韧','速度'],Array.from({length:8},(_,i)=>{const l=i+2,g=gain(l,aggressive,blade);return [l,...[2,3,6,8,13,14].map(k=>g[k]!.toFixed(2))];}));
md+='\n\n## 4. 一次十级突破的完整增量\n\n激进核心＋锋刃原液，比较 Lv.8→9 与 Lv.9→10；每级按概率分配成长点，只有总预算为4倍；单项可能为0，不能要求单项增量3～5倍。保留小数展示内部增量，实际面板最终取整。\n\n';
const g9=gain(9,aggressive,blade),g10=gain(10,aggressive,blade);
const distribution=probabilities(9,aggressive,blade);
md+=table(['属性','每点抽中概率','普通级30点至少抽中一次概率'],labels.map((label,i)=>[label,(distribution.prob[i]!*100).toFixed(2)+'%',((1-(1-distribution.prob[i]!)**30)*100).toFixed(2)+'%']))+'\n\n';
md+=table(['属性','普通级增量','十级增量','比值'],labels.map((label,i)=>[label,g9[i]!.toFixed(4),g10[i]!.toFixed(4),g9[i]===0?'本次普通级未抽中':(g10[i]!/g9[i]!).toFixed(2)]));
md+=`\n\n## 5. 校验结果与边界\n\n通过 ${checked} 组核心/材料/等级增量检查，覆盖12×12×49；额外覆盖1200组人格词条组合。验证全部谱归一、非负增长、随机前后归一预算守恒、每项抽中概率为正、点数30/120守恒、同配方十级总预算4倍、允许单项零增长、出生归一预算15份、人格与材料分别改变面板、300经验拆为244本级和56坚壳谱进度、跨多级拆单/批量一致、同实例同级重试一致、不同实例/等级的波动不同。12种配方均使用源码存在的粒子且满足60/40/40预算。\n\n数值校验不代替数据库事务、绑定扣料或游戏战斗验证。战斗已确定与人物共用公式，无额外人偶折扣；以上仅为面板及成长增量，实战强度仍待校准。\n`;
writeFileSync(new URL('./机巧材料成长测算V3.md',import.meta.url),md,'utf8');
console.log(JSON.stringify({validated:true,cases:checked,facetCases:1200,recipes:feeds.length,example:split,aggressiveBlade30:panel(30,aggressive,blade),aggressiveShell30:panel(30,aggressive,shell)},null,2));
