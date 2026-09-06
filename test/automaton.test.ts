import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaton, cultivateAutomaton, respecAutomaton } from '../src/game/automaton';
import { allocateAutomatonGrowth, automatonGrowthPreview } from '../src/game/automaton-growth';
import { automatonFeeds } from '../src/game/automaton-feeds';
import { createAutomatonPersonality, compatibleAutomatonTraits } from '../src/game/automaton-personality';
import { automatonSkills } from '../src/game/automaton-skill-catalog';
import { automatonCorpus } from '../src/game/automaton-corpus';
import { consumeBinding, productionBinding } from '../src/game/inventory-binding';
import { bossSkyDustDrops } from '../src/game/boss-sky-dust';
import { chooseAutomatonQuote, renderAutomatonQuote } from '../src/game/automaton-dialogue';
import { baseMaterialTradeValues } from '../src/game/deconstructor-catalog';

test('普通元素统一价后，十二种原液主材60、辅材40、催化剂40保持等成本',()=>{
  for(const code of ['metal','wood','water','ice','fire','thunder'])assert.equal(baseMaterialTradeValues[`${code}_element_dust`],3);
  const cost=(parts:Record<string,number>)=>Object.entries(parts).reduce((sum,[code,count])=>sum+count*baseMaterialTradeValues[code]!*2,0);
  for(const feed of automatonFeeds){assert.equal(cost(feed.main),60,feed.name);assert.equal(cost(feed.aux),40,feed.name);assert.equal(cost({magic_unit:2}),40);assert.equal((cost(feed.main)+cost(feed.aux)+40)/.9,140/.9);}
});

