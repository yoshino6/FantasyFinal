import { randomUUID } from 'node:crypto';
import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
import {recordAchievement} from './achievement-events';
/** 跟随已支付业务事务保存跨次判定；账号锁、事件回执和状态写入不可分离。 */
export const updateAchievementState=async(c:PoolConnection,characterId:number,metric:string,event:string,life:boolean,apply:(state:any)=>void)=>{
 const [actors]=await c.execute<RowDataPacket[]>('SELECT c.id,p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.id=? AND c.npc_code IS NULL',[characterId]);
 if(!actors[0])return;
 const identity=String(actors[0].qq_user_id),lifeKey=life?String(characterId):'';
 await c.execute('INSERT IGNORE INTO achievement_profiles(identity_key) VALUES (?)',[identity]);
 await c.execute('SELECT identity_key FROM achievement_profiles WHERE identity_key=? FOR UPDATE',[identity]);
 const [receipt]=await c.execute<any>('INSERT IGNORE INTO achievement_events(identity_key,event_key) VALUES (?,?)',[identity,'state:'+metric+':'+lifeKey+':'+event]);if(!receipt.affectedRows)return;
 const [rows]=await c.execute<RowDataPacket[]>('SELECT value_json FROM achievement_progress WHERE identity_key=? AND life_key=? AND metric=? FOR UPDATE',[identity,lifeKey,metric]);
 const state=typeof rows[0]?.value_json==='string'?JSON.parse(rows[0].value_json):rows[0]?.value_json??{};
 apply(state);
 await c.execute('INSERT INTO achievement_progress(identity_key,life_key,metric,value_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)',[identity,lifeKey,metric,JSON.stringify(state)]);
};
export const achievementAlchemyRecovery=async(c:PoolConnection,id:number,token:string,signature:string,successes:number,failures:number)=>updateAchievementState(c,id,'alchemy_recovery',token,true,state=>{
 const failed:string[]=state.failed??=[];
 if(successes>0){if(failed.includes(signature))recordAchievement(c,id,['ACH_H20'],'alchemy-recovery:'+token);state.failed=failed.filter(s=>s!==signature);}
 else if(failures>0&&!failed.includes(signature))failed.push(signature);
});
export const achievementPeerProgress=async(c:PoolConnection,id:number,peerIdentity:string,kind:'friend'|'oath',event:string)=>updateAchievementState(c,id,'social_'+kind,event,false,state=>{
 const peers:Record<string,string[]>=state.peers??={};const seen=peers[peerIdentity]??=[];
 const token=kind==='friend'?new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}):event;
 if(!seen.includes(token))seen.push(token);
 if(seen.length>=(kind==='friend'?5:10))recordAchievement(c,id,[{metric:kind==='friend'?'ACH_G15':'ACH_G19',value:seen.length,maximum:true}],'social-progress:'+kind+':'+event);
});
export const achievementAutomatonFeeds=async(c:PoolConnection,id:number,pet:number,event:string,codes:string[])=>updateAchievementState(c,id,'automaton_feeds',event,false,state=>{
 const pets:Record<string,string[]>=state.pets??={};const seen=pets[String(pet)]??=[];
 for(const code of codes)if(!seen.includes(code))seen.push(code);
 if(seen.length>=5)recordAchievement(c,id,[{metric:'ACH_J07',value:seen.length,maximum:true}],'pet-five:'+event);
 recordAchievement(c,id,codes.map(code=>({metric:'ACH_J08',distinct:code})),'pet-feed:'+event);
});
export const achievementSocialPair=async(c:PoolConnection,left:number,right:number,kind:'friend'|'oath',event:string)=>{
 const [actors]=await c.query<RowDataPacket[]>('SELECT c.id,p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.id IN (?) AND c.npc_code IS NULL ORDER BY p.qq_user_id',[[left,right]]);
 if(actors.length!==2||actors[0].qq_user_id===actors[1].qq_user_id)return;
 for(const actor of actors)await achievementPeerProgress(c,Number(actor.id),String(actors.find(a=>a.id!==actor.id)!.qq_user_id),kind,event);
};
export const achievementBattlePeers=async(c:PoolConnection,event:string,ids:number[])=>{
 if(ids.length<2)return;
 const [actors]=await c.query<RowDataPacket[]>('SELECT c.id,p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.id IN (?) AND c.npc_code IS NULL ORDER BY p.qq_user_id',[ids]);
 for(const actor of actors)await updateAchievementState(c,Number(actor.id),'battle_peers',event,false,state=>{
  const peers:Record<string,number>=state.peers??={};
  for(const other of actors){const identity=String(other.qq_user_id);if(identity===String(actor.qq_user_id))continue;peers[identity]=Number(peers[identity]??0)+1;}
  const highest=Math.max(0,...Object.values(peers));if(highest>=10)recordAchievement(c,Number(actor.id),[{metric:'ACH_G05',value:highest,maximum:true}],'battle-peers:'+event);
 });
};
export const achievementBookSource=async(c:PoolConnection,id:number,skill:number,book:number)=>updateAchievementState(c,id,'book_sources','read:'+skill+':'+book,true,state=>{(state.sources??={})[String(skill)]=String(book);});
export const achievementBookLearned=async(c:PoolConnection,id:number,skill:number)=>updateAchievementState(c,id,'book_sources','learn:'+skill+':'+randomUUID(),true,state=>{
 const book=state.sources?.[String(skill)];if(book){(state.learned??={})[String(skill)]=String(book);recordAchievement(c,id,[{metric:'ACH_J18',distinct:String(book)}],'learn-book:'+id+':'+skill);}
});
export const achievementBookSkillUsed=async(c:PoolConnection,id:number,skill:number,event:string)=>updateAchievementState(c,id,'book_sources','use:'+event,true,state=>{
 if(state.learned?.[String(skill)])recordAchievement(c,id,['ACH_J17'],'book-skill-use:'+event);
});
/** 锻造完成时先固化制作者与唯一武器实例的关系；仅当前生涯可用于后续实际战斗验证。 */
export const achievementCraftedWeapon=async(c:PoolConnection,id:number,instance:number)=>updateAchievementState(c,id,'crafted_weapon_instances','craft:'+instance,true,state=>{
 const instances:string[]=state.instances??=[];const key=String(instance);if(!instances.includes(key))instances.push(key);
});
/** 只在正式 PVE 胜利中，由已登记实例的普通攻击造成实际扣血时结算。 */
export const achievementCraftedWeaponUsed=async(c:PoolConnection,id:number,instance:number,event:string)=>updateAchievementState(c,id,'crafted_weapon_instances','use:'+event+':'+instance,true,state=>{
 if((state.instances??[]).includes(String(instance)))recordAchievement(c,id,['ACH_I21'],'crafted-weapon-use:'+event+':'+instance);
});
export const achievementInstanceVictory=async(c:PoolConnection,id:number,instance:number,event:string,metric:'ACH_J11'|'ACH_I15'|'ACH_G23')=>updateAchievementState(c,id,'instance_'+metric,instance+':'+event,false,state=>{
 const counts:Record<string,number>=state.counts??={};const count=counts[String(instance)]=Number(counts[String(instance)]??0)+1;
 recordAchievement(c,id,[{metric,value:count,maximum:true}],'instance-victory:'+metric+':'+instance+':'+event);
});
