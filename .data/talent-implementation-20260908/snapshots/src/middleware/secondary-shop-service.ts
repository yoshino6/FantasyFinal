import { Format, useEvent, useRoute, useMessage } from 'alemonjs';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { shopProfessions, withSecondaryShop, type ServiceShop } from '../game/secondary-shop-context';

export const shopServiceMiddleware=(fixedShop?:ServiceShop)=>async(_event:unknown,next:()=>Promise<void>)=>{
  const [event]=useEvent(),[route]=useRoute();const user=event.current.UserId;
  const shop=fixedShop??String(route.param('shop')) as ServiceShop;
  let context;
  try{
    if(!Object.hasOwn(shopProfessions,shop))throw new Error('请选择有效的副职业商店。');
    if(shop==='alchemy_sweetshop'&&route.param('action'))throw new Error('店铺炼金固定为 3 级；点灵与育成需要个人炼金达到 4 级并完成教学。');
    await requireNpcAtCurrentPosition(user,shop);
    const [rows]=await (await getPool()).execute<RowDataPacket[]>('SELECT c.id,c.secondary_profession_code FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1',[user]);
    if(!rows[0])throw new Error('请先注册角色。');
    context={shop,characterId:Number(rows[0].id),user,personalProfession:rows[0].secondary_profession_code as string|null};
  }catch(error){const [message]=useMessage();await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addTitle('店铺服务').addText(error instanceof Error?error.message:'暂时无法使用店铺服务。'))});return;}
  await withSecondaryShop(context,next);
};
