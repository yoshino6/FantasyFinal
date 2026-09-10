import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection} from 'mysql2/promise';
import ts from 'typescript';
import * as constants from '../src/game/constants';
import {lamplightPrivate,lamplightLocal,lamplightJoin,lamplightWorld} from '../src/game/lamplight-content.generated';
import {lamplightWork} from '../src/game/lamplight-work';
import type {LamplightNode} from '../src/game/lamplight.types';
const budget=(n:LamplightNode)=>Math.floor(Array.from({length:n.endLevel-n.minLevel+1},(_,i)=>constants.experienceRequiredForLevel(n.minLevel+i)).reduce((a,b)=>a+b,0)*n.experienceShare);
const {parse}=createRequire(import.meta.url)('yaml'),settings=parse(readFileSync('alemon.config.yaml','utf8')),db=settings.FantasyFinal?.database??settings.mysql;
const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectTimeout:8000});
const result:Record<string,any>={};
try{
 await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 result.settings=(await c.query("SELECT setting_key,numeric_value FROM game_global_settings WHERE setting_key='experience_multiplier'"))[0];
 result.players=(await c.query(`SELECT c.level,c.realm_stage,p.phase,p.node_index,COUNT(*) AS players FROM player_lamplight_progress p JOIN characters c ON c.id=p.character_id GROUP BY c.level,c.realm_stage,p.phase,p.node_index ORDER BY c.level,p.phase,p.node_index`))[0];
 result.rewards=(await c.query(`SELECT node_code,COUNT(*) AS grants,MIN(experience) AS minimum,MAX(experience) AS maximum,SUM(experience) AS total FROM player_lamplight_rewards GROUP BY node_code ORDER BY node_code`))[0];
 result.jobs=(await c.query("SELECT s.uses,COUNT(*) AS players FROM player_opening_services s WHERE code='job_progress' GROUP BY uses ORDER BY uses"))[0];
 await c.rollback();
}finally{await c.end();}
// Execute the actual level settlement with isolated storage, neutral talent, and explicit multipliers.
const ast=ts.createSourceFile('a.ts',readFileSync('src/game/adventure.service.ts','utf8'),ts.ScriptTarget.Latest,true);
const decl=ast.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(ast)==='awardRealmExperience'))!;
const code=ts.transpileModule(decl.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
result.growth=[];
for(const multiplier of [...new Set([1,2,5,10,Number(result.settings[0]?.numeric_value??1)])]){
 const char={id:1,level:5,experience:0,realm_stage:1};
 const conn={execute:async(sql:string,args:any[])=>{if(sql.startsWith('UPDATE characters SET level=')){char.level=args[0];char.experience=args[1];}else throw Error(sql);}};
 const deps={repairEvolutionProgress:async()=>({corrected:false}),realmLevelCap:constants.realmLevelCap,experienceRequiredForLevel:constants.experienceRequiredForLevel,globalExperienceMultiplier:async()=>multiplier,talentExperience:async(_c:any,_id:any,x:number)=>x,recordSkillPointChange:async()=>{}};
 const award=new Function(...Object.keys(deps),code+'\nreturn awardRealmExperience;')(...Object.values(deps));
 const trace=[];
 for(const n of [...lamplightPrivate.F03,...lamplightLocal.baina_town]){
  if(char.level<n.minLevel){trace.push({blocked:n.code,requires:n.minLevel,level:char.level,experience:char.experience});break;}
  const gain=await award(conn,char,budget(n),{talent:{kind:'quest',key:n.code}});trace.push({node:n.code,base:budget(n),awarded:gain.experience,level:char.level,experience:char.experience});
 }
 result.growth.push({multiplier,trace});
}
result.budgets={private:lamplightPrivate.F03.map(n=>[n.code,budget(n)]),local:Object.fromEntries(Object.entries(lamplightLocal).map(([h,ns])=>[h,ns.map(n=>[n.code,n.minLevel,budget(n),n.gate])])),join:lamplightJoin.map(n=>[n.code,budget(n)]),world:lamplightWorld.reduce((a,n)=>a+budget(n),0)};
result.workKinds=Object.fromEntries(['maintenance','rescue','supplies','records'].map(k=>[k,[...lamplightPrivate.F03,...lamplightLocal.world_tree,...lamplightJoin,...lamplightWorld].filter(n=>lamplightWork(n).kind===k).length]));
const lampAst=ts.createSourceFile('l.ts',readFileSync('src/game/lamplight.service.ts','utf8'),ts.ScriptTarget.Latest,true);
const gateDecl=lampAst.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(lampAst)==='getGate'))!;
const gateCode=ts.transpileModule(gateDecl.getText(lampAst),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const gate=new Function('lampJson','legacyProgress',gateCode+'\nreturn getGate;')((v:any)=>v,async()=>({goblin:0,gratitude:0,evolution:0}));
result.afterBreakthrough=await gate(null,{id:1,level:10,experience:5200,realm_stage:2},{flags_json:{}},lamplightLocal.baina_town[4]);
result.nextNodeGate=await gate(null,{id:1,level:10,experience:5200,realm_stage:1},{flags_json:{}},lamplightLocal.baina_town[3]);
writeFileSync('.data/main-story-review-20260909.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
