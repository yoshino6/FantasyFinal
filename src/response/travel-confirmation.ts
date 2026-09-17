import { Format } from 'alemonjs';
import type { TravelPlan } from '../game/connected-travel.service';
import { durationText } from '../game/time-format';

export const travelConfirmationFormat=(result:{token:string;plan:TravelPlan})=>{
  const {plan,token}=result;
  const guild=plan.legs.some(l=>l.kind==='guild'),portal=plan.legs.some(l=>l.kind==='portal');
  const descending=plan.legs.some(l=>l.kind==='guild'&&l.from.z>l.to.z);
  const text=guild?(descending?'当前需通过公会后勤驳接至地面前往。':'当前需通过公会后勤接驳前往目的地。'):'当前路径地图缺失，可通过界门前往目的地。';
  const md=Format.createMarkdown().addTitle('行动确认').addNewline().addNewline().addText(text);
  if(guild&&portal)md.addNewline().addText('途中还需通过界门换乘。');
  const position=(p:{x:number;y:number;z:number})=>`（${p.x}, ${p.y}, ${p.z}）`;
  for(const leg of plan.legs)md.addNewline().addText(`${leg.kind==='walk'?'步行':leg.kind==='portal'?'界门':'公会接驳'}${leg.name?`·${leg.name}`:''}：${position(leg.from)} → ${position(leg.to)}，${durationText(leg.seconds??0)}`);
  md.addNewline().addNewline().addText(`目的坐标：${position(plan.target)}\n预计总耗时：${durationText(plan.seconds)}`);
  return Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton(guild?'确认前往':'确认',`/确认前往 ${token}`,{type:'command',autoEnter:false,style:'blue'}));
};
