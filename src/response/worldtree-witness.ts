import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { messageFormat } from '../game/message';
import { battleStatus } from '../game/adventure.service';
import { aevierTour } from '../game/worldtree-witness-content';
import { continueAevierChallenge, continueWorldtreeTour, enterEternalArena, eternalArenaView, leaveEternalArena, startAesonDuel, startAevierChallenge } from '../game/worldtree-witness.service';
import { battleStartFormat } from './adventure';

type Scene={kind:'tour'|'challenge';stage:number;total:number;title:string;text:string};
export const worldtreeWitnessFormat=(scene:Scene)=>{
  const md=Format.createMarkdown().addTitle(`${scene.kind==='tour'?'初章':'主线'}·${scene.title}（${scene.stage}/${scene.total}）`).addNewline().addNewline().addText(scene.text).addNewline().addNewline();
  if(scene.kind==='tour'&&scene.stage===2)md.addText('**【获得地图】世界树草原环带**').addNewline().addNewline();
  const buttons=Format.createButtonGroup().addRow();
  if(scene.stage<scene.total)buttons.addButton('继续',`/世界树见证 ${scene.kind==='tour'?'游览':'邀约'} ${scene.stage}`,{type:'command',autoEnter:true,style:'blue'});
  else if(scene.kind==='challenge')buttons.addButton('前往竞技场','/前往 6 -4',{type:'command',autoEnter:true,style:'blue'});
  buttons.addButton('任务','/任务',{type:'command',autoEnter:true});
  return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
const fail=(message:any,error:unknown)=>message.send({format:messageFormat('世界树',error instanceof Error?error.message:'请稍后再试。')});
export const worldtreeWitnessHandler=async()=>{const[event]=useEvent();const[route]=useRoute();const[message]=useMessage();try{const action=String(route.param('action'));const page=route.param('page');const expected=page===undefined?undefined:Number(page);const scene=action==='赴约'?await startAevierChallenge(event.current.UserId):action==='游览'?await continueWorldtreeTour(event.current.UserId,expected):action==='邀约'?await continueAevierChallenge(event.current.UserId,expected):await (async()=>{const state=await (await import('../game/worldtree-witness.service')).worldtreeWitnessState(event.current.UserId);return state&&state.tour<aevierTour.length?continueWorldtreeTour(event.current.UserId):continueAevierChallenge(event.current.UserId);})();if(!scene)throw new Error('当前没有待继续的世界树剧情。');await message.send({format:worldtreeWitnessFormat(scene)});}catch(error){await fail(message,error);}};
export const eternalArenaHandler=async()=>{const[event]=useEvent();const[message]=useMessage();try{const view=await eternalArenaView(event.current.UserId);const md=Format.createMarkdown().addTitle(view.title).addNewline().addNewline().addText(view.text);const buttons=Format.createButtonGroup().addRow();if(view.canStart)buttons.addButton('开始决斗','/艾森决斗',{type:'command',autoEnter:true,style:'blue'});buttons.addButton('离开竞技场','/竞技场离开',{type:'command',autoEnter:true}).addButton('任务','/任务',{type:'command',autoEnter:true});await message.send({format:Format.create().addMarkdown(md).addButtonGroup(buttons)});}catch(error){await fail(message,error);}};
export const enterEternalArenaHandler=async()=>{const[event]=useEvent();const[message]=useMessage();try{const text=await enterEternalArena(event.current.UserId);const md=Format.createMarkdown().addTitle('主线·狂拳的约战').addNewline().addNewline().addText(text);await message.send({format:Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('查看竞技场','/永恒竞技场',{type:'command',autoEnter:true,style:'blue'}).addButton('任务','/任务',{type:'command',autoEnter:true}))});}catch(error){await fail(message,error);}};
export const leaveEternalArenaHandler=async()=>{const[event]=useEvent();const[message]=useMessage();try{const text=await leaveEternalArena(event.current.UserId);await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addTitle('世界树·根桥').addNewline().addNewline().addText(text)).addButtonGroup(Format.createButtonGroup().addRow().addButton('任务','/任务',{type:'command',autoEnter:true}))});}catch(error){await fail(message,error);}};
export const aesonDuelHandler=async()=>{const[event]=useEvent();const[message]=useMessage();try{const result=await startAesonDuel(event.current.UserId);await message.send({format:battleStartFormat(`${result.text}\n本场剧情战不会产生技能领悟、经验或掉落。`,await battleStatus(event.current.UserId))});}catch(error){await fail(message,error);}};
