import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {opposedChance,correctedHitChance,correctedCritChance,correctedCritBonus} from '../../src/game/combat-math';
import {armorSetFromRows} from '../../src/game/armor-set';
const p=(n:number)=>Number((n*100).toFixed(4));
const levels=[10,20,40,50,80,100];
const rows=levels.map(b=>{const hit=opposedChance(1000*(1+b/100),1000),incoming=opposedChance(1000,1000*(1+b/100));return {attributeBonusPct:b,hitPct:p(hit),hitGainPoints:p(hit-.5),hitRelativeGainPct:p(hit/.5-1),incomingHitPct:p(incoming),incomingHitReductionPct:p(1-incoming/.5)};});
const targets=[.55,.6,.65,.7].map(target=>({targetProbabilityPct:p(target),attributeBonusPct:p((target-.5)/(.5*(1-target))),referencePiecePct:p((target-.5)/(.5*(1-target))/5)}));
const sets=(type:string)=>armorSetFromRows(['shoulder','upper','waist','lower','feet'].map(slot=>({slot,weapon_type:type})))!;
// Current per-piece mobility coefficients verified in character.service.ts; exclude defense changes here.
const compare=[['布甲',.8,.6,.2,.05],['皮甲',.4,0,.05,.2],['轻甲',.05,.05,.1,.1]].map(([name,oldAcc,oldEva,newAcc,newEva])=>{
 const type=String(name),set=sets(type);
 return {type,currentHitPct:p(correctedHitChance(opposedChance(1000*(1+Number(oldAcc)),1000),{hitCorrectionPct:set.hitCorrectionPct})),currentIncomingHitPct:p(correctedHitChance(opposedChance(1000,1000*(1+Number(oldEva))),{evasionCorrectionPct:set.evasionCorrectionPct})),v1HitPct:p(opposedChance(1000*(1+Number(newAcc)),1000)),v1IncomingHitPct:p(opposedChance(1000,1000*(1+Number(newEva))))};
});
const armorCrit=[10,40,80,100].map(b=>{const chance=opposedChance(1000,1000*(1+b/100)),bonus=chance,expected=1+chance*bonus;return {bothAntiCritAttributePct:b,enemyCritChancePct:p(chance),critExtraDamagePct:p(bonus),expectedCritMultiplier:expected,directDamageReductionPct:p(1-expected/1.25)};});
const sensitivity=[.2,.5,.8].flatMap(base=>[.2,.5,1].map(b=>({baseProbabilityPct:p(base),attributeBonusPct:p(b),newProbabilityPct:p(base*(1+b)/(1+base*b)),relativeIncreasePct:p((1+b)/(1+base*b)-1)})));
assert.ok(Math.abs(rows[1].hitRelativeGainPct-9.0909)<1e-4);
assert.equal(targets[1].attributeBonusPct,50);
assert.equal(targets[1].referencePiecePct,10);
const out={at:new Date().toISOString(),rows,targets,compare,armorCrit,sensitivity,method:'live combat-math and armor-set functions; controlled equal input values; no gameplay simulation or database writes'};
writeFileSync('.data/balance-review-20260908/probability-review.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
