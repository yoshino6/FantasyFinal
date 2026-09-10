import {readFileSync,writeFileSync} from 'node:fs';
import {calculateDerivedStats,forgedEquipmentBase,virtualEquipmentStats,equipmentQualityMultiplier,forgeRarityMultiplier} from '../../src/game/constants';
import {calculatePanelStats,panelPercentKeys} from '../../src/game/panel-stat-formula';
import {armorSetFromRows} from '../../src/game/armor-set';
import {birth,increment,keys as petKeys} from '../../src/game/automaton-growth';
import {opposedChance,correctedHitChance,correctedCritChance,correctedCritBonus} from '../../src/game/combat-math';
const s=JSON.parse(readFileSync('.data/balance-review-20260908/snapshot.json','utf8'));
const attrs=['constitution','spirit','strength','intelligence','agility','perception'];
const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v??{};
const sum=(a:number[])=>a.reduce((x,y)=>x+y,0);
const median=(a:number[])=>{a=[...a].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:0;};
const growth=(l:number)=>Math.min(9,Math.max(0,l-1))+2*Math.min(10,Math.max(0,l-10))+3*Math.min(10,Math.max(0,l-20));
const body=(r:any,isNew=false,birthOnly=false)=>calculateDerivedStats(Object.fromEntries(attrs.map(k=>{
 const pg=Number(parse(s.professions.find((p:any)=>p.code===r.profession_code)?.growth_json)[k]??0);
 return [k,Number(r[k])+Number(r[k+'_growth'])*(isNew?growth(Number(r.level)):Math.max(0,Number(r.level)-1))-(isNew&&birthOnly?pg*(growth(r.level)-(r.level-1)):0)];
})) as any);
const standard=(l:number,isNew=false,profession='')=>body({level:l,profession_code:profession,...Object.fromEntries(attrs.flatMap(k=>[[k,100/6],[k+'_growth',10/6+Number(parse(s.professions.find((p:any)=>p.code===profession)?.growth_json)[k]??0)]]))},isNew);
const b=(l:number)=>standard(l,true).physicalAttack;
const newWeapon=(l:number)=>b(l)/2, newArmor=(l:number)=>b(l)/10;
const armorMod:any={'布甲':[.2,.2,16,12,16],'皮甲':[.4,.4,8,0,8],'轻甲':[.8,.8,0,0,0],'重甲':[1.3,1.1,0,-8,-8],'板甲':[1.8,1.6,-12,-16,-16]};
const innateKeys=['accuracy','evasion','critResistBp','critDamageReductionBp','tenacity','speed'];
const profiles:any={
 '布甲':{percent:[4,1,-2,2,-2,4]},
 '皮甲':{percent:[1,4,-2,-2,-2,6]},
 '轻甲':{percent:[2,2,2,2,2,2]},
 '重甲':{percent:[0,0,12,8,10,-1]},
 '板甲':{percent:[-.5,-.5,16,16,8,-2]}
};
const newSets:any={
 '布甲':{3:{panel:{mpPct:8}},5:{panel:{mpPct:16,magicAttackPct:3}}},
 '皮甲':{3:{panel:{hpPct:3}},5:{panel:{hpPct:5,speedPct:5}}},
 '轻甲':{3:{panel:{hpPct:3,mpPct:3}},5:{panel:{hpPct:6,mpPct:6}}},
 '重甲':{3:{panel:{hpPct:5}},5:{panel:{hpPct:10}}},
 '板甲':{3:{panel:{hpPct:3},reduction:1.5},5:{panel:{hpPct:6},reduction:3}}
};
const slotWeight=(slot:string)=>['upper','lower','上装','下装'].includes(slot)?1.2:13/15;
const armorProfile=(rows:any[])=>{const out:any={panelPercent:{},setPercent:{},hitCorrectionPct:0,evasionCorrectionPct:0,critAvoidanceCorrectionPct:0,critDamageCorrectionPct:0,reduction:0};const counts:any={};for(const r of rows){if(r.rarity==='神器'||!['shoulder','upper','waist','lower','feet'].includes(r.slot))continue;const p=profiles[r.weapon_type];if(!p)continue;counts[r.weapon_type]=(counts[r.weapon_type]??0)+1;innateKeys.forEach((k,i)=>{const pk=panelPercentKeys[k as keyof typeof panelPercentKeys];out.panelPercent[pk]=(out.panelPercent[pk]??0)+p.percent[i]*slotWeight(r.slot)*equipmentQualityMultiplier(Number(r.quality??100));});}const active=Object.entries(counts).find(([,n])=>Number(n)>=3);if(active){const e=newSets[active[0]][Number(active[1])>=5?5:3];out.setPercent=e.panel;out.reduction=e.reduction??0;}return out;};
const gearEffect=(r:any,isNew:boolean)=>{
 const e={...parse(r.effect_json)}; if(!isNew||r.rarity==='神器'||Number(r.required_level)>30)return e;
 const weapon=r.item_category==='武器'||r.weapon_type==='盾牌';
 const p=weapon?(r.weapon_type==='盾牌'?['physicalDefense','magicDefense']:['法杖','法书','法球'].includes(r.weapon_type)?['magicAttack']:r.weapon_type==='匕首'?['physicalAttack','magicAttack']:['physicalAttack']):['physicalDefense','magicDefense'];
 const ratio=(weapon?newWeapon(Number(r.required_level)):newArmor(Number(r.required_level))*slotWeight(r.slot??r.item_category))/forgedEquipmentBase(Number(r.required_level),weapon?'武器':'防具');
 for(const k of p){if(!(k in e))continue; const fusion=sum(s.fusions.filter((f:any)=>f.instance_id===r.instance_id).map((f:any)=>Number(parse(f.effect_json)[k]??0)));e[k]=Math.max(0,Number(e[k])-fusion)*ratio+fusion;}
 return e;
};
const panel=(r:any,isNew:boolean,stripArtifact=false)=>{
 const rows=s.equipment.filter((e:any)=>e.character_id===r.id&&(!stripArtifact||e.rarity!=='神器'));
 const core=Object.fromEntries(attrs.map(k=>[k,Number(r[k])+Number(r[k+'_growth'])*(isNew?growth(r.level):r.level-1)+sum(rows.map((e:any)=>Number(gearEffect(e,isNew)[k]??0)*equipmentQualityMultiplier(Number(e.quality))))]));
 const base=calculateDerivedStats(core as any),flat:any={},pct:any={};
 for(const k of Object.keys(base)){flat[k]=sum(rows.map((e:any)=>Number(gearEffect(e,isNew)[k]??0)*equipmentQualityMultiplier(Number(e.quality))*(isNew?1:k==='physicalDefense'?armorMod[e.weapon_type]?.[0]??1:k==='magicDefense'?armorMod[e.weapon_type]?.[1]??1:1)));}
 for(const pk of Object.values(panelPercentKeys))pct[pk]=sum(rows.map((e:any)=>Number(gearEffect(e,isNew)[pk]??0)*equipmentQualityMultiplier(Number(e.quality))));
 const set=isNew?armorProfile(rows):armorSetFromRows(rows); const out:any=calculatePanelStats(base,flat,pct,[set?.panelPercent??{},...(isNew?[set.setPercent]:[])]);
 if(!isNew)for(const [k,i] of [['accuracy',2],['evasion',3],['speed',4]] as const)out[k]=Math.floor(out[k]*Math.max(0,1+sum(rows.map((e:any)=>armorMod[e.weapon_type]?.[i]??0))/100));
 return out;
};
const players=s.characters.filter((r:any)=>!r.npc_code);
const cohorts=[['1—10',1,10],['11—20',11,20],['21—30',21,30]].map(([label,lo,hi])=>{
 const p=players.filter((r:any)=>r.level>=Number(lo)&&r.level<=Number(hi));
 return {label,count:p.length,baseMedian:median(p.map((r:any)=>sum(attrs.map(k=>Number(r[k]))))),growthMedian:median(p.map((r:any)=>sum(attrs.map(k=>Number(r[k+'_growth']))))),artifactUsers:p.filter((r:any)=>s.equipment.some((e:any)=>e.character_id===r.id&&e.rarity==='神器')).length,fullArmor:p.filter((r:any)=>s.equipment.filter((e:any)=>e.character_id===r.id&&['shoulder','upper','waist','lower','feet'].includes(e.slot)).length===5).length,medianSlots:median(p.map((r:any)=>s.equipment.filter((e:any)=>e.character_id===r.id).length)),avgQuality:median(s.equipment.filter((e:any)=>p.some((r:any)=>r.id===e.character_id)&&e.rarity!=='神器').map((e:any)=>Number(e.quality)))};
});
const playerRows=players.map((r:any)=>({id:r.id,level:Number(r.level),profession:r.profession_code,baseTotal:sum(attrs.map(k=>Number(r[k]))),growthTotal:sum(attrs.map(k=>Number(r[k+'_growth']))),coreBefore:sum(attrs.map(k=>Number(r[k])+Number(r[k+'_growth'])*(r.level-1))),coreAfter:sum(attrs.map(k=>Number(r[k])+Number(r[k+'_growth'])*growth(r.level))),bodyBefore:body(r),bodyAfter:body(r,true),bodyBirthOnly:body(r,true,true),stored:{hp:r.hp_max,pa:r.physical_attack,ma:r.magic_attack,pd:r.physical_defense,md:r.magic_defense},gearPanelBefore:panel(r,false),gearPanelAfter:panel(r,true),noArtifactBefore:panel(r,false,true),noArtifactAfter:panel(r,true,true),slots:s.equipment.filter((e:any)=>e.character_id===r.id).map((e:any)=>({slot:e.slot,rarity:e.rarity,level:e.required_level,quality:e.quality,code:e.code}))}));
const standardRows=[1,5,10,11,15,20,21,25,30].map(l=>({level:l,growthOld:l-1,growthNew:growth(l),old:standard(l),new:standard(l,true),oldWeapon:forgedEquipmentBase(l,'武器'),newWeapon:newWeapon(l),oldArmor:forgedEquipmentBase(l,'防具'),newArmor:newArmor(l)}));
const zero=()=>Object.fromEntries(Object.keys(panelPercentKeys).map(k=>[k,0]));
const virtual=(l:number,tier:string,pa:number,ma:number,isNew:boolean)=>{
 const old:any=virtualEquipmentStats(l,tier as any,pa,ma);if(!isNew)return old;
 const m:any={normal:.6,large:1,elite:1.15,boss:1.3};const scale=m[tier]??.6;
 const k=pa>=ma?'physicalAttack':'magicAttack';
 old[k]=Math.floor(newWeapon(l)*scale);old.physicalDefense=Math.floor(b(l)*.5*scale);old.magicDefense=Math.floor(b(l)*.5*scale);
 return old; // elite/boss non-primary secondary expectations frozen at existing values
};
const monster=(r:any,newGear=false,newGrowth=false)=>{
 const a=Object.fromEntries(attrs.map(k=>[k,Math.floor(Number(r[k])+Number(r[k+'_growth'])*(newGrowth?growth(r.level):r.level-1))]));
 const base:any=calculateDerivedStats(a as any),v=virtual(r.level,r.monster_class,base.physicalAttack,base.magicAttack,newGear);
 return Object.fromEntries(Object.keys(base).map(k=>[k,Math.floor(base[k]+v[k])]));
};
const standardPanel=(l:number,prof:string,isNew:boolean,newGear:boolean,type='轻甲')=>{
 const p:any=standard(l,isNew,prof),a=newGear?[1,1,0,0,0]:armorMod[type];const w=newGear?newWeapon(l):forgedEquipmentBase(l,'武器');const ar=newGear?newArmor(l):forgedEquipmentBase(l,'防具');
 const flat:any={physicalDefense:5*ar*a[0],magicDefense:5*ar*a[1]};flat[['mage','priest'].includes(prof)?'magicAttack':'physicalAttack']=w;
 const rows=['shoulder','upper','waist','lower','feet'].map(slot=>({slot,weapon_type:type})),set=newGear?armorProfile(rows):armorSetFromRows(rows)!;
 const stats:any=calculatePanelStats(p,flat,{},[set.panelPercent,...(newGear?[set.setPercent]:[])]);for(const [k,i] of [['accuracy',2],['evasion',3],['speed',4]] as const)stats[k]=Math.floor(stats[k]*(1+5*a[i]/100));
 return {stats,set};
};
const expected=(p:any,q:any,magic:boolean,sourceSet:any=null,targetSet:any=null,power=1)=>{
 const a=p[magic?'magicAttack':'physicalAttack']*power,d=q[magic?'magicDefense':'physicalDefense'];
 const corr={hitCorrectionPct:sourceSet?.hitCorrectionPct,evasionCorrectionPct:targetSet?.evasionCorrectionPct,critAvoidanceCorrectionPct:targetSet?.critAvoidanceCorrectionPct,critDamageCorrectionPct:targetSet?.critDamageCorrectionPct};
 const h=correctedHitChance(opposedChance(p.accuracy,q.evasion),corr),c=correctedCritChance(opposedChance(p.critRateBp,q.critResistBp),corr),cb=correctedCritBonus(opposedChance(p.critDamageBp,q.critDamageReductionBp),corr);
 const hit=Math.max(1,Math.floor(a*a/(a+Math.max(1,d))));return h*((1-c)*hit+c*Math.max(1,Math.floor(hit*(1+cb))))*(1-Number(targetSet?.reduction??0)/100);
};
// Only untraited actual spawns: no fictional recreation of random base attributes.
const eligible=s.spawns.filter((r:any)=>['normal','large','elite'].includes(r.monster_class)&&Array.isArray(parse(r.traits_json))&&parse(r.traits_json).length===0);
const duelRows:any[]=[];
for(const l of [5,10,15,20,25,30])for(const tier of ['normal','large','elite']){
 const monsters=eligible.filter((m:any)=>m.level===l&&m.monster_class===tier);if(!monsters.length)continue;
 for(const [scenario,gp,eg,mg,gm] of [['现行',false,false,false,false],['仅成长',true,false,false,false],['玩家改怪物不改',true,true,false,false],['建议联动',true,true,true,false],['怪物成长也翻倍',true,true,true,true]] as const){
 const p=standardPanel(l,'warrior',gp,eg);const results=monsters.map((r:any)=>{const m=monster(r,mg,gm);const out=expected(p.stats,m,false,p.set);const incoming=expected(m,p.stats,m.magicAttack>m.physicalAttack,null,p.set);return {kill:m.hpMax/out,death:p.stats.hpMax/incoming,margin:(p.stats.hpMax/incoming)/(m.hpMax/out),attack:m.physicalAttack,defense:m.physicalDefense};});
 duelRows.push({level:l,tier,n:monsters.length,scenario,kill:median(results.map(x=>x.kill)),death:median(results.map(x=>x.death)),margin:median(results.map(x=>x.margin)),monsterAttack:median(results.map(x=>x.attack)),monsterDefense:median(results.map(x=>x.defense))});
 }
}
const classRows:any[]=[];
for(const l of [10,20,30])for(const prof of ['warrior','mage','rogue','priest'])for(const type of ['布甲','皮甲','轻甲','重甲','板甲']){
 const monsters=eligible.filter((m:any)=>m.level===l&&m.monster_class==='normal'); if(!monsters.length)continue;
 const p=standardPanel(l,prof,true,true,type);const v=monsters.map((r:any)=>{const m=monster(r,true,false),kill=m.hpMax/expected(p.stats,m,['mage','priest'].includes(prof),p.set),death=p.stats.hpMax/expected(m,p.stats,m.magicAttack>m.physicalAttack,null,p.set);return {kill,death,margin:death/kill};});
 classRows.push({level:l,prof,type,n:monsters.length,kill:median(v.map(x=>x.kill)),death:median(v.map(x=>x.death)),margin:median(v.map(x=>x.margin))});
}
const pets=[1,10,20,30].map(l=>{const old=[...birth];for(let i=2;i<=l;i++)increment(i,'均衡').forEach((v,j)=>old[j]+=v);
 const t=(l-1)/49,oldPlayer=standard(l),newPlayer=standard(l,true);const converted=petKeys.map((k,i)=>old[i]+(.8+.2*t)*(newPlayer[k]-oldPlayer[k])+(['physicalAttack','magicAttack'].includes(k)?.9*t*(newWeapon(l)-forgedEquipmentBase(l,'武器')):0));
 return {level:l,before:Object.fromEntries(petKeys.map((k,i)=>[k,Math.floor(old[i]+1e-9)])),proposed:Object.fromEntries(petKeys.map((k,i)=>[k,Math.floor(converted[i]+1e-9)]))};});
