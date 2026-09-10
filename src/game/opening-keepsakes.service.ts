import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { openingCharacter, grantOpeningItem } from './opening.service';
import { requireGuildService } from './guild-context';
import { keepsakeByCode } from './opening-keepsakes.config';
import { consumeInventory } from './inventory-binding';
import { openingHubs, type OpeningHubCode } from './opening-world.config';
import { grantOpeningExperience } from './opening-progress.service';
import { staminaMaxForRealm } from './constants';
import { divineFoodSeconds } from './divine-effects';

const parse=(v:unknown):Record<string,any>=>typeof v==='string'?JSON.parse(v):(v??{}) as Record<string,any>;
const readKeepsake=async(c:Pick<PoolConnection,'execute'>,id:number,code:string,lock=false)=>{
  const definition=keepsakeByCode(code);if(!definition)throw new Error('这份凭物没有对应的办理记录。');
  const [rows]=await c.execute<RowDataPacket[]>(`SELECT * FROM player_opening_keepsakes WHERE character_id=? AND code=?${lock?' FOR UPDATE':''}`,[id,code]);
  if(!rows[0])throw new Error('这份凭物不属于你的故事。');
  return{definition,row:rows[0],record:parse(rows[0].record_json)};
};
export const keepsakeView=async(user:string,code:string)=>{
  const c=await getPool(),character=await openingCharacter(c,user);
  const data=await readKeepsake(c,Number(character.id),code);
  return{...data,away:String(character.region_code)!==data.definition.home};
};
export const serveBasicOpeningMeal=async(c:PoolConnection,id:number)=>{
  const [foods]=await c.execute<RowDataPacket[]>('SELECT m.item_id,m.buff_json,m.duration_minutes,i.name FROM guild_restaurant_menu m JOIN item_definitions i ON i.id=m.item_id WHERE m.is_active=1 ORDER BY m.processing_fee,m.item_id LIMIT 1');
  const food=foods[0];if(!food)throw new Error('基础餐尚未备好，本次服务没有扣除。');
  const seconds=await divineFoodSeconds(c,id,Number(food.duration_minutes)*60);
  await c.execute('DELETE FROM player_food_buffs WHERE character_id=?',[id]);
  await c.execute('INSERT INTO player_food_buffs (character_id,item_id,buff_json,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL ? SECOND))',[id,food.item_id,JSON.stringify(parse(food.buff_json)),seconds]);
  await(await import('./character.service')).recalculateCharacterStats(c,id);
  return `已享用${food.name}，餐食效果持续 ${Math.ceil(seconds/60)} 分钟。`;
};
const consumeDisplay=async(c:PoolConnection,id:number,code:string)=>{
  const [items]=await c.execute<RowDataPacket[]>('SELECT i.id,COALESCE(p.quantity,0) AS quantity FROM item_definitions i LEFT JOIN player_inventory p ON p.item_id=i.id AND p.character_id=? WHERE i.code=? FOR UPDATE',[id,code]);
  if(Number(items[0]?.quantity)>0)await consumeInventory(c,id,Number(items[0].id),1);
};
export const keepsakeAction=async(user:string,code:string,action:string,value='')=>withTransaction(async c=>{
  const [operation,stamp]=action.split(':');action=operation;
  const expected=stamp===undefined?undefined:Number(stamp);
  if(expected!==undefined&&(!Number.isSafeInteger(expected)||expected<0))throw new Error('凭物页面已失效，请重新打开。');
  if(!['register','use','archive','restore'].includes(action))throw new Error('请选择凭物窗口提供的操作。');
  const character=await openingCharacter(c,user,true),id=Number(character.id);
  const {definition:d,row,record}=await readKeepsake(c,id,code,true);
  if(expected!==undefined&&expected!==Number(record.revision??0))return String(record.lastResult??record.result??'该操作已有记录，请查看当前凭物页面。');
  if(action==='use'&&expected===undefined)throw new Error('请从当前凭物页面点击使用，以免重复消耗次数。');
  const context=await requireGuildService(c,id);
  const saveResult=async(result:string)=>{
    record.revision=Number(record.revision??0)+1;record.lastResult=result;
    await c.execute('UPDATE player_opening_keepsakes SET record_json=? WHERE character_id=? AND code=?',[JSON.stringify(record),id,code]);return result;
  };
  const prefix=`【${d.desk}·${d.npc}】\n\n${context.code===d.home?'':'当地联络员核验你的凭据，接收经办窗口的回函。\n\n'}`;
  if(action==='archive'){
    if(row.archived)return '这份凭物已经收纳在安全档案中。';
    await consumeDisplay(c,id,code);await c.execute('UPDATE player_opening_keepsakes SET archived=1 WHERE character_id=? AND code=?',[id,code]);
    return saveResult('显示件已收纳，办理次数、原选择和后续资格均保留在个人档案。');
  }
  if(action==='restore'){
    if(record.originalDeposited)return '原件已经交存，请查看档案副本与收件回执；不能重新生成原件。';
    const [owned]=await c.execute<RowDataPacket[]>(`SELECT p.quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code=? AND p.quantity>0 UNION ALL SELECT s.quantity FROM player_home_storage_items s JOIN player_homes h ON h.id=s.home_id JOIN item_definitions i ON i.id=s.item_id WHERE h.character_id=? AND i.code=? AND s.quantity>0`,[id,code,id,code]);
    if(!Number(owned[0]?.quantity))await grantOpeningItem(c,id,code);
    await c.execute('UPDATE player_opening_keepsakes SET archived=0 WHERE character_id=? AND code=?',[id,code]);return saveResult('纪念显示件已归还，使用次数没有重置。');
  }
  if(action==='register'){
    if(record.registered)return prefix+(record.result??d.result)+'\n\n这份交接已有记录，无需重复领取。';
    let result=d.result;
    if(d.kind==='aqua'){
      const [world]=await c.execute<RowDataPacket[]>('SELECT aqua_character_id FROM opening_world WHERE id=1');
      if(Number(world[0]?.aqua_character_id)!==id)throw new Error('同行凭据与世界接引记录不符，请联系管理员核验。');
    }
    if(d.kind==='map'){
      const [points]=await c.execute<RowDataPacket[]>(`SELECT n.name,n.pos_x,n.pos_y,n.pos_z,r.name AS region FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE r.is_enabled=1 AND r.is_owner_only=0 AND (n.code IN (${Object.values(openingHubs).map(()=>'?').join(',')}) OR (r.danger_level<=10 AND (n.name LIKE '%渡%' OR n.name LIKE '%桥%'))) ORDER BY r.id,n.id LIMIT 16`,Object.values(openingHubs).map(h=>h.guild));
      record.points=points;result='【当前核验的安全接引点】\n'+points.map(p=>`${p.region}·${p.name}（${p.pos_x}，${p.pos_y}，${p.pos_z}）`).join('\n')+'\n未核验的断桥与航段保留为空白，不能作为通行许可。';
    }
    if(['R02-B','A02-B'].includes(d.branch)){
      await consumeDisplay(c,id,code);record.originalDeposited=true;
      await c.execute('UPDATE player_opening_keepsakes SET archived=1 WHERE character_id=? AND code=?',[id,code]);
    }
    if(code==='opening_aqua_letter'){
      await consumeDisplay(c,id,code);record.originalDeposited=true;
      await grantOpeningItem(c,id,'opening_aqua_receipt');
      await c.execute('INSERT IGNORE INTO player_opening_keepsakes (character_id,code,used,record_json) VALUES (?,?,1,?)',[id,'opening_aqua_receipt',JSON.stringify({...record,name:'地上女神的收件回执',registered:true,use:'查询送达与事故答复',result:'原件已送达女神办事桌；阿库娅外出时显示待本人阅读。',originalDeposited:false})]);
      await grantOpeningItem(c,id,'healing_herb',2);
      await c.execute('UPDATE player_opening_keepsakes SET archived=1 WHERE character_id=? AND code=?',[id,code]);
    }
    record.registered=true;record.result=result;record.qualification=d.branch;record.npc=d.npc;record.desk=d.desk;
    record.remaining=d.kind==='travel'?(['M01-B','R01-A'].includes(d.branch)?2:1):['repair','meal','rest'].includes(d.kind)?1:0;
    await c.execute('UPDATE player_opening_keepsakes SET used=?,record_json=? WHERE character_id=? AND code=?',[record.remaining===0?1:0,JSON.stringify(record),id,code]);
    await grantOpeningExperience(c,id,'lesson');
    return saveResult(prefix+d.dialogue+'\n\n【交接完成】\n'+result+'\n\n【未解之事】'+String(record.future??'记录已保留，后续开放时可继续查阅。'));
  }
  if(!record.registered)throw new Error('请先与经办人核验凭物。');
  if(row.used||Number(record.remaining??0)<=0)return prefix+'本次免费服务已经使用完毕，纪念物与后续资格仍保留。';
  let result='';
  if(d.kind==='repair'){
    const gearId=Number(value);if(!Number.isSafeInteger(gearId)||gearId<=0)throw new Error('请填写一件 Lv.1～5 普通装备的实例编号。');
    const [gears]=await c.execute<RowDataPacket[]>("SELECT ii.id,ii.durability,ii.durability_max,i.name,i.item_category FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.id=? AND ii.character_id=? AND i.rarity='普通' AND i.required_level BETWEEN 1 AND 5 FOR UPDATE",[gearId,id]);
    const gear=gears[0];if(!gear||(d.repairKind==='weapon'&&gear.item_category!=='武器'))throw new Error('请选择符合本次服务要求、属于自己的低级普通装备。');
    if(Number(gear.durability)>=Number(gear.durability_max))throw new Error('这件装备完好，无需消耗本次维修。');
    await c.execute('UPDATE player_item_instances SET durability=durability_max WHERE id=?',[gearId]);result=`${gear.name}已经修好。`;
  }else if(d.kind==='meal')result=await serveBasicOpeningMeal(c,id);
  else if(d.kind==='rest'){
    await c.execute('UPDATE characters SET current_hp=hp_max,current_mp=mp_max,stamina=?,stamina_updated_at=NOW() WHERE id=?',[staminaMaxForRealm(Number(character.realm_stage)),id]);result='你在安排好的普通床位休息，生命、魔力与体力已恢复。';
  }else if(d.kind==='travel'){
    const other=d.destination==='world_tree'?'sleepwhale_market':d.destination!;
    const destination=value|| (context.code==='world_tree'?other:'world_tree');
    if(![other,'world_tree'].includes(context.code)||![other,'world_tree'].includes(destination)||context.code===destination)throw new Error('这张凭据只能在注明的两处安全接引站之间使用。');
    if(d.branch==='T03-A'&&destination!=='world_tree'||d.branch==='T03-B'&&destination!=='sleepwhale_market')throw new Error('本张凭据只适用于注明的单程方向。');
    const hub=openingHubs[destination as OpeningHubCode];
    const [world]=await c.execute<RowDataPacket[]>('SELECT leaf_route_open FROM opening_world WHERE id=1');
    if(destination==='floating_leaf_town'&&!world[0]?.leaf_route_open)throw new Error('浮叶航路尚未开放，次数已为你保留。');
    const [points]=await c.execute<RowDataPacket[]>('SELECT r.id,n.pos_x,n.pos_y,n.pos_z FROM map_regions r JOIN map_npcs n ON n.region_id=r.id WHERE r.code=? AND n.code=? AND r.is_enabled=1 AND r.is_owner_only=0',[destination,hub.guild]);
    if(!points[0])throw new Error('目的地暂时停航，本次不扣次数。');
    const p=points[0];await c.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?',[p.id,p.pos_x,p.pos_y,p.pos_z,id]);
    await c.execute('DELETE FROM player_opening_visits WHERE character_id=?',[id]);await grantOpeningItem(c,id,`map_${destination}`);
    result=`值守核对凭据后安排了受保护的行程。你已抵达${hub.name}公会入口。`;
  }else throw new Error('这份凭物的内容可直接查阅，没有可重复兑换的服务。');
  record.remaining=Number(record.remaining)-1;record.lastService=result;
  await c.execute('UPDATE player_opening_keepsakes SET used=?,record_json=? WHERE character_id=? AND code=?',[record.remaining<=0?1:0,JSON.stringify(record),id,code]);
  return saveResult(prefix+result+`\n\n本凭物剩余服务：${record.remaining} 次。后续资格仍有效。`);
});
