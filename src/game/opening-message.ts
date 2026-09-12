import { Format } from 'alemonjs';
import type { OpeningView } from './opening.types';
import { firstPersonNarrative } from './narrative-voice';

export const openingFormat = (story: OpeningView) => {
  const progress=story.state!=='choice'&&story.pages>1?`（${story.page}/${story.pages}）`:'';
  const md=Format.createMarkdown().addTitle(`初章·${story.title}${progress}`).addNewline().addNewline();
  // 剧情正文保留自然段，选项与系统提示另行排版，方便在 QQ 中连续阅读。
  const paragraphs=firstPersonNarrative(story.text).trim().split(/\r?\n\s*\r?\n/).map(text=>text.trim()).filter(Boolean);
  for(const [index,paragraph] of paragraphs.entries()){
    md.addText(paragraph);
    if(index<paragraphs.length-1)md.addNewline().addNewline();
  }
  if(story.reward&&story.state==='arrival'&&story.page===1){
    const journey=story.reward.startsWith('旅程变化：');
    md.addNewline().addNewline().addBold(journey?`【旅程变化】${story.reward.slice('旅程变化：'.length)}`:`已获得：${story.reward}`);
  }
  const buttons=Format.createButtonGroup();
  if(story.state==='choice'){
    for(const choice of story.choices){md.addNewline().addNewline().addBold(`${choice.code} · ${choice.label}`);buttons.addRow().addButton(`选择 ${choice.code}`,`/初行选择 ${story.revision} ${choice.code}`,{type:'command',autoEnter:true,style:'blue'});}
  }
  else if(story.state==='armed')buttons.addRow().addButton('打开面板','/面板',{type:'command',autoEnter:true,style:'blue'});
  else if(story.state==='completed')buttons.addRow().addButton('进入公会','/初行公会',{type:'command',autoEnter:true,style:'blue'});
  else{
    const treat=story.route==='F02'&&story.branch==='B'&&story.state==='branch'&&story.page===story.pages;
    const forestBattle=story.route==='F03'&&story.state==='branch'&&story.page===story.pages;
    const action=story.state==='lesson'?'lesson':treat?'treat':'next';
    const entering=story.state==='arrival'&&story.page===story.pages;
    buttons.addRow().addButton(story.state==='lesson'?'进入公会':entering?'进入公会':forestBattle?'迎战史莱姆':treat?'敷上微光草药并继续':'继续',`/初行选择 ${story.revision} ${action}`,{type:'command',autoEnter:true,style:'blue'});
  }
  buttons.addRow().addButton('任务','/任务',{type:'command',autoEnter:true});
  return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
