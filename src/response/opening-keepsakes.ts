import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message';
import { messageFormat } from '../game/message';
import { keepsakeAction, keepsakeView } from '../game/opening-keepsakes.service';
import { openingJob } from '../game/opening-progress.service';

export const keepsakeHandler=async()=>{
  const [event]=useEvent(),[route]=useRoute(),[message]=useGameMessage();
  try{
    const code=String(route.param('code')),action=String(route.param('action')??'');
    if(action)await message.send({format:messageFormat('凭物交接',await keepsakeAction(event.current.UserId,code,action,String(route.param('value')??'')))});
    const {definition:d,row,record,away}=await keepsakeView(event.current.UserId,code);
    const revision=Number(record.revision??0);
    const md=Format.createMarkdown().addTitle(`${d.desk}·${record.name}`).addNewline().addNewline()
      .addText(`经办：${d.npc}\n${away?'可在当地公会联络窗口转交，接收原经办人的回函。':'请在当地公会内办理。'}\n\n${record.registered?record.result:d.dialogue}`)
      .addNewline().addNewline().addBlockquote(`当前用途：${record.use}`).addNewline().addBlockquote(`未解之事：${record.future}`);
    const buttons=Format.createButtonGroup();
    const add=(label:string,command:string,autoEnter=true)=>buttons.addButton(label,command,{type:'command',autoEnter,style:'blue'});
    if(!record.registered){buttons.addRow();add(d.kind==='lesson'?'参加这次教学':'交由经办人核验',`/初行凭物 ${code} register:${revision}`);}
    else if(!row.used&&Number(record.remaining)>0){
      md.addNewline().addText(`\n剩余服务：${record.remaining} 次`);buttons.addRow();
      add(d.kind==='repair'?'填写装备编号':d.kind==='meal'?'享用热餐':d.kind==='rest'?'安排休息':'使用额外行程',`/初行凭物 ${code} use:${revision}${d.kind==='repair'?' ':''}`,d.kind!=='repair');
    }
    if(d.kind==='aqua'&&record.registered){buttons.addRow();add('陪女神办理登记','/女神');}
    buttons.addRow();add(row.archived?'取回纪念显示件':'收纳纪念显示件',`/初行凭物 ${code} ${row.archived?'restore':'archive'}:${revision}`);add('查看背包','/背包');
    buttons.addRow();add('前往当地公会','/初行公会');add('后续主线','/任务');
    buttons.addRow();add('返回见闻','/初行见闻');
    await message.send({format:Format.create().addMarkdown(md).addButtonGroup(buttons)});
  }catch(error){await message.send({format:messageFormat('凭物交接',error instanceof Error?error.message:'请稍后重试。')});}
};
export const openingJobHandler=async()=>{
  const [event]=useEvent(),[route]=useRoute(),[message]=useGameMessage();
  try{
    const value=route.param('revision');const result=await openingJob(event.current.UserId,value===undefined?undefined:Number(value));
    const buttons=Format.createButtonGroup().addRow();
    if(result.action)buttons.addButton(result.action,`/初行委托 ${result.revision}`,{type:'command',autoEnter:true,style:'blue'});
    else buttons.addButton('查看委托','/初行委托',{type:'command',autoEnter:true});
    buttons.addButton('返回公会','/初行公会',{type:'command',autoEnter:true});
    await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addTitle(result.title).addNewline().addNewline().addText(result.text)).addButtonGroup(buttons)});
  }catch(error){await message.send({format:messageFormat('初行委托',error instanceof Error?error.message:'请稍后重试。')});}
};
