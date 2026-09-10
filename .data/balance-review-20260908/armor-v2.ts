import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {opposedChance,correctedHitChance,correctedCritChance,correctedCritBonus} from '../../src/game/combat-math';
import {equipmentQualityMultiplier} from '../../src/game/constants';
const profiles:any={布甲:[8,2,-2,4,-2,4],皮甲:[2,8,-2,-2,-2,6],轻甲:[2,2,2,2,2,2],重甲:[0,0,12,8,10,-1],板甲:[-.5,-.5,16,16,8,-2]};
const sets:any={
 布甲:{3:{hit:10,mp:8},5:{hit:20,mp:16,magicAttack:2}},
 皮甲:{3:{evade:6,hp:1.5},5:{evade:12,hp:3}},
 轻甲:{3:{hit:6,hp:7,mp:5},5:{hit:12,hp:15,mp:10}},
 重甲:{3:{critAvoid:8,hp:10,reduction:3},5:{critAvoid:15,hp:22,reduction:6}},
 板甲:{3:{critAvoid:12,critReduction:12,hp:7,reduction:5},5:{critAvoid:25,critReduction:25,hp:15,reduction:10}}
};
const slots=['头肩','上装','腰部','下装','脚部'];
const weight=(i:number)=>i===1||i===3?1.2:13/15;
const calculate=(types:string[],ratio=1,critRatio=1,quality=100,magic=true)=>{
 const totals=Array(6).fill(0),counts:any={};
 types.forEach((type,i)=>{counts[type]=(counts[type]??0)+1;profiles[type].forEach((v:number,k:number)=>totals[k]+=v*weight(i)*equipmentQualityMultiplier(quality));});
 const active=Object.entries(counts).find(([,n])=>Number(n)>=3),tier=active?(Number(active[1])>=5?5:3):0,set=active?sets[active[0]][tier]:{};
 const [acc,eva,res,red]=totals.map(v=>1000*(1+v/100));
 const hit=correctedHitChance(opposedChance(acc*ratio,1000),{hitCorrectionPct:set.hit});
 const incoming=correctedHitChance(opposedChance(1000*ratio,eva),{evasionCorrectionPct:set.evade});
 const crit=correctedCritChance(opposedChance(1000*critRatio,res),{critAvoidanceCorrectionPct:set.critAvoid});
 const extra=correctedCritBonus(opposedChance(1000*critRatio,red),{critDamageCorrectionPct:set.critReduction});
 const normalHit=opposedChance(1000*ratio,1000),normalCrit=opposedChance(1000*critRatio,1000);
 const a=1+Number(magic?set.magicAttack??0:0)/100;
 const output=hit/normalHit*2*a*a/(a+1);
 const damage=incoming/normalHit*(1+crit*extra)/(1+normalCrit*normalCrit)*(1-Number(set.reduction??0)/100);
 const ehp=(1+Number(set.hp??0)/100)/damage;
 return {types,totals,tier,set,hit,incoming,crit,extra,output,damage,ehp,score:output*ehp};
};
const names=Object.keys(profiles),full=names.map(n=>({name:n,...calculate(Array(5).fill(n))}));
const scenarios:any[]=[];let neutralMixes:any[]=[];
for(const ratio of [.5,1,2])for(const critRatio of [.25,1,4])for(const quality of [0,60,100])for(const magic of [false,true]){
 const mixes=[];for(let code=0;code<3125;code++){let n=code;const types=slots.map(()=>{const t=names[n%5];n=Math.floor(n/5);return t;});mixes.push(calculate(types,ratio,critRatio,quality,magic));}
 mixes.sort((a,b)=>b.score-a.score);
 const fullScores=names.map(n=>({name:n,score:calculate(Array(5).fill(n),ratio,critRatio,quality,magic).score})).sort((a,b)=>b.score-a.score);
 scenarios.push({ratio,critRatio,quality,magic,bestMix:mixes[0],bestFull:fullScores[0],worstFull:fullScores.at(-1),fullSpread:fullScores[0].score/fullScores.at(-1)!.score-1,mixAdvantage:mixes[0].score/fullScores[0].score-1});
 if(ratio===1&&critRatio===1&&quality===100&&magic)neutralMixes=mixes.slice(0,8);
}
assert.equal(calculate(['板甲','板甲','板甲','轻甲','轻甲']).tier,3);
assert.equal(calculate(Array(5).fill('板甲')).set.reduction,10);
assert.equal(correctedHitChance(.5,{hitCorrectionPct:20}),.6);
assert.equal(correctedHitChance(.5,{evasionCorrectionPct:20}),.4);
assert.equal(correctedHitChance(.5,{hitCorrectionPct:20,evasionCorrectionPct:20}),.48);
for(const r of full)assert.ok(r.hit>=0&&r.hit<=1&&r.incoming>=0&&r.incoming<=1&&r.score>1);
const out={date:new Date().toISOString(),profiles,sets,slots,weight:[13/15,1.2,13/15,1.2,13/15],full,neutralMixes,scenarios,checks:{passed:true,combinationsPerScenario:3125,scenarioCount:scenarios.length,totalCombinations:3125*scenarios.length},scope:'candidate design; same pre-armor stats; A=D; no game or database changes'};
writeFileSync('.data/balance-review-20260908/armor-v2.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({full:full.map(({name,hit,incoming,crit,output,ehp,score})=>({name,hit,incoming,crit,output,ehp,score})),topMix:neutralMixes[0],maxMixAdvantage:Math.max(...scenarios.map(s=>s.mixAdvantage)),maxFullSpread:Math.max(...scenarios.map(s=>s.fullSpread)),checks:out.checks},null,2));