test('出生稳定、兼容人格、完整技能权重与三倍语料',()=>{
  for(let i=0;i<120;i++){const p=createAutomatonPersonality(`seed-${i}`);assert.equal(p.traits.length,4);assert.equal(new Set(p.traits.map(t=>t.id.split('_')[0])).size,4);assert(compatibleAutomatonTraits(p.traits.map(t=>t.id)));assert.equal(p.aligned.length,2);assert(Math.abs(p.vector.reduce((a,b)=>a+b,0)-1)<1e-9);assert.deepEqual(createAutomaton(`seed-${i}`),createAutomaton(`seed-${i}`));}
  assert.equal(automatonSkills.length,128);for(const [kind,n] of [['A',72],['Psv',24],['SP',16],['ULT',16]] as const)assert.equal(automatonSkills.filter(s=>s.kind===kind).length,n);
  const weights:Record<string,number>={C:100,U:40,R:10,E:60,L:20,M:5};assert.equal(automatonSkills.filter(s=>s.id.startsWith('N')).reduce((sum,s)=>sum+weights[s.rarity]!,0),6240);assert.equal(automatonSkills.filter(s=>s.id.startsWith('S')).reduce((sum,s)=>sum+weights[s.rarity]!,0),1220);
  assert.equal(automatonCorpus.dialogues.length,1296);assert.equal(new Set(automatonCorpus.dialogues.map(q=>q.id)).size,1296);
});
test('全部属性可抽中，十级归一预算为四倍，稳定种子不随材料刷新',()=>{
  const p=createAutomaton('growth');
  for(const f of automatonFeeds)for(let level=2;level<=50;level++){
    const v=automatonGrowthPreview(level,p.personality.vector,f.vector),g=allocateAutomatonGrowth(level,p.personality.vector,f.vector,p.seed);
    assert(v.probabilities.every(x=>x>0));assert.equal(g.counts.reduce((a,b)=>a+b,0),level%10===0?120:30);
    assert(Math.abs(g.values.reduce((s,x,i)=>s+x/v.unit[i]!,0)-v.budget)<1e-8);
    assert.deepEqual(g,allocateAutomatonGrowth(level,p.personality.vector,f.vector,p.seed));
    if(level%10===0)assert(Math.abs(v.budget/automatonGrowthPreview(level-1,p.personality.vector,f.vector).budget-4)<1e-9);
  }
});
test('批量与拆分培养一致，244/56材料贡献守恒，停机不被升级治愈',()=>{
  const initial=createAutomaton('feed');initial.hp=0;initial.mp=0;
  const batch=cultivateAutomaton(initial,[{code:'blade',count:2},{code:'shell',count:1}],50);
  let split=cultivateAutomaton(initial,[{code:'blade',count:1}],50);split=cultivateAutomaton(split,[{code:'blade',count:1}],50);split=cultivateAutomaton(split,[{code:'shell',count:1}],50);
  assert.deepEqual(batch,split);assert.equal(batch.level,2);assert.equal(batch.hp,0);assert.equal(batch.mp,0);
  assert.deepEqual(batch.levels[0]!.contributions,[{code:'blade',xp:200},{code:'shell',xp:44}]);assert.deepEqual(batch.progress,[{code:'shell',xp:56}]);
  const stopped=cultivateAutomaton(initial,[{code:'blade',count:2},{code:'shell',count:1}],50,2);assert.deepEqual(stopped.progress,[]);assert.deepEqual(stopped.reserve,[{code:'shell',xp:56}]);assert.throws(()=>cultivateAutomaton(stopped,[{code:'shell',count:1}],2));
});
test('跨越十级只领悟一次特殊，重调不重抽技能，原材料与手续费分离',()=>{
  const initial=createAutomaton('respec');let state=initial;for(let i=0;i<5;i++)state=cultivateAutomaton(state,[{code:'blade',count:100}],50);
  assert.equal(state.learned.filter(id=>id.startsWith('S')).length,Math.floor(state.level/10));
  const result=respecAutomaton(state,[2],[{code:'shell',xp:244}]);assert.equal(result.fee,100);assert.deepEqual(result.state.learned,state.learned);assert.notDeepEqual(result.state.stats,state.stats);
  assert.throws(()=>respecAutomaton(state,[2],[{code:'blade',xp:244}]),/无需重调/);
  const restore=respecAutomaton(result.state,[2],[{code:'blade',xp:244}]);assert.deepEqual(restore.state.stats,state.stats);
});
test('绑定先消耗、不可逆制造可交易、互转继承绑定',()=>{
  assert.deepEqual(consumeBinding({unbound:9,trade:4,personal:2},5),{personal:2,trade:3,unbound:0});
  assert.deepEqual(consumeBinding({unbound:9,trade:4,personal:2},5,true),{personal:0,trade:0,unbound:5});
  assert.throws(()=>consumeBinding({unbound:1,trade:4,personal:2},2,true));
  assert.deepEqual(productionBinding({unbound:0,trade:10,personal:0},1,true),{unbound:1,trade:0,personal:0});assert.deepEqual(productionBinding({unbound:0,trade:10,personal:0},2,false),{unbound:0,trade:2,personal:0});
});
test('天空粉尘逐份40%，移除旧重复条目，召唤与部位不产生粉尘',()=>{
  const drops=bossSkyDustDrops([{code:'sky_dust',chance:.4,quantity:1}],{level:99,monster_class:'boss'});assert.equal(drops.length,5);assert(drops.every(d=>d.chance===.4&&d.quantity===1));
  assert.equal(bossSkyDustDrops([],{level:50,monster_class:'boss',traits_json:[{code:'boss_component'}]}).length,0);
});
test('称呼和自称独立持久化，去重耗尽不强制重复，自定义默认不公开',()=>{
  const state=createAutomaton('quote');state.ownerAddress='汝';state.selfAddress='吾';assert.equal(renderAutomatonQuote('{称呼}，{自称}在。',state),'汝，吾在。');state.customQuotes.greeting=['绝不公开'];
  const used=new Set<string>();for(let i=0;i<9;i++){const q=chooseAutomatonQuote(state,'greeting',String(i),used);assert(q);assert.notEqual(q.text,'绝不公开');used.add(q.hash);}assert.equal(chooseAutomatonQuote(state,'greeting','exhausted',used),null);
});