const summary={capturedAt:s.capturedAt,players:players.length,npcs:s.characters.length-players.length,cohorts,artifactUsers:players.filter((r:any)=>s.equipment.some((e:any)=>e.character_id===r.id&&e.rarity==='神器')).length,eligibleSpawns:eligible.length,projectionDecreases:playerRows.filter((r:any)=>Math.max(r.gearPanelAfter.physicalAttack,r.gearPanelAfter.magicAttack)<Math.max(r.gearPanelBefore.physicalAttack,r.gearPanelBefore.magicAttack)).map((r:any)=>r.id),fullArmorUsers:cohorts.reduce((a:any,c:any)=>a+c.fullArmor,0)};
const armorChecks=Object.entries(profiles).map(([name,p]:any)=>{
 const [acc,eva,res,red]=p.percent.map((v:number)=>1+.05*v);
 const dps=2*acc/(acc+1),survival=(1+eva)/2*1.25/(1+1/(1+res)/(1+red));
 const set=newSets[name][5],at=1+Number(set.panel.magicAttackPct??0)/100;const withSetDps=dps*2*at*at/(at+1),withSetEhp=survival*(1+Number(set.panel.hpPct??0)/100)/(1-Number(set.reduction??0)/100);
 return {name,dps,ehp:survival,budget:dps*survival,withSetDps,withSetEhp,withSetBudget:withSetDps*withSetEhp,fullPercent:p.percent.map((v:number)=>v*5)};
});
const plateOriginal={dps:2*.2/1.2,ehp:1.2/2*1.25/(1+1/2.8/2.8)};
const armorSensitivity:any[]=[];
for(const hitRatio of [.5,1,2])for(const critRatio of [.25,1,4])for(const quality of [0,100])for(const [name,p]of Object.entries(profiles) as any){
 const [acc,eva,res,red]=p.percent.map((v:number)=>1+.05*v*equipmentQualityMultiplier(quality));
 const dps=(hitRatio*acc/(hitRatio*acc+1))/(hitRatio/(hitRatio+1));
 const ehp=(hitRatio+eva)/(hitRatio+1)*(1+critRatio/(critRatio+1)*critRatio/(critRatio+1))/(1+critRatio/(critRatio+res)*critRatio/(critRatio+red));
 armorSensitivity.push({hitRatio,critRatio,quality,name,budget:dps*ehp});
}
const mixes:any[]=[];const slots=['shoulder','upper','waist','lower','feet'],names=Object.keys(profiles);
for(let code=0;code<3125;code++){let n=code;const rows=slots.map(slot=>{const type=names[n%5];n=Math.floor(n/5);return {slot,weapon_type:type};});const p=armorProfile(rows),v=p.panelPercent;const acc=1+Number(v.accuracyPct??0)/100,eva=1+Number(v.evasionPct??0)/100,res=1+Number(v.critResistPct??0)/100,red=1+Number(v.critDamageReductionPct??0)/100;const at=1+Number(p.setPercent.magicAttackPct??0)/100;const dps=2*acc/(acc+1)*2*at*at/(at+1),ehp=(1+eva)/2*1.25/(1+1/(1+res)/(1+red))*(1+Number(p.setPercent.hpPct??0)/100)/(1-p.reduction/100);mixes.push({rows,dps,ehp,budget:dps*ehp});}
mixes.sort((a,b)=>b.budget-a.budget);
writeFileSync('.data/balance-review-20260908/calculations.json',JSON.stringify({summary,profiles,newSets,armorChecks,plateOriginal,armorSensitivity,mixCount:mixes.length,mixTop:mixes.slice(0,5),standardRows,playerRows,duelRows,classRows,pets},null,2));
console.log(JSON.stringify({summary,armorChecks,duels:duelRows.filter(x=>x.tier==='normal'&&[10,20,30].includes(x.level)),classes:classRows.filter(x=>x.level===30&&['warrior','mage'].includes(x.prof))},null,2));


