import {Format,useEvent,useRoute} from 'alemonjs';
import {useGameMessage} from '../game/use-game-message';
import {messageFormat} from '../game/message';
import {lamplightAction,lamplightView,lamplightHistory,lamplightGrowthView,lamplightPersonView} from '../game/lamplight.service';
import {currentMainQuest} from '../game/main-quest.service';
import type {LamplightView} from '../game/lamplight.types';

export const lamplightFormat=(view:LamplightView)=>{
  if(view.buttons.length>10)throw Error('主线选项超出当前消息容量，请保留进度核查。');
  const md=Format.createMarkdown().addTitle(view.title).addNewline().addNewline().addText(`【${view.npc}】   `).addButton('[详情]',{data:'/灯火人物',autoEnter:false}).addNewline().addNewline().addBlockquote(view.text.replace(/\r?\n/g,'\n> '));
  const group=Format.createButtonGroup();
  for(const [index,button] of view.buttons.slice(0,10).entries()){
    if(index%2===0)group.addRow();
    const command=button.command??`/灯火行动 ${view.revision} ${button.action}`;
    const long=button.label.length>16;
    if(long)md.addNewline().addNewline().addButton(`[${index+1}] ${button.label}`,{data:command,autoEnter:false});
    group.addButton(long?`选择 ${index+1}`:button.label,command,{type:'command',autoEnter:true});
  }
  return Format.create().addMarkdown(md).addButtonGroup(group);
};
const send=async(kind:'view'|'action'|'history'|'legacy'|'growth'|'person')=>{
  const[event]=useEvent();const[request]=useRoute();const[message]=useGameMessage();
  try{
    if(kind==='legacy'){
      const quest=await currentMainQuest(event.current.UserId,true);
      const md=Format.createMarkdown().addTitle(quest.title).addNewline().addNewline().addBlockquote(quest.description.replace(/\r?\n/g,'\n> '));
      const group=Format.createButtonGroup();
      const actions=[...(quest.actions??(quest.action?[quest.action]:[])),{label:'返回灯火主线',command:'/灯火主线'}];
      for(const [i,a] of actions.slice(0,10).entries()){if(i%2===0)group.addRow();group.addButton(a.label,a.command,{type:'command',autoEnter:true});}
      await message.send({format:Format.create().addMarkdown(md).addButtonGroup(group)});return;
    }
    const result=kind==='person'?await lamplightPersonView(event.current.UserId):kind==='growth'?await lamplightGrowthView(event.current.UserId):kind==='history'?await lamplightHistory(event.current.UserId,Number(request.param('page')??1)):kind==='action'?await lamplightAction(event.current.UserId,Number(request.param('revision')),String(request.param('action'))):await lamplightView(event.current.UserId);
    await message.send({format:lamplightFormat(result)});
  }catch(error){await message.send({format:messageFormat('灯火所至',error instanceof Error?error.message:'请稍后重试。')});}
};
export const lamplightHandler=()=>send('view');
export const lamplightActionHandler=()=>send('action');
export const lamplightHistoryHandler=()=>send('history');
export const lamplightLegacyHandler=()=>send('legacy');
export const lamplightGrowthHandler=()=>send('growth');
export const lamplightPersonHandler=()=>send('person');
