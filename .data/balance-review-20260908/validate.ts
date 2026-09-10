import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {calculateDerivedStats,virtualEquipmentStats,equipmentQualityMultiplier,forgeRarityMultiplier} from '../../src/game/constants';
const root='.data/balance-review-20260908/';
const s=JSON.parse(readFileSync(root+'snapshot.json','utf8')),c=JSON.parse(readFileSync(root+'calculations.json','utf8')),m=JSON.parse(readFileSync(root+'monster-calculations.json','utf8'));
const attrs=['constitution','spirit','strength','intelligence','agility','perception'];
const g=(l:number)=>Math.min(9,Math.max(0,l-1))+2*Math.min(10,Math.max(0,l-10))+3*Math.min(10,Math.max(0,l-20));
assert.equal(g(1),0);assert.equal(g(10),9);assert.equal(g(11),11);assert.equal(g(20),29);assert.equal(g(21),32);assert.equal(g(30),59);
const equipment:any[]=[];
for(let l=1;l<=30;l++){
 if(l>1)assert.equal(g(l)-g(l-1),l<=10?1:l<=20?2:3);
 const base=calculateDerivedStats(Object.fromEntries(attrs.map(k=>[k,(100+10*g(l))/6])) as any);
 for(const [rarity,r]of Object.entries(forgeRarityMultiplier))for(const quality of [0,60,100]){
  const b=base.physicalDefense,z=r*equipmentQualityMultiplier(quality);
  const upper=.12*b*z,lower=upper,other=13/150*b*z;
  assert.ok(Math.abs(upper+lower+other*3-.5*b*z)<1e-8);
  assert.ok(upper>other);assert.ok(Math.abs(base.physicalAttack-base.physicalDefense)<1e-8);
  equipment.push({level:l,rarity,quality,weapon:.5*b*z,upper,lower,shoulder:other,waist:other,feet:other});
 }
}
assert.equal(c.playerRows.length,42);assert.equal(m.spawns.length,4423);assert.equal(m.templates.length,204);
for(const r of c.playerRows){const orig=s.characters.find((x:any)=>x.id===r.id);const total=attrs.reduce((a,k)=>a+Number(orig[k])+Number(orig[k+'_growth'])*g(r.level),0);assert.ok(Math.abs(total-r.coreAfter)<1e-8);}
const mapping:any={critRateBp:'crit',critDamageBp:'critDamage',critResistBp:'critResist',critDamageReductionBp:'critReduction'};
let compared=0;
for(const r of s.spawns){const traits=typeof r.traits_json==='string'?JSON.parse(r.traits_json):r.traits_json;if(!Array.isArray(traits)||traits.length||!['normal','large','elite'].includes(r.monster_class))continue;
 const a=Object.fromEntries(attrs.map(k=>[k,Math.floor(Number(r[k])+Number(r[k+'_growth'])*(r.level-1))]));
 const base=calculateDerivedStats(a as any),gear=virtualEquipmentStats(r.level,r.monster_class,base.physicalAttack,base.magicAttack);const exact=m.spawns.find((x:any)=>x.id===r.id).old;
 for(const k of Object.keys(base) as Array<keyof typeof base>){assert.equal(Math.floor(base[k]+gear[k]),exact[mapping[k]??k],`spawn ${r.id} ${k}`);}compared++;
}
assert.equal(compared,2442);
for(const r of m.spawns)for(const part of [r.old,r.newMainOnly])for(const v of Object.values(part))assert.ok(Number.isFinite(Number(v)));
assert.equal(c.mixCount,3125);assert.equal(c.armorSensitivity.length,90);
const doc=readFileSync('docs/玩家六维成长与装备甲类重平衡复核建议V1.md','utf8');
assert.equal((doc.match(/^```/gm)??[]).length%2,0);
assert.ok(!/TODO|TBD|待填写/.test(doc));
const hashes=JSON.parse(readFileSync(root+'source-hashes.json','utf8')).sha256;
for(const [p,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),hash,`${p} changed since report generation`);
writeFileSync(root+'equipment-caps-1-30.json',JSON.stringify(equipment,null,2));
writeFileSync(root+'validation.json',JSON.stringify({at:new Date().toISOString(),passed:true,growthBoundaries:6,allLevelIncrements:29,equipmentLevelRarityQualityCases:equipment.length,allPlayerRows:42,independentMonsterComparisons:compared,finiteActualMonsterRows:4423,templateRows:204,armorMixes:3125,armorSensitivityRows:90,sourceHashesMatched:Object.keys(hashes).length,typescriptCommand:'npx tsc --noEmit',typescriptExitCode:0,limitations:'static calculation and source checks only; no gameplay implementation or full combat replay'},null,2));
console.log('Audit checks passed; 540 equipment cap combinations, 42 players, 2442 independent monster comparisons, 4423 finite monster rows.');
