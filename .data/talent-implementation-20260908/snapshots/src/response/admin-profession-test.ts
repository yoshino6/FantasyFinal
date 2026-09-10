import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { adminTestProfession, professionTestOptions } from '../game/admin-profession-test.service';
import { requireAdministrator } from '../game/permission.service';
import { messageFormat } from '../game/message';

export const professionTestFormat = () => {
  const md=Format.createMarkdown().addTitle('测试二转').addNewline().addNewline()
    .addText('点击职业填入命令，发送后为自己的角色完成对应二转任务并转职。').addNewline()
    .addText('切换时按正常二转规则重置技能点、移除旧二转技能，获得新职业技能。测试入口免等级、好感、材料、位置及转职冷却要求。').addNewline();
  for(const group of new Set(professionTestOptions.map(p=>p.group))) {
    md.addNewline().addBlockquote(`**${group}**`).addNewline();
    const options=professionTestOptions.filter(p=>p.group===group);
    for(const [index,p] of options.entries()) {
      md.addButton(`[${p.name}]`,{data:`测试二转 ${p.code}`,autoEnter:false}).addText(' ');
      if((index+1)%3===0||index===options.length-1)md.addNewline();
    }
  }
  md.addNewline().addText('仅完成所选职业的转职任务；测试不发放任务物资。战斗或交涉结束后才能使用。');
  return Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('返回管理','管理',{type:'command',autoEnter:true,style:'blue'}));
};

export default async () => {
  const [event]=useEvent(),[route]=useRoute(),[message]=useMessage();
  try {
    const user=event.current.UserId;await requireAdministrator(user);
    const code=String(route.param('code')??'').trim();
    if(!code){await message.send({format:professionTestFormat()});return;}
    const result=await adminTestProfession(user,code);
    const md=Format.createMarkdown().addTitle(result.changed?'测试二转完成':'转职资料已补齐').addNewline().addNewline()
      .addBlockquote(`**${result.name} · ${result.profession}**`).addNewline()
      .addText(`对应二转任务已完成，职业技能共${result.skillCount}项。${result.changed?`本次返还${result.restoredPoints}点技能点，旧二转技能与对应快捷配置已清理。`:'当前职业未改变，保留已有技能加点。'}`).addNewline()
      .addText('属性面板已重算，可重新配置战斗技能。');
    await message.send({format:Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow()
      .addButton('继续测试二转','测试二转',{type:'command',autoEnter:true,style:'blue'})
      .addButton('我的技能','技能列表 已学习',{type:'command',autoEnter:true})
      .addButton('返回管理','管理',{type:'command',autoEnter:true}))});
  } catch(error){await message.send({format:messageFormat('测试二转失败',error instanceof Error?error.message:'请稍后重试。')});}
};
