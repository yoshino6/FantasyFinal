import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {opposedChance,correctedHitChance,correctedCritChance,correctedCritBonus,tenacityContest} from '../../src/game/combat-math';
import {equipmentQualityMultiplier} from '../../src/game/constants';

// Candidate data only. No database connection or game config mutations.
const profiles:Record<string,number[]>={
 布甲:[6,4,0,0,0,3],皮甲:[4,6,0,0,2,2],轻甲:[4,4,4,4,4,1],重甲:[3,3,12,12,8,0],板甲:[2.5,2.5,16,16,4,-1]
};
type SetEffect={hit?:number;evade?:number;hp?:number;mp?:number;critAvoid?:number;critReduction?:number;reduction?:number;magicAttack?:number};
const sets:Record<string,Record<number,SetEffect>>={
 布甲:{3:{hit:7,evade:4},5:{hit:14,evade:8}},
 皮甲:{3:{hit:10,mp:10},5:{hit:20,mp:20}},
 轻甲:{3:{hp:7.5,mp:10},5:{hp:15,mp:20}},
 重甲:{3:{hp:8,critAvoid:6,critReduction:6},5:{hp:16,critAvoid:12,critReduction:12}},
 板甲:{3:{hp:6,critAvoid:6,critReduction:6,reduction:2},5:{hp:12,critAvoid:12,critReduction:12,reduction:4}}
};
const names=Object.keys(profiles),slots=['头肩','上装','腰部','下装','脚部'],weights=[13/15,1.2,13/15,1.2,13/15];
type Scenario={outRatio?:number;inRatio?:number;critRatio?:number;bonusRatio?:number;quality?:number;preReduction?:number;forceHit?:boolean;forceCrit?:boolean;noCrit?:boolean};
const empty=Array(5).fill('');
function calculate(types:string[],s:Scenario={},enableSet=true,profile=profiles,setTable=sets){
 const {outRatio=1,inRatio=1,critRatio=1,bonusRatio=1,quality=100,preReduction=0,forceHit=false,forceCrit=false,noCrit=false}=s;
 const total=Array(6).fill(0),counts:Record<string,number>={};
 types.forEach((n,i)=>{if(!n)return;counts[n]=(counts[n]??0)+1;profile[n].forEach((v,k)=>total[k]+=v*weights[i]*equipmentQualityMultiplier(quality));});
 const active=Object.entries(counts).find(([,v])=>v>=3),tier=enableSet&&active?(active[1]>=5?5:3):0;
 const set:SetEffect=tier?setTable[active![0]][tier]:{};
 const [acc,eva,res,red]=total.map(v=>1+v/100);
 // Scale to 1000 so opposedChance's floor of 1 does not erase ratios < 1.
 const opposed=(a:number,b:number)=>opposedChance(1000*a,1000*b);
 const hit=correctedHitChance(opposed(outRatio*acc,1),{hitCorrectionPct:set.hit});
 const incoming=forceHit?1:correctedHitChance(opposed(inRatio,eva),{evasionCorrectionPct:set.evade});
 const crit=noCrit?0:forceCrit?1:correctedCritChance(opposed(critRatio,res),{critAvoidanceCorrectionPct:set.critAvoid});
 const extra=correctedCritBonus(opposed(bonusRatio,red),{critDamageCorrectionPct:set.critReduction});
 const baseHit=opposed(outRatio,1),baseIncoming=forceHit?1:opposed(inRatio,1),baseCrit=noCrit?0:forceCrit?1:opposed(critRatio,1),baseExtra=opposed(bonusRatio,1);
 const reduction=Math.min(80,preReduction+(set.reduction??0));
 const output=hit/baseHit;
 const damage=incoming/baseIncoming*(1+crit*extra)/(1+baseCrit*baseExtra)*(1-reduction/100)/(1-Math.min(80,preReduction)/100);
 const ehp=(1+(set.hp??0)/100)/damage;
 return {total,tier,set,hit,incoming,crit,extra,output,ehp,score:output*ehp,mp:1+(set.mp??0)/100};
}
const full=names.map(name=>{
 const types=Array(5).fill(name),base=calculate(types,{},false),result=calculate(types);
 const three=calculate([name,name,name,'','']),threeBase=calculate([name,name,name,'',''],{},false);
 return {name,...result,noSet:base.score,setGain:result.score/base.score,threeScore:three.score,threeSetGain:three.score/threeBase.score,
 smallSingle:calculate([name,'','','',''],{},false).score,largeSingle:calculate(['',name,'','',''],{},false).score,
 setOnly3:calculate(Array(3).fill(name).concat(['','']),{},true,Object.fromEntries(names.map(n=>[n,Array(6).fill(0)]))).score,
 setOnly5:calculate(types,{},true,Object.fromEntries(names.map(n=>[n,Array(6).fill(0)]))).score,
 tenacity:tenacityContest(1000,1000*(1+result.total[4]/100),0,100),speed:1+result.total[5]/100};
});
const old=JSON.parse(readFileSync('.data/balance-review-20260908/armor-v2.json','utf8'));
const oldBreakdown=names.map(name=>{const t=Array(5).fill(name),ns=calculate(t,{},false,old.profiles,old.sets),fs=calculate(t,{},true,old.profiles,old.sets);return {name,single:calculate(['',name,'','',''],{},false,old.profiles,old.sets).score,noSet:ns.score,setGain:fs.score/ns.score,score:fs.score,excludedMagicAttack:old.sets[name][5].magicAttack??0};});
const loadouts=Array.from({length:3125},(_,code)=>{let n=code;return slots.map(()=>{const k=names[n%5];n=Math.floor(n/5);return k;});});
function compare(s:Scenario,mixes=false){
 const fullScores=names.map(name=>({name,...calculate(Array(5).fill(name),s)})).sort((a,b)=>b.score-a.score);
 let best={types:Array(5).fill(fullScores[0].name),score:fullScores[0].score};
 if(mixes)for(const types of loadouts){const score=calculate(types,s).score;if(score>best.score+1e-12)best={types,score};}
 return {s,full:fullScores,spread:fullScores[0].score/fullScores.at(-1)!.score-1,bestMix:best,mixAdvantage:best.score/fullScores[0].score-1};
}
const scenarios=[];
for(const outRatio of [.5,1,2])for(const inRatio of [.5,1,2])for(const critRatio of [.25,1,4])for(const bonusRatio of [.25,1,4])for(const quality of [0,60,100])scenarios.push(compare({outRatio,inRatio,critRatio,bonusRatio,quality},true));
const special=[{forceHit:true},{forceCrit:true},{noCrit:true},{preReduction:50},{preReduction:70},{preReduction:80}].map(s=>compare(s,true));
const mana=names.map(name=>{
 const f=full.find(x=>x.name===name)!;
 // Explicit illustrative action budget, not real skill simulation: 20 actions, 10 affordable casts, each worth 2 basic hits.
 const actions=20,baseCasts=10,casts=Math.min(actions,Math.floor(baseCasts*f.mp));
 const resourceFactor=(actions+casts)/(actions+baseCasts);
 return {name,actions,baseCasts,casts,resourceFactor,resourceAdjustedScore:f.score*resourceFactor};
});
const sourcePlayers=JSON.parse(readFileSync('.data/balance-review-20260908/calculations.json','utf8'));
const sourceMonsters=JSON.parse(readFileSync('.data/balance-review-20260908/monster-calculations.json','utf8'));
const quantile=(v:number[],p:number)=>{const a=v.toSorted((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)*p)]:null;};
const pairRows:any[]=[];
for(const p of sourcePlayers.playerRows)for(const m of sourceMonsters.spawns){
 if(p.level!==m.level||m.traits.length||!['normal','large','elite'].includes(m.tier))continue;
 const b=p.bodyAfter,e=m.newMainOnly;
 const scenario={outRatio:b.accuracy/e.evasion,inRatio:e.accuracy/b.evasion,critRatio:e.crit/b.critResistBp,bonusRatio:e.critDamage/b.critDamageReductionBp};
 const scores=names.map(name=>({name,score:calculate(Array(5).fill(name),scenario).score}));
 const ordered=scores.toSorted((a,b)=>b.score-a.score);
 pairRows.push({player:p.id,level:p.level,tier:m.tier,monster:m.id,scores,spread:ordered[0].score/ordered.at(-1)!.score-1,best:ordered[0].name});
}
const actualGroups:any[]=[];
for(const [label,lo,hi] of [['1—10',1,10],['11—20',11,20],['21—30',21,30]] as const)for(const tier of ['normal','large','elite']){
 const pairs=pairRows.filter(p=>p.level>=lo&&p.level<=hi&&p.tier===tier);if(!pairs.length)continue;
 actualGroups.push({label,tier,pairs:pairs.length,players:new Set(pairs.map(p=>p.player)).size,
 scores:names.map(name=>({name,median:quantile(pairs.map(p=>p.scores.find((x:any)=>x.name===name).score),.5)})),
 medianSpread:quantile(pairs.map(p=>p.spread),.5),p95Spread:quantile(pairs.map(p=>p.spread),.95),maxSpread:Math.max(...pairs.map(p=>p.spread)),
 bestCounts:Object.fromEntries(names.map(name=>[name,pairs.filter(p=>p.best===name).length]))});
}
const data={at:new Date().toISOString(),profiles,sets,slots,weights,full,oldBreakdown,mana,scenarios,special,
 actual:{capturedAt:sourcePlayers.summary.capturedAt,pairCount:pairRows.length,groups:actualGroups,scope:'42 saved human bodyAfter projections paired with same-level untraited normal/large/elite spawns, Q100 armor; not actual equipment or actual win rates.'},
 checks:{scenarioCount:scenarios.length,specialCount:special.length,loadouts:3125,totalComparisons:(scenarios.length+special.length)*3125,maxSpread:Math.max(...scenarios.map(x=>x.spread)),maxMixAdvantage:Math.max(...scenarios.map(x=>x.mixAdvantage))},
 scope:'Analytical direct-hit expectation with current formulas; excludes shared defense and outgoing crit (identical across candidate armor); MP and tenacity separate; no live battle simulation.'};
assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-5)<1e-10);
for(const x of full){assert.equal(x.tier,5);assert.ok(x.score>1);assert.ok(x.largeSingle>x.smallSingle);}
assert.equal(calculate(['板甲','板甲','板甲','轻甲','轻甲']).tier,3);
assert.equal(calculate(['板甲','板甲','板甲','板甲','轻甲']).tier,3);
assert.equal(calculate(empty).score,1);
assert.equal(calculate(Array(5).fill('板甲'),{forceCrit:true}).crit,1);
for(const x of [...scenarios,...special])for(const f of x.full)assert.ok(Number.isFinite(f.score)&&f.hit>=0&&f.hit<=1&&f.incoming>=0&&f.incoming<=1);
writeFileSync('.data/balance-review-20260908/armor-v3.json',JSON.stringify(data,null,2));
console.log(JSON.stringify({full,oldBreakdown,mana,actual:data.actual,checks:data.checks,worstSpread:scenarios.toSorted((a,b)=>b.spread-a.spread)[0],special:special.map(x=>({s:x.s,spread:x.spread,mixAdvantage:x.mixAdvantage,full:x.full.map(f=>({name:f.name,score:f.score}))}))},null,2));
