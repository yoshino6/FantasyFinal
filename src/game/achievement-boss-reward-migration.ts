import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { bossAchievementReward, excludedBossAchievementCode } from './achievement-boss';
import { achievementAttributeKeys } from './achievement-rules';

/** 调整已得奖励，不重做成就结算，不改名次、首发名单或道具库存。调用者负责事务。 */
export const migrateBossAchievementRewards=async(c:PoolConnection)=>{
  const [rows]=await c.query<RowDataPacket[]>(`SELECT a.identity_key,a.achievement_id,d.boss_code,d.difficulty
    FROM achievement_completions a JOIN achievement_boss_definitions d ON d.id=a.achievement_id ORDER BY a.identity_key,a.achievement_id`);
  const dirty=new Set<string>();
  for(const row of rows){
    if(excludedBossAchievementCode(String(row.boss_code)))continue;
    await c.execute('SELECT identity_key FROM achievement_profiles WHERE identity_key=? FOR UPDATE',[row.identity_key]);
    const [current]=await c.execute<RowDataPacket[]>('SELECT reward_attribute,reward_points,rarity FROM achievement_completions WHERE identity_key=? AND achievement_id=? FOR UPDATE',[row.identity_key,row.achievement_id]);
    if(!current.length)continue;
    const desired=bossAchievementReward(String(row.boss_code),String(row.difficulty));const [label,amount]=desired.attribute.split('+');const attribute=achievementAttributeKeys[label],points=Number(amount);
    const old=current[0];if(old.reward_attribute===attribute&&Number(old.reward_points)===points&&old.rarity===desired.rarity)continue;
    await c.execute("INSERT IGNORE INTO achievement_progress(identity_key,life_key,metric,value_json) VALUES (?,'',?,?)",[row.identity_key,`boss_reward:${row.achievement_id}:${attribute}:${points}:${desired.rarity}`,JSON.stringify({before:old,after:{reward_attribute:attribute,reward_points:points,rarity:desired.rarity}})]);
    await c.execute('UPDATE achievement_completions SET reward_attribute=?,reward_points=?,rarity=? WHERE identity_key=? AND achievement_id=?',[attribute,points,desired.rarity,row.identity_key,row.achievement_id]);
    dirty.add(String(row.identity_key));
  }
  const characters:number[]=[];
  for(const identity of dirty){const [actors]=await c.execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND c.npc_code IS NULL',[identity]);characters.push(...actors.map(a=>Number(a.id)));}
  return [...new Set(characters)].sort((a,b)=>a-b);
};
export const initializeBossAchievementRewards=async(pool:Pool)=>{
  for(let attempt=0;attempt<3;attempt++){
    const c=await pool.getConnection();
    try{
      await c.beginTransaction();const dirty=await migrateBossAchievementRewards(c);
      if(dirty.length){const {recalculateCharacterStats}=await import('./character.service');for(const id of dirty)await recalculateCharacterStats(c,id);}
      await c.commit();return;
    }catch(error:any){await c.rollback();if(error?.code!=='ER_LOCK_DEADLOCK'||attempt===2)throw error;}
    finally{c.release();}
  }
};
