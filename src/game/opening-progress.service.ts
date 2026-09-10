import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { experienceRequiredForLevel } from './constants';
import { openingCharacter } from './opening.service';
import { openingRouteByCode } from './opening-content';
import { getPool, withTransaction } from '../database/pool';
import { requireGuildService } from './guild-context';
import { openingReplay, saveOpeningReplay } from './opening-replay';

export const openingExperienceShares=()=>{
  const total=experienceRequiredForLevel(1)+experienceRequiredForLevel(2);
  const arrival=Math.floor(total*.4),register=Math.floor(total*.2);
  return{arrival,register,lesson:total-arrival-register};
};
export const grantOpeningExperience=async(c:PoolConnection,id:number,stage:keyof ReturnType<typeof openingExperienceShares>)=>{
  const [marked]=await c.execute<any>('INSERT IGNORE INTO player_opening_services (character_id,code,uses) VALUES (?,?,0)',[id,`xp_${stage}`]);
  if(!marked.affectedRows)return 0;
  const [rows]=await c.execute<RowDataPacket[]>('SELECT id,level,experience,realm_stage FROM characters WHERE id=? FOR UPDATE',[id]);
  const row=rows[0];
  const result=await(await import('./adventure.service')).awardRealmExperience(c,{id,level:Number(row.level),experience:Number(row.experience),realm_stage:Number(row.realm_stage)},openingExperienceShares()[stage],{fixed:true});
  await(await import('./character.service')).recalculateCharacterStats(c,id);
  return result.experience;
};

export const openingFollowupQuest=async(user:string)=>{
  const pool=await getPool();const character=await openingCharacter(pool,user);
  const [stories]=await pool.execute<RowDataPacket[]>("SELECT * FROM player_opening_stories WHERE character_id=? AND state='completed'",[character.id]);
  if(!stories[0])return null;
  const story=stories[0],route=openingRouteByCode(String(story.route_code),Number(story.story_version))!;
  const choice=route.choices.find(b=>b.code===story.branch_code)!;
  const [keepsakes]=await pool.execute<RowDataPacket[]>('SELECT code,record_json FROM player_opening_keepsakes WHERE character_id=?',[character.id]);
  const pending=keepsakes.find(r=>!(typeof r.record_json==='string'?JSON.parse(r.record_json):r.record_json)?.registered);
  const [world]=await pool.execute<RowDataPacket[]>('SELECT aqua_stage,aqua_character_id FROM opening_world WHERE id=1');
  const aquaPending=Number(world[0]?.aqua_character_id)===Number(character.id)&&Number(world[0]?.aqua_stage)<3;
  if(pending||aquaPending||!character.profession_code||Number(character.level)<5){
    const guild=await(await import('./opening-guild.service')).openingGuildView(user);
    if(!guild.at||!guild.inside)return{title:`【主线·${choice.quest}】`,description:`你已完成安全护送。接下来先进入${guild.hub.name}的公会，再与接待员办理交接与职业登记。`,action:{label:guild.at?'[进入公会]':'[前往当地公会]',command:guild.at?'/初行入会':'/初行公会'}};
  }
  if(pending)return{title:`【主线·${choice.quest}】`,description:`${choice.task}\n\n带着这次相遇留下的凭物，到安全公会的对应联络窗口完成交接。`,action:{label:'[办理剧情凭物]',command:`/初行凭物 ${pending.code}`}};
  if(aquaPending)return{title:'【主线·女神也要在地上生活】',description:'同行凭据已登记，陪阿库娅完成她在世界树的第一份工作。',action:{label:'[女神办事桌]',command:'/女神'}};
  if(!character.profession_code)return{title:'【主线·选择今后的手艺】',description:`${choice.quest}已经留下完整记录。先在当地公会选择主职业，领取适合自己的普通武器，再安排下一段旅途。`,action:{label:'[当地公会]',command:'/初行公会'}};
  if(Number(character.level)<5)return{title:`【主线·${choice.quest}之后】`,description:'公会为你安排了安全区内的低级委托。检查目标、完成实际操作，再回来结算。无需回到出生的高危野外。',action:{label:'[查看初行委托]',command:'/初行委托'}};
  return null;
};

