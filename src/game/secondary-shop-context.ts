import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { secondaryProfessionBonus, secondaryProfessionProficiencyRequired } from './secondary-profession';

export const shopProfessions={blacksmith:'blacksmith',alchemy_sweetshop:'alchemist',oddworkshop:'deconstructor',bookshop:'omniscient'} as const;
export type ServiceShop=keyof typeof shopProfessions;
export type ShopContext={shop:ServiceShop;characterId:number;user:string;personalProfession:string|null};
const storage=new AsyncLocalStorage<ShopContext>();
export const currentSecondaryShop=()=>storage.getStore();
export const withSecondaryShop=<T>(context:ShopContext,work:()=>T):T=>storage.run(context,work);
export const shopProficiency=(amount:number)=>currentSecondaryShop()?0:amount;
export const shopProgressFor=async(connection:Pick<Pool|PoolConnection,'execute'>,characterId:number,profession:string)=>{
  const context=currentSecondaryShop();if(!context)return null;
  if(context.characterId!==characterId||shopProfessions[context.shop]!==profession)throw new Error('店铺服务与本次操作不匹配。');
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN map_npcs n ON n.region_id=c.current_region_id AND n.pos_x=c.pos_x AND n.pos_y=c.pos_y AND n.pos_z=c.pos_z WHERE c.id=? AND n.code=? LIMIT 1',[characterId,context.shop]);
  if(!rows.length)throw new Error('你已经离开店铺，无法继续使用副职业服务。');
  return {level:3,proficiency:0,required:secondaryProfessionProficiencyRequired(3),bonus:secondaryProfessionBonus(3)};
};
