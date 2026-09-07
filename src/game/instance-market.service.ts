import type { RowDataPacket, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { marketCharacterFor, marketWeeklySales, marketFeeForSale } from './market.service';
import { createCraftRequest, craftRequestFor, completeCraftRequest, craftJson } from './alchemy-journal.service';
import type { AutomatonState } from './automaton';
import { recordAutomatonFirstEvent } from './automaton.service';

const integer=(value:number)=>{if(!Number.isSafeInteger(value)||value<1||value>99999999)throw new Error('编号或单价须为 1～99999999 的整数。');return value;};
const release=async(c:PoolConnection,row:RowDataPacket,status:string)=>{
  const table=row.kind==='automaton'?'player_automatons':'player_item_instances';
  await c.execute(`UPDATE ${table} SET market_listing_id=NULL WHERE id=? AND market_listing_id=?`,[row.resource_id,row.id]);
  await c.execute('UPDATE market_instance_listings SET status=?,active_instance_id=NULL,active_automaton_id=NULL,settled_at=NOW() WHERE id=?',[status,row.id]);
};
const expire=async(c:PoolConnection)=>{const [rows]=await c.execute<RowDataPacket[]>("SELECT * FROM market_instance_listings WHERE status='open' AND expires_at<=NOW() FOR UPDATE");for(const row of rows)await release(c,row,'expired');};
export const instanceMarketList=(user:string,page=1,category='全部',keyword='')=>withTransaction(async c=>{
  const categories:Record<string,string>={全部:'全部',装备:'装备',equipment:'装备',异械:'异械',device:'异械',机巧:'机巧',automaton:'机巧',instance:'装备与异械'};
  if(!Object.hasOwn(categories,category))throw new Error('不存在该寄售分类。');category=categories[category];
  const character=await marketCharacterFor(c,user,true);await expire(c);page=Math.max(1,Math.floor(page)||1);keyword=keyword.trim().slice(0,80);
  // 老异械也可能使用 equipment 类型，以异械分类兼容；订单仍保留原实例类型。
  const itemFilter=category==='装备'?"i.item_type='equipment' AND i.item_category<>'异械'":category==='异械'?"(i.item_type='device' OR i.item_category='异械')":'1=1';
  const listingFilter=category==='全部'?'1=1':category==='机巧'?"l.kind='automaton'":`l.kind='instance' AND ${itemFilter}`;
  const [rows]=await c.execute<RowDataPacket[]>(`SELECT l.id,l.seller_id,l.kind,l.name,l.price,l.snapshot_json,l.expires_at FROM market_instance_listings l LEFT JOIN player_item_instances ii ON l.kind='instance' AND ii.id=l.resource_id LEFT JOIN item_definitions i ON i.id=ii.item_id WHERE l.status='open' AND (${listingFilter}) AND LOCATE(?,l.name)>0 ORDER BY l.id DESC`,[keyword]);
  const [instances]=category==='机巧'?[[]]:await c.execute<RowDataPacket[]>(`SELECT ii.id,i.name,i.item_type,i.item_category,ii.quality,ii.durability FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND ii.bound_kind='none' AND ii.market_listing_id IS NULL AND i.is_tradeable=1 AND i.rarity<>'神器' AND i.item_type IN ('equipment','device') AND (${itemFilter}) AND NOT EXISTS(SELECT 1 FROM player_equipment e WHERE e.instance_id=ii.id) AND NOT EXISTS(SELECT 1 FROM player_active_devices d WHERE d.instance_id=ii.id) AND NOT EXISTS(SELECT 1 FROM player_home_storage_instances hs WHERE hs.instance_id=ii.id)`,[character.id]);
  const [pets]=category==='全部'||category==='机巧'?await c.execute<RowDataPacket[]>("SELECT id,state_json FROM player_automatons WHERE holder_id=? AND owner_id IS NULL AND bound_kind='none' AND market_listing_id IS NULL",[character.id]):[[]];
  const pages=Math.max(1,Math.ceil(rows.length/5));page=Math.min(page,pages);
  return {page,pages,category:category==='装备与异械'?'instance':category,keyword,characterId:Number(character.id),items:rows.slice((page-1)*5,page*5).map(r=>({id:Number(r.id),seller_id:Number(r.seller_id),kind:String(r.kind),name:String(r.name),price:Number(r.price),snapshot:craftJson<Record<string,unknown>>(r.snapshot_json)})),instances,pets:pets.map(p=>({id:Number(p.id),name:craftJson<AutomatonState>(p.state_json).name}))};
});
type MarketRequest={action:'list'|'buy'|'cancel';kind:string;id:number;price:number};
const resource=async(c:PoolConnection,ownerId:number,kind:string,id:number)=>{
  if(kind==='automaton'){
    const [rows]=await c.execute<RowDataPacket[]>("SELECT * FROM player_automatons WHERE id=? AND holder_id=? AND owner_id IS NULL AND bound_kind='none' AND market_listing_id IS NULL AND combat_id IS NULL FOR UPDATE",[id,ownerId]);if(!rows[0])throw new Error('仅未认主、未绑定、未寄售的人偶可上架。');
    const p=craftJson<AutomatonState>(rows[0].state_json);return{name:p.name,snapshot:{name:p.name,level:p.level,personality:p.personality,stats:p.stats,skills:p.learned,creatorId:Number(rows[0].creator_id)}};
  }
  if(kind!=='instance')throw new Error('请选择装备异械或未认主人偶。');
  const [rows]=await c.execute<RowDataPacket[]>(`SELECT ii.*,i.name,i.item_category,i.required_level,i.description,i.rarity,i.is_tradeable,i.effect_json AS definition_effect FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.id=? AND ii.character_id=? AND ii.bound_kind='none' AND ii.market_listing_id IS NULL FOR UPDATE`,[id,ownerId]);const row=rows[0];if(!row||!row.is_tradeable||row.rarity==='神器')throw new Error('该实例不可寄售。');
  const [active]=await c.execute<RowDataPacket[]>('SELECT instance_id FROM player_equipment WHERE instance_id=? UNION SELECT instance_id FROM player_active_devices WHERE instance_id=? UNION SELECT instance_id FROM player_home_storage_instances WHERE instance_id=?',[id,id,id]);if(active.length)throw new Error('使用中或仓储中的装备与异械不可寄售。');
  return{name:String(row.name),snapshot:{...row,effect_json:row.effect_json??row.definition_effect}};
};
export const previewInstanceMarket=(user:string,action:MarketRequest['action'],kind:string,id:number,price=1)=>withTransaction(async c=>{
  const character=await marketCharacterFor(c,user,true);await expire(c);integer(id);integer(price);
  let summary:string;
  if(action==='list'){const r=await resource(c,Number(character.id),kind,id);summary=`寄售 ${r.name} #${id}，单价 ${price} 铜币，有效期72小时。成交收取分段手续费；买家收货后绑定。`;}
  else{const [rows]=await c.execute<RowDataPacket[]>("SELECT * FROM market_instance_listings WHERE id=? AND status='open' FOR UPDATE",[id]);const row=rows[0];if(!row)throw new Error('订单已结束。');if(action==='cancel'&&Number(row.seller_id)!==Number(character.id))throw new Error('只能撤销自己的订单。');price=Number(row.price);kind=row.kind;summary=`${action==='buy'?'购买':'撤回'} ${row.name}，${price} 铜币。${action==='buy'?'成交后绑定，不能转卖。':'两分钟内撤单按既有市场规则收费。'}`;}
  const token=await createCraftRequest(c,Number(character.id),'instance_market',{action,kind,id,price} satisfies MarketRequest);return{token,summary};
});
export const confirmInstanceMarket=(user:string,token:string)=>withTransaction(async c=>{
  const character=await marketCharacterFor(c,user,true),characterId=Number(character.id);const request=await craftRequestFor<MarketRequest>(c,characterId,'instance_market',token);if(request.result)return request.result as {text:string};await expire(c);
  const {action,kind,id,price}=request.snapshot;let text:string;
  if(action==='list'){
    const r=await resource(c,characterId,kind,id);const week=await marketWeeklySales(c,characterId);const [held]=await c.execute<RowDataPacket[]>(`SELECT (SELECT COUNT(*) FROM market_orders WHERE character_id=? AND status IN ('open','partial'))+(SELECT COUNT(*) FROM market_instance_listings WHERE seller_id=? AND status='open') total,
      (SELECT COALESCE(SUM(unit_price*quantity_remaining),0) FROM market_orders WHERE character_id=? AND side='sell' AND status IN ('open','partial'))+(SELECT COALESCE(SUM(price),0) FROM market_instance_listings WHERE seller_id=? AND status='open') reserved`,[characterId,characterId,characterId,characterId]);
    const cap=Date.now()-new Date(character.created_at).getTime()<14*86400000?20000:300000;if(Number(held[0]?.total)>=60)throw new Error('进行中的市场订单最多60笔。');if(week.gross+Number(held[0]?.reserved)+price>cap)throw new Error('已成交与在售占用合计超过本周寄售额度。');
    const [daily]=await c.execute<RowDataPacket[]>('SELECT COUNT(*) total FROM market_instance_listings WHERE seller_id=? AND kind=? AND resource_id=? AND created_at>=CURDATE()',[characterId,kind,id]);if(Number(daily[0]?.total)>=20)throw new Error('该实例今日发布次数已达20次。');
    const [insert]=await c.execute<ResultSetHeader>('INSERT INTO market_instance_listings(seller_id,kind,resource_id,active_instance_id,active_automaton_id,name,price,snapshot_json,expires_at) VALUES (?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 72 HOUR))',[characterId,kind,id,kind==='instance'?id:null,kind==='automaton'?id:null,r.name,price,JSON.stringify(r.snapshot)]);
    await c.execute(`UPDATE ${kind==='automaton'?'player_automatons':'player_item_instances'} SET market_listing_id=? WHERE id=?`,[insert.insertId,id]);text=`已寄售 ${r.name}，订单 #${insert.insertId}。`;
  }else{
    const [rows]=await c.execute<RowDataPacket[]>("SELECT * FROM market_instance_listings WHERE id=? AND status='open' FOR UPDATE",[id]);const row=rows[0];if(!row||Number(row.price)!==price)throw new Error('订单已变化或已成交。');const sellerId=Number(row.seller_id),week=await marketWeeklySales(c,sellerId);
    if(action==='cancel'){
      if(sellerId!==characterId)throw new Error('只能撤回自己的寄售。');const fee=Date.now()-new Date(row.created_at).getTime()<120000?Math.max(1,Math.ceil(price*(week.cancellations>=5?.02:.005))):0;
      const [paid]=await c.execute<ResultSetHeader>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?',[fee,characterId,fee]);if(!paid.affectedRows)throw new Error('铜币不足以支付撤单手续费。');await release(c,row,'cancelled');await c.execute('UPDATE market_weekly_volume SET cancellation_count=cancellation_count+1 WHERE character_id=? AND week_key=?',[characterId,week.key]);text=`已撤回 ${row.name}，手续费 ${fee} 铜币，原实例与绑定状态保留。`;
    }else{
      if(sellerId===characterId)throw new Error('不能购买自己的寄售。');
      const [sellers]=await c.execute<RowDataPacket[]>('SELECT created_at FROM characters WHERE id=? FOR UPDATE',[sellerId]);const cap=Date.now()-new Date(sellers[0]!.created_at).getTime()<14*86400000?20000:300000;if(week.gross+price>cap)throw new Error('卖家本周交易额度已满。');
      const [paid]=await c.execute<ResultSetHeader>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?',[price,characterId,price]);if(!paid.affectedRows)throw new Error('铜币不足。');
      const fee=marketFeeForSale(week.gross,price);await c.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?',[price-fee,sellerId]);
      const table=row.kind==='automaton'?'player_automatons':'player_item_instances',ownerColumn=row.kind==='automaton'?'holder_id':'character_id';const [transferred]=await c.execute<ResultSetHeader>(`UPDATE ${table} SET ${ownerColumn}=?,bound_kind='trade',market_listing_id=NULL WHERE id=? AND market_listing_id=? AND ${ownerColumn}=? AND bound_kind='none'`,[characterId,row.resource_id,id,sellerId]);if(transferred.affectedRows!==1)throw new Error('托管实例状态不一致，未成交。');
      if(row.kind==='automaton')await recordAutomatonFirstEvent(c,Number(row.resource_id),characterId,'first_met',{name:String(row.name),source:'在交易行初识'});
      await release(c,row,'filled');await c.execute('UPDATE market_instance_listings SET buyer_id=?,fee=? WHERE id=?',[characterId,fee,id]);await c.execute('UPDATE market_weekly_volume SET gross_sales=gross_sales+?,fee_paid=fee_paid+? WHERE character_id=? AND week_key=?',[price,fee,sellerId,week.key]);text=`已购得 ${row.name}，支付 ${price} 铜币，物品已绑定。`;
    }
  }
  const result={text};await completeCraftRequest(c,characterId,token,result);return result;
});
