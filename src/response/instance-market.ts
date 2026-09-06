import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { instanceMarketList, previewInstanceMarket, confirmInstanceMarket } from '../game/instance-market.service';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { girlGratitudeStage } from '../game/girl-gratitude.service';
import { escapeAutomatonText } from '../game/automaton-dialogue';
import { automatonSkills } from '../game/automaton-skill-catalog';
export default async()=>{
  const [event]=useEvent(),[route]=useRoute(),[message]=useMessage();const user=event.current.UserId;
  const action=String(route.param('action')??'列表'),id=Number(route.param('id')??1),kind=String(route.param('kind')??'全部'),value=String(route.param('value')??'');
  const m=Format.createMarkdown().addTitle('万叶联市 · 实例寄售').addNewline();const link=(title:string,command:string)=>m.addButton(`[${title}]`,{data:command,autoEnter:false}).addText(' ');
  try{
    await requireNpcAtCurrentPosition(user,'canopy_exchange');if(await girlGratitudeStage(user)<6)throw new Error('先完成梨子喵的谢礼之约。');
    if(action==='列表'){
      const data=await instanceMarketList(user,id,kind,value);link('全部','/实例寄售 列表 1 全部');link('装备与异械','/实例寄售 列表 1 instance');link('机巧','/实例寄售 列表 1 automaton');m.addNewline();
      for(const item of data.items){const snapshot=item.snapshot as any;m.addText(`#${item.id} ${escapeAutomatonText(String(item.name))}｜${item.price} 铜币`).addNewline();
        if(item.kind==='automaton'){m.addText(`出生性格 ${snapshot.personality?.coreName}｜词条 ${snapshot.personality?.traits?.map((t:any)=>t.name).join('、')}`).addNewline();m.addText(`初始技能：${snapshot.skills.map((id:string)=>automatonSkills.find(s=>s.id===id)?.name??id).join('、')}`).addNewline();}
        else m.addText(`等级 ${snapshot.required_level}｜品质 ${snapshot.quality}｜耐久 ${snapshot.durability}/${snapshot.durability_max}\n${snapshot.description}`).addNewline();
        link(Number(item.seller_id)===data.characterId?'撤单':'购买',`/实例寄售 ${Number(item.seller_id)===data.characterId?'撤单':'购买'} ${item.id} ${item.kind}`);m.addNewline().addNewline();}
      link('上一页',`/实例寄售 列表 ${Math.max(1,data.page-1)} ${kind} ${value}`);m.addText(`${data.page}/${data.pages} `);link('搜索',`/实例寄售 列表 1 ${kind} `);link('下一页',`/实例寄售 列表 ${Math.min(data.pages,data.page+1)} ${kind} ${value}`);m.addNewline().addText('可寄售的本人实例（填写单价后提交）：').addNewline();
      for(const item of data.instances){m.addText(`#${item.id} ${item.name}｜品质${item.quality} `);link('上架',`/实例寄售 上架 ${item.id} instance `);m.addNewline();}
      for(const item of data.pets){m.addText(`#${item.id} ${escapeAutomatonText(item.name)} `);link('上架',`/实例寄售 上架 ${item.id} automaton `);m.addNewline();}
    }else if(action==='确认'){const result=await confirmInstanceMarket(user,value);m.addText(result.text);
    }else{const result=await previewInstanceMarket(user,action==='上架'?'list':action==='购买'?'buy':action==='撤单'?'cancel':(()=>{throw new Error('未知寄售操作。');})(),kind,id,action==='上架'?Number(value):1);m.addText(result.summary).addNewline();link('确认',`/实例寄售 确认 0 token ${result.token}`);}
    m.addNewline();link('返回寄售','/实例寄售');link('标准品市场','/万叶联市');await message.send({format:Format.create().addMarkdown(m)});
  }catch(error){await message.send({format:Format.create().addMarkdown(m.addText(error instanceof Error?error.message:'市场操作失败。'))});}
};
