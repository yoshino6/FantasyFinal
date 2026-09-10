import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection,type RowDataPacket,type PoolConnection} from 'mysql2/promise';
import {monsterCombatStats} from '../src/game/adventure.service';
import {recalculateNpcSparProfileStats} from '../src/game/npc-sparring.config';
import {recalculateCharacterStats} from '../src/game/character.service';
import {createCombatRules} from '../src/game/combat-rule-adapter';
import {attributes} from '../src/game/types';
test('实库事务：存活怪物血量、全部域民快照、NPC重算及敌方套装适配（回滚）',{skip:process.env.FF_ENEMY_DB_TEST!=='1'},async()=>{
  const cfg=createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=cfg.FantasyFinal?.database??cfg.mysql;
  const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database}) as PoolConnection;
  try{
    await c.beginTransaction();
    const [templates]=await c.query<RowDataPacket[]>('SELECT * FROM monster_templates');
    const [spawns]=await c.query<RowDataPacket[]>('SELECT * FROM monster_spawns WHERE defeated_at IS NULL');
    const byId=new Map(templates.map(t=>[Number(t.id),t]));
    for(const r of spawns){const t=byId.get(Number(r.template_id))!;const row={...t,...r,code:t.code,...Object.fromEntries(attributes.map(k=>[k,r[k]??t[k]]))};assert.ok(Number(r.current_hp)<=monsterCombatStats(row as any).hpMax,`怪物 ${r.id} 血量越界`);}
    const [profiles]=await c.query<RowDataPacket[]>('SELECT * FROM npc_spar_profiles');
    for(const r of profiles){const profile=typeof r.profile_json==='string'?JSON.parse(r.profile_json):r.profile_json;assert.deepEqual({...profile,...recalculateNpcSparProfileStats(profile)},profile,`域民 ${r.npc_code} 重算不幂等`);}
    const [characters]=await c.query<RowDataPacket[]>('SELECT * FROM characters WHERE npc_code IS NOT NULL FOR UPDATE');
    assert.ok(characters.length);assert.ok(profiles.length);
    for(const before of characters){
      await recalculateCharacterStats(c,Number(before.id));
      const [after]=await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?',[before.id]);
      for(const key of ['hp_max','mp_max','current_hp','current_mp','physical_attack','magic_attack','physical_defense','magic_defense','accuracy','evasion','crit_rate_bp','crit_resist_bp','crit_damage_bp','crit_damage_reduction_bp','tenacity','tenacity_pierce','speed','stat_formula_version'])assert.equal(after[0]![key],before[key],`NPC ${before.npc_code} 的 ${key} 不稳定`);
    }
    const selected=profiles.find(r=>r.npc_code==='alchemy_sweetshop')!;
    const profile=typeof selected.profile_json==='string'?JSON.parse(selected.profile_json):selected.profile_json;
    const target={id:-904,name:profile.name,level:profile.level,current_hp:profile.stats.hpMax,hp_max:profile.stats.hpMax,current_mp:profile.stats.mpMax,cooldowns:{},traits_json:[{code:'npc_sparring',name:'',profile}]};
    const battle=await createCombatRules(c,'enemy-balance-test',1,[{...characters[0],cooldowns:{}}] as any,[target] as any,monsterCombatStats as any,()=>[],[],async()=>({absorbed:0,remaining:0,broken:false}),()=>{});
    assert.deepEqual(battle.get('target',-904).armorSet,profile.armorSet);
    assert.equal(battle.get('target',-904).armorSet?.hitCorrectionPct,33);
    assert.equal(battle.get('target',-904).accuracy,profile.stats.accuracy);
  }finally{await c.rollback();await c.end();}
});
