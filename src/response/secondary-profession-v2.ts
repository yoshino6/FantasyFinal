import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { messageFormat } from '../game/message';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { oddWorkshopDungeonCatalog, studyWorkshopBlueprint } from '../game/dungeon-quest.service';
import { constructionBlueprintCodes,blindBoxBlueprints } from '../game/deconstructor-catalog';

export const professionMentorsHandler=async()=>{
  const[message]=useMessage();const md=Format.createMarkdown().addTitle('副职业 · 入门与导师').addNewline().addText('前往导师所在位置后，可了解副职业、交付入门任务或继续授艺与剧情。个人制作从“副职业”进入。');
  const buttons=Format.createButtonGroup();
  for(const[name,code,position]of [['漠北','blacksmith','-17 -191'],['晴儿','alchemy_sweetshop','-12 -196'],['唯薇安','oddworkshop','6 -189']]) buttons.addRow().addButton(`前往${name}`,`/前往 ${position}`,{type:'command',autoEnter:true}).addButton(`与${name}交谈`,`/副职业导师交谈 ${code}`,{type:'command',autoEnter:true});
  buttons.addRow().addButton('修理装备','/修理装备',{type:'command',autoEnter:true}).addButton('返回副职业','/副职业',{type:'command',autoEnter:true});
  await message.send({format:Format.create().addMarkdown(md).addButtonGroup(buttons)});
};
export const professionMentorTalkHandler=async()=>{
  const[event]=useEvent();const[route]=useRoute();const[message]=useMessage();const user=event.current.UserId;const code=String(route.param('npc'));
  try {
    if(!['blacksmith','alchemy_sweetshop','oddworkshop'].includes(code)) throw new Error('请选择副职业导师。');
    await requireNpcAtCurrentPosition(user,code);
    const format=code==='blacksmith'?await(await import('./blacksmith')).blacksmithFormat(user,'漠北放下锤子，认真听你说明来意。'):code==='alchemy_sweetshop'?await(await import('./alchemist')).alchemistShopFormat(user,'晴儿收好药瓶，邀你谈谈最近的修行与见闻。'):await(await import('./deconstructor')).oddWorkshopFormat(user,'唯薇安挪开桌上的零件，给你留出交谈的位置。');
    await message.send({format});
  }catch(error){await message.send({format:messageFormat('导师提示',error instanceof Error?error.message:'请稍后重试。')});}
};
export const blueprintStudyHandler=async()=>{
  const[event]=useEvent();const[route]=useRoute();const[message]=useMessage();const user=event.current.UserId;
  try{
    const{secondaryProfessionCode}=await import('../game/alchemist.service');if(await secondaryProfessionCode(user)!=='deconstructor') throw new Error('图纸研习需要个人解构师资格。');
    await requireNpcAtCurrentPosition(user,'oddworkshop');
    const code=String(route.param('code')??'');
    if(code){const result=await studyWorkshopBlueprint(user,code);await message.send({format:messageFormat('图纸研习完成',`消耗 ${result.price} 铜币，获得【${result.rewardName??result.name}】。`)});return;}
    const items=(await oddWorkshopDungeonCatalog(user)).filter(item=>constructionBlueprintCodes.has(item.code)||blindBoxBlueprints.some(box=>box.code===item.code));
    const md=Format.createMarkdown().addTitle('个人解构师 · 图纸研习').addNewline().addText('保留原有等级、费用和图纸门槛；已掌握课程仍可通过与唯薇安交谈领取。').addNewline();
    for(const item of items)md.addText(`【${item.name}】｜研习费 ${item.price} 铜币｜${item.owned?'已持有':'未持有'}`).addText(' ').addButton('[研习]',{data:`/解构图纸研习 ${item.code}`,autoEnter:false}).addNewline();
    await message.send({format:Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('课程与授艺','/唯薇安闲聊',{type:'command',autoEnter:true}).addButton('返回副职业','/副职业',{type:'command',autoEnter:true}))});
  }catch(error){await message.send({format:messageFormat('研习提示',error instanceof Error?error.message:'请稍后重试。')});}
};
export const alchemyGuideHandler=async()=>{const[message]=useMessage();await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addTitle('炼金反应说明').addNewline().addText('炼金不需要图纸。主材、辅材、催化剂有顺序区别，一键配方随机选择库存足够且你未尝试过的组合，确认后才消耗材料。\n\n基础萃取（每槽各1份）：\n兽核 + 血肉残渣 + 能量余烬 → 魔力粉尘。\n活木 + 血肉残渣 + 能量余烬 → 草木萃取液。\n\n归悟洗练露（炼金师Lv.3）：\n魔力粉尘×3 + 草木萃取液×3 + 魔力微弧×3。\n成功率与大成功沿用当前炼金条件，不保证每次成功。\n\n药品分标准、精制、匠造；制作成本与匠心决定品质分布，达到品质上限的匠心收益折为额外产量。\n每次实际耗材和成果自动写入炼金手记；稳定记录是经验统计，不限制制作。')).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回炼金','/炼金',{type:'command',autoEnter:true}).addButton('炼金手记','/炼金手记',{type:'command',autoEnter:true}).addButton('归悟洗练','/归悟洗练',{type:'command',autoEnter:true}))});};

export const forgeRepairHandler=async()=>{
  const[event]=useEvent();const[route]=useRoute();const[message]=useMessage();
  try{const service=await import('../game/forge-repair.service');const id=Number(route.param('id')??0);const craft=String(route.param('craft')??'');
    if(craft==='制作'){await service.craftForgeRepairKit(event.current.UserId);await message.send({format:messageFormat('制作成功','消耗活木×1、金元素微尘×3、10铜币，获得锻造维修包×1。')});return;}
    if(id){const name=await service.useForgeRepairKit(event.current.UserId,id);await message.send({format:messageFormat('修理完成',`消耗锻造维修包×1，【${name}】已恢复全部耐久。`)});return;}
    const items=await service.damagedEquipment(event.current.UserId);const md=Format.createMarkdown().addTitle('个人装备修理').addNewline().addText('每件消耗锻造维修包×1，恢复全部耐久；可从铁匠铺购买成品。').addNewline();
    for(const item of items)md.addText(`【${item.name}】#${item.id} 耐久${item.durability}/${item.durability_max}`).addText(' ').addButton('[使用维修包]',{data:`/修理装备 ${item.id}`,autoEnter:false}).addNewline();
    if(!items.length)md.addText('暂无需要修理的装备。');await message.send({format:Format.create().addMarkdown(md)});
  }catch(error){await message.send({format:messageFormat('修理提示',error instanceof Error?error.message:'请稍后重试。')});}
};
