import {randomUUID} from 'node:crypto';
import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
import {buildNpcSparProfile,recalculateNpcSparProfileStats} from './npc-sparring.config';
import {snapshotCombatEnvironment} from './world-dynamics.service';
import {advancedResourceForProfession} from './advanced-resource.config';
import type {LamplightNode} from './lamplight.types';
import {grantOpeningItem} from './opening.service';
import {lamplightNode} from './lamplight.config';
import type {LamplightState} from './lamplight.types';
const json=(value:unknown):Record<string,any>=>typeof value==='string'?JSON.parse(value):value as Record<string,any>??{};

export const lamplightBattleProfile=(node:Pick<LamplightNode,'code'|'gate'|'minLevel'>,stage:number)=>{
  const level=node.gate==='boss'?(stage===0?30:32):node.gate==='barrier'?10:22;
  const name=node.gate==='boss'?(stage===0?'诺维恩·界路屏障':'诺维恩·断路执笔者'):node.gate==='barrier'?'幽影狼王·公会调查遭遇':'噶·界路研究验证';
  const base=buildNpcSparProfile({code:`lamplight_${node.code}_${stage}`,name,description:node.gate==='barrier'?'守卫巡护':'学者观测机关',region_code:'world_tree'},level,0);
  const profile={...base,name,level,band:[level,level] as [number,number],profession:node.gate==='barrier'?'warrior':'mage',advancedCode:undefined,advancedName:'',advancedEffect:{},
    equipment:{...base.equipment,level,quality:100},evolution:{},injections:0};
  return {...profile,...recalculateNpcSparProfileStats(profile)};
};

