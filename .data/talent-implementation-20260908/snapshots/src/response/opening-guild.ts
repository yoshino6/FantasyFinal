import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage } from '../game/use-game-message';
import { messageFormat, npcInteractionMarkdown } from '../game/message';
import { enterOpeningGuild, openingGuildView, openingGuildAction, openingKeepsakes, openingTransport } from '../game/opening-guild.service';
import { rootGuildPeople, guildLessons } from '../game/opening-guild.config';
import { nearbyPoints } from '../game/adventure.service';
import { openingHubs } from '../game/opening-world.config';

export const openingGuildFormat=async(user:string,area='大厅')=>{
  const view=await openingGuildView(user);const md=Format.createMarkdown().addTitle(`${view.hub.name}·${view.hub.guildName}`).addNewline().addNewline();const buttons=Format.createButtonGroup();
  const add=(label:string,command:string,autoEnter=true)=>buttons.addButton(label,command,{type:'command',autoEnter,style:'blue'});
  if(!view.at){
    md.addText(`公会入口位于（${view.place.pos_x}，${view.place.pos_y}，${view.place.pos_z}）。\n\n办事员与补给都在柜台等候，请先抵达入口。`);
    buttons.addRow();add('前往公会',`/前往 ${view.place.pos_x} ${view.place.pos_y}`);add('查看地图','/地图');
  }else if(!view.inside){
    md.addText(view.code==='world_tree'?'巨根在前方分开，托起一座挂满风铃的木厅。公会徽记被新生枝条稳稳托住。\n\n岑渡扶住木门，等抱着药箱的小树灵先过去，才转向你。\n\n“找工作、问路，或者只是刚走出一段不太好的路，都可以进去。”':view.hub.description);
    buttons.addRow();add('进入公会','/初行入会');add('查看附近','/面板');
  }else if(area==='前台'){
    return (await import('./adventure')).guildFrontDeskFormat(user);
  }else if(area==='人物'){
    md.addText(view.hub.description);
    if(view.code==='world_tree')for(const [index,person] of rootGuildPeople.entries()){md.addNewline().addNewline().addText(`${person.name} · ${person.role}`);if(index%2===0)buttons.addRow();add(person.name.split('·').at(-1)!,`/初行服务 chat ${person.code}`);}
    else md.addNewline().addNewline().addText(`“${view.code==='sleepwhale_market'?'请慢慢看，停在柜台前也不会按分钟收费。':view.code==='frost_dragon_inn'?'我已经把结实的椅子摆好了。别急，尾巴也给你们让开。':view.code==='floating_leaf_town'?'云上也有人会迷路，不必为了刚到这里而难为情。':view.code==='snowlamp_hollow'?'手暖起来，字也会写得顺些。': '欢迎回来，需要什么帮助？'}”`);
    buttons.addRow();add('返回大厅','/初行公会');
  }else if(area==='礼包'){
    const credits=Object.fromEntries(view.services.map(s=>[String(s.code),Number(s.uses)]));
    md.addText(`接引员将你的路线记录和服务凭据放在一起。\n\n补给抵扣 ${credits.supplies??0} 铜币｜低危地图 ${credits.map_exchange??0} 张\n免费工艺练习 ${credits.craft_practice??0} 次｜随从疗养 ${credits.companion_care??0} 次\n初行救援 ${credits.pve_rescue??0} 次`);
    for(const map of view.maps)md.addNewline().addButton(`[兑换${map.name}]`,{data:`/初行服务 map_exchange ${map.code}`,autoEnter:false});
    buttons.addRow();add('核对路线礼包','/初行服务 pack');add('补领选职武器','/初行服务 profession_weapon');
    buttons.addRow();add('工艺凭单练习','/初行服务 craft_practice');add('随从疗养','/初行服务 heal_companion');
    buttons.addRow();add('兑换补给券','/初行服务 coupon opening_trade_coupon');add('兑换急救券','/初行服务 coupon opening_medical_coupon');
    buttons.addRow();add('返回大厅','/初行公会');
  }else if(area==='兽栏'){
    md.addText(view.code==='world_tree'?'温槐先蹲下身，等伙伴自己靠近，才轻轻伸手。\n\n“先别催它做什么。让它知道留在你身边不会受伤，才谈得上同行。”':'契兽员将饮水放到低处，又给来访的伙伴留出能自行退开的空地。\n\n“名册不等于命令。让它愿意跟上你，才算结契。”');
    buttons.addRow();add('随从名册','/随从');add('契约教学','/初行服务 lesson contract');
    buttons.addRow();add('领取基础疗养','/初行服务 heal_companion');add('返回大厅','/初行公会');
    buttons.addRow();add('购买灵契饲料','/商店搜索 灵契饲料');
  }else if(area==='教学'){
    md.addText('公会把教具放在窗边。这里的练习不会刷出高等级野怪，也不要求你交出仅有的行装。');
    for(const lesson of guildLessons){buttons.addRow();add(lesson.title,`/初行服务 lesson ${lesson.code}`);}
    buttons.addRow();add('返回大厅','/初行公会');
  }else if(area==='接驳'){
    md.addText('值守把往返时刻牌转向你。接驳舱有完整护栏，沿受保护的线路往返安全落点。临时停航的目的地不会放行。');
    if(view.code==='world_tree')for(const[code,hub]of Object.entries(openingHubs)){if(['world_tree','baina_town'].includes(code)||code==='floating_leaf_town'&&!view.world.leaf_route_open)continue;buttons.addRow();add(hub.name,`/初行接驳 ${code}`);}
    else if(view.code!=='baina_town'){buttons.addRow();add('返回世界树','/初行接驳 world_tree');}
    else md.addNewline().addText('百纳镇与世界树的通行请向原有界门驿站办理。');
    buttons.addRow();add('返回大厅','/初行公会');
  }else if(view.code==='world_tree'){
    const scene=area==='集结区'
      ?'你来到根冠分会的集结区。长桌上铺着尚未卷起的地图，归来的冒险者正擦去靴边的泥水；有人给空椅让出位置，也有人压低声音，商量下一趟结伴出发的时间。'
      :area==='委托板'
        ?'你来到根冠分会的委托板前。木框上钉着按日期整理的委托单，砾秋把一张被风卷起的纸角压平：“先看清要求，再看报酬。看不明白的地方，就来问我。”'
        :'叶脉透下的光，在木地板上缓缓移动。左侧柜台压着厚厚的登记册，归来的冒险者在长桌旁交换消息。餐厅小门半掩着，热汤的香气飘进大厅。维萝抬起头，替你指了指前台旁的空椅：“先坐。名字可以慢慢写。”';
    md.addBlockquote(scene);
    buttons.addRow();add('前往 前台','/初行公会 前台');add('前往 集结区','/初行公会 集结区');
    buttons.addRow();add('前往 悬赏板','/悬赏板');add('前往 委托板','/初行公会 委托板');
    buttons.addRow();add('前往 餐厅','/餐厅');add('前往 工会商店','/工会商店');
    buttons.addRow().addButton('离开 冒险者公会','/初行离会',{type:'command',autoEnter:true});
  }else{
    md.addText(view.hub.description);
    const credits=Object.fromEntries(view.services.map(s=>[String(s.code),Number(s.uses)]));md.addNewline().addNewline().addText(`免费热食 ${credits.meal??0} 份｜恢复 ${credits.arrival_recovery??0} 次｜普通维修 ${credits.repair??0} 次`);
    if(area==='次页'){
      buttons.addRow();add('见闻与地图','/初行见闻');add('随从兽栏','/初行公会 兽栏');
      buttons.addRow();add('人物交谈','/初行公会 人物');add('安全接驳','/初行公会 接驳');
      buttons.addRow();add('免费恢复','/初行服务 recover');add('普通维修','/初行服务 repair ',false);
      buttons.addRow();add('上一页','/初行公会');add('离开公会','/初行离会');
    }else{
      buttons.addRow();add('前往 前台','/初行公会 前台');add('职业指引','/职业选择');
      buttons.addRow();add('委托与教学','/初行公会 教学');add('公会商店','/商店购买页 1');
      buttons.addRow();add('领取基础热食','/初行服务 meal');add('餐厅菜单','/餐厅菜单');
      buttons.addRow();add('下一页','/初行公会 次页');add('礼包与凭单','/初行公会 礼包');
    }
  }
  return Format.create().addMarkdown(md).addButtonGroup(buttons);
};
export const openingGuildHandler=(mode:'view'|'enter'|'leave'|'service'|'keepsakes'|'transport'='view')=>async()=>{
  const[event]=useEvent();const[route]=useRoute();const[message]=useGameMessage();
  try{
    if(mode==='enter'||mode==='leave')await enterOpeningGuild(event.current.UserId,mode==='enter');
    if(mode==='service'){
      const action=String(route.param('action')),value=String(route.param('value')??'');
      const text=await openingGuildAction(event.current.UserId,action,value);
      if(action==='chat'){
        const person=rootGuildPeople.find(p=>p.code===value)!;const nearby=await nearbyPoints(event.current.UserId);
        const area=person.code==='root_guild_clerk'?'前台':person.role;
        await message.send({format:Format.create().addMarkdown(npcInteractionMarkdown(`冒险者公会·${area}`,person.name.split('·').at(-1)!,text,person.code,nearby.npcDetailsUnlocked))
          .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续闲聊',`/初行服务 chat ${person.code}`,{type:'command',autoEnter:true,style:'blue'}).addButton('返回公会大厅','/初行公会',{type:'command',autoEnter:true}))});return;
      }
      await message.send({format:messageFormat('公会交接',text)});
    }
    if(mode==='transport')await message.send({format:messageFormat('安全接驳',await openingTransport(event.current.UserId,String(route.param('destination'))))});
    if(mode==='keepsakes'){
      const view=await openingKeepsakes(event.current.UserId);const md=Format.createMarkdown().addTitle('初行见闻·未解之事').addNewline().addNewline();
      for(const item of view.items)md.addText(`【${item.name}】${item.used?' · 本次服务已使用':''}`).addNewline().addBlockquote(`现在：${item.use}`).addNewline().addBlockquote(`未解之事：${item.future}`).addNewline().addButton('[查看经办窗口]',{data:`/初行凭物 ${item.code}`,autoEnter:false}).addNewline().addNewline();
      if(!view.items.length)md.addText('你还没有留下特殊凭物。一路遇见的人与事，会慢慢填满这本见闻。\n\n');
      for(const event of view.events)md.addBlockquote(`世界纪事：${event.text}`).addNewline();
      await message.send({format:Format.create().addMarkdown(md).addButtonGroup(Format.createButtonGroup().addRow().addButton('前往公会','/初行公会',{type:'command',autoEnter:true}).addButton('继续剧情','/继续剧情',{type:'command',autoEnter:true}))});return;
    }
    await message.send({format:await openingGuildFormat(event.current.UserId,String(route.param('area')??'大厅'))});
  }catch(error){await message.send({format:messageFormat('公会',error instanceof Error?error.message:'请稍后再试。')});}
};
