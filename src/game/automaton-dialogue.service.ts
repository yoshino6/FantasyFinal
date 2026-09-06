import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { automatonCharacter, automatonFor, automatonIntimacy, saveAutomaton } from './automaton.service';
import type { AutomatonState } from './automaton';
import { chooseAutomatonQuote } from './automaton-dialogue';
export const prepareAutomatonQuote=async(connection:PoolConnection,id:number,state:AutomatonState,event:string,key:string,facts:Set<string>=new Set(),allowCustom=false)=>{
  const [existing]=await connection.execute<RowDataPacket[]>('SELECT id,text_value,quote_id FROM automaton_dialogues WHERE automaton_id=? AND event_key=? FOR UPDATE',[id,key]);
  if(existing[0])return {id:Number(existing[0].id),text:String(existing[0].text_value),quoteId:String(existing[0].quote_id)};
  const [history]=await connection.execute<RowDataPacket[]>('SELECT text_hash FROM automaton_dialogues WHERE automaton_id=? AND sent_at>=DATE_SUB(NOW(),INTERVAL 180 DAY)',[id]);
  const selected=chooseAutomatonQuote(state,event,key,new Set(history.map(h=>String(h.text_hash))),facts,allowCustom);
  if(!selected)return null;
  const [insert]=await connection.execute<any>('INSERT INTO automaton_dialogues (automaton_id,event_key,event_type,quote_id,text_hash,text_value) VALUES (?,?,?,?,?,?)',[id,key,event,selected.id,selected.hash,selected.text]);
  return {id:Number(insert.insertId),text:selected.text,quoteId:selected.id};
};
export const greetAutomaton=(user:string,id:number,key:string,privateOutput:boolean)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user),{row,state}=await automatonFor(connection,character.id,id);
  if(!privateOutput&&!state.publicQuotes)return {quote:null,note:'语录默认私有；请在私密会话查看，或在设置中开启公开语录。'};
  await automatonIntimacy(connection,character.id,state,'interaction');await saveAutomaton(connection,row,state);
  const quote=await prepareAutomatonQuote(connection,id,state,'greeting',key,new Set(),privateOutput);
  return {quote,note:quote?'':'近期可用语句已用完，它安静地陪在你身旁。'};
});
export const acknowledgeAutomatonQuote=(id:number)=>withTransaction(async connection=>{await connection.execute('UPDATE automaton_dialogues SET sent_at=COALESCE(sent_at,NOW()) WHERE id=?',[id]);});
export const rateAutomatonQuote=(user:string,id:number,quoteId:number,like:boolean)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user),{row,state}=await automatonFor(connection,character.id,id);
  const [quotes]=await connection.execute<RowDataPacket[]>('SELECT quote_id FROM automaton_dialogues WHERE id=? AND automaton_id=? AND sent_at IS NOT NULL',[quoteId,id]);if(!quotes[0])throw new Error('只能反馈已收到的本人机巧语录。');
  const key=String(quotes[0].quote_id);state.preferences[key]=Math.max(-9,Math.min(40,(state.preferences[key]??0)+(like?1:-1)));await saveAutomaton(connection,row,state);
});

export const acknowledgeAutomatonBattleText=(user:string,text:string)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user);
  const [rows]=await connection.execute<RowDataPacket[]>("SELECT d.id,d.text_value FROM automaton_dialogues d WHERE d.sent_at IS NULL AND d.created_at>=DATE_SUB(NOW(),INTERVAL 1 DAY) AND d.event_key LIKE 'battle:%' AND EXISTS(SELECT 1 FROM combat_members cm WHERE cm.character_id=? AND SUBSTRING_INDEX(SUBSTRING(d.event_key,8),':',1)=cm.session_id)",[character.id]);
  for(const row of rows)if(text.includes('「'+row.text_value+'」'))await connection.execute('UPDATE automaton_dialogues SET sent_at=COALESCE(sent_at,NOW()) WHERE id=?',[row.id]);
});
