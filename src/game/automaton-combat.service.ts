import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { craftJson } from './alchemy-journal.service';
import { automatonFor, saveAutomaton, automatonIntimacy, type AutomatonRow } from './automaton.service';
import { emptyRuleState } from './combat-rule-registry';
import { automatonRuleUnit as unitFor, type AutomatonBattleState, type AutomatonCombatant } from './automaton-combat';
import { prepareAutomatonQuote } from './automaton-dialogue.service';
import { recordAutomatonEvent } from './automaton.service';
export const loadCombatAutomatons=async(connection:PoolConnection,sessionId:string,ownerIds:number[])=>{
  if(!ownerIds.length)return [];
  const [existing]=await connection.execute<RowDataPacket[]>('SELECT automaton_id,owner_id,state_json FROM combat_automatons WHERE session_id=? FOR UPDATE',[sessionId]);
  const result:AutomatonCombatant[]=existing.map(row=>{const battle=craftJson<AutomatonBattleState>(row.state_json),id=Number(row.automaton_id);return{id,ownerId:Number(row.owner_id),battle,unit:unitFor(id,battle)};});
  for(const ownerId of ownerIds){
    if(result.some(p=>p.ownerId===ownerId))continue;
    const [rows]=await connection.execute<AutomatonRow[]>('SELECT * FROM player_automatons WHERE owner_id=? AND following=1 FOR UPDATE',[ownerId]);
    const row=rows[0];if(!row)continue;const {state}=await automatonFor(connection,ownerId,Number(row.id));if(!state.hp)continue;
    const battle:AutomatonBattleState={pet:state,rule:emptyRuleState(),cooldowns:{},sync:state.equipped.includes('S008')?20:0,ultimateUsed:false,actionCount:0,exited:false,threat:{}};
    await connection.execute('INSERT INTO combat_automatons (session_id,automaton_id,owner_id,state_json) VALUES (?,?,?,?)',[sessionId,row.id,ownerId,JSON.stringify(battle)]);
    await connection.execute('UPDATE player_automatons SET combat_id=?,recover_at=NULL WHERE id=?',[sessionId,row.id]);
    result.push({id:Number(row.id),ownerId,battle,unit:unitFor(Number(row.id),battle)});
    await connection.execute('INSERT IGNORE INTO automaton_events (automaton_id,character_id,event_key,kind,data_json) VALUES (?,?,?,\'battle_start\',?)',[row.id,ownerId,`battle:${sessionId}`,JSON.stringify({name:state.name,sessionId})]);
  }
  return result;
};
export const saveCombatAutomatons=async(connection:PoolConnection,sessionId:string,pets:AutomatonCombatant[])=>{
  for(const pet of pets)await connection.execute('UPDATE combat_automatons SET state_json=? WHERE session_id=? AND automaton_id=?',[JSON.stringify(pet.battle),sessionId,pet.id]);
};
export const finishCombatAutomatons=async(connection:PoolConnection,sessionId:string,victory=false)=>{
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT automaton_id,owner_id,state_json FROM combat_automatons WHERE session_id=? FOR UPDATE',[sessionId]);
  for(const row of rows){const battle=craftJson<AutomatonBattleState>(row.state_json);const {row:stored,state}=await automatonFor(connection,Number(row.owner_id),Number(row.automaton_id));state.hp=battle.pet.hp;state.mp=battle.pet.mp;
    if(victory)await automatonIntimacy(connection,Number(row.owner_id),state,'victory');
    await recordAutomatonEvent(connection,Number(row.automaton_id),Number(row.owner_id),`end:${sessionId}`,victory?'victory':state.hp?'rest':'shutdown',{name:state.name,sessionId,hp:state.hp,mp:state.mp});
    await saveAutomaton(connection,stored,state);await connection.execute('UPDATE player_automatons SET combat_id=NULL,recover_at=DATE_ADD(NOW(),INTERVAL ? MINUTE) WHERE id=?',[state.hp>0?10:30,row.automaton_id]);}
  await connection.execute('DELETE FROM combat_automatons WHERE session_id=?',[sessionId]);
};
export const appendAutomatonBattleQuotes=async(connection:PoolConnection,sessionId:string,pets:AutomatonCombatant[],log:string[],victory:boolean)=>{
  const [existing]=await connection.execute<RowDataPacket[]>('SELECT automaton_id,event_type FROM automaton_dialogues WHERE event_key LIKE ?',[`battle:${sessionId}:%`]);
  let teamCount=existing.length;
  for(const p of pets){
    if(!p.battle.pet.publicQuotes||teamCount>=4)continue;
    const shown=existing.filter(row=>Number(row.automaton_id)===p.id).map(row=>String(row.event_type));if(shown.length>=2)continue;
    const memory=p.unit.state.memory;
    const event=!p.unit.hp?'shutdown':memory.automaton_intercept===1?'intercept':memory.automaton_ownerDanger===1?'owner_danger':p.battle.actionCount<=1?'battle_start':victory?'victory':p.unit.hp/p.unit.hpMax<.3?'hurt':'attack';
    if(shown.includes(event))continue;
    const facts=new Set<string>([event,'owner_present','battle_active','owner_alive','enemy_present','level_gained','intercept_succeeded','battle_won']);
    const quote=await prepareAutomatonQuote(connection,p.id,p.battle.pet,event,`battle:${sessionId}:${event}`,facts,false);
    if(quote){log.push(`【${p.unit.name}】「${quote.text}」`);teamCount++;}
  }
};