export const newcomerJobs=[
  {title:'药架上的两个标签',npc:'补给员',intro:'两只药箱挨在一起，一只装外用草药，一只装回魔药。补给员把标签递来：“先分清，再摆稳。别凭瓶子的颜色猜。”',first:'核对药物标签',second:'垫稳药箱并复查',middle:'你按药物名称分好标签。现在把易碎瓶底垫稳，急用药放到容易取出的上层。',done:'补给员逐瓶复核后，在交接表上签了名。你知道下一次需要哪一瓶时，不必慌忙翻遍整个架子。'},
  {title:'会晃的候车长凳',npc:'工匠',intro:'候车处的长凳一坐就晃。工匠没有递来钉锤，先放了一把直尺：“找出哪里不平，再决定修哪里。”',first:'检查支脚与榫口',second:'装好垫片并试坐',middle:'你找到松动的榫口，把安全垫片推进标线内。现在扶稳凳面，按顺序检查承重。',done:'长凳稳稳承住了工匠的重量。候车的老人道了谢，你将剩下的工具一件件归位。'},
  {title:'回程牌不能指错路',npc:'值守',intro:'接引口换了新的路牌。值守让你拿地图逐项比对：“牌子上的方向，得对得起照着它走的人。”',first:'对照当前位置与公会入口',second:'挂好安全方向牌',middle:'你核对了入口与回程接驳位置，把通向未开放野外的旧箭头遮住。再检查一次，确认没有指反。',done:'值守沿牌走了一遍，回来把验收章盖在图角。“这次你替别人认清了回来的路。”'}
] as const;
export const openingJob=async(user:string,revision?:number)=>withTransaction(async c=>{
  if(revision!==undefined&&(!Number.isSafeInteger(revision)||revision<0))throw new Error('委托页码无效。');
  const character=await openingCharacter(c,user,true);const id=Number(character.id);
  type JobView={title:string;text:string;revision:number;action:string|undefined};
  if(revision!==undefined){const replay=await openingReplay<JobView>(c,id,'job',revision);if(replay)return replay.result;}
  await requireGuildService(c,id);
  const [stories]=await c.execute<RowDataPacket[]>("SELECT route_code FROM player_opening_stories WHERE character_id=? AND state='completed'",[id]);
  if(!stories[0])throw new Error('这份初行委托安排给已完成安全交接的新旅人。');
  if(!character.profession_code)throw new Error('先在公会选择主职业，再领取初行委托。');
  await c.execute("INSERT IGNORE INTO player_opening_services (character_id,code,uses) VALUES (?,'job_progress',0)",[id]);
  const [rows]=await c.execute<RowDataPacket[]>("SELECT uses FROM player_opening_services WHERE character_id=? AND code='job_progress' FOR UPDATE",[id]);
  let step=Number(rows[0].uses),settled=false;
  const job=newcomerJobs[(Math.floor(step/2)+String(stories[0].route_code).charCodeAt(0))%newcomerJobs.length];
  const startingStep=step;
  if(revision===step&&Number(character.level)<5){
    if(step%2===1){
      const remaining=experienceRequiredForLevel(Number(character.level))-Number(character.experience);
      await(await import('./adventure.service')).awardRealmExperience(c,{id,level:Number(character.level),experience:Number(character.experience),realm_stage:Number(character.realm_stage)},Math.max(1,remaining),{fixed:true});
      await c.execute('UPDATE characters SET copper_coins=copper_coins+40 WHERE id=?',[id]);
      await(await import('./character.service')).recalculateCharacterStats(c,id);settled=true;
    }
    await c.execute("UPDATE player_opening_services SET uses=uses+1 WHERE character_id=? AND code='job_progress'",[id]);step++;
  }
  const [current]=await c.execute<RowDataPacket[]>('SELECT level FROM characters WHERE id=?',[id]);
  const result:JobView=settled?{title:job.title,text:`${job.done}\n\n【结算】经验已到账，铜币 ×40。${Number(current[0].level)>=5?'你已经可以继续常规旅途，初行委托圆满结束。':'可继续查看下一份初行委托。'}`,revision:step,action:undefined}
    :Number(current[0].level)>=5?{title:'初行委托已完成',text:'你的等级已达到 Lv.5。公会将继续提供正常委托与旅途指引，这份入门补助已经结清。',revision:step,action:undefined}
    :{title:`${job.npc}·${job.title}`,text:step%2===0?job.intro:job.middle,revision:step,action:step%2===0?job.first:job.second};
  if(step!==startingStep)await saveOpeningReplay(c,id,'job',startingStep,'next',result);
  return result;
});
