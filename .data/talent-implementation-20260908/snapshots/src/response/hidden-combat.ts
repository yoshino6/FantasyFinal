import { specializeTime } from '../game/skill-specialization';
import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { messageFormat } from '../game/message';
import { hiddenDraft, hiddenLoadout } from '../game/hidden-battle.service';
import { hiddenMix, hiddenMixProbability, hiddenParticles } from '../game/hidden-particles';
import { hiddenSkill, hiddenSkills } from '../game/hidden-profession.config';
import { inventorCapability } from '../game/hidden-device-protocol';
import { battleStatus } from '../game/adventure.service';
import { pvpBattleStatus } from '../game/pvp.service';

export const hiddenCombatFormat = async (user: string, code: string, revision?: number, operation?: string, value?: string) => {
  const draft = await hiddenDraft(user,code,revision,operation,value), definition = hiddenSkill(code)!;
  const mixSkill = ['hidden_mix','hidden_kettle'].includes(code);
  const md = Format.createMarkdown().addTitle(mixSkill ? '调配·主材' : definition.name).addNewline().addNewline();
  const buttons = Format.createButtonGroup();
  const command = (op:string,val='')=>`/隐藏战技 ${code} ${draft.revision} ${op}${val?' '+val:''}`;
  md.addBlockquote(definition.description).addNewline().addNewline();
  if(!mixSkill)md.addBold(`MP ${draft.mana} · CD ${draft.spec.cooldown}${definition.resource?` · ${definition.resource}专属资源`:''}`).addNewline().addNewline();
  if (mixSkill) {
    md.addBold(`已投入 ${(draft.choice.particles??[]).length}/4`).addNewline().addText((draft.choice.particles??[]).map((code,index)=>`${index===0?'主材·':''}${hiddenParticles.find(p=>p.code===code)?.name}`).join(' ＋ ') || '首颗决定主反应；同种可重复，每颗各消耗1个。').addNewline().addNewline();
    md.addText('按钮数字为扣除本次已选粒子后的剩余数量。').addNewline();
    for (let row=0;row<3;row++) { const line=buttons.addRow(); for (const particle of hiddenParticles.slice(row*4,row*4+4)) line.addButton(`${particle.name} ${draft.remainingStocks[particle.code]??0}`,command('particle',particle.code),{type:'command',autoEnter:true,style:draft.remainingStocks[particle.code]>0?'blue':'gray'}); }
    if ((draft.choice.particles?.length??0)>=2) {
      const mix=hiddenMix(draft.choice.particles!, 'success',code==='hidden_kettle'), chance=hiddenMixProbability(mix.particles.length,draft.catalyst,code==='hidden_kettle');
      md.addBold(`MP ${draft.mana} · CD ${specializeTime(mix.cooldown,draft.spec.timeChange)} · ${mix.targets}目标 · ${mix.duration}回合`).addNewline().addText(`失败 ${chance.failure}% / 成功 ${chance.success}% / 大成功 ${chance.great}%`).addNewline().addText(draft.catalyst?`已计入${draft.catalyst==='stable'?'稳定':'激发'}催化。`:'已计入当前专精与施法状态。').addNewline().addNewline();
      md.addText(mix.branches.map(b=>`${hiddenParticles.find(p=>p.code===b.code)?.name}：权重${Math.round(b.weight*100)}%${b.damage?' · 伤害':''}${b.heal||b.regeneration?' · 回复':''}${b.shield?' · 护盾':''}${b.control?' · 控制':''}`).join('\n')).addNewline();
    }
  } else if (definition.profession==='weapon_master' && code!=='hidden_weapon_guard') {
    md.addBold('本次器序').addText((draft.choice.weapons??[]).map(id=>draft.ctx.weapons.find(w=>w.id===id)?.name??'失效武器').join(' → ')||'尚未选择').addNewline();
    for (const weapon of draft.ctx.weapons) buttons.addRow().addButton(`${weapon.name} · ${weapon.type}`,command('weapon',String(weapon.id)),{type:'command',autoEnter:true});
    if (!draft.ctx.weapons.length) md.addBlockquote('器阵为空，请结束战斗后通过「二转配置」配置随身武器。');
  } else if (definition.profession==='inventor') {
    md.addBold('本次驱动').addText((draft.choice.devices??[]).map(d=>{const device=draft.ctx.devices.find(i=>i.id===d.id),skill=device?.skills.find(s=>s.code===d.skill);return device&&skill?`${device.name}·${skill.name}（${skill.energyCost}能量／CD${skill.cooldownTurns}）`:'失效异械';}).join(' ＋ ')||'尚未选择').addNewline();
    if (draft.choice.donor) md.addText(`供体／维护：${draft.ctx.devices.find(d=>d.id===draft.choice.donor)?.name??'失效'}`).addNewline();
    const deviceButtons:Array<{label:string;command:string}>=[];
    for (const device of draft.ctx.devices) {
      md.addText(`${device.name} · 能量 ${device.energy}/${device.max}`).addNewline();
      for (const skill of device.skills.filter(s=>inventorCapability(s))) deviceButtons.push({label:`${device.name}·${skill.name}`,command:command('device',`${device.id}:${skill.code}`)});

    }
    const pageSize=deviceButtons.length>6?4:6,page=operation==='modes'?Math.max(0,Number(value)||0):0;
    for(let i=page*pageSize;i<Math.min(deviceButtons.length,(page+1)*pageSize);i+=2){const row=buttons.addRow();for(const button of deviceButtons.slice(i,i+2))row.addButton(button.label,button.command,{type:'command',autoEnter:true});}
    if(deviceButtons.length>6){const nav=buttons.addRow();if(page>0)nav.addButton('上一页',command('modes',String(page-1)),{type:'command',autoEnter:true});if((page+1)*pageSize<deviceButtons.length)nav.addButton('下一页',command('modes',String(page+1)),{type:'command',autoEnter:true});}
    if (!draft.ctx.devices.length) md.addBlockquote('主脑尚未连接异械，请在局外通过「二转配置」连接已激活异械。');
  }
  const modes:Record<string,Array<[string,string]>>={hidden_catalyst:[['稳定','stable'],['激发','excite']],hidden_order:[['提位友方','advance'],['延后敌方','delay']],hidden_plan:[['守势','guard'],['接应','rescue'],['截断','interrupt']]};
  if (modes[code]) { md.addBold('模式：').addText(modes[code].find(m=>m[1]===draft.choice.mode)?.[0]??'待选择').addNewline(); const row=buttons.addRow(); for(const [name,mode] of modes[code]) row.addButton(name,command('mode',mode),{type:'command',autoEnter:true}); }
  let targets: Array<{key:string;name:string;hp:number}>;
  if (draft.kind === 'setup') targets=[{key:'current',name:'当前敌方',hp:1},{key:'self',name:'自身',hp:1},{key:'lowest',name:'最低生命友方',hp:1}];
  else {
  const status= draft.kind==='pve'?await battleStatus(user):await pvpBattleStatus(user);
  targets = [...status.members.map(m=>({key:`${draft.kind==='pve'?'member':'pvp'}:${m.id}`,name:m.name,hp:m.hp})),...status.targets.map(t=>({key:`${draft.kind==='pve'?'target':'pvp'}:${t.id}`,name:t.name,hp:t.hp}))];
  }
  md.addNewline().addBold('目标：').addText(targets.find(t=>t.key===draft.choice.target)?.name??'当前敌方／自身').addNewline();
  if (operation==='targets' || operation==='donors') {
    const page=Math.max(0,Number(value)||0), entries=operation==='targets'?targets.filter(t=>t.hp>0):draft.ctx.devices.map(d=>({key:String(d.id),name:d.name,hp:1}));
    const selection=Format.createButtonGroup();
    for(let i=page*9;i<Math.min(entries.length,page*9+9);i+=3){const row=selection.addRow();for(const entry of entries.slice(i,Math.min(i+3,page*9+9)))row.addButton(entry.name,command(operation==='targets'?'target':'donor',entry.key),{type:'command',autoEnter:true});}
    if(entries.length>9){const row=selection.addRow();if(page>0)row.addButton('上一页',command(operation,String(page-1)),{type:'command',autoEnter:true});if((page+1)*9<entries.length)row.addButton('下一页',command(operation,String(page+1)),{type:'command',autoEnter:true});}
    selection.addRow().addButton('返回准备',command('view'),{type:'command',autoEnter:true});
    return Format.create().addMarkdown(Format.createMarkdown().addTitle(operation==='targets'?'选择目标':'选择供体／维护异械').addNewline().addBlockquote('选择不会消耗行动或材料。')).addButtonGroup(selection);
  }
  const controls=buttons.addRow().addButton('撤回一项',command('undo'),{type:'command',autoEnter:true}).addButton('清空',command('clear'),{type:'command',autoEnter:true}).addButton('选择目标',command('targets'),{type:'command',autoEnter:true});
  if(['hidden_transfer','hidden_debug'].includes(code))controls.addButton(code==='hidden_transfer'?'选择供体':'追加维护',command('donors'),{type:'command',autoEnter:true});
  if(draft.kind==='setup') { md.addNewline().addBlockquote('保存即允许自动战斗使用这份固定选择并消耗所列材料；还需在原有自动战斗列表中编排此技能。');buttons.addRow().addButton('保存自动配置',`/隐藏自动保存 ${code} ${draft.revision}`,{type:'command',autoEnter:true,style:'blue'}); }
  else buttons.addRow().addButton(mixSkill?'确定调配':'确定施放',`/隐藏施放 ${code} ${draft.skillId} ${draft.revision} ${draft.turn} ${draft.battleKey}`,{type:'command',autoEnter:true,style:'blue'}).addButton('返回战斗','/战斗',{type:'command',autoEnter:true});
  return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
export const hiddenCombatHandler = async () => {
  const [event]=useEvent(),[route]=useRoute(),[message]=useMessage();
  try { await message.send({format:await hiddenCombatFormat(event.current.UserId,String(route.param('code')),route.param('revision')===undefined?undefined:Number(route.param('revision')),route.param('operation') as string|undefined,route.param('value') as string|undefined)}); }
  catch(error) { await message.send({format:messageFormat('战技准备',error instanceof Error?error.message:'暂时无法准备。')}); }
};
export const hiddenLoadoutHandler = async () => {
  const [event]=useEvent(),[route]=useRoute(),[message]=useMessage();
  try {
    const data=await hiddenLoadout(event.current.UserId,route.param('type') as 'weapons'|'devices'|undefined,Number(route.param('id'))||undefined);
    const type=data.profession.code==='weapon_master'?'weapons':'devices',items=type==='weapons'?data.weapons:data.devices;
    const md=Format.createMarkdown().addTitle(`${data.profession.name}·二转配置`).addNewline().addNewline().addBlockquote(!['weapon_master','inventor'].includes(data.profession.code)?'战斗中点击二转技能准备行动；下方可保存局外自动战斗方案。':type==='weapons'?'器阵最多3件；点击加入或移除。战斗中可选择已登记器具的出手顺序。':'主脑最多连接3种已激活异械。战斗中选择模式后立即驱动，消耗自身一次行动。').addNewline();
    const buttons=Format.createButtonGroup();
    const page=Math.max(0,Number(route.param('page'))||0);
    if (['weapon_master','inventor'].includes(data.profession.code)) {
      for(let i=page*6;i<Math.min(items.length,page*6+6);i+=2){const row=buttons.addRow();for(const item of items.slice(i,Math.min(i+2,page*6+6)))row.addButton(`${(data.config[type]??[]).includes(item.id)?'✓ ':''}${item.name} #${item.id}`,`/二转配置 ${type} ${item.id} ${page}`,{type:'command',autoEnter:true});}
    } else md.addText('该职业无需登记器阵或主脑。战斗中点击二转技能即可选择参数。');
    const auto=buttons.addRow();for (const skill of hiddenSkills.filter(s=>s.profession===data.profession.code))auto.addButton(`自动·${skill.button}`,`/隐藏战技 ${skill.code}`,{type:'command',autoEnter:true});
    if(items.length>6){const nav=buttons.addRow();if(page>0)nav.addButton('上一页',`/二转配置 ${type} 0 ${page-1}`,{type:'command',autoEnter:true});if((page+1)*6<items.length)nav.addButton('下一页',`/二转配置 ${type} 0 ${page+1}`,{type:'command',autoEnter:true});}
    await message.send({format:Format.create().addMarkdown(md).addButtonGroup(buttons)});
  } catch(error) { await message.send({format:messageFormat('二转配置',error instanceof Error?error.message:'配置失败。')}); }
};

export const hiddenAutoSaveHandler = async () => {
  const [event]=useEvent(),[route]=useRoute(),[message]=useMessage();
  try {const name=await (await import('../game/hidden-battle.service')).saveHiddenAuto(event.current.UserId,String(route.param('code')),Number(route.param('revision')));await message.send({format:messageFormat('自动配置',`已保存「${name}」的固定选择。可在自动战斗设置中编排该技能。`)});}
  catch(error){await message.send({format:messageFormat('自动配置',error instanceof Error?error.message:'保存失败。')});}
};
