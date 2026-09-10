import {writeFileSync} from 'node:fs';
import {talentExperience} from '../../src/game/talent-rewards';
import {emptyTalentData,type TalentData} from '../../src/game/talent-data';
import {talentCode} from '../../src/game/talent.config';
let data:TalentData=emptyTalentData();
const c={execute:async(sql:string,args:any[]=[])=>{
  if(sql.startsWith('SELECT code FROM player_blessings'))return [[{code:talentCode('C10')}]];
  if(sql.startsWith('SELECT data_json'))return [[{data_json:JSON.stringify(data)}]];
  if(sql.startsWith('INSERT INTO player_talent_state')){data=JSON.parse(args[1]);return [{affectedRows:1}];}
  throw Error(`Unexpected SQL: ${sql}`);
}};
for(const n of [100,200,300,400])await talentExperience(c as any,1,n,{kind:'combat'});
const before=structuredClone(data);
await talentExperience(c as any,1,500,{kind:'combat'});
const result={finding:'C10 full queue replaces unresolved candidate without user selection',queued:before.jobs.map(j=>j.payload.amount),candidateBefore:before.flags.reviewOverflow.amount,candidateAfter:data.flags.reviewOverflow.amount,oldCandidateRetained:JSON.stringify(data).includes('600')};
writeFileSync('.data/talent-implementation-20260908/acceptance-findings.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
