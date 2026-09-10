import { createHash } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { recordAchievement, type AchievementFact } from './achievement-events';

export const recordPvpAchievements=async(c:PoolConnection,battleId:string,winnerId:number)=>{
  const [battles]=await c.execute<RowDataPacket[]>('SELECT * FROM player_pvp_battle_sessions WHERE id=?',[battleId]);
  const b=battles[0];if(!b||!['attacker_win','defender_win'].includes(b.state))return;
  const [actors]=await c.execute<RowDataPacket[]>('SELECT c.*,p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.id IN (?,?) AND c.npc_code IS NULL',[b.attacker_character_id,b.defender_character_id]);
  if(actors.length!==2||actors[0].qq_user_id===actors[1].qq_user_id)return;
  const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v??{};
  const evidence=(actor:RowDataPacket)=>parse(Number(actor.id)===Number(b.attacker_character_id)?b.attacker_cooldowns:b.defender_cooldowns).__rules?.memory?.achievement;
  // 短袭、未结束、逃跑、挂机挨打不算完整交锋。双方都须造成真实伤害。
  if(actors.some(a=>!(Number(evidence(a)?.damage)>0)))return;
  const day=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
  const pair=createHash('sha256').update(actors.map(a=>String(a.qq_user_id)).sort().join('\0')).digest('hex');
  for(const actor of actors){
    const opponent=actors.find(a=>a.id!==actor.id)!;
    if(Number(opponent.level)<Math.ceil(Number(actor.level)*.8))continue;
    const facts:AchievementFact[]=[{metric:'ACH_P01'},...['ACH_P16','ACH_P17','ACH_P18'].map(metric=>({metric,distinct:day}))];
    if(Number(actor.id)===winnerId){
      facts.push(...['ACH_P02','ACH_P03','ACH_P04','ACH_P05','ACH_P06'].map(metric=>({metric})));
      facts.push(...['ACH_P07','ACH_P08','ACH_P09'].map(metric=>({metric,distinct:String(opponent.qq_user_id)})));
      facts.push(...(Number(actor.id)===Number(b.attacker_character_id)?['ACH_P13','ACH_P14','ACH_P15']:['ACH_P10','ACH_P11','ACH_P12']).map(metric=>({metric})));
      if(Number(actor.level)===Number(opponent.level))facts.push({metric:'ACH_P20'});
      if(Number(opponent.level)>=Number(actor.level)+2)facts.push({metric:'ACH_P22'});
      const hp=Number(Number(actor.id)===Number(b.attacker_character_id)?b.attacker_hp:b.defender_hp);
      if(hp>0&&hp<=Number(actor.hp_max)*.1)facts.push({metric:'ACH_P23'});
      if(Number(b.turn_no)>10)facts.push({metric:'ACH_P24'});
      facts.push({metric:'ACH_P25',distinct:String(actor.current_region_id)});
    }
    // 同一双方身份每天只认首场，注销或换角色不能反复刷同一对手。
    recordAchievement(c,Number(actor.id),facts,`pvp:${pair}:${day}`);
  }
};
