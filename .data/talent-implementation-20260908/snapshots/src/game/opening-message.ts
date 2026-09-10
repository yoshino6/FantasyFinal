import { Format } from 'alemonjs';
import type { OpeningView } from './opening.types';

export const openingFormat = (story: OpeningView) => {
  const md=Format.createMarkdown().addTitle(`初章·${story.title}`).addNewline().addNewline().addText(story.text);
  if(story.state!=='choice'&&story.pages>1)md.addNewline().addNewline().addText(`（${story.page}/${story.pages}）`);
  if(story.reward&&['arrival','lesson','completed'].includes(story.state))md.addNewline().addNewline().addBlockquote(`已获得：${story.reward}`);
  const buttons=Format.createButtonGroup();
  if(story.state==='choice'){
    for(const choice of story.choices){md.addNewline().addNewline().addText(`${choice.code} · ${choice.label}`);buttons.addRow().addButton(`选择 ${choice.code}`,`/初行选择 ${story.revision} ${choice.code}`,{type:'command',autoEnter:true,style:'blue'});}
  }else if(story.state==='armed')buttons.addRow().addButton('开始初行故事','/继续剧情',{type:'command',autoEnter:true,style:'blue'});
  else if(story.state==='completed')buttons.addRow().addButton('进入公会','/初行公会',{type:'command',autoEnter:true,style:'blue'}).addButton('未解之事','/初行见闻',{type:'command',autoEnter:true});
  else{
    const treat=story.route==='F02'&&story.branch==='B'&&story.state==='branch'&&story.page===story.pages;
    const action=story.state==='lesson'?'lesson':treat?'treat':'next';
    buttons.addRow().addButton(story.state==='lesson'?'完成交接':treat?'敷上微光草药并继续':'继续',`/初行选择 ${story.revision} ${action}`,{type:'command',autoEnter:true,style:'blue'});
    if(story.route==='F01'&&story.branch==='B'&&story.reward)buttons.addRow().addButton('打开黄金宝箱','/打开宝箱 opening_golden_chest 1',{type:'command',autoEnter:true});
  }
  buttons.addRow().addButton('背包','/背包 道具',{type:'command',autoEnter:true}).addButton('任务','/任务',{type:'command',autoEnter:true});
  return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
