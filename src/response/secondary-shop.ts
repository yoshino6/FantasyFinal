import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { secondaryFinishedCatalog,buySecondaryFinished } from '../game/secondary-shop.service';
import { messageFormat } from '../game/message';

export const secondaryShopFormat=async (user:string,shop:string,page=1,keyword='',category='全部')=>{
  const data=await secondaryFinishedCatalog(user,shop,page,keyword,category);
  const md=Format.createMarkdown().addTitle(`${data.name} · 成品货架`).addNewline();
  for(const category of data.categories)md.addButton(`[${category}]`,{data:`/职业成品分类 ${data.shop} ${category} 1${data.keyword?` ${data.keyword}`:''}`,autoEnter:false}).addText(' ');
  md.addNewline().addText(`当前分类：${data.category}｜基础供货：副职业 Lv.${data.basicLevel} 以内`).addNewline().addText('查看商品详情后会记入你的物品图鉴。').addNewline().addNewline();
  if(!data.items.length) md.addText('未找到匹配的成品。').addNewline();
  for(const item of data.items) md.addText(`【${item.name}】${item.price} 铜币｜库存 ${item.stock}`).addNewline().addButton('[详情]',{data:`/职业成品详情 ${data.shop} ${item.codex}`,autoEnter:false}).addText(' ').addButton('[购买]',{data:`/购买职业成品 ${data.shop} ${item.id} `,autoEnter:false}).addNewline().addNewline();
  md.addText(`当前第 ${data.page}/${data.pages} 页`);
  const command=(page:number)=>`/职业成品分类 ${data.shop} ${data.category} ${page}${data.keyword?` ${data.keyword}`:''}`;
  const returnCommand=({blacksmith:'/铁匠铺',alchemy_sweetshop:'/糖水屋',oddworkshop:'/异工坊'} as Record<string,string>)[data.shop];
  return Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('上一页',command(Math.max(1,data.page-1)),{type:'command',autoEnter:true}).addButton('搜索',`/职业成品分类 ${data.shop} ${data.category} 1 `,{type:'command',autoEnter:false}).addButton('下一页',command(Math.min(data.pages,data.page+1)),{type:'command',autoEnter:true}).addRow().addButton('全部成品',`/职业成品商店 ${data.shop}`,{type:'command',autoEnter:true}).addButton('返回商店',returnCommand,{type:'command',autoEnter:true}).addButton('离开商店',`/建筑离开 ${data.shop}`,{type:'command',autoEnter:true}));
};
export const finishedShopHandler=async()=>{ const[event]=useEvent();const[route]=useRoute();const[message]=useMessage();try{await message.send({format:await secondaryShopFormat(event.current.UserId,String(route.param('shop')),Number(route.param('page')??1),String(route.param('keyword')??''),String(route.param('category')??'全部'))});}catch(error){await message.send({format:messageFormat('商店提示',error instanceof Error?error.message:'请稍后重试。')});} };
export const finishedPurchaseHandler=async()=>{ const[event]=useEvent();const[route]=useRoute();const[message]=useMessage();try{const result=await buySecondaryFinished(event.current.UserId,String(route.param('shop')),Number(route.param('id')),Number(route.param('quantity')??1));await message.send({format:messageFormat('购买成功',`获得【${result.name}】×${result.quantity}，消耗 ${result.price} 铜币。`)});}catch(error){await message.send({format:messageFormat('购买提示',error instanceof Error?error.message:'请稍后重试。')});} };

export const legacyFinishedShopHandler=(shop:string)=>async()=>{const[event]=useEvent();const[route]=useRoute();const[message]=useMessage();try{await message.send({format:await secondaryShopFormat(event.current.UserId,shop,Number(route.param('page')??1),String(route.param('keyword')??''),String(route.param('category')??'全部'))});}catch(error){await message.send({format:messageFormat('商店提示',error instanceof Error?error.message:'请稍后重试。')});}};
