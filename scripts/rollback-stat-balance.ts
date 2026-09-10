/** 停服且回退本次数值代码后使用；默认只读检查，--apply 才恢复备份。 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createPool, type RowDataPacket } from 'mysql2/promise';
const argument=process.argv.slice(2).find(value=>!value.startsWith('--'));
if(!argument)throw new Error('用法：npx tsx scripts/rollback-stat-balance.ts <迁移备份目录> [--apply]');
const directory=resolve(argument),apply=process.argv.includes('--apply');
if(!existsSync(`${directory}/applied.json`)||existsSync(`${directory}/rolled-back.json`))throw new Error('该目录不是已提交且未回滚的迁移备份');
const read=(file:string)=>JSON.parse(readFileSync(`${directory}/${file}.json`,'utf8'));
const backup=read('backup'),preview=read('preview'),after=read('after');
const cfg=createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=cfg.FantasyFinal?.database??cfg.mysql;
const pool=createPool({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectionLimit:1});const c=await pool.getConnection();
const stats=['hp_max','mp_max','current_hp','current_mp','physical_attack','magic_attack','physical_defense','magic_defense','accuracy','evasion','crit_rate_bp','crit_damage_bp','crit_resist_bp','crit_damage_reduction_bp','tenacity','tenacity_pierce','speed','stat_formula_version','element_mastery_json','element_resistance_json'];
const canonical=(value:any):string=>{if(typeof value==='string'){try{return canonical(JSON.parse(value));}catch{return JSON.stringify(value);}}if(value&&typeof value==='object')return Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);};
try{
  await c.query(apply?'START TRANSACTION':'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const lock=apply?' FOR UPDATE':'';
  const [characters]=await c.query<RowDataPacket[]>(`SELECT * FROM characters ORDER BY id${lock}`);
  const [combat]=await c.query<RowDataPacket[]>("SELECT id FROM combat_sessions WHERE state='active' UNION ALL SELECT id FROM player_pvp_battle_sessions WHERE state='active'");
  if(combat.length)throw new Error('存在进行中的战斗，不能回滚');
  for(const row of after.characters){const current=characters.find(entry=>Number(entry.id)===Number(row.id));if(!current||stats.some(key=>canonical(current[key])!==canonical(row[key])))throw new Error(`角色 ${row.id} 在迁移后已变化，不能覆盖回滚`);}
  for(const [table,planKey,backupKey]of [['item_definitions','definitionPlan','definitions'],['player_item_instances','instancePlan','instances']]as const){
    for(const plan of preview[planKey].filter((row:any)=>row.changed)){
      const [rows]=await c.execute<RowDataPacket[]>(`SELECT ${table==='player_item_instances'?'effect_json,character_id,market_listing_id':'effect_json'} FROM ${table} WHERE id=?${lock}`,[plan.id]);
      if(!rows[0]||canonical(rows[0].effect_json)!==canonical(plan.effect))throw new Error(`装备 ${table}/${plan.id} 在迁移后已变化，不能覆盖回滚`);
      const original=backup[backupKey].find((row:any)=>Number(row.id)===Number(plan.id));
      if(table==='player_item_instances'&&(Number(rows[0].character_id)!==Number(original.character_id)||Number(rows[0].market_listing_id)!==Number(original.market_listing_id)))throw new Error(`实例 ${plan.id} 的归属或寄售状态已变化，不能覆盖回滚`);
      if(apply){
        const listing=table==='player_item_instances'?original.market_listing_id:null;
        if(listing!=null)await c.execute('UPDATE player_item_instances SET market_listing_id=NULL WHERE id=?',[plan.id]);
        await c.execute(`UPDATE ${table} SET effect_json=? WHERE id=?`,[original.effect_json==null?null:typeof original.effect_json==='string'?original.effect_json:JSON.stringify(original.effect_json),plan.id]);
        if(listing!=null)await c.execute('UPDATE player_item_instances SET market_listing_id=? WHERE id=?',[listing,plan.id]);
      }
    }
  }
  for(const plan of preview.marketPlan??[]){
    const [rows]=await c.execute<RowDataPacket[]>(`SELECT * FROM market_instance_listings WHERE id=?${lock}`,[plan.id]);
    const original=backup.marketListings.find((row:any)=>Number(row.id)===Number(plan.id));
    if(!rows[0]||rows[0].status!==original.status||Number(rows[0].seller_id)!==Number(original.seller_id)||Number(rows[0].price)!==Number(original.price)||canonical(rows[0].snapshot_json)!==canonical(plan.snapshot))throw new Error(`寄售 ${plan.id} 已变化，不能覆盖回滚`);
    if(apply)await c.execute('UPDATE market_instance_listings SET snapshot_json=? WHERE id=?',[typeof original.snapshot_json==='string'?original.snapshot_json:JSON.stringify(original.snapshot_json),plan.id]);
  }
  // 有机巧时不能只回退玩家而遗留新版机巧；本批实际为0，后续批次须增加其逐字段校验再执行。
  if(backup.automatons.length)throw new Error('该备份含机巧，须核实机巧后续活动记录后再恢复');
  if(apply){for(const row of backup.characters)await c.execute(`UPDATE characters SET ${stats.map(key=>key+'=?').join(',')} WHERE id=?`,[...stats.map(key=>typeof row[key]==='object'&&row[key]!==null?JSON.stringify(row[key]):row[key]),row.id]);await c.commit();writeFileSync(`${directory}/rolled-back.json`,JSON.stringify({at:new Date().toISOString()}));}
  else await c.rollback();
  console.log(JSON.stringify({directory,rolledBack:apply,verified:true}));
}catch(error){await c.rollback();throw error;}finally{c.release();await pool.end();}
