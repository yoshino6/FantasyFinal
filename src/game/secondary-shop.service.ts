import { grantInventory } from './inventory-binding';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { requireNpcAtCurrentPosition } from './adventure.service';
import { craftCharacterId } from './alchemy-journal.service';
import { alchemyOutputDefinitions } from './alchemy-catalog';
import { activeDeviceCodes, constructionRecipes } from './deconstructor-catalog';
import { secondaryFinishedPrice } from './secondary-shop-pricing';

export const secondaryShopNames = { blacksmith:'铁匠铺',alchemy_sweetshop:'糖水屋',oddworkshop:'异工坊' };
export type SecondaryShop = keyof typeof secondaryShopNames;
export const secondaryShopBasicLevel = { blacksmith:3,alchemy_sweetshop:3,oddworkshop:3 };
export const secondaryShopCategories = {
  blacksmith:['全部','武器','防具','维修包','长剑','法杖','法书','法球','匕首','拳刃','盾牌','头肩','上装','腰部','下装','脚部'],
  alchemy_sweetshop:['全部','回复','增益','净化','投掷物','符咒','秘药'],
  oddworkshop:['全部','主动异械','被动异械']
};
const alchemyCodes = new Set(alchemyOutputDefinitions.filter(item=>item.code.startsWith('alchemy_base_')&&!/_q[12]$/.test(item.code)).map(item=>item.code));
const noviceAlchemyCodes = new Set(['glimmer_potion','novice_hp_potion_small','novice_mp_potion_small']);
const deviceCodes = new Set(constructionRecipes.filter(item=>item.outputType!=='material'&&item.recommendedSecondaryLevel<=secondaryShopBasicLevel.oddworkshop).map(item=>item.code));
type ShopItem = {code:string;item_type:string;item_category:string;required_level?:number;rarity?:string;weapon_type?:string|null;effect_json?:unknown};
export const isSecondaryFinishedProduct = (shop:string,item:ShopItem) => shop==='alchemy_sweetshop'?item.item_type==='consumable'&&(alchemyCodes.has(item.code)||noviceAlchemyCodes.has(item.code)||item.code==='alchemy_skill_reset_elixir'&&secondaryShopBasicLevel.alchemy_sweetshop>=3):shop==='oddworkshop'?['device','consumable'].includes(item.item_type)&&deviceCodes.has(item.code):shop==='blacksmith'?(item.code==='forge_repair_kit' || item.item_type==='equipment'&&item.code.startsWith('shop_')&&Number(item.required_level??Infinity)<=secondaryShopBasicLevel.blacksmith*5&&item.rarity==='普通'&&item.item_category!=='异械'):false;
export const matchesSecondaryShopCategory = (item:ShopItem,category:string) => {
  const effect:Record<string,any>=typeof item.effect_json==='string'?JSON.parse(item.effect_json):item.effect_json??{};
  if(category==='全部')return true;
  if(category==='维修包')return item.code==='forge_repair_kit';
  if(category==='武器')return ['武器','副手'].includes(item.item_category);
  if(category==='防具')return ['头肩','上装','腰部','下装','脚部'].includes(item.item_category);
  if(category==='主动异械')return item.item_category==='异械'&&activeDeviceCodes.has(item.code);
  if(category==='被动异械')return item.item_category==='异械'&&!activeDeviceCodes.has(item.code);
  if(category==='回复')return item.item_category==='药剂'&&!!(effect.heal||effect.restoreMp||effect.healPct||effect.restoreMpPct||['regeneration','mana_regeneration'].includes(effect.status?.code));
  if(category==='净化')return !!effect.cleanse;
  if(category==='增益')return item.item_category==='药剂'&&effect.target!=='enemy'&&!!effect.status&&!['regeneration','mana_regeneration'].includes(effect.status.code);
  return item.item_category===category||item.weapon_type===category;
};
const priceFor = (shop:SecondaryShop,item:RowDataPacket) => secondaryFinishedPrice(shop,item as any,secondaryShopBasicLevel[shop]);
const checkShop = (shop:string):SecondaryShop => { if(!Object.hasOwn(secondaryShopNames,shop)) throw new Error('未知成品商店。'); return shop as SecondaryShop; };
export const secondaryFinishedCatalog = async (user:string,shopName:string,page=1,keyword='',category='全部') => {
  const shop=checkShop(shopName); await requireNpcAtCurrentPosition(user,shop); const pool=await getPool();
  const [all] = await pool.execute<RowDataPacket[]>("SELECT i.*,bs.buy_price AS retail_price,COALESCE(IF(s.stock_day<CURDATE(),30,s.quantity),30) AS stock FROM item_definitions i LEFT JOIN blacksmith_shop_items bs ON bs.item_id=i.id LEFT JOIN secondary_finished_stock s ON s.item_id=i.id AND s.shop_code=? WHERE i.item_type IN ('equipment','device','consumable') ORDER BY i.required_level,i.id",[shop]);
  category=secondaryShopCategories[shop].includes(category)?category:'全部';
  keyword=keyword.trim().slice(0,80); const items=all.filter(item=>isSecondaryFinishedProduct(shop,item as any)&&matchesSecondaryShopCategory(item as any,category)&&(!keyword||`${item.name} ${item.item_category} ${item.weapon_type??''}`.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())));
  const pages=Math.max(1,Math.ceil(items.length/5)); page=Math.min(pages,Math.max(1,Math.floor(page)||1));
  return { shop,name:secondaryShopNames[shop],basicLevel:secondaryShopBasicLevel[shop],categories:secondaryShopCategories[shop],category,page,pages,keyword,items:items.slice((page-1)*5,page*5).map(item=>({id:Number(item.id),name:String(item.name),category:String(item.item_category),description:String(item.description),codex:String(item.codex_id),price:priceFor(shop,item),stock:Number(item.stock)})) };
};
export const discoverSecondaryFinished = async(user:string,shopName:string,codex:string) => {
  const shop=checkShop(shopName);await requireNpcAtCurrentPosition(user,shop);
  return withTransaction(async connection=>{
    const id=await craftCharacterId(connection,user,true);
    const[rows]=await connection.execute<RowDataPacket[]>('SELECT * FROM item_definitions WHERE codex_id=?',[codex]);
    const item=rows[0];if(!item||!isSecondaryFinishedProduct(shop,item as any))throw new Error('该物品不在此店的基础成品货架中。');
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)',[id,item.id]);
    return String(item.codex_id);
  });
};
export const buySecondaryFinished = async (user:string,shopName:string,itemId:number,quantity=1) => {
  const shop=checkShop(shopName); if(!Number.isInteger(quantity)||quantity<1||quantity>99) throw new Error('购买数量需为1～99。');
  await requireNpcAtCurrentPosition(user,shop);
  return withTransaction(async connection=>buyFinishedFor(connection,user,shop,itemId,quantity));
};
const buyFinishedFor = async (connection:PoolConnection,user:string,shop:SecondaryShop,itemId:number,quantity:number) => {
  const id=await craftCharacterId(connection,user,true); await requireNpcAtCurrentPosition(user,shop);
  const [items]=await connection.execute<RowDataPacket[]>('SELECT i.*,bs.buy_price AS retail_price FROM item_definitions i LEFT JOIN blacksmith_shop_items bs ON bs.item_id=i.id WHERE i.id=? FOR UPDATE',[itemId]); const item=items[0];
  if(!item||!isSecondaryFinishedProduct(shop,item as any)) throw new Error('该物品不在此店的成品货架中。');
  await connection.execute('INSERT IGNORE INTO secondary_finished_stock (shop_code,item_id,quantity,stock_day) VALUES (?,?,30,CURDATE())',[shop,itemId]);
  await connection.execute('UPDATE secondary_finished_stock SET quantity=30,stock_day=CURDATE() WHERE shop_code=? AND item_id=? AND stock_day<CURDATE()',[shop,itemId]);
  const [stock]=await connection.execute<RowDataPacket[]>('SELECT quantity FROM secondary_finished_stock WHERE shop_code=? AND item_id=? FOR UPDATE',[shop,itemId]);
  if(Number(stock[0]?.quantity??0)<quantity) throw new Error('成品库存不足，请减少数量或次日再来。');
  const price=priceFor(shop,item)*quantity;
  const [paid]=await connection.execute<any>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?',[price,id,price]);
  if(!paid.affectedRows) throw new Error(`铜币不足，需要 ${price} 铜币。`);
  await connection.execute('UPDATE secondary_finished_stock SET quantity=quantity-? WHERE shop_code=? AND item_id=?',[quantity,shop,itemId]);
  if(item.item_type==='device'||item.item_type==='equipment') for(let count=0;count<quantity;count++) await connection.execute("INSERT INTO player_item_instances (character_id,item_id,bound_kind,bound_at,bound_reason) VALUES (?,?,'trade',NOW(),'npc_purchase')",[id,itemId]);
  else await grantInventory(connection,id,itemId,{personal:0,trade:quantity,unbound:0});
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)',[id,itemId]);
  return { name:String(item.name),quantity,price };
};
