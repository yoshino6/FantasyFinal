import { armorPanelPercent } from '../src/game/armor-class';
import { panelPercentKeys } from '../src/game/panel-stat-formula';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as alemon from 'alemonjs';
import { createConnection, type RowDataPacket, type PoolConnection } from 'mysql2/promise';
import { createCombatRules } from '../src/game/combat-rule-adapter';
import { createPvpCombatRules } from '../src/game/pvp-combat-rule-adapter';
import { equipmentSetSummary } from '../src/game/equipment-set-summary';
import { calculateDerivedStats } from '../src/game/constants';

const enabled=process.env.FF_ARMOR_DB_TEST==='1';
test('数据库事务：临时角色穿卸甲、15项属性重算、双战斗适配器与装备消息（全部回滚）',{skip:!enabled},async()=>{
  const require=createRequire(import.meta.url),config=require('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=config.FantasyFinal?.database??config.mysql;
  const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectTimeout:8000}) as PoolConnection;
  try {
    await c.beginTransaction();
    const [templates]=await c.query<RowDataPacket[]>('SELECT id FROM characters WHERE npc_code IS NULL LIMIT 1');assert.ok(templates[0]);
    const user=`armor_${randomUUID().replaceAll('-','').slice(0,20)}`;
    const [player]=await c.execute<any>('INSERT INTO players (qq_user_id) VALUES (?)',[user]);
    const [columns]=await c.query<RowDataPacket[]>('SHOW COLUMNS FROM characters');const names=columns.filter(col=>col.Field!=='id'&&!String(col.Extra).includes('GENERATED')).map(col=>String(col.Field));
    const [clone]=await c.execute<any>(`INSERT INTO characters (${names.map(n=>'`'+n+'`').join(',')}) SELECT ${names.map(n=>n==='player_id'?'?':n==='name'?"'甲类验收影像'":n==='game_id'?'NULL':'`'+n+'`').join(',')} FROM characters WHERE id=?`,[player.insertId,templates[0].id]);
    const id=Number(clone.insertId),cache=new Map<string,any>();let sent:any;
    const load=(relative:string):any=>{
      const path=resolve(relative.endsWith('.ts')?relative:relative+'.ts');if(cache.has(path))return cache.get(path).exports;
      const module={exports:{} as any};cache.set(path,module);
      const local=(name:string):any=>name==='alemonjs'?{...alemon,useEvent:()=>[{current:{UserId:user}}]}:name.endsWith('/use-game-message')?{useGameMessage:()=>[{send:async(value:any)=>{sent=value;}}]}:name.endsWith('/pool')?{getPool:async()=>c,withTransaction:async(work:any)=>work(c)}:name.startsWith('.')?load(resolve(dirname(path),name)):require(name);
      const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      new Function('require','module','exports',compiled)(local,module,module.exports);return module.exports;
    };
    const characterService=load('src/game/character.service'),adventure=load('src/game/adventure.service');
    const read=async()=>{const [r]=await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?',[id]);return r[0];};
    await c.execute('UPDATE characters SET current_hp=1,current_mp=1 WHERE id=?',[id]);
    await characterService.recalculateCharacterStats(c,id);const baseline=await read();
    const slots=['shoulder','upper','waist','lower','feet'];
    const wear=async(name:string,count:number,epic='')=>{
      await c.execute('DELETE FROM player_equipment WHERE character_id=?',[id]);
      for(const slot of slots.slice(0,count)) {
        const [item]=await c.execute<any>("INSERT INTO item_definitions (code,name,description,item_type,item_category,weapon_type,rarity,required_level,effect_json) VALUES (?,?,'事务测试装备','equipment','防具',?,'普通',1,?)",[`armor_${randomUUID()}`,name,name,JSON.stringify({epicSetCode:epic})]);
        const [instance]=await c.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality) VALUES (?,?,100)',[id,item.insertId]);
        await c.execute('INSERT INTO player_equipment (character_id,slot,item_id,instance_id) VALUES (?,?,?,?)',[id,slot,item.insertId,instance.insertId]);
      }
      await characterService.recalculateCharacterStats(c,id);return read();
    };
    for(const name of ['重甲','板甲']) for(const count of [2,3,5]) {
      const panel=await wear(name,count),ratio=count===5?1.25:count===3?1.12:1;
      assert.ok(Math.abs(Number(panel.hp_max)-Number(baseline.hp_max)*ratio)<=1,`${name}${count}生命`);
      assert.equal(Number(panel.current_hp),1,'增加上限不会免费治疗');assert.equal(Number(panel.current_mp),1);
    }
    // 无装备额外属性和进化/精通记录的临时角色，基础面板作为期望；机动性仍受原有轻甲单件倍率影响。
    const map:Record<string,string>={hpMax:'hp_max',mpMax:'mp_max',physicalAttack:'physical_attack',magicAttack:'magic_attack',physicalDefense:'physical_defense',magicDefense:'magic_defense',accuracy:'accuracy',evasion:'evasion',speed:'speed',critRateBp:'crit_rate_bp',critDamageBp:'crit_damage_bp',critResistBp:'crit_resist_bp',critDamageReductionBp:'crit_damage_reduction_bp',tenacity:'tenacity',tenacityPierce:'tenacity_pierce'};
    for(const count of [3,5]) {
      const panel=await wear('轻甲',count),ratio=count===5?1.15:1.08;
      const armor=armorPanelPercent(slots.slice(0,count).map(slot=>({slot,weapon_type:'轻甲',quality:100})));
      for(const [key,column] of Object.entries(map)) {
        const mobility=1+Number(armor[panelPercentKeys[key as keyof typeof panelPercentKeys]]??0)/100;
        assert.ok(Math.abs(Number(panel[column])-Number(baseline[column])*(['hpMax','mpMax'].includes(key)?ratio:1)*mobility)<=2,`${count}轻甲 ${column}`);
      }
      for(const key of ['constitution','spirit','strength','intelligence','agility','perception','element_mastery_json','element_resistance_json']) assert.deepEqual(panel[key],baseline[key],key);
    }
    const panel=await wear('板甲',5,'mountainheart_regalia');
    const items=await adventure.equipment(user);assert.equal(items.length,5);assert.equal(equipmentSetSummary(items).length,2);
    const member={...panel,id,current_hp:1000,current_mp:1000,cooldowns:{},selected_target_id:-1},foe={...member,id:-1,name:'甲类试靶',monster_class:'normal'};
    const stats={...calculateDerivedStats({constitution:100,spirit:100,strength:100,intelligence:100,agility:100,perception:100}),crit:50,critResist:50,critDamage:50,critReduction:50};
    const pve=await createCombatRules(c,randomUUID(),1,[member],[foe],()=>stats,()=>[],[],'',async()=>({absorbed:0,remaining:0,broken:false}),()=>{});
    assert.equal(pve.get('member',id).armorSet?.critAvoidanceCorrectionPct,12);assert.equal(pve.get('target',-1).armorSet,undefined);
    const pvp=await createPvpCombatRules(c,[member,foe],[{},{}],1,[],()=>{});assert.equal(pvp.get(id).armorSet?.critDamageCorrectionPct,12);
    await load('src/response/equipment').default();assert.ok(sent?.format);
    const strings:string[]=[];const visit=(value:any)=>{if(typeof value==='string')strings.push(value);else if(value&&typeof value==='object')for(const child of Object.values(value))visit(child);};visit(sent.format.value);
    const rendered=strings.join('\n');assert.ok(rendered.indexOf('已生效套装效果')>rendered.indexOf('【戒指】'));assert.match(rendered,/板甲 5\/5件/);assert.match(rendered,/断层壁障/);assert.match(rendered,/12%/);
    const removed=await wear('板甲',0);for(const column of Object.values(map))assert.equal(removed[column],baseline[column],`卸下 ${column}`);
    assert.equal(equipmentSetSummary(await adventure.equipment(user)).length,0);
  } finally {await c.rollback();await c.end();}
});
