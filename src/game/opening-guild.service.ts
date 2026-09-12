import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { openingCharacter, grantOpeningItem } from './opening.service';
import { openingWorldFor, assertOpeningFree } from './opening-state';
import { openingHubs, type OpeningHubCode } from './opening-world.config';
import { guildContextFor, requireGuildService } from './guild-context';
import { guildLessons, rootGuildPeople, rootGuildScenes } from './opening-guild.config';
import { consumeInventory } from './inventory-binding';
import { staminaMaxForRealm } from './constants';
import { repairClaimedOpeningPack, grantOpeningProfessionWeapon } from './opening-pack.service';
import { guildMapCatalog } from './guild-map.service';

const parse=(v:unknown):Record<string,any>=>typeof v==='string'?JSON.parse(v):(v??{}) as Record<string,any>;
export const grantOpeningService=async(c:PoolConnection,id:number,code:string,uses:number)=>{
  if(uses<=0)return;await c.execute('INSERT INTO player_opening_services (character_id,code,uses) VALUES (?,?,?) ON DUPLICATE KEY UPDATE uses=uses+VALUES(uses)',[id,code,uses]);
};
const useService=async(c:PoolConnection,id:number,code:string)=>{
  const[result]=await c.execute<any>('UPDATE player_opening_services SET uses=uses-1 WHERE character_id=? AND code=? AND uses>0',[id,code]);
  if(!result.affectedRows)throw new Error('这项免费服务已经使用完了。');
};
export const openingGuildView=async(user:string)=>{
  const pool=await getPool();const character=await openingCharacter(pool,user);
  let destination=String(character.region_code) as OpeningHubCode;
  if(!openingHubs[destination]){const[story]=await pool.execute<RowDataPacket[]>('SELECT destination_code FROM player_opening_stories WHERE character_id=?',[character.id]);destination=(story[0]?.destination_code??'world_tree') as OpeningHubCode;}
  const hub=openingHubs[destination];
  const[places]=await pool.execute<RowDataPacket[]>('SELECT n.pos_x,n.pos_y,n.pos_z,n.region_id FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE n.code=? AND r.code=? AND r.is_enabled=1',[hub.guild,destination]);
  const place=places[0];if(!place)throw new Error('这处分会暂未开放，请查看当前地图的其他安全接引点。');
  const at=Number(character.current_region_id)===Number(place.region_id)&&Number(character.pos_x)===Number(place.pos_x)&&Number(character.pos_y)===Number(place.pos_y)&&Number(character.pos_z)===Number(place.pos_z);
  const[visits]=await pool.execute<RowDataPacket[]>('SELECT * FROM player_opening_visits WHERE character_id=? AND building_code=?',[character.id,hub.guild]);
  const[services]=await pool.execute<RowDataPacket[]>('SELECT code,uses FROM player_opening_services WHERE character_id=? AND uses>0',[character.id]);
  const world=await openingWorldFor(pool);
  const maps=await guildMapCatalog(pool,destination);
  return{hub,code:destination,at,inside:at&&(visits.length>0||destination==='baina_town'&&character.npc_code===hub.guild),place,services,maps,registered:Boolean(character.adventurer_registered),world};
};
export const enterOpeningGuild=async(user:string,inside=true)=>withTransaction(async c=>{
  const character=await openingCharacter(c,user,true);await assertOpeningFree(c,Number(character.id));const context=await guildContextFor(c,Number(character.id));
  if(!inside){await c.execute('DELETE FROM player_opening_visits WHERE character_id=?',[character.id]);return;}
  if(character.activity_status!=='active')throw new Error('请先恢复行动状态。');
  await c.execute("INSERT INTO player_opening_visits (character_id,building_code) VALUES (?,?) ON DUPLICATE KEY UPDATE building_code=VALUES(building_code),area='大厅'",[character.id,context.hub.guild]);
  await requireGuildService(c,Number(character.id));
  await repairClaimedOpeningPack(c,Number(character.id));
  if(character.profession_code)await grantOpeningProfessionWeapon(c,Number(character.id),String(character.profession_code));
});
export const openingGuildAction=async(user:string,action:string,value='')=>withTransaction(async c=>{
  const character=await openingCharacter(c,user,true);const id=Number(character.id);const context=await requireGuildService(c,id);
  await repairClaimedOpeningPack(c,id);
  if(action==='pack')return '接引员核对了你当时选择的路线，缺少的礼包物品和服务额度已经补齐；此前领过的部分不会重复发放。';
  if(action==='profession_weapon'){
    const weapon=await grantOpeningProfessionWeapon(c,id,String(character.profession_code??''));
    return weapon?`工匠递来${weapon.name}（装备编号 ${weapon.id}）：“先熟悉它的重心。别急着追求花哨的招式。”\n\n武器已收入背包，可从装备页面穿戴。`:'你已领过适配武器，或尚未完成初行登记与职业选择。';
  }
  if(action==='map_exchange'){
    const item=(await guildMapCatalog(c,context.code)).find(map=>map.code===value&&map.canExchange);
    if(!item)throw new Error('只能兑换当前公会周边已开放的低危地图或邻近安全城镇地图。');
    const[owned]=await c.execute<RowDataPacket[]>(`SELECT 1 FROM player_inventory WHERE character_id=? AND item_id=? AND quantity>0 UNION ALL SELECT 1 FROM player_home_storage_items s JOIN player_homes h ON h.id=s.home_id WHERE h.character_id=? AND s.item_id=? AND s.quantity>0`,[id,item.id,id,item.id]);
    if(owned.length)throw new Error('你已经持有这张地图，兑换额度没有消耗。');
    await useService(c,id,'map_exchange');await grantOpeningItem(c,id,String(item.code));return `鉴物员按你的勘路笔记核准了${item.name}，将回程的路口又描深了一遍。\n\n已兑换地图 ×1。`;
  }
  if(action==='craft_practice'){
    await useService(c,id,'craft_practice');
    const[items]=await c.execute<RowDataPacket[]>("SELECT i.id FROM item_definitions i JOIN player_inventory p ON p.item_id=i.id WHERE p.character_id=? AND i.code='opening_craft_coupon' AND p.quantity>0",[id]);
    if(items[0])await consumeInventory(c,id,Number(items[0].id),1);
    await grantOpeningItem(c,id,'opening_practice_stool');
    return guildLessons.find(l=>l.code==='craft')!.text+'\n\n凭单已核销。你完成了一次免费练习，获得个人绑定的【第一张小木凳】×1。';
  }
  if(action==='recover'){
    await useService(c,id,'arrival_recovery');await c.execute("UPDATE characters SET current_hp=hp_max,current_mp=mp_max,stamina=?,stamina_updated_at=NOW(),activity_status='active' WHERE id=?",[staminaMaxForRealm(Number(character.realm_stage)),id]);return '你在接引室安静休息，生命、魔力与体力都已恢复。';
  }
  if(action==='meal'){
    await useService(c,id,'meal');
    const[foods]=await c.execute<RowDataPacket[]>(`SELECT m.item_id,m.buff_json,m.duration_minutes,i.name FROM guild_restaurant_menu m JOIN item_definitions i ON i.id=m.item_id WHERE m.is_active=1 ORDER BY m.processing_fee,m.item_id LIMIT 1`);
    if(!foods[0])throw new Error('今天的基础餐尚未备好，餐票没有扣除。');
    const[divine]=await c.execute<RowDataPacket[]>("SELECT 1 FROM player_blessings WHERE character_id=? AND code='talent_production_03'",[id]);
    await c.execute('DELETE FROM player_food_buffs WHERE character_id=?',[id]);await c.execute('INSERT INTO player_food_buffs (character_id,item_id,buff_json,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL ? SECOND))',[id,foods[0].item_id,JSON.stringify(parse(foods[0].buff_json)),Math.floor(Number(foods[0].duration_minutes)*60*(divine.length?1.5:1))]);
    await(await import('./character.service')).recalculateCharacterStats(c,id);return `${context.code==='world_tree'?'朵菈将热腾腾的餐盘往你面前推了推。':context.hub.host+'替你递来餐票，厨师很快端上热食。'}\n\n已享用${foods[0].name}，沿用同类餐食覆盖规则。`;
  }
  if(action==='repair'){
    const gearId=Number(value);if(!Number.isSafeInteger(gearId)||gearId<=0)throw new Error('请填写需要修理的普通装备编号。');
    const[items]=await c.execute<RowDataPacket[]>("SELECT ii.id,ii.durability,ii.durability_max,i.name FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.id=? AND ii.character_id=? AND i.rarity='普通' AND i.required_level<=5 AND i.item_type='equipment' FOR UPDATE",[gearId,id]);
    if(!items[0]||Number(items[0].durability)>=Number(items[0].durability_max))throw new Error('请选择自己持有且需要修理的普通装备。');
    await useService(c,id,'repair');await c.execute('UPDATE player_item_instances SET durability=durability_max WHERE id=?',[gearId]);return `${items[0].name}已经修好，工匠又检查了一遍容易松动的地方。`;
  }
  if(action==='heal_companion'){
    const[companions]=await c.execute<RowDataPacket[]>('SELECT id FROM player_companions WHERE character_id=? AND released_at IS NULL AND (injured=1 OR stability<100) FOR UPDATE',[id]);if(!companions.length)throw new Error('名册中的伙伴都很安稳，暂时不需要疗养。');
    await useService(c,id,'companion_care');await c.execute('UPDATE player_companions SET injured=0,stability=100 WHERE character_id=? AND released_at IS NULL',[id]);return '契兽员检查了伙伴的伤处，耐心等它放松下来。名册中随从的伤势与安定度已恢复。';
  }
  if(action==='lesson'){
    const lesson=guildLessons.find(l=>l.code===value);if(!lesson)throw new Error('请选择柜台提供的入门练习。');
    const[result]=await c.execute<any>("INSERT IGNORE INTO player_opening_services (character_id,code,uses) VALUES (?,?,0)",[id,`lesson_${value}`]);if(!result.affectedRows)return `${lesson.text}\n\n这次是复习，初次练习的用品已经领取过。`;
    await grantOpeningItem(c,id,lesson.reward,lesson.quantity);return `${lesson.text}\n\n已领取本次练习用品。`;
  }
  if(action==='chat'){
    const person=rootGuildPeople.find(p=>p.code===value);if(context.code!=='world_tree'||!person)throw new Error('这位接待员不在当前分会。');
    const[seen]=await c.execute<RowDataPacket[]>('SELECT 1 FROM player_opening_relations WHERE character_id=? AND npc_code=?',[id,value]);
    await c.execute("INSERT IGNORE INTO player_opening_relations (character_id,npc_code,flags_json) VALUES (?,?,'{}')",[id,value]);return `${rootGuildScenes[person.code]}\n“${seen.length?person.again:person.first}”`;
  }
  if(action==='coupon'){
    if(!['opening_medical_coupon','opening_trade_coupon'].includes(value))throw new Error('这张凭单不能在此兑换。');
    const[items]=await c.execute<RowDataPacket[]>('SELECT id FROM item_definitions WHERE code=?',[value]);await consumeInventory(c,id,Number(items[0]?.id),1);
    await grantOpeningService(c,id,value==='opening_medical_coupon'?'arrival_recovery':'supplies',value==='opening_medical_coupon'?1:150);return value==='opening_medical_coupon'?'急救券已登记，可以进行一次免费恢复。':'补给券已登记，购买公会普通补给时可累计抵扣150铜币。';
  }
  throw new Error('请选择当前分会提供的服务。');
});
export const openingKeepsakes=async(user:string)=>{
  const pool=await getPool();const character=await openingCharacter(pool,user);
  const[rows]=await pool.execute<RowDataPacket[]>('SELECT code,used,archived,record_json FROM player_opening_keepsakes WHERE character_id=? ORDER BY code',[character.id]);
  const[events]=await pool.execute<RowDataPacket[]>('SELECT text,created_at FROM opening_world_events ORDER BY created_at DESC LIMIT 8');
  return{items:rows.map(r=>{const item=parse(r.record_json);return{name:String(item.name),use:String(item.use),future:String(item.future),code:String(r.code),used:Boolean(r.used),archived:Boolean(r.archived),recordOnly:Boolean(item.recordOnly),route:String(item.route??'')};}),events};
};
export const openingTransport=async(user:string,destination:string)=>withTransaction(async c=>{
  const character=await openingCharacter(c,user,true);const context=await requireGuildService(c,Number(character.id));const target=openingHubs[destination as OpeningHubCode];
  const special=['floating_leaf_town','frost_dragon_inn'];
  if(!target||!(special.includes(context.code)&&destination==='world_tree'||context.code==='world_tree'&&special.includes(destination)))throw new Error('这条接驳线路不由当前柜台办理。');
  const world=await openingWorldFor(c);if(destination==='floating_leaf_town'&&!world.leaf_route_open)throw new Error('云上的公共航路尚未完成首次航务登记。');
  const[places]=await c.execute<RowDataPacket[]>('SELECT r.id,n.pos_x,n.pos_y,n.pos_z FROM map_regions r JOIN map_npcs n ON n.region_id=r.id WHERE r.code=? AND n.code=? AND r.is_enabled=1 AND r.is_owner_only=0',[destination,target.guild]);
  if(!places[0])throw new Error('目的地暂时停航，请留在当前安全城镇。');
  const point=places[0];await c.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?',[point.id,point.pos_x,point.pos_y,point.pos_z,character.id]);await c.execute('DELETE FROM player_opening_visits WHERE character_id=?',[character.id]);
  return `公会工作人员打开有护栏的接驳舱，确认行李安放妥当后启动线路。途中无需穿过野怪领地。\n\n舱门再次打开时，${target.name}的公会入口已经在眼前。`;
});
