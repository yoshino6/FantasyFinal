import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { portraitScope, reservePortraitUpload } from '../game/automaton-portrait.service';
import { acceptPortraitImage } from '../game/automaton-portrait-upload';
import { escapeAutomatonText } from '../game/automaton-dialogue';

export default async(_event:unknown,next:()=>Promise<void>)=>{
  const [event]=useEvent(),current=event.current;
  const media='MessageMedia' in current?current.MessageMedia:undefined;
  if(!current.UserId||!media?.length||current.IsBot){await next();return;}
  const [message]=useMessage();let handled=false,passed=false,submitted=false;
  try{
    const upload=await reservePortraitUpload(current.UserId,portraitScope(current));
    if(!upload){passed=true;await next();return;}handled=true;
    if('expired' in upload){await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addText('上传已超时，请重新点击“更换形象”。'))});return;}
    if('busy' in upload){await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addText('上一张图片正在处理，请稍等。'))});return;}
    const result=await acceptPortraitImage(current.UserId,upload,media);submitted=true;
    await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addText(`〖${escapeAutomatonText(result.name)}〗的新形象已提交人工审核，审核通过后生效，原形象保留。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看详情',`/机巧 详情 ${result.id}`,{type:'command',autoEnter:true,style:'blue'}))});
  }catch(error){
    if(passed)throw error;
    logger.warn({err:error},'机巧形象上传未完成');
    if(submitted)return;
    if(!handled){await next();return;}
    const text=error instanceof Error&&/图片|形象审核|上传已/.test(error.message)?error.message:'形象上传暂时失败，请稍后重试。';
    await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addText(text))});
  }
};
