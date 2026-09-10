import type { RowDataPacket, PoolConnection } from 'mysql2/promise';
import type { OpeningConnection } from './opening-state';

export const hasDivine=async(connection:OpeningConnection,id:number,code:string)=>{
  const[rows]=await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_blessings WHERE character_id=? AND code=? LIMIT 1',[id,code]);return rows.length>0;
};
export const divineUses=async(connection:OpeningConnection,id:number,code:string)=>{
  const[rows]=await connection.execute<RowDataPacket[]>('SELECT used FROM player_divine_daily WHERE character_id=? AND code=? AND day_key=CURRENT_DATE()',[id,code]);return Number(rows[0]?.used??0);
};
/** The caller holds the owner character lock; daily effects share the same transaction as the action. */
export const spendDivineUse=async(connection:PoolConnection,id:number,code:string,limit=1,amount=1)=>{
  if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('神技次数无效。');
  await connection.execute('INSERT IGNORE INTO player_divine_daily (character_id,code,day_key,used) VALUES (?,?,CURRENT_DATE(),0)',[id,code]);
  const[result]=await connection.execute<any>('UPDATE player_divine_daily SET used=used+? WHERE character_id=? AND code=? AND day_key=CURRENT_DATE() AND used+?<=?',[amount,id,code,amount,limit]);return Boolean(result.affectedRows);
};
export const divineFoodSeconds=async(connection:OpeningConnection,id:number,seconds:number)=>Math.max(0,Math.floor(seconds*(await hasDivine(connection,id,'divine_g06')?1.5:1)));
export type GuildPriceItem={item_type:string;item_category:string;buy_price:number;trade_price:number;rarity?:string};
export const openingShopQuote=async(connection:OpeningConnection,id:number,item:GuildPriceItem,quantity:number)=>{
  const base=Number(item.buy_price)*quantity;
  const eligible=item.item_type==='consumable'&&['药剂','食物'].includes(item.item_category)&&(!item.rarity||item.rarity==='普通')&&Number(item.trade_price)<Math.ceil(Number(item.buy_price)*.92);
  if(!eligible)return{base,price:base,credit:0,discount:0};
  const[credits]=await connection.execute<RowDataPacket[]>("SELECT uses FROM player_opening_services WHERE character_id=? AND code='supplies'",[id]);
  const credit=Math.min(base,Number(credits[0]?.uses??0));if(credit)return{base,price:base-credit,credit,discount:0};
  const discount=await hasDivine(connection,id,'divine_g10')?Math.max(0,Math.min(200-await divineUses(connection,id,'g10_discount'),base-Math.ceil(base*.92))):0;
  return{base,price:base-discount,credit:0,discount};
};
export const payOpeningShopDiscount=async(connection:PoolConnection,id:number,quote:{credit:number;discount:number})=>{
  if(quote.credit){const[result]=await connection.execute<any>("UPDATE player_opening_services SET uses=uses-? WHERE character_id=? AND code='supplies' AND uses>=?",[quote.credit,id,quote.credit]);if(!result.affectedRows)throw new Error('补给额度已变化，请重新查看价格。');}
  if(quote.discount&&!await spendDivineUse(connection,id,'g10_discount',200,quote.discount))throw new Error('今日折扣额度已变化，请重新查看价格。');
};
