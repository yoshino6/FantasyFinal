import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {opposedChance,correctedHitChance,correctedCritChance,correctedCritBonus} from '../../src/game/combat-math';
import {equipmentQualityMultiplier} from '../../src/game/constants';
// Exact user table: large slots use these values, small slots use 3/4.
// This slot ratio applies only to the six percentage modifiers; defense budget is unchanged.
const profiles:Record<string,number[]>={布甲:[16,16,0,0,0,16],皮甲:[12,8,4,4,4,8],轻甲:[4,4,8,8,8,4],重甲:[-4,-8,12,12,12,-8],板甲:[-16,-16,16,16,16,-16]};
const weights=[.75,1,.75,1,.75],slots=['头肩','上装','腰部','下装','脚部'];
const previous=JSON.parse(readFileSync('.data/balance-review-20260908/armor-v4.json','utf8'));
const sets:any={
 布甲:{3:{hit:16,evade:16},5:{hit:33,evade:33}},
 皮甲:{3:{hit:12,mp:10},5:{hit:25,mp:20}},
 轻甲:{3:{hp:8,mp:8},5:{hp:15,mp:15}},
 重甲:{3:{hp:12,critAvoid:8,critReduction:8},5:{hp:25,critAvoid:16,critReduction:16}},
 板甲:{3:{hp:12,critAvoid:12,critReduction:12,reduction:2},5:{hp:25,critAvoid:12,critReduction:12,reduction:4}}
};
const names=Object.keys(profiles);
function calc(types:string[],quality=100,enableSet=true){
 const factors=Array(6).fill(1),counts:Record<string,number>={};
 types.forEach((n,i)=>{if(!n)return;counts[n]=(counts[n]??0)+1;profiles[n].forEach((v,k)=>factors[k]*=1+v*weights[i]*equipmentQualityMultiplier(quality)/100);});
 const total=factors.map(f=>(f-1)*100);
 const active=Object.entries(counts).find(([,v])=>v>=3),tier=enableSet&&active?(active[1]>=5?5:3):0;
 const set=tier?sets[active![0]][tier]:{};
 const [a,e,r,d]=total.map(x=>1000*(1+x/100));
 const hit=correctedHitChance(opposedChance(a,1000),{hitCorrectionPct:set.hit});
 const incoming=correctedHitChance(opposedChance(1000,e),{evasionCorrectionPct:set.evade});
 const crit=correctedCritChance(opposedChance(1000,r),{critAvoidanceCorrectionPct:set.critAvoid});
 const extra=correctedCritBonus(opposedChance(1000,d),{critDamageCorrectionPct:set.critReduction});
 const output=hit/.5,ehp=(1+(set.hp??0)/100)/((incoming/.5)*(1+crit*extra)/1.25*(1-(set.reduction??0)/100));
 return {types,quality,total,tier,set,hit,incoming,crit,extra,output,ehp,score:output*ehp};
}
const full=names.map(name=>({name,withoutSet:calc(Array(5).fill(name),100,false),withUserSet:calc(Array(5).fill(name))}));
const partial=names.map(name=>({name,rows:[1,2,3,4,5].map(count=>{
 const order=[1,3,0,2,4],types=Array(5).fill('');for(let i=0;i<count;i++)types[order[i]]=name;
 return {count,...calc(types)};
})}));
const qualityRows=names.flatMap(name=>[0,60,100].map(q=>({name,...calc(Array(5).fill(name),q)})));
const mixes=Array.from({length:3125},(_,code)=>{let n=code;const types=slots.map(()=>{const t=names[n%5];n=Math.floor(n/5);return t;});return calc(types);}).sort((a,b)=>b.score-a.score);
const cloth=full[0].withUserSet;
const rescue=full.filter(x=>['重甲','板甲'].includes(x.name)).map(x=>{
 const r=x.withUserSet,h=1+r.set.hp/100;
 return {name:x.name,hpPctToReachNeutral:(h/r.score-1)*100,hpPctToMatchCloth:(h*cloth.score/r.score-1)*100};
});
assert.ok(Math.abs(full[0].withoutSet.total[0]/100+1-Math.pow(1.16,2)*Math.pow(1.12,3))<1e-12);
assert.ok(Math.abs(full[4].withoutSet.total[0]/100+1-Math.pow(.84,2)*Math.pow(.88,3))<1e-12);
const plateFactor=Math.pow(.84,2)*Math.pow(.88,3);
assert.ok(Math.abs(full[4].withUserSet.hit-plateFactor/(1+plateFactor))<1e-12);
assert.ok(Math.abs(full[4].withUserSet.incoming-1/(1+plateFactor))<1e-12);
for(const x of mixes)assert.ok(x.hit>0&&x.hit<1&&Number.isFinite(x.score));
const out={at:new Date().toISOString(),profiles,slots,weights,userSets:sets,full,partial,qualityRows,bestMixes:mixes.slice(0,10),rescue,
 checks:{passed:true,loadouts:mixes.length},scope:'Exact user per-piece table, independent multiplicative stacking; Exact newly supplied 3/5-piece sets; 5-piece replaces 3-piece. Equal pre-armor opposition stats, identical flat defense, direct expectation only; no skills, mana, initiative or live DB.'};
writeFileSync('.data/balance-review-20260908/armor-user-multiplicative-v7.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({full:full.map(x=>({name:x.name,total:x.withoutSet.total,noSet:x.withoutSet.score,...x.withUserSet})),rescue,plateQuality:qualityRows.filter(x=>x.name==='板甲'),bestMix:mixes[0]},null,2));


