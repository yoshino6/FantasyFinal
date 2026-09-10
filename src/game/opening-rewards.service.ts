import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { OpeningChoice, OpeningRoute } from './opening.types';
import { grantOpeningItem } from './opening.service';
import { crimsonArmor, dawnWeapons } from './opening-chest.config';

/** Called inside the locked opening transition. Fixed awards never emit production/drop/quest events. */
export const grantOpeningRouteReward = async(c:PoolConnection,id:number,route:OpeningRoute,choice:OpeningChoice) => {
  let kind=choice.rewardKind;
  if(!kind)throw new Error('这条路线的奖励配置尚未齐全。');
  if(kind==='照料'){
    const [companions]=await c.execute<RowDataPacket[]>('SELECT id FROM player_companions WHERE character_id=? LIMIT 1',[id]);
    if(!companions.length)kind='药袋';
  }
  let copper=choice.rewardCopper??(kind==='工料'?100:['药袋','餐食','照料'].includes(kind)?150:180);
  const items:[string,number][] = kind==='工料'?[['home_wood',3],['home_stone',3],['home_metal',3]]
    :kind==='药袋'?[['healing_herb',3],['novice_mp_potion_small',2]]
    :kind==='照料'?[['opening_companion_feed',3]]:[];
  if(kind==='餐食'){
    const [meals]=await c.execute<RowDataPacket[]>("SELECT i.id FROM item_definitions i JOIN guild_restaurant_menu m ON m.item_id=i.id WHERE i.code='mushroom_cream_soup'");
    if(meals.length)items.push(['mushroom_cream_soup',1]);else copper=180;
  }
  if(choice.bonusItem)items.push([choice.bonusItem,1]);
  for(const item of choice.rewardItems??[])items.push([item.code,item.quantity]);
  await c.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?',[copper,id]);
  const names=[`${copper} 铜币`];
  for(const [code,quantity] of items){
    await grantOpeningItem(c,id,code,quantity);
    const [rows]=await c.execute<RowDataPacket[]>('SELECT name FROM item_definitions WHERE code=?',[code]);
    names.push(`${rows[0].name} ×${quantity}`);
  }
  if(choice.rewardEquipment){
    const code=choice.rewardEquipment==='random_weapon'
      ?`opening_rare_${dawnWeapons[Math.floor(Math.random()*dawnWeapons.length)]![0]}`
      :choice.rewardEquipment==='random_armor'
        ?`opening_rare_${crimsonArmor[Math.floor(Math.random()*crimsonArmor.length)]![0]}`
        :choice.rewardEquipment;
    const equipment=await(await import('./opening-chest.service')).grantOpeningEquipment(c,id,code);
    names.push(`${equipment.name} ×1`);
  }
  const record={name:route.title,use:choice.rewardUse,future:choice.future,registered:true,recordOnly:true,
    route:route.code,branch:choice.code,storyVersion:route.version,source:'opening_fixed',reward:names.join('、')};
  await c.execute('INSERT INTO player_opening_keepsakes (character_id,code,used,archived,record_json) VALUES (?,?,0,1,?)',[id,choice.rewardCode,JSON.stringify(record)]);
  await c.execute('INSERT INTO player_opening_relations (character_id,npc_code,affection,hatred,flags_json) VALUES (?,?,0,0,?)',[id,`opening_${route.code.toLowerCase()}`,JSON.stringify(record)]);
  const explanation=choice.rewardKind==='照料'&&kind==='药袋'?'（暂无随从，照料补给改为随行药袋）':choice.rewardKind==='手艺'?'（本次手艺酬谢按路费结清）':'';
  return names.join('、')+explanation;
};
