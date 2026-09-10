import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
import type {LamplightState} from './lamplight.types';
import {ownedTalent} from './talent-data';
import {experienceRequiredForLevel} from './constants';
export const lamplightLibraryRooms=[
  ['大厅','总目录把“界路维护”归在生命与居所的交叉索引。你找到一张磨损的卡片，卡上提醒：被删去的路，不一定无人居住。'],
  ['阅览室','旧笔记将界路连接与灵魂承载分开记录。相同笔迹留下资料室的索引号，并指出维护记录必须与居民见闻相互核验。'],
  ['资料室','你在第七列封存盒找到引荐函。落款提及噶，函中还有旧界路的编号规则，不能只凭后来抄录的地图认定一处地方不存在。'],
  ['休息室','守馆人记得那位爱喝苦茶的研究者。你询问她离开的方向，核对旧留言，然后带着已查明的索引前往无尽回廊。'],
  ['无尽回廊','引荐函上的火漆与门边的笔画对应。你沿原编号找到研究室，门里传来杯盏轻响。噶先请你把证据放到桌上，没有直接替你下结论。']
] as const;
export const lamplightLibraryAction=async(c:PoolConnection,character:RowDataPacket,state:LamplightState,flags:Record<string,any>,action:string)=>{
  if(state.phase!=='join'||state.node_index!==3||Number(character.level)<20)throw Error('先接到联合调查的图书馆任务，再来核验馆藏。');
  const [progress]=await c.execute<RowDataPacket[]>("SELECT stage FROM player_main_quest_progress WHERE character_id=? AND quest_code='evolution_barrier'",[character.id]);
  const old=Number(progress[0]?.stage??0);
  const index=Math.max(Number(flags.libraryRoom??0),Math.min(4,Math.max(0,old-1)));
  if(index>=5)throw Error('五处调查已经完成，请回到主线提交记录。');
  const [places]=await c.execute<RowDataPacket[]>("SELECT n.region_id,n.pos_x,n.pos_y,n.pos_z FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE n.code='world_library' AND r.is_enabled=1 AND r.is_owner_only=0");
  const p=places[0];if(!p)throw Error('世界图书馆暂未开放，研究进度保留。');
  const [room,text]=lamplightLibraryRooms[index];
  if(action==='library_go'){
    await(await import('./lamplight.service')).assertLamplightBoarding(c,Number(character.current_region_id));
    await c.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?',[p.region_id,p.pos_x,p.pos_y,p.pos_z,character.id]);
    await c.execute('DELETE FROM player_opening_visits WHERE character_id=?',[character.id]);
    Object.assign(character,{current_region_id:p.region_id,pos_x:p.pos_x,pos_y:p.pos_y,pos_z:p.pos_z});
    flags.libraryAt=room;flags.message=`你通过已核验的安全接驳抵达世界图书馆，沿导览进入${room}。下一步请调查这间房的线索。`;
    return;
  }
  if(Number(character.current_region_id)!==Number(p.region_id)||Number(character.pos_x)!==Number(p.pos_x)||Number(character.pos_y)!==Number(p.pos_y)||Number(character.pos_z)!==Number(p.pos_z)||flags.libraryAt!==room)throw Error(`请先前往世界图书馆·${room}。`);
  flags.libraryRoom=index+1;delete flags.libraryAt;flags.message=text;
  // Share observations only with an actually eligible ordinary breakthrough; never grant a seed or injection here.
  const talent=await ownedTalent(c,Number(character.id));
  if(talent?.group!=='？？？'&&Number(character.level)===20&&Number(character.realm_stage)===2&&Number(character.experience)>=experienceRequiredForLevel(20)){
    const next=Math.min(5,index+2);
    await c.execute("INSERT INTO player_main_quest_progress (character_id,quest_code,stage) VALUES (?,'evolution_barrier',?) ON DUPLICATE KEY UPDATE stage=GREATEST(stage,VALUES(stage))",[character.id,next]);
  }
};