/** Uses the existing isolated duel session lifecycle, without public spawns, loot, capture or daily spar awards. */
export const startLamplightBattle=async(c:PoolConnection,character:RowDataPacket,node:LamplightNode,stage:number)=>{
  await(await import('./character.service')).recalculateCharacterStats(c,Number(character.id));
  const [current]=await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?',[character.id]);Object.assign(character,current[0]);
  const profile=lamplightBattleProfile(node,stage),session=randomUUID();
  const [templates]=await c.execute<RowDataPacket[]>("SELECT id FROM monster_templates WHERE code='npc_sparring_dummy' LIMIT 1");
  if(!templates[0])throw Error('主线对抗所需的基础战斗数据尚未初始化。');
  await c.execute('INSERT INTO player_lamplight_battles (session_id,character_id,node_code,stage,snapshot_json) VALUES (?,?,?,?,?)',[session,character.id,node.code,stage,JSON.stringify({hp:character.current_hp,mp:character.current_mp,kind:node.gate})]);
  const [spawn]=await c.execute<any>(`INSERT INTO monster_spawns (template_id,region_id,pos_x,pos_y,pos_z,level,current_hp,skill_sequence,traits_json,defeated_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
    [templates[0].id,character.current_region_id,character.pos_x,character.pos_y,character.pos_z,profile.level,profile.stats.hpMax,JSON.stringify(profile.rotation),JSON.stringify([{code:'npc_sparring',name:'',profile},{code:'lamplight_encounter',name:'',owner_character_id:character.id,node:node.code,stage}])]);
  await c.execute("INSERT INTO combat_sessions (id,character_id,spawn_id,player_hp,player_mp,cooldowns,opening_damage_bonus,mode) VALUES (?,?,?,?,?,JSON_OBJECT(),0,'story')",[session,character.id,spawn.insertId,character.current_hp,character.current_mp]);
  await c.execute('INSERT INTO combat_members (session_id,character_id,current_hp,current_mp,selected_target_id,cooldowns,stamina_eligible) VALUES (?,?,?,?,?,JSON_OBJECT(),0)',[session,character.id,character.current_hp,character.current_mp,spawn.insertId]);
  await c.execute('INSERT INTO combat_targets (session_id,spawn_id,current_mp,cooldowns) VALUES (?,?,?,JSON_OBJECT())',[session,spawn.insertId,profile.stats.mpMax]);
  await c.execute('INSERT INTO combat_threat (session_id,spawn_id,character_id,threat) VALUES (?,?,?,1)',[session,spawn.insertId,character.id]);
  await snapshotCombatEnvironment(c,session,Number(character.current_region_id),[Number(character.id)]);
  const [professions]=await c.execute<RowDataPacket[]>('SELECT profession_code FROM player_advanced_professions WHERE character_id=?',[character.id]);
  const resource=advancedResourceForProfession(String(professions[0]?.profession_code??''));
  if(resource)await c.execute('INSERT INTO combat_profession_resources (session_id,character_id,profession_code,resource_code,resource_name,current_value,max_value) VALUES (?,?,?,?,?,0,100)',[session,character.id,resource.professionCode,resource.code,resource.name]);
  return session;
};
export const finishLamplightBattle=async(c:PoolConnection,session:string,result:'victory'|'defeat'|'escaped'|'timeout')=>{
  const [rows]=await c.execute<RowDataPacket[]>('SELECT * FROM player_lamplight_battles WHERE session_id=? FOR UPDATE',[session]);
  const row=rows[0];if(!row)return null;if(row.state!=='active')return'这次主线对抗已经结算。';
  const snap=json(row.snapshot_json);
  const [states]=await c.execute<RowDataPacket[]>('SELECT * FROM player_lamplight_progress WHERE character_id=? FOR UPDATE',[row.character_id]);
  const state=states[0];if(!state)throw Error('主线记录缺失，请保留战斗现场。');
  const flags=json(state.flags_json);
  if(lamplightNode(state as LamplightState)?.code!==row.node_code)throw Error('对抗与当前主线不一致，请保留记录核查。');
  if(snap.kind==='boss'&&Number(row.stage)!==Number(flags.bossStage??0))throw Error('中枢对抗阶段不一致，请保留记录核查。');
  if(result==='victory'){
    if(snap.kind==='boss')flags.bossStage=Math.max(Number(flags.bossStage??0),Number(row.stage)+1);
    else if(snap.kind==='research')flags.research=true;
    else if(snap.kind==='barrier'&&!flags.barrierWon){flags.barrierWon=true;await grantOpeningItem(c,Number(row.character_id),'sky_dust');}
  }
  flags.message=result==='victory'?(snap.kind==='boss'&&Number(flags.bossStage)<2?'外围屏障已经解除。诺维恩退入核心，第二阶段仍等待你完成。':snap.kind==='barrier'?'调查队核验幽影狼王遭遇的结果，将找到的天空粉尘交给你。请带它向晴儿请教，再依原规则感悟。':'本次对抗已完成。见证人保存了结果，回到主线继续后续处理。'):'接应人员将你带回已经建立的安全点。本次没有完成对抗，原调查、奖励与人物关系保持不变，可以准备后再试。';
  await c.execute('UPDATE player_lamplight_progress SET flags_json=?,revision=revision+1 WHERE character_id=?',[JSON.stringify(flags),row.character_id]);
  await c.execute('UPDATE player_lamplight_battles SET state=? WHERE session_id=?',[result,session]);
  await c.execute('UPDATE characters SET current_hp=LEAST(hp_max,?),current_mp=LEAST(mp_max,?) WHERE id=?',[snap.hp,snap.mp,row.character_id]);
  await c.execute('UPDATE combat_sessions SET state=? WHERE id=?',[result==='timeout'?'escaped':result,session]);
  await(await import('./automaton-combat.service')).finishCombatAutomatons(c,session,result==='victory');
  await c.execute('UPDATE player_battle_buffs SET remaining_battles=remaining_battles-1 WHERE character_id=? AND remaining_battles>0',[row.character_id]);
  await c.execute('DELETE FROM player_battle_buffs WHERE character_id=? AND remaining_battles<=0',[row.character_id]);
  await(await import('./character.service')).recalculateCharacterStats(c,Number(row.character_id));
  await c.execute('DELETE FROM combat_status_effects WHERE session_id=?',[session]);
  await c.execute('DELETE FROM combat_spirits WHERE session_id=?',[session]);
  await c.execute('UPDATE combat_members SET pending_action=NULL WHERE session_id=?',[session]);
  await c.execute("UPDATE monster_spawns s JOIN combat_targets t ON t.spawn_id=s.id SET s.current_hp=0,s.defeated_at=NOW(),s.traits_json=JSON_ARRAY(JSON_OBJECT('code','lamplight_encounter','name','')) WHERE t.session_id=?",[session]);
  return flags.message as string;
};
