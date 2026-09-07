import { createHash, randomBytes } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { automatonCharacter, automatonFor, recordAutomatonEvent } from './automaton.service';

type Context={Platform?:string;BotId?:string;UserId?:string;ChannelId?:string;GuildId?:string;IsPrivate?:boolean};
export const portraitScope=(event:Context)=>{
  if(!event.UserId||(!event.IsPrivate&&!event.ChannelId))throw new Error('无法识别上传会话。');
  return createHash('sha256').update(JSON.stringify([event.Platform??'',event.BotId??'',event.IsPrivate?'private':'group',event.GuildId??'',event.ChannelId??'',event.UserId])).digest('hex');
};
const assertQueueAvailable=async(c:PoolConnection,characterId:number,id:number)=>{
  const [pending]=await c.execute<RowDataPacket[]>("SELECT id FROM automaton_portrait_reviews WHERE character_id=? AND automaton_id=? AND status='pending'",[characterId,id]);
  if(pending.length)throw new Error('此机巧已有待审核图片，请等待审核或恢复默认形象后重新提交。');
  const [counts]=await c.execute<RowDataPacket[]>("SELECT COUNT(*) total FROM automaton_portrait_reviews WHERE character_id=? AND created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)",[characterId]);
  if(Number(counts[0]?.total)>=10)throw new Error('24小时内最多提交10张形象图片，请稍后再试。');
};
export const beginPortraitUpload=(user:string,scope:string,id:number)=>withTransaction(async c=>{
  const character=await automatonCharacter(c,user),{state}=await automatonFor(c,character.id,id);
  await assertQueueAvailable(c,character.id,id);
  const token=randomBytes(16).toString('hex');
  await c.execute('DELETE FROM automaton_portrait_uploads WHERE character_id=? AND expires_at<=NOW()',[character.id]);
  await c.execute("INSERT INTO automaton_portrait_uploads(character_id,scope_key,token,automaton_id,status,expires_at) VALUES(?,?,?,?,'pending',DATE_ADD(NOW(),INTERVAL 2 MINUTE)) ON DUPLICATE KEY UPDATE token=VALUES(token),automaton_id=VALUES(automaton_id),status='pending',expires_at=VALUES(expires_at)",[character.id,scope,token,id]);
  return {token,name:state.name,id};
});
export const reservePortraitUpload=(user:string,scope:string)=>withTransaction(async c=>{
  // 普通图片事件不要求发图者已注册，也不会打断其他图片处理流程。
  const [players]=await c.execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? FOR UPDATE',[user]);
  if(!players[0])return null;const characterId=Number(players[0].id);
  const [rows]=await c.execute<RowDataPacket[]>('SELECT *,expires_at<=NOW() expired FROM automaton_portrait_uploads WHERE character_id=? AND scope_key=? FOR UPDATE',[characterId,scope]);
  const row=rows[0];if(!row)return null;
  if(row.expired){await c.execute('DELETE FROM automaton_portrait_uploads WHERE character_id=? AND scope_key=?',[characterId,scope]);return {expired:true as const};}
  if(row.status==='processing')return {busy:true as const};
  const id=Number(row.automaton_id);await automatonFor(c,characterId,id);
  await c.execute("UPDATE automaton_portrait_uploads SET status='processing' WHERE character_id=? AND scope_key=?",[characterId,scope]);
  return {characterId,scope,token:String(row.token),id};
});
export type PortraitUpload=Extract<NonNullable<Awaited<ReturnType<typeof reservePortraitUpload>>>,{token:string}>;
export const retryPortraitUpload=(upload:PortraitUpload)=>withTransaction(async c=>{
  await c.execute("UPDATE automaton_portrait_uploads SET status='pending' WHERE character_id=? AND scope_key=? AND token=? AND status='processing' AND expires_at>NOW()",[upload.characterId,upload.scope,upload.token]);
});
export const submitPortraitReview=(user:string,upload:PortraitUpload,portrait:{key:string;width:number;height:number})=>withTransaction(async c=>{
  const character=await automatonCharacter(c,user);
  const [rows]=await c.execute<RowDataPacket[]>("SELECT token FROM automaton_portrait_uploads WHERE character_id=? AND scope_key=? AND token=? AND status='processing' AND expires_at>NOW() FOR UPDATE",[character.id,upload.scope,upload.token]);
  if(character.id!==upload.characterId||!rows.length)throw new Error('上传已取消、超时或被新上传替代，本次图片未保存。');
  const {state}=await automatonFor(c,character.id,upload.id);
  await assertQueueAvailable(c,character.id,upload.id);
  await c.execute('INSERT INTO automaton_portrait_reviews(character_id,automaton_id,token,file_key,width,height) VALUES(?,?,?,?,?,?)',[character.id,upload.id,upload.token,portrait.key,portrait.width,portrait.height]);
  await c.execute('DELETE FROM automaton_portrait_uploads WHERE character_id=? AND scope_key=? AND token=?',[character.id,upload.scope,upload.token]);
  return {name:state.name};
});
export const portraitReviewStatus=async(user:string,id:number)=>{
  const [rows]=await (await getPool()).execute<RowDataPacket[]>('SELECT r.status,r.reason FROM automaton_portrait_reviews r JOIN player_automatons a ON a.id=r.automaton_id JOIN characters c ON c.id=r.character_id JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND a.id=? AND a.owner_id=c.id AND a.holder_id=c.id ORDER BY r.id DESC LIMIT 1',[user,id]);
  return rows[0]?{status:String(rows[0].status),reason:String(rows[0].reason)}:null;
};

export const cancelPortraitUpload=(user:string,scope:string,id:number,token:string)=>withTransaction(async c=>{
  const character=await automatonCharacter(c,user);
  await c.execute('DELETE FROM automaton_portrait_uploads WHERE character_id=? AND scope_key=? AND automaton_id=? AND token=?',[character.id,scope,id,token]);
});
export const resetPortrait=(user:string,id:number)=>withTransaction(async c=>{
  const character=await automatonCharacter(c,user),{state}=await automatonFor(c,character.id,id);
  await c.execute("UPDATE player_automatons SET state_json=JSON_REMOVE(state_json,'$.portrait') WHERE id=?",[id]);
  await c.execute('DELETE FROM automaton_portrait_uploads WHERE character_id=? AND automaton_id=?',[character.id,id]);
  const [pending]=await c.execute<RowDataPacket[]>("SELECT file_key FROM automaton_portrait_reviews WHERE character_id=? AND automaton_id=? AND status='pending' FOR UPDATE",[character.id,id]);
  await c.execute("UPDATE automaton_portrait_reviews SET status='cancelled',reason='玩家恢复默认形象',reviewed_at=NOW() WHERE character_id=? AND automaton_id=? AND status='pending'",[character.id,id]);
  if(state.portrait)await recordAutomatonEvent(c,id,character.id,'portrait-reset:'+randomBytes(16).toString('hex'),'portrait_reset',{name:state.name});
  return {name:state.name,oldKey:state.portrait?.key,pendingKeys:pending.map(r=>String(r.file_key))};
});
