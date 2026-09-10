/** 默认只读。--baseline 指定改动前完整怪物快照；确认停服、备份与无战斗后 --apply。 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {isDeepStrictEqual} from 'node:util';
import {createPool,type RowDataPacket} from 'mysql2/promise';
import {monsterCombatStats,monsterAttributes,regionalBossComponentStats} from '../src/game/adventure.service';
import {regionalBossComponentByKey} from '../src/game/regional-boss-components.config';
import {recalculateNpcSparProfileStats,buildNpcSparProfile,canSparNpc} from '../src/game/npc-sparring.config';
import {recalculateCharacterStats} from '../src/game/character.service';
import {previousMonsterHpMax,migratedEnemyHp,enemyBalanceJson,ENEMY_STAT_BALANCE_VERSION} from '../src/game/enemy-stat-balance';
import {attributes} from '../src/game/types';
import {monsterGrowthCoefficient} from '../src/game/monster-growth';

const args=process.argv.slice(2),apply=args.includes('--apply');
const baselinePath=args[args.indexOf('--baseline')+1];
const baseline=args.includes('--baseline')?JSON.parse(readFileSync(baselinePath!,'utf8')):null;
if(baseline&&(!Array.isArray(baseline.spawns)||!baseline.at))throw Error('无效的改动前快照');
const oldIds=new Set<number>((baseline?.spawns??[]).map((r:any)=>Number(r.id)));
const cfg=createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=cfg.FantasyFinal?.database??cfg.mysql;
const pool=createPool({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectionLimit:1,charset:'utf8mb4'});
const connection=await pool.getConnection();
const directory=`.data/enemy-stat-migration/${new Date().toISOString().replace(/[:.]/g,'-')}`;
mkdirSync(directory,{recursive:true});
const migrationCode='enemy_segmented_growth_v4';
try{
  await connection.query(apply?'START TRANSACTION':'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const lock=apply?' FOR UPDATE':'';
  const [combat]=await connection.query<RowDataPacket[]>(`SELECT id FROM combat_sessions WHERE state='active'${lock}`);
  const [pvp]=await connection.query<RowDataPacket[]>(`SELECT id FROM player_pvp_battle_sessions WHERE state='active'${lock}`);
  const [negotiation]=await connection.query<RowDataPacket[]>(`SELECT id FROM negotiation_sessions WHERE state='active'${lock}`);
  const [migrations]=await connection.query<RowDataPacket[]>(`SELECT code FROM game_data_migrations WHERE code=?${lock}`,[migrationCode]);
  const alreadyApplied=migrations.length>0;
  const [templates]=await connection.query<RowDataPacket[]>(`SELECT * FROM monster_templates ORDER BY id${lock}`);
  const [rawSpawns]=await connection.query<RowDataPacket[]>(`SELECT * FROM monster_spawns WHERE defeated_at IS NULL ORDER BY id${lock}`);
  const [profiles]=await connection.query<RowDataPacket[]>(`SELECT * FROM npc_spar_profiles ORDER BY npc_code${lock}`);
  const [characters]=await connection.query<RowDataPacket[]>(`SELECT * FROM characters WHERE npc_code IS NOT NULL ORDER BY id${lock}`);
  const [npcs]=await connection.query<RowDataPacket[]>('SELECT n.*,r.code AS region_code FROM map_npcs n JOIN map_regions r ON r.id=n.region_id');
  const templateById=new Map(templates.map(r=>[Number(r.id),r]));
  const spawns=rawSpawns.map(r=>{const t=templateById.get(Number(r.template_id))!;return {...t,...r,code:t.code,monster_class:t.monster_class,...Object.fromEntries(attributes.map(k=>[k,r[k]??t[k]]))} as any});
  const bySpawnId=new Map(spawns.map(r=>[Number(r.id),r]));
  const blocked:string[]=[];
  if(combat.length||pvp.length||negotiation.length)blocked.push(`尚有活动PVE ${combat.length}、PVP ${pvp.length}、交涉 ${negotiation.length}`);
  if(!alreadyApplied&&!baseline)blocked.push('首次迁移必须提供 --baseline 改动前快照，区分旧怪物与新规则下新生怪物');
  const spawnChanges:any[]=[];
  for(const r of spawns){
    const traits=enemyBalanceJson(r.traits_json)??[];
    let nextTraits=traits;
    const spar=traits.find((t:any)=>t.code==='npc_sparring');
    const part=traits.find((t:any)=>t.code==='boss_component');
    if(spar?.profile)nextTraits=traits.map((t:any)=>t===spar?{...t,profile:{...t.profile,...recalculateNpcSparProfileStats(t.profile)}}:t);
    if(part){
      const body=bySpawnId.get(Number(part.body_spawn_id)),definition=regionalBossComponentByKey(part.part_key);
      if(!body||!definition){blocked.push(`部位 ${r.id} 缺少本体或定义`);continue;}
      nextTraits=traits.map((t:any)=>t===part?{...t,stats:regionalBossComponentStats(monsterCombatStats(body),definition),balanceVersion:ENEMY_STAT_BALANCE_VERSION}:t);
    }
    const oldMax=previousMonsterHpMax(r),newMax=monsterCombatStats({...r,traits_json:nextTraits}).hpMax;
    const current=Number(r.current_hp);
    // 改动前已有怪物按旧上限保留受伤比例；改动后新生怪物已用新公式，仅纠正越界血量。
    const hp=alreadyApplied||!oldIds.has(Number(r.id))?Math.min(current,newMax):migratedEnemyHp(current,oldMax,newMax);
    const traitChanged=!isDeepStrictEqual(traits,nextTraits);
    if(hp!==current||traitChanged)spawnChanges.push({id:Number(r.id),oldHp:current,newHp:hp,oldMax,newMax,oldTraits:r.traits_json,newTraits:nextTraits,traitChanged});
  }
  const profileChanges=profiles.flatMap(r=>{
    const previous=enemyBalanceJson(r.profile_json),next={...previous,...recalculateNpcSparProfileStats(previous)};
    return isDeepStrictEqual(previous,next)?[]:[{code:r.npc_code,previous: r.profile_json,next}];
  });
  const characterChanges=characters.filter(r=>Number(r.stat_formula_version)<ENEMY_STAT_BALANCE_VERSION);
  const npcScenarios=npcs.filter(r=>canSparNpc(r.code,r.interaction_kind)).flatMap(r=>[1,10,20,30,40,50].map(level=>({code:r.code,playerLevel:level,profile:buildNpcSparProfile(r as any,level,0)})));
  const templateAudit=templates.map(t=>({id:t.id,code:t.code,name:t.name,level:t.level,coefficient:monsterGrowthCoefficient(t.code),birth:Object.fromEntries(attributes.map(k=>[k,t[k]])),effectiveGrowth:Object.fromEntries(attributes.map(k=>[k,Number(t[k+'_growth'])*monsterGrowthCoefficient(t.code)])),six:monsterAttributes(t as any),stats:monsterCombatStats(t as any)}));
  const summary={mode:apply?'apply':'preview',directory,alreadyApplied,templates:templates.length,liveSpawns:spawns.length,oldSpawns:spawns.filter(r=>oldIds.has(Number(r.id))).length,newSpawns:spawns.filter(r=>!oldIds.has(Number(r.id))).length,spawnChanges:spawnChanges.length,profileChanges:profileChanges.length,characterChanges:characterChanges.length,mapNpcs:npcs.length,sparNpcs:npcScenarios.length/6,scenarioCount:npcScenarios.length,blocked};
  writeFileSync(`${directory}/preview.json`,JSON.stringify({summary,spawnChanges,profileChanges,characterChanges,templateAudit,npcScenarios},null,2));
  console.log(JSON.stringify(summary));
  if(apply){
    if(blocked.length)throw Error(blocked.join('；'));
    writeFileSync(`${directory}/backup.json`,JSON.stringify({at:new Date().toISOString(),migrationCode,alreadyApplied,templates,rawSpawns,profiles,characters},null,2));
    if(!alreadyApplied)await connection.execute('INSERT INTO game_data_migrations (code) VALUES (?)',[migrationCode]);
    for(const change of spawnChanges){
      if(change.traitChanged)await connection.execute('UPDATE monster_spawns SET current_hp=?,traits_json=? WHERE id=?',[change.newHp,JSON.stringify(change.newTraits),change.id]);
      else await connection.execute('UPDATE monster_spawns SET current_hp=? WHERE id=?',[change.newHp,change.id]);
    }
    for(const change of profileChanges)await connection.execute('UPDATE npc_spar_profiles SET profile_json=?,updated_at=NOW() WHERE npc_code=?',[JSON.stringify(change.next),change.code]);
    for(const r of characterChanges)await recalculateCharacterStats(connection,Number(r.id));
    const [afterSpawns]=await connection.query<RowDataPacket[]>('SELECT * FROM monster_spawns WHERE defeated_at IS NULL ORDER BY id');
    const [afterCharacters]=await connection.query<RowDataPacket[]>('SELECT * FROM characters WHERE npc_code IS NOT NULL ORDER BY id');
    const [afterProfiles]=await connection.query<RowDataPacket[]>('SELECT * FROM npc_spar_profiles ORDER BY npc_code');
    const afterMap=new Map(afterSpawns.map(r=>[Number(r.id),r]));
    for(const old of rawSpawns){const next=afterMap.get(Number(old.id));if(!next||attributes.some(k=>old[k]!==next[k])||old.level!==next.level||old.template_id!==next.template_id)throw Error(`怪物身份或出生数值改变：${old.id}`);}
    for(const change of spawnChanges)if(Number(afterMap.get(change.id)?.current_hp)!==change.newHp)throw Error(`血量回读不一致：${change.id}`);
    await connection.commit();
    writeFileSync(`${directory}/after.json`,JSON.stringify({rawSpawns:afterSpawns,characters:afterCharacters,profiles:afterProfiles},null,2));
    writeFileSync(`${directory}/result.json`,JSON.stringify({...summary,committed:true},null,2));
  }else await connection.rollback();
}catch(error){await connection.rollback();console.error(error instanceof Error?error.message:error);process.exitCode=1;}
finally{connection.release();await pool.end();}
process.exit(process.exitCode??0);
