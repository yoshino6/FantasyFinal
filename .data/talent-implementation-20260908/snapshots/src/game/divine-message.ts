import { Format } from 'alemonjs';
import { withTransaction } from '../database/pool';
import type { RowDataPacket } from 'mysql2/promise';
import { divineSkillDefinitions } from './opening-content';
import { openingWorldFor } from './opening-state';
import { audienceText, dangerText, destinationText, heavenText, questionText, randomStoryText } from './message';
import { completedRegistrationFormat } from './registration-message';

export const divineGroups:Record<string,readonly string[]>={生存:['G01','G06','G14','G17'],探索:['G02','G03','G04'],交涉:['G08','G09','G11'],生产:['G05','G07','G10','G18'],成长:['G12'],战斗:['G13','G15','G16']};
export const divineCatalog=(page=1,keyword='',group='全部')=>{
  const entries=divineSkillDefinitions.filter(skill=>(group==='全部'||divineGroups[group]?.includes(skill.number))&&(!keyword||`${skill.name}${skill.description}`.includes(keyword)));
  const total=Math.max(1,Math.ceil(entries.length/6));page=Math.max(1,Math.min(total,Number.isFinite(page)?Math.floor(page):1));
  const md=Format.createMarkdown().addTitle('序章·选择神技（6/6）').addText('\n\n神器已散布世界各地。此刻可以带走的，是一项陪你走下去的神技。\n\n');
  const pageSkills=entries.slice((page-1)*6,page*6);
  // QQ Markdown 的 cmd-enter 不支持 show；蓝色链接只填入指令，由玩家确认发送。
  for(const skill of pageSkills)md.addButton(`【${skill.name}】`,{data:`/神技详情 ${skill.number}`,autoEnter:false}).addNewline().addBlockquote(skill.summary).addNewline().addNewline();
  md.addText(`第 ${page}/${total} 页｜${group}`);
  const buttons=Format.createButtonGroup();
  buttons.addRow().addButton('上一页',`/神技目录 ${Math.max(1,page-1)} ${group}`,{type:'command',autoEnter:true}).addButton('下一页',`/神技目录 ${Math.min(total,page+1)} ${group}`,{type:'command',autoEnter:true});
  for(const row of [['全部','生存','探索'],['交涉','生产','成长','战斗']]){buttons.addRow();for(const label of row)buttons.addButton(label,`/神技目录 1 ${label}`,{type:'command',autoEnter:true});}
  return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
export const divineDetail=(input:string)=>{
  const skill=divineSkillDefinitions.find(s=>s.number.toLowerCase()===input.toLowerCase()||s.code===input);if(!skill)throw new Error('请从神技目录中选择。');
  return Format.create().addMarkdown(Format.createMarkdown().addTitle(skill.name).addNewline().addNewline().addText(skill.summary).addNewline().addNewline().addBlockquote(skill.description))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('选择此神技',`/选择恩赐 ${skill.code}`,{type:'command',autoEnter:true,style:'blue'}).addButton('返回目录','/神技目录 1 全部',{type:'command',autoEnter:true}));
};
export const registrationScene=async(stage:string,user:string)=>{
  if(stage==='completed')return completedRegistrationFormat(user);
  return withTransaction(async connection=>{
  const [sessions]=await connection.execute<RowDataPacket[]>('SELECT s.id,s.stage FROM registration_sessions s JOIN players p ON p.id=s.player_id WHERE p.qq_user_id=? FOR UPDATE',[user]);
  if(!sessions[0])return null;
  stage=String(sessions[0].stage);
  if(stage==='choice')return divineCatalog();
  const world=await openingWorldFor(connection);const eris=world.current_goddess==='eris';
  const texts:Record<string,string>={
    story:randomStoryText(),
    audience:eris?'再次睁眼时，你坐在一张铺着软垫的椅子上。一名银发少女将温水放到手边，没有急着催你起身。\n\n“醒了吗？可以慢慢来。跨过两个世界，有时会比长途旅行还累。”\n\n她把册子转向你，让你看清上面的名字：“我是厄里斯，现在负责这里的接引。”':audienceText,
    question:eris?'厄里斯安静听完，才轻声回答：“这里是死后的中转处。你原先的生命已经结束，但接下来的去向，仍然可以由你选择。”\n\n她将散开的纸页整理好，语气温和，却没有把事实藏起来。':questionText,
    destination:eris?'“你可以走进天堂，也可以到异世界开始新的旅程。”厄里斯翻开一幅地图。\n\n“那边有愿意帮助别人的人，也有危险。不要因为不认识路，就觉得只能独自往前闯。”':destinationText,
    heaven:heavenText,
    danger:eris?'厄里斯将地图铺平，指尖停在城镇灯火之外。树影在纸面上摇动，一双兽瞳从黑暗中亮起。\n\n“离开城镇以后，魔物、陷阱和陌生的道路都可能威胁你的生命。遇见看不清底细的对手，请先退开；求助并不是一件丢脸的事。”\n\n她伸手轻触你的眉心，银色微光安静地融入印记。\n\n“我将【鉴识】赐予你。愿它帮你辨认对手隐藏的情报，少一些贸然涉险。随着今后的成长，你也能用它看得更清楚。”\n\n确认印记稳定后，她才翻开另一册发光的名录。\n\n“神器已经散布世界各地。鉴识之外，你还可以从这里选择一项神技。照顾自己、听懂别人、寻找道路、制作东西，都可以成为它发挥作用的地方。”':dangerText
  };
  const [records]=await connection.execute<RowDataPacket[]>('SELECT stage,goddess,text FROM registration_scene_records WHERE session_id=? ORDER BY created_at DESC',[sessions[0].id]);
  const saved=records.find(r=>r.stage===stage);
  let text=saved?String(saved.text):texts[stage]??'请继续选择你的旅途。';
  if(!saved){
    if(eris&&records.some(r=>r.goddess==='aqua'&&r.stage!=='story')&&!records.some(r=>r.goddess==='eris'))text='接引室的铃响了。银发少女接过名册，先向你欠身：“我是厄里斯。阿库娅前辈刚随一位旅人下界，接下来由我陪你完成接引。你的记录和选择都在，请放心。”\n\n'+text;
    await connection.execute('INSERT INTO registration_scene_records (session_id,stage,goddess,text) VALUES (?,?,?,?)',[sessions[0].id,stage,world.current_goddess,text]);
  }
  const labels:Record<string,string>={story:'最后一幕（1/6）',audience:'神界苏醒（2/6）',question:'女神的回答（3/6）',destination:'命运的岔路（4/6）',danger:'散落的神迹（5/6）',heaven:'天堂的门扉'};
  const buttons=Format.createButtonGroup().addRow();
  if(stage==='audience')buttons.addButton('这里是哪里？','/询问 这里是哪里',{type:'command',autoEnter:true,style:'blue'});
  else if(stage==='destination')buttons.addButton('前往天堂','/选择去向 天堂',{type:'command',autoEnter:true}).addButton('转生异世界','/选择去向 异世界',{type:'command',autoEnter:true,style:'blue'});
  else if(stage==='heaven')buttons.addButton('还是转生异世界','/选择去向 异世界',{type:'command',autoEnter:true});
  else buttons.addButton(stage==='danger'?'看看神技':'继续',`/注册 继续 ${stage}`,{type:'command',autoEnter:true,style:'blue'});
  return Format.create().addMarkdown(Format.createMarkdown().addTitle(`序章·${labels[stage]??'接引'}`).addNewline().addNewline().addText(text)).addButtonGroup(buttons);
  }).then(result=>result??completedRegistrationFormat(user));
};
