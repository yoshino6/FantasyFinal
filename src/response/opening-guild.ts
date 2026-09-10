import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message';
import { messageFormat, npcInteractionMarkdown } from '../game/message';
import { enterOpeningGuild, openingGuildView, openingGuildAction, openingKeepsakes, openingTransport } from '../game/opening-guild.service';
import { rootGuildPeople, guildLessons } from '../game/opening-guild.config';
import { nearbyPoints } from '../game/adventure.service';
import { openingHubs } from '../game/opening-world.config';

export const openingGuildServiceFormat=(text:string)=>{
  const markdown=Format.createMarkdown().addTitle('公会交接').addNewline().addNewline();
  for(const paragraph of text.trim().split(/\r?\n\s*\r?\n/)){
    if(/^(已领取|已兑换|已享用|这次是复习|凭单已核销|急救券已登记|补给券已登记|你已领过)/.test(paragraph))markdown.addText(paragraph);
    else markdown.addBlockquote(paragraph.replace(/\r?\n/g,'\n> '));
    markdown.addNewline().addNewline();
  }
  return Format.create().addMarkdown(markdown);
};

export const openingGuildFormat=async(user:string,area='大厅')=>{
  const view=await openingGuildView(user);const section=['大厅','次页'].includes(area)?'':`·${area==='休息'?'休息区':area}`;const md=Format.createMarkdown().addTitle(`${view.hub.name}·${view.hub.guildName}${section}`).addNewline().addNewline();const buttons=Format.createButtonGroup();
  const add=(label:string,command:string,autoEnter=true)=>buttons.addButton(label,command,{type:'command',autoEnter,style:'blue'});
  if(!view.at){
    md.addText(`公会入口位于（${view.place.pos_x}，${view.place.pos_y}，${view.place.pos_z}）。`).addNewline().addBlockquote('办事员与补给都在柜台等候，请先抵达入口。');
    buttons.addRow();add('前往公会',`/前往 ${view.place.pos_x} ${view.place.pos_y}`);add('查看地图','/地图');
  }else if(!view.inside){
    md.addBlockquote((view.code==='world_tree'?'巨根在前方分开，托起一座挂满风铃的木厅。公会徽记被新生枝条稳稳托住。\n\n岑渡扶住木门，等抱着药箱的小树灵先过去，才转向你。\n\n“找工作、问路，或者只是刚走出一段不太好的路，都可以进去。”':view.hub.description).replace(/\r?\n/g,'\n> '));
    buttons.addRow();add('进入公会','/初行入会');add('查看附近','/面板');
  }else if(area==='前台'){
    return (await import('./adventure')).guildFrontDeskFormat(user);
  }else if(area==='人物'){
    md.addBlockquote(view.hub.description);
    if(view.code==='world_tree')for(const [index,person] of rootGuildPeople.entries()){md.addNewline().addNewline().addText(`${person.name} · ${person.role}`);if(index%2===0)buttons.addRow();add(person.name.split('·').at(-1)!,`/初行服务 chat ${person.code}`);}
    else md.addNewline().addNewline().addBlockquote(`“${view.code==='sleepwhale_market'?'请慢慢看，停在柜台前也不会按分钟收费。':view.code==='frost_dragon_inn'?'我已经把结实的椅子摆好了。别急，尾巴也给你们让开。':view.code==='floating_leaf_town'?'云上也有人会迷路，不必为了刚到这里而难为情。':view.code==='snowlamp_hollow'?'手暖起来，字也会写得顺些。': '欢迎回来，需要什么帮助？'}”`);
    buttons.addRow();add('返回休息区','/初行公会 休息区');
  }else if(area==='礼包'){
    md.addBlockquote('接引员翻开你的初行记录，将应领的奖励逐项核准，再把适合所选职业的武器登记在册。');
    buttons.addRow();add('核对路线礼包','/初行服务 pack');add('补领选职武器','/初行服务 profession_weapon');
    buttons.addRow();add('返回委托板','/初行公会 委托板');
  }else if(area==='集结区'){
    md.addBlockquote((view.code==='world_tree'?'长桌上铺着地图，归来的冒险者擦去靴边的泥水，给空椅让出位置。有人将下一次出发的时刻写在纸上，招呼还在寻找同伴的旅人过来看看。':`你来到${view.hub.guildName}的集结区。有人摊开地图招呼同伴，有人对照队伍名册核实人数。桌边留出一处空位，供新来的冒险者写下打算前往的地方。`).replace(/\r?\n/g,'\n> '));
    buttons.addRow();add('我的队伍','/队伍');add('寻找队伍','/队伍列表');
    buttons.addRow();add('创建队伍','/组队 创建');add('加入队伍','/组队 加入 ',false);
    buttons.addRow();add('返回大厅','/初行公会');
  }else if(area==='后勤区'){
    md.addBlockquote('你沿侧廊来到后勤区。工台上摆着待检的工具，兽栏里备好了清水，接驳值守正核对出发名单。工匠抬手示意你避开地上的木屑，把通道让给运送补给的人。');
    buttons.addRow();add('随从兽栏','/初行公会 兽栏');add('工艺练习','/初行公会 工艺');
    buttons.addRow();add('安全接驳','/初行公会 接驳');
    buttons.addRow();add('返回大厅','/初行公会');
  }else if(area==='委托板'){
    md.addBlockquote((view.code==='world_tree'?'砾秋把被风卷起的委托单压平：“先看要求，再看报酬。初行的交接记录也放在这里，需要复习的，可以借旁边的教具。”':'委托单按日期钉在木框上，已完成的记录收在一旁。办事员留出一块干净桌面，供新来的冒险者核对初行奖励、练习旅途常识。').replace(/\r?\n/g,'\n> '));
    buttons.addRow();add('查看委托','/任务分类 委托');add('主线任务','/任务分类 主线');
    buttons.addRow();add('初行交接','/初行公会 礼包');add('入门教学','/初行公会 教学');
    buttons.addRow();add('返回大厅','/初行公会');
  }else if(area==='地图'){
    const credits=Object.fromEntries(view.services.map(s=>[String(s.code),Number(s.uses)]));
    md.addBlockquote('鉴物员展开公会周边的地图，把已知的魔物踪迹标在路旁：“先看清这段路通向哪里，再决定什么时候出发。”')
      .addNewline().addNewline().addText(`地图兑换额度：${credits.map_exchange??0} 张（低危地图／邻近城镇）。`).addNewline()
      .addText('低危：20级以下｜中危：20～50级｜高危：50级以上');
    for(const map of view.maps){
      const level=map.minLevel===null||map.maxLevel===null?'等级待勘测':map.minLevel===map.maxLevel?`Lv.${map.maxLevel}`:`Lv.${map.minLevel}～${map.maxLevel}`;
      md.addNewline().addNewline().addText(`【${map.regionName}】${map.risk}${map.safeTown?'':` · ${level}`}`).addNewline()
        .addBlockquote(map.description.replace(/\r?\n/g,'\n> ')).addNewline();
      if(map.codexId)md.addButton('[地图详情]',{data:`/物品图鉴 ${map.codexId}`,autoEnter:false});
      if(map.canExchange)md.addText(' ').addButton('[兑换地图]',{data:`/初行服务 map_exchange ${map.code}`,autoEnter:false});
    }
    if(!view.maps.length)md.addNewline().addNewline().addText('周边暂时没有已开放的地图资料。');
    buttons.addRow();add('初行见闻','/初行见闻');add('地图教学','/初行服务 lesson map');
    buttons.addRow();add('返回休息区','/初行公会 休息区');
  }else if(area==='工艺'){
    const credits=Object.fromEntries(view.services.map(s=>[String(s.code),Number(s.uses)]));
    md.addBlockquote('工匠收起锋利的工具，把练习用的木件放到桌边：“先认准榫口，再试着合上。做完还要摇一摇，看它站不站得稳。”').addNewline().addText(`工艺凭单练习：${credits.craft_practice??0} 次。`);
    buttons.addRow();add('工艺教学','/初行服务 lesson craft');add('凭单练习','/初行服务 craft_practice');
    buttons.addRow();add('返回后勤区','/初行公会 后勤区');
  }else if(area==='休息区'||area==='休息'){
    const credits=Object.fromEntries(view.services.map(s=>[String(s.code),Number(s.uses)]));
    md.addBlockquote('长椅旁备着温水，屏风挡住了大厅的喧闹。接引员替你留好行李的位置，让你安心歇一会儿。').addNewline().addText(`免费恢复 ${credits.arrival_recovery??0} 次｜初行救援减免 ${credits.pve_rescue??0} 次。`);
    buttons.addRow();add('人物交谈','/初行公会 人物');add('初行见闻','/初行见闻');
    buttons.addRow();add('地图资料','/初行公会 地图');add('免费恢复','/初行服务 recover');
    buttons.addRow();add('返回大厅','/初行公会');
  }else if(area==='兽栏'){
    md.addBlockquote((view.code==='world_tree'?'温槐先蹲下身，等伙伴自己靠近，才轻轻伸手。\n\n“先别催它做什么。让它知道留在你身边不会受伤，才谈得上同行。”':'契兽员将饮水放到低处，又给来访的伙伴留出能自行退开的空地。\n\n“名册不等于命令。让它愿意跟上你，才算结契。”').replace(/\r?\n/g,'\n> '));
    buttons.addRow();add('随从名册','/随从');add('契约教学','/初行服务 lesson contract');
    buttons.addRow();add('领取基础疗养','/初行服务 heal_companion');add('购买灵契饲料','/商店搜索 灵契饲料');
    buttons.addRow();add('返回后勤区','/初行公会 后勤区');
  }else if(area==='教学'){
    md.addBlockquote('公会把教具放在窗边。这里的练习不会刷出高等级野怪，也不要求你交出仅有的行装。');
    for(const lesson of guildLessons){buttons.addRow();add(lesson.title,`/初行服务 lesson ${lesson.code}`);}
    buttons.addRow();add('返回委托板','/初行公会 委托板');
  }else if(area==='接驳'){
    md.addBlockquote('值守把往返时刻牌转向你。接驳舱有完整护栏，沿受保护的线路往返安全落点。临时停航的目的地不会放行。');
    if(view.code==='world_tree')for(const[code,hub]of Object.entries(openingHubs)){if(['world_tree','baina_town'].includes(code)||code==='floating_leaf_town'&&!view.world.leaf_route_open)continue;buttons.addRow();add(hub.name,`/初行接驳 ${code}`);}
    else if(view.code!=='baina_town'){buttons.addRow();add('前往世界树','/初行接驳 world_tree');}
    else md.addNewline().addText('百纳镇与世界树的通行请向原有界门驿站办理。');
    buttons.addRow();add('返回后勤区','/初行公会 后勤区');
  }else{
    const scene=view.code==='world_tree'
      ?'叶脉透下的光，在木地板上缓缓移动。左侧柜台压着厚厚的登记册，归来的冒险者在长桌旁交换消息。餐厅小门半掩着，热汤的香气飘进大厅。维萝抬起头，替你指了指前台旁的空椅：“先坐。名字可以慢慢写。”'
      :view.hub.description;
    md.addBlockquote(scene);
    buttons.addRow();add('前往 前台','/初行公会 前台');add('前往 集结区','/初行公会 集结区');
    buttons.addRow();add('前往 悬赏板','/悬赏板');add('前往 委托板','/初行公会 委托板');
    buttons.addRow();add('前往 餐厅','/餐厅');add('前往 工会商店','/工会商店');
    buttons.addRow();add('前往 后勤区','/初行公会 后勤区');add('前往 休息区','/初行公会 休息区');
    buttons.addRow().addButton('离开 冒险者公会','/初行离会',{type:'command',autoEnter:true});
  }
  return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
export const openingGuildHandler=(mode:'view'|'enter'|'leave'|'service'|'keepsakes'|'transport'='view')=>async()=>{
  const[event]=useEvent();const[route]=useRoute();const[message]=useGameMessage();
  try{
    let returnArea=String(route.param('area')??'大厅');
    if(mode==='enter'||mode==='leave')await enterOpeningGuild(event.current.UserId,mode==='enter');
    if(mode==='service'){
      const action=String(route.param('action')),value=String(route.param('value')??'');
      const text=await openingGuildAction(event.current.UserId,action,value);
      if(action==='chat'){
        const person=rootGuildPeople.find(p=>p.code===value)!;const nearby=await nearbyPoints(event.current.UserId);
        const area=person.code==='root_guild_clerk'?'前台':person.role;
        await message.send({format:Format.create().addMarkdown(npcInteractionMarkdown(`冒险者公会·${area}`,person.name.split('·').at(-1)!,text,person.code,nearby.npcDetailsUnlocked))
          .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续闲聊',`/初行服务 chat ${person.code}`,{type:'command',autoEnter:true,style:'blue'}).addButton('返回休息区','/初行公会 休息区',{type:'command',autoEnter:true}))});return;
      }
      await message.send({format:openingGuildServiceFormat(text)});
      if(action==='meal'){await(await import('./guild-restaurant')).default();return;}
      const serviceAreas:Record<string,string>={pack:'礼包',profession_weapon:'礼包',map_exchange:'地图',craft_practice:'工艺',recover:'休息区',heal_companion:'兽栏'};
      const lessonAreas:Record<string,string>={contract:'兽栏',craft:'工艺',map:'地图'};
      returnArea=action==='lesson'?(lessonAreas[value]??'教学'):(serviceAreas[action]??'大厅');
    }
    if(mode==='transport'){
      const text=await openingTransport(event.current.UserId,String(route.param('destination')));
      await message.send({format:Format.create().addMarkdown(Format.createMarkdown().addTitle('安全接驳').addNewline().addNewline().addBlockquote(text.replace(/\r?\n/g,'\n> ')))});
      returnArea='接驳';
    }
    if(mode==='keepsakes'){
      const view=await openingKeepsakes(event.current.UserId);const md=Format.createMarkdown().addTitle('初行见闻·未解之事').addNewline().addNewline();
      for(const item of view.items){md.addText(`【${item.name}】${item.used?' · 本次服务已使用':''}`).addNewline().addBlockquote(`现在：${item.use}`).addNewline().addBlockquote(`未解之事：${item.future}`).addNewline();if(item.recordOnly)md.addButton('[人物资料]',{data:`/初行人物 ${item.route}`,autoEnter:false});else md.addButton('[查看经办窗口]',{data:`/初行凭物 ${item.code}`,autoEnter:false});md.addNewline().addNewline();}
      if(!view.items.length)md.addBlockquote('你还没有留下特殊凭物。一路遇见的人与事，会慢慢填满这本见闻。\n\n');
      for(const event of view.events)md.addBlockquote(`世界纪事：${event.text}`).addNewline();
      await message.send({format:Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回休息区','/初行公会 休息区',{type:'command',autoEnter:true}).addButton('继续剧情','/继续剧情',{type:'command',autoEnter:true}))});return;
    }
    await message.send({format:await openingGuildFormat(event.current.UserId,returnArea)});
  }catch(error){await message.send({format:messageFormat('公会',error instanceof Error?error.message:'请稍后再试。')});}
};
