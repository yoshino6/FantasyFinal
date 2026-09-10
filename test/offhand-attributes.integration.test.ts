import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createConnection,type RowDataPacket,type PoolConnection} from 'mysql2/promise';
import {recalculateCharacterStats,effectiveCharacterAttributes,equipmentExtraAttributes} from '../src/game/character.service';
import {weaponMasteryBonusesFor} from '../src/game/weapon-mastery.service';
import {calculateDerivedStats,equipmentQualityMultiplier} from '../src/game/constants';
import {calculatePanelStats,panelPercentKeys} from '../src/game/panel-stat-formula';
import {attributes,type Allocation,type DerivedStats} from '../src/game/types';
test('实库事务：副手主副词条、六维、元素、主手与效果边界，未学及随心1—6级（回滚）',{skip:process.env.FF_OFFHAND_DB_TEST!=='1'},async()=>{
  const cfg=createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=cfg.FantasyFinal?.database??cfg.mysql;
  const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database}) as PoolConnection;
  try{
    await c.beginTransaction();
    const [templates]=await c.query<RowDataPacket[]>('SELECT id FROM characters WHERE npc_code IS NULL LIMIT 1');assert.ok(templates[0]);
    const [p]=await c.execute<any>('INSERT INTO players (qq_user_id) VALUES (?)',[`offhand_${randomUUID().replaceAll('-','').slice(0,18)}`]);
    const [cols]=await c.query<RowDataPacket[]>('SHOW COLUMNS FROM characters');
    const names=cols.filter(r=>r.Field!=='id'&&!String(r.Extra).includes('GENERATED')).map(r=>String(r.Field));
    const [clone]=await c.execute<any>(`INSERT INTO characters (${names.map(n=>'`'+n+'`').join(',')}) SELECT ${names.map(n=>n==='player_id'?'?':n==='name'?"'副手验收影像'":n==='game_id'?'NULL':'`'+n+'`').join(',')} FROM characters WHERE id=?`,[p.insertId,templates[0].id]);
    const id=Number(clone.insertId);
    await c.execute(`UPDATE characters SET level=1,profession_code=NULL,current_hp=1,current_mp=1,${attributes.flatMap(k=>[`${k}=20`,`${k}_growth=0`]).join(',')},element_base_mastery_json=JSON_OBJECT(),element_base_resistance_json=JSON_OBJECT() WHERE id=?`,[id]);
    const flat=Object.fromEntries(Object.keys(panelPercentKeys).map(k=>[k,k==='speed'?-20:100])) as DerivedStats;
    const effect={...flat,physicalAttackPct:20,strength:20,elementMastery_火:20,elementResistance_火:20,damageReductionPct:12,minimumHitRatePct:30,epicWeaponCode:'offhand_test'};
    const [item]=await c.execute<any>("INSERT INTO item_definitions(code,name,description,item_type,item_category,weapon_type,rarity,required_level,effect_json) VALUES (?,'副手验收长剑','测试','equipment','武器','长剑','普通',1,?)",[`offhand_${randomUUID()}`,JSON.stringify(effect)]);
    const [instance]=await c.execute<any>('INSERT INTO player_item_instances(character_id,item_id,quality,effect_json) VALUES (?,?,100,?)',[id,item.insertId,JSON.stringify(effect)]);
    await c.execute("INSERT INTO player_equipment(character_id,slot,item_id,instance_id) VALUES (?,'offhand',?,?)",[id,item.insertId,instance.insertId]);
    const [masteries]=await c.query<RowDataPacket[]>("SELECT id FROM skill_definitions WHERE code='longsword_mastery'");assert.ok(masteries[0]);const skillId=Number(masteries[0].id);
    const columns:Record<string,string>={hpMax:'hp_max',mpMax:'mp_max',physicalAttack:'physical_attack',magicAttack:'magic_attack',physicalDefense:'physical_defense',magicDefense:'magic_defense',accuracy:'accuracy',evasion:'evasion',critRateBp:'crit_rate_bp',critDamageBp:'crit_damage_bp',critResistBp:'crit_resist_bp',critDamageReductionBp:'crit_damage_reduction_bp',tenacity:'tenacity',tenacityPierce:'tenacity_pierce',speed:'speed'};
    const read=async()=>{const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM characters WHERE id=?',[id]);return rows[0]!};
    const check=async(focus:number,quality=100)=>{
      await c.execute('UPDATE player_item_instances SET quality=? WHERE id=?',[quality,instance.insertId]);
      if(focus){await c.execute('INSERT IGNORE INTO player_skills(character_id,skill_id,level) VALUES (?,?,1)',[id,skillId]);await c.execute("INSERT INTO player_skill_specializations(character_id,skill_id,specialization,level) VALUES (?,?,'instant',?) ON DUPLICATE KEY UPDATE level=VALUES(level)",[id,skillId,focus]);}
      await recalculateCharacterStats(c,id);const row=await read();
      const factor=(focus<2?.5:(focus+4)/10)*equipmentQualityMultiplier(quality);
      const six=Object.fromEntries(attributes.map(k=>[k,20+(k==='strength'?20*factor:0)])) as Allocation;
      assert.deepEqual(await effectiveCharacterAttributes(c,row,id),six);
      const mastery=await weaponMasteryBonusesFor(c,id);
      const expected=calculatePanelStats(calculateDerivedStats(six),Object.fromEntries(Object.entries(flat).map(([k,v])=>[k,v*factor])),{physicalAttackPct:20*factor},[Object.fromEntries(Object.values(panelPercentKeys).map(k=>[k,Number((mastery as any)[k]??0)]))]);
      for(const [key,column] of Object.entries(columns))assert.equal(Number(row[column]),expected[key as keyof DerivedStats],`随心${focus} 品质${quality} ${key}`);
      const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v;
      assert.equal(parse(row.element_mastery_json).火,20*factor);assert.equal(parse(row.element_resistance_json).火,20*factor);
      const extra=await equipmentExtraAttributes(c,id);
      assert.equal(extra.damageReductionPct,12);assert.equal(extra.minimumHitRatePct,30*equipmentQualityMultiplier(quality));
      assert.equal(row.current_hp,1);assert.equal(row.current_mp,1);
    };
    for(let level=0;level<=6;level++)await check(level);
    await check(1,25);
    // 换到主手后，低级随心不再缩放同一装备。
    await c.execute("UPDATE player_equipment SET slot='weapon' WHERE character_id=? AND slot='offhand'",[id]);
    await c.execute('UPDATE player_item_instances SET quality=100 WHERE id=?',[instance.insertId]);
    await recalculateCharacterStats(c,id);const main=await read();assert.equal((await effectiveCharacterAttributes(c,main,id)).strength,40);
    const [stored]=await c.query<RowDataPacket[]>('SELECT effect_json FROM player_item_instances WHERE id=?',[instance.insertId]);
    assert.deepEqual(typeof stored[0]!.effect_json==='string'?JSON.parse(stored[0]!.effect_json):stored[0]!.effect_json,effect);
  }finally{await c.rollback();await c.end();}
});
