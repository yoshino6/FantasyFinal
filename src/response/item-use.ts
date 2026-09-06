import {randomUUID} from 'node:crypto';
import {Format,useEvent,useMessage,useRoute} from 'alemonjs';
import {useInventoryItem} from '../game/item-use.service';
import {itemUsePolicy} from '../game/item-use-policy';
import {messageFormat} from '../game/message';

export const appendItemUse=(markdown:ReturnType<typeof Format.createMarkdown>,item:{id:number;code:string;item_type?:string;effect_json?:unknown})=>{
  const policy=itemUsePolicy(item);
  // QQ 行内蓝色链接使用 cmd-input；cmd-enter 不支持自定义显示文字。
  if(policy.kind==='direct')markdown.addText(' ').addButton('[使用]',{data:`/使用道具 ${item.id} ${randomUUID()}`,autoEnter:false});
  else if(policy.kind==='workflow')markdown.addText(' ').addButton('[使用]',{data:policy.command!,autoEnter:false});
  else if(policy.kind==='combat')markdown.addText('（战斗中使用）');
  return markdown;
};
export default async()=>{
  const[event]=useEvent();const[route]=useRoute();const[message]=useMessage();
  try{const result=await useInventoryItem(event.current.UserId,Number(route.param('id')),String(route.param('token')??randomUUID()));await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addTitle(result.name).addNewline().addText(result.message)).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回背包','/背包 道具',{type:'command',autoEnter:true}))});}
  catch(error){await message.send({format:messageFormat('道具使用',error instanceof Error?error.message:'请稍后重试。')});}
};
