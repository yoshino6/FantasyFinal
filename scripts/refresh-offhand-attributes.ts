/** 默认事务预览并回滚；--apply仅重算现有副手持有者的角色面板，保留装备原始词条。 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {isDeepStrictEqual} from 'node:util';
import {createPool,type RowDataPacket} from 'mysql2/promise';
import {recalculateCharacterStats} from '../src/game/character.service';
import {weaponMasteryBonusesFor} from '../src/game/weapon-mastery.service';
const cfg=createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=cfg.FantasyFinal?.database??cfg.mysql;
const pool=createPool({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectionLimit:1});
const c=await pool.getConnection(),apply=process.argv.includes('--apply');
const directory=`.data/offhand-refresh/${new Date().toISOString().replace(/[:.]/g,'-')}`;mkdirSync(directory,{recursive:true});
try{
  await c.beginTransaction();
  const [characters]=await c.query<RowDataPacket[]>("SELECT c.* FROM characters c WHERE EXISTS (SELECT 1 FROM player_equipment pe WHERE pe.character_id=c.id AND pe.slot='offhand') ORDER BY c.id FOR UPDATE");
  const [pve]=await c.query<RowDataPacket[]>("SELECT id FROM combat_sessions WHERE state='active' FOR UPDATE");
  const [pvp]=await c.query<RowDataPacket[]>("SELECT id FROM player_pvp_battle_sessions WHERE state='active' FOR UPDATE");
  if(pve.length||pvp.length)throw Error(`当前有活动PVE ${pve.length}、PVP ${pvp.length}，不批量重算战斗中的面板`);
  const [equipment]=await c.query<RowDataPacket[]>("SELECT pe.*,ii.effect_json,ii.quality FROM player_equipment pe LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id WHERE pe.slot='offhand' ORDER BY pe.character_id");
  writeFileSync(`${directory}/before.json`,JSON.stringify({characters,equipment},null,2));
  const audit:any[]=[];
  const keys=['hp_max','mp_max','physical_attack','magic_attack','physical_defense','magic_defense','accuracy','evasion','crit_rate_bp','crit_damage_bp','crit_resist_bp','crit_damage_reduction_bp','tenacity','tenacity_pierce','speed','element_mastery_json','element_resistance_json'];
  for(const before of characters){
    const mastery=await weaponMasteryBonusesFor(c,Number(before.id));
    await recalculateCharacterStats(c,Number(before.id));
    const [rows]=await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?',[before.id]);const after=rows[0]!;
    audit.push({id:before.id,name:before.name,multiplier:mastery.offhandAttributeMultiplier,changed:keys.filter(k=>!isDeepStrictEqual(before[k],after[k])),before,after});
  }
  const [afterEquipment]=await c.query<RowDataPacket[]>("SELECT pe.*,ii.effect_json,ii.quality FROM player_equipment pe LEFT JOIN player_item_instances ii ON ii.id=pe.instance_id WHERE pe.slot='offhand' ORDER BY pe.character_id");
  if(!isDeepStrictEqual(equipment,afterEquipment))throw Error('副手装备记录发生变化，回滚');
  const result={apply,directory,characters:characters.length,changed:audit.filter(r=>r.changed.length).length,scales:audit.map(({id,multiplier,changed})=>({id,multiplier,changed}))};
  writeFileSync(`${directory}/audit.json`,JSON.stringify(audit,null,2));
  if(apply)await c.commit();else await c.rollback();
  writeFileSync(`${directory}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await c.rollback();console.error(error instanceof Error?error.message:error);process.exitCode=1;}
finally{c.release();await pool.end();}
process.exit(process.exitCode??0);
