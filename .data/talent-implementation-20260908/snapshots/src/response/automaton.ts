import { randomUUID } from 'node:crypto';
import { automatonMemoryKinds } from '../game/automaton-events';
import { Format, ResultCode, logger, useEvent, useRoute, useMessage as useRawMessage } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { automatonList, automatonEventPage, automatonRecipeCatalog, previewAutomatonCraft, confirmAutomatonCraft, previewAutomatonMutation, confirmAutomatonMutation, automatonCharacter } from '../game/automaton.service';
import { escapeAutomatonText, automatonInteractionText } from '../game/automaton-dialogue';
import { quoteForAutomatonMutation, acknowledgeAutomatonQuote, greetAutomaton, finishAutomatonMutationQuote } from '../game/automaton-dialogue.service';
import { automatonSkills } from '../game/automaton-skill-catalog';
import { labels, cultivationRequired } from '../game/automaton-growth';
import { withTransaction } from '../database/pool';
import { cancelCraftPreview, alchemyJournalDetail } from '../game/alchemy-journal.service';
import { automatonFeeds } from '../game/automaton-feeds';
import { previewAutomatonComponents, confirmAutomatonComponents } from '../game/automaton-construction.service';
import { assertAlchemyCreationUnlocked } from '../game/alchemy-creation-quest.service';
import { beginPortraitUpload, cancelPortraitUpload, portraitScope, resetPortrait, portraitReviewStatus } from '../game/automaton-portrait.service';
import { getAdminWebConfig } from '../config/admin-web';
import { portraitHeaderImage } from '../game/automaton-portrait-image';
import { cleanupPortrait } from '../game/automaton-portrait-upload';

const md=(title='机巧')=>Format.createMarkdown().addTitle(title).addNewline();
type Markdown=ReturnType<typeof md>;
const link=(m:Markdown,title:string,command:string)=>m.addButton(`[${title}]`,{data:command,autoEnter:false}).addText(' ');
const automatonHandler=async(alchemyMode=false)=>{
  const [event]=useEvent(),[route]=useRoute(),[message]=useMessage();
  const user=event.current.UserId,action=String(route.param('action')??'').replace(/^造物$/, '点灵'),id=Number(route.param('id'));
  const args=['a','b','c','d','e','f','g','h'].map(k=>route.param(k)).filter(v=>v!==undefined&&v!==null&&String(v)!=='').map(String);
  try{
    let format=Format.create();let interaction:{id:number;text:string;name:string}|undefined;let mutationToken:string|undefined;
    const pageTitles:Record<string,string>={详情:'机巧·详情',技能:'机巧·技能',成长:'机巧·成长',回忆:'机巧·回忆',选料:'机巧·培养',选人偶:'机巧·选择人偶',归档列表:'机巧·休眠归档'};
    const m=md(alchemyMode?(action==='点灵'||action==='育成'?`炼金·${action}`:'炼金'):(pageTitles[action]??'机巧')).addNewline();
    const craftPrefix=alchemyMode?'/炼金':'/机巧';
    const controls:{title:string;command:string;autoEnter:boolean}[]=[];
    const control=(title:string,command:string,autoEnter=true)=>controls.push({title,command,autoEnter});
    const paginate=(page:number,pages:number,command:(page:number)=>string)=>{
      m.addNewline().addText(`当前第（${page}/${pages}）页`).addNewline();
      control('上一页',command(Math.max(1,page-1)));control('下一页',command(Math.min(pages,page+1)));
    };
    const back=(m:Markdown)=>{
      if(alchemyMode)return Format.create().addMarkdown(m).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回炼金','/炼金',{type:'command',autoEnter:true}));
      const buttons=Format.createButtonGroup();
      for(let index=0;index<controls.length;index++){
        if(index%3===0)buttons.addRow();const button=controls[index]!;
        buttons.addButton(button.title,button.command,{type:'command',autoEnter:button.autoEnter,style:'blue'});
      }
      if(!action||action==='列表')return controls.length?Format.create().addMarkdown(m).addButtonGroup(buttons):Format.create().addMarkdown(m);
      buttons.addRow();
      if(Number.isSafeInteger(id)&&id>0&&!['列表','归档列表','选人偶','构件预览','构件确认','配方','制造确认','取消','确认','构造'].includes(action))buttons.addButton('返回详情',`/机巧 详情 ${id}`,{type:'command',autoEnter:true});
      buttons.addButton('返回机巧','/机巧',{type:'command',autoEnter:true});
      return Format.create().addMarkdown(m).addButtonGroup(buttons);
    };
    if(alchemyMode&&!['点灵','育成','配方','制造确认','取消'].includes(action))throw new Error('请选择「炼金 点灵」或「炼金 育成」。');
    if(!alchemyMode&&(action==='点灵'||action==='育成'))throw new Error('入口已迁移，请使用「炼金 '+action+'」。');
    if(alchemyMode&&action==='取消'&&args[1]!=='automaton_craft')throw new Error('只能取消本次炼金点灵或育成。');
    if(alchemyMode&&action!=='取消')await withTransaction(async connection=>{
      const character=await automatonCharacter(connection,user);await assertAlchemyCreationUnlocked(connection,character.id);
    });
    if(!action||action==='列表'||action==='归档列表'){
      const {items}=await automatonList(user);
      m.addBold(`已认主 ${items.filter(p=>p.row.owner_id).length}/3｜已跟随 ${items.filter(p=>p.row.owner_id&&p.row.following).length}/1`).addNewline().addNewline();
      const visible=items.filter(p=>Boolean(p.state.archived)===(action==='归档列表')),pages=Math.max(1,Math.ceil(visible.length/5)),page=Math.min(pages,Math.max(1,Math.floor(id)||1));
      for(const [index,{row,state}] of visible.slice((page-1)*5,page*5).entries()){m.addText(`${'①②③④⑤'[index]}${escapeAutomatonText(state.name)} Lv.${state.level}｜${row.owner_id?row.following?'已跟随':'已认主':'未认主'}｜${row.bound_kind==='none'?'未绑定':'已绑定'}`).addNewline();
        link(m,'详情',`/机巧 详情 ${row.id}`);if(!row.owner_id)link(m,'认主',`/机巧 认主 ${row.id}`);else{link(m,row.following?'收起':'随行',`/机巧 ${row.following?'收起':'随行'} ${row.id}`);link(m,'打招呼',`/机巧 打招呼 ${row.id}`);}m.addNewline().addNewline();}
      if(!visible.length)m.addText(action==='归档列表'?'暂无休眠归档的机巧。':'尚未拥有机巧。可以向其他玩家购买未认主人偶，再进行认主和培养。');
      if(pages>1)paginate(page,pages,p=>`/机巧 ${action==='归档列表'?'归档列表':'列表'} ${p}`);
      if(action!=='归档列表'&&items.some(p=>p.state.archived))control('休眠归档','/机巧 归档列表');format=back(m);
    }else if(action==='选人偶'){
      const {items}=await automatonList(user);const feed=automatonFeeds.find(f=>f.code===args[0]);if(!feed)throw new Error('请选择有效原液。');m.addText(`使用${feed.name}，请选择已认主机巧：`).addNewline();for(const {row,state} of items.filter(p=>p.row.owner_id))control(state.name,`/机巧 培养 ${row.id} ${feed.code} 1`,false);format=back(m);
    }else if(action==='选料'){
      const {items}=await automatonList(user),item=items.find(p=>Number(p.row.id)===id&&p.row.owner_id);if(!item)throw new Error('未找到已认主机巧。');
      m.addText(`培养 ${escapeAutomatonText(item.state.name)}，选择原液后可修改投入瓶数：`).addNewline();
      const pages=Math.ceil(automatonFeeds.length/5),page=Math.min(pages,Math.max(1,Math.floor(Number(args[0]))||1));
      for(const f of automatonFeeds.slice((page-1)*5,page*5)){m.addText(f.name).addNewline().addBlockquote(`均衡／物攻／魔攻／防御／灵巧：${f.vector.map(n=>Math.round(n*100)+'%').join('／')}`).addNewline().addNewline();control(f.name,`/机巧 培养 ${id} ${f.code} 1`,false);}
      control('使用余额',`/机巧 培养 ${id} 余额 50`,false);control('混合培养',`/机巧 培养 ${id} blade:2,shell:1 50`,false);
      paginate(page,pages,p=>`/机巧 选料 ${id} ${p}`);format=back(m);
    }else if(action==='点灵'||action==='育成'||action==='构造'){
      m.addNewline();
      for(const recipe of await automatonRecipeCatalog(user,action)){
        if(action==='构造'){
          m.addText(`${recipe.name}｜解构师4级｜成功率${recipe.chance*100}%`).addNewline();
          m.addText(recipe.ingredients.map(p=>`${p.role} ${p.name}×${p.quantity}（持有 ${p.owned}）`).join('、')).addNewline();
        }else{
          m.addText(`${recipe.name} `);
          link(m,'放入配方',`/炼金 配方 0 ${recipe.code} 1`);m.addNewline();
          for(const role of ['主材','辅材','催化剂']){
            const ingredients=recipe.ingredients.filter(p=>p.role===role);if(!ingredients.length)continue;
            m.addText('> ').addBold(role).addNewline();
            for(const part of ingredients)m.addText(`> ${part.name}（${part.owned}/${part.quantity}）`).addNewline();
          }
          m.addNewline();
        }
        if(action==='构造'){
          link(m,'放入配方',`/机巧 配方 0 ${recipe.code} 1`);
          link(m,'补齐构件','/机巧 构件预览 1');
        }
        m.addNewline().addNewline();
      }
      format=action==='构造'?back(m):Format.create().addMarkdown(m).addButtonGroup(Format.createButtonGroup().addRow()
        .addButton('返回机巧','/机巧',{type:'command',autoEnter:true}));
    }else if(action==='构件预览'){
      const result=await previewAutomatonComponents(user,id||1);m.addText(`补齐 ${result.bodies} 具素体的构件，优先使用已有基材与构件。`).addNewline().addText('投入：'+result.used.map(i=>`${i.name}×${i.count}`).join('、')).addNewline();
      if(result.missing.length)m.addText('仍缺少：'+result.missing.map(i=>`${i.name}×${i.count}`).join('、')).addNewline();else if(result.token){m.addText('前置构造：'+result.steps.map(i=>`${i.name}×${i.count}`).join('、')).addNewline();link(m,'确认补齐',`/机巧 构件确认 0 ${result.token}`);link(m,'取消',`/机巧 取消 0 ${result.token} automaton_components`);}else m.addText('所需构件已经齐全。');format=back(m);
    }else if(action==='构件确认'){
      m.addText((await confirmAutomatonComponents(user,args[0]??'')).text).addNewline();link(m,'合成素体','/机巧 配方 0 automaton_body 1');format=back(m);
    }else if(action==='配方'){
      const result=await previewAutomatonCraft(user,args[0]??'',Number(args[1]??1));
      if(result.recipe.profession==='alchemist'){
        const confirmation=md(result.recipe.code.startsWith('automaton_feed_')?'育成':'点灵').addNewline()
          .addText(`${result.recipe.name} ×${result.batches}｜成功率 ${Math.round(result.recipe.chance*100)}%`).addNewline().addNewline();
        for(const i of result.ingredients)confirmation.addBlockquote(`${i.role}：${i.name}（${result.owned[i.code]}/${i.quantity*result.batches}）`).addNewline();
        confirmation.addBlockquote(result.recipe.code==='automaton'?'成功全部消耗；失败只消耗天空粉尘×2。':'成功或失败均消耗本批全部材料；失败无保底。');
        format=Format.create().addMarkdown(confirmation).addButtonGroup(Format.createButtonGroup().addRow()
          .addButton('确认制造',`/炼金 制造确认 0 ${result.token}`,{type:'command',autoEnter:true,style:'blue'})
          .addButton('取消',`/炼金 取消 0 ${result.token} automaton_craft`,{type:'command',autoEnter:true})
          .addRow().addButton('返回炼金','/炼金',{type:'command',autoEnter:true}));
      }else{
        m.addText(`${result.recipe.name} ×${result.batches} 批，成功率 ${result.recipe.chance*100}%`).addNewline();
        for(const i of result.ingredients)m.addText(`${i.role}：${i.name}×${i.quantity*result.batches}`).addNewline();
        m.addText('成功或失败均消耗本批全部材料；失败无保底。').addNewline();link(m,'确认制造',`${craftPrefix} 制造确认 0 ${result.token}`);link(m,'取消',`${craftPrefix} 取消 0 ${result.token} automaton_craft`);format=back(m);
      }
    }else if(action==='制造确认'){
      const result=await confirmAutomatonCraft(user,args[0]??'');
      if(result.code==='automaton_body'){
        m.addText(result.text).addNewline();link(m,'继续尝试',`/机巧 配方 0 ${result.code} 1`);format=back(m);
      }else{
        const record=await alchemyJournalDetail(user,result.journalId),kind=result.code.startsWith('automaton_feed_')?'育成':'点灵';
        const successes=record.batches.filter(b=>b.success).length;
        const consumed=new Map<string,{name:string;quantity:number}>(),outputs=new Map<string,{name:string;quantity:number}>();
        for(const batch of record.batches){
          for(const item of batch.consumed??record.snapshot.ingredients){const previous=consumed.get(item.code);consumed.set(item.code,{name:item.name,quantity:(previous?.quantity??0)+item.quantity});}
          for(const item of batch.outputs){const code=item.code.startsWith('automaton_instance_')?'automaton':item.code,previous=outputs.get(code);outputs.set(code,{name:code==='automaton'?'机巧人偶·未认主':item.name,quantity:(previous?.quantity??0)+item.quantity});}
        }
        const resultMarkdown=md(`${kind}${successes===record.batches.length?'成功':successes?'完成':'失败'}`).addNewline()
          .addText(`消耗：${[...consumed.values()].map(i=>`${i.name}×${i.quantity}`).join('、')||'无'}`).addNewline()
          .addText(`获得：${[...outputs.values()].map(i=>`【${i.name}】${i.quantity>1?`×${i.quantity}`:''}`).join('、')||'无'}`);
        if(outputs.has('automaton'))resultMarkdown.addNewline().addText('可通过指令 ')
          .addButton('/机巧',{data:'/机巧',autoEnter:false}).addText(' 查看');
        if(record.batches.length>1)resultMarkdown.addNewline().addText(`本次 ${record.batches.length} 批，成功 ${successes}，失败 ${record.batches.length-successes}。`);
        format=Format.create().addMarkdown(resultMarkdown).addButtonGroup(Format.createButtonGroup().addRow()
          .addButton('继续尝试',`/炼金 配方 0 ${result.code} 1`,{type:'command',autoEnter:true,style:'blue'})
          .addButton('查看手记',`/炼金手记详情 ${result.journalId}`,{type:'command',autoEnter:true})
          .addRow().addButton(`返回 ${kind}`,`/炼金 ${kind}`,{type:'command',autoEnter:true}));
      }
    }else if(action==='确认'){
      mutationToken=args[0]??'';m.addText((await confirmAutomatonMutation(user,mutationToken)).text);format=back(m);
    }else if(action==='取消'){
      if(!['automaton_craft','automaton_mutate','automaton_components'].includes(args[1]!))throw new Error('确认类型无效。');await cancelCraftPreview(user,args[0]!,args[1]!);m.addText('已取消，未消耗材料。');format=back(m);
    }else if(action==='更换形象'){
      if(!getAdminWebConfig().enabled)throw new Error('机巧形象人工审核暂未开放。');
      const result=await beginPortraitUpload(user,portraitScope(event.current),id);
      m.addText(`请在2分钟内发送一张图片，作为〖${escapeAutomatonText(result.name)}〗的新形象。`).addNewline()
        .addText('支持静态 JPG、PNG、WebP，最大5 MB。禁止色情、赌博、毒品相关图片及真人照片；图片经管理员人工审核通过后生效。').addNewline();
      if(!event.current.IsPrivate)m.addText('请在当前群发送图片；群内未开启免@接收时，请在私聊重新点击“更换形象”后上传。').addNewline();
      control('取消上传',`/机巧 取消上传 ${id} ${result.token}`);format=back(m);
    }else if(action==='取消上传'){
      await cancelPortraitUpload(user,portraitScope(event.current),id,args[0]??'');m.addText('已取消本次上传，原形象保留。');format=back(m);
    }else if(action==='恢复形象'){
      const result=await resetPortrait(user,id);await cleanupPortrait(result.oldKey);for(const key of result.pendingKeys)await cleanupPortrait(key);m.addText('已恢复默认形象。');format=back(m);
    }else if(action==='详情'||action==='技能'||action==='成长'||action==='回忆'){
      const data=await automatonList(user),item=data.items.find(p=>Number(p.row.id)===id);if(!item)throw new Error('未找到你的机巧。');const {row,state}=item;
      const review=action==='详情'&&row.owner_id?await portraitReviewStatus(user,id):null;
      if(action==='详情'&&state.portrait?.url){
        const width=Math.min(360,state.portrait.width),height=Math.max(1,Math.round(state.portrait.height*width/state.portrait.width));
        m.addImage(state.portrait.url,{width,height}).addNewline().addNewline();
      }else if(action==='详情'&&state.portrait){
        try{
          const [rawMessage]=useRawMessage();
          const sent=await rawMessage.send({format:Format.create().addImage(await portraitHeaderImage(state.portrait.key))});
          if(sent.length&&sent.every(r=>r.code===ResultCode.Ok))m.clear();
        }catch(error){logger.warn({err:error},'机巧形象暂未显示，继续显示属性详情');}
      }
      m.addText(`${escapeAutomatonText(state.name)} #${id}｜Lv.${state.level} `);
      if(action==='详情'&&row.owner_id)link(m,'改名',`/机巧 命名 ${id} ${state.name}`);
      m.addNewline().addNewline();
      if(action==='详情'){
        const required=cultivationRequired(state.level),progress=state.progress.reduce((s,c)=>s+c.xp,0),ratio=state.level>=50?1:Math.min(1,Math.max(0,progress/required)),filled=Math.floor(ratio*10);
        m.addText(`${'▓'.repeat(filled)}${'░'.repeat(10-filled)} ${(ratio*100).toFixed(1)}%`).addNewline()
          .addText(state.level>=50?'培育度（已达上限）':`培育度（${progress}/${required}）`).addNewline().addNewline();
        const vitals=item.battle?.pet??state;
        m.addText(`HP ${vitals.hp}/${Math.floor(vitals.stats[0]!)}｜MP ${vitals.mp}/${Math.floor(vitals.stats[1]!)}`).addNewline();
        for(let index=0;index<labels.length;index+=2)m.addText(`${labels[index]} ${Math.floor(vitals.stats[index]!)}${index+1<labels.length?`｜${labels[index+1]} ${Math.floor(vitals.stats[index+1]!)}`:''}`).addNewline();
        if(item.battle)m.addNewline().addText(`本场有效等级 ${vitals.level}｜同步 ${item.battle.sync}/100｜${item.battle.exited?'已退出本场战斗':vitals.hp?'战斗中':'停机'}`).addNewline();
        if(row.recover_at)m.addText(`恢复时间：${new Date(row.recover_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`).addNewline();
        if(review?.status==='pending')m.addNewline().addText('新形象：等待人工审核，审核通过后生效。').addNewline();
        if(review?.status==='rejected')m.addNewline().addText('形象审核未通过：'+escapeAutomatonText(review.reason)).addNewline();
        const buttons=Format.createButtonGroup().addRow();
        for(const title of ['技能','成长','回忆'])buttons.addButton(title,`/机巧 ${title} ${id}`,{type:'command',autoEnter:true,style:'blue'});
        if(row.owner_id)buttons.addRow().addButton('培养',`/机巧 选料 ${id}`,{type:'command',autoEnter:true}).addButton('维修',`/机巧 维修 ${id}`,{type:'command',autoEnter:true});
        else buttons.addRow().addButton('认主',`/机巧 认主 ${id}`,{type:'command',autoEnter:true});
        if(row.owner_id){
          buttons.addRow().addButton('更换形象',`/机巧 更换形象 ${id}`,{type:'command',autoEnter:true});
          if(state.portrait||review?.status==='pending')buttons.addButton('恢复默认形象',`/机巧 恢复形象 ${id}`,{type:'command',autoEnter:true});
        }
        buttons.addRow().addButton('返回机巧','/机巧',{type:'command',autoEnter:true});
        format=Format.create().addMarkdown(m).addButtonGroup(buttons);
      }else if(action==='技能'){
        const pages=Math.max(1,Math.ceil(state.learned.length/5)),page=Math.min(pages,Math.max(1,Math.floor(Number(args[0]))||1));
        for(const skillId of state.learned.slice((page-1)*5,page*5)){const s=automatonSkills.find(s=>s.id===skillId);if(!s)continue;m.addText(`${state.equipped.includes(s.id)?'已装配':'待装配'}｜${s.name} ${s.id}`).addNewline().addBlockquote(`消耗：${s.cost}｜${s.description}`).addNewline().addNewline();}
        if(row.owner_id){control('修改装配',`/机巧 装配 ${id} ${state.equipped.join(' ')}`,false);}
        paginate(page,pages,p=>`/机巧 技能 ${id} ${p}`);
      }else if(action==='成长'){
        const pages=Math.max(1,Math.ceil(state.levels.length/3)),page=Math.min(pages,Math.max(1,Math.floor(Number(args[0]))||1));
        m.addText(`原液余额：${state.reserve.reduce((s,c)=>s+c.xp,0)} 经验`).addNewline().addNewline();
        if(!state.levels.length)m.addBlockquote('尚未产生升级记录。').addNewline();
        for(const l of state.levels.slice((page-1)*3,page*3)){
          m.addBold(`Lv.${l.level}`).addNewline().addBlockquote(l.contributions.map(c=>`${automatonFeeds.find(f=>f.code===c.code)?.name??'历史原液'} ${c.xp}经验`).join('、')).addNewline();
          for(let index=0;index<labels.length;index+=2)m.addBlockquote(`${labels[index]}+${l.gain[index]!.toFixed(2)}${index+1<labels.length?`｜${labels[index+1]}+${l.gain[index+1]!.toFixed(2)}`:''}`).addNewline();
          m.addNewline();
        }
        if(row.owner_id&&state.level>=2)control('回路重调',`/机巧 重调 ${id} 2 ${state.level} blade`,false);
        paginate(page,pages,p=>`/机巧 成长 ${id} ${p}`);
      }else{
        if(!event.current.IsPrivate)m.addText('回忆默认私有，请在私密会话查看。');
        else{
          const history=await automatonEventPage(user,id,Number(args[0]??1));const names=automatonMemoryKinds;
          m.addText('重大经历').addNewline();if(!history.events.length)m.addText('你们的共同经历正从这里开始。').addNewline();
          for(const e of history.events){m.addText(e.time.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'｜'+(names[e.kind]??e.kind)).addNewline().addText('当时：'+escapeAutomatonText(String(e.data.name??'名字未记录'))+(e.data.level?'｜达到 Lv.'+e.data.level:'')+(e.data.boss?'｜'+escapeAutomatonText(String(e.data.boss))+' Lv.'+e.data.bossLevel:'')+(e.kind==='命名'&&e.data.previousName?'｜原名：'+escapeAutomatonText(String(e.data.previousName)):'')+(e.data.stage?'｜'+escapeAutomatonText(String(e.data.stage))+' '+e.data.intimacy+'/1000':'')+(e.data.absenceDays?'｜分别 '+e.data.absenceDays+' 天':'')+(e.data.source?'｜'+escapeAutomatonText(String(e.data.source)):'')).addNewline();if(Array.isArray(e.data.skills)&&e.data.skills.length)m.addText('领悟：'+e.data.skills.map(id=>automatonSkills.find(s=>s.id===id)?.name??id).join('、')).addNewline();m.addNewline();}
          paginate(history.page,history.pages,p=>`/机巧 回忆 ${id} ${p}`);
        }
      }
      if(action!=='详情')format=back(m);
    }else if(action==='打招呼'){
      const result=await greetAutomaton(user,id,event.current.MessageId||randomUUID(),Boolean(event.current.IsPrivate));
      m.addText(result.quote?'你向人偶打了个招呼。':result.note);if(result.quote)interaction={...result.quote,name:result.name};format=back(m);
    }else{
      const result=await previewAutomatonMutation(user,id,action,args);
      if(['随行','收起','装配','命名','休眠归档','恢复展示'].includes(action)){
        mutationToken=result.token;m.addText((await confirmAutomatonMutation(user,result.token)).text);
      }else{
        m.addText(result.description).addNewline();control('确认',`/机巧 确认 ${id} ${result.token}`);control('取消',`/机巧 取消 ${id} ${result.token} automaton_mutate`);
      }
      format=back(m);
    }
    const results=await message.send({format});
    if(results.length&&results.every(r=>r.code===ResultCode.Ok)){
      try{
        const mutationQuote=mutationToken?await quoteForAutomatonMutation(user,mutationToken,Boolean(event.current.IsPrivate)):null;
        const quote=mutationQuote??interaction;
        if(quote){
          const reply=Format.create().addMarkdown(Format.createMarkdown().addText(automatonInteractionText(quote.name,quote.text)));
          const sent=await message.send({format:reply});
          if(sent.length&&sent.every(r=>r.code===ResultCode.Ok)){
            if(mutationQuote)await finishAutomatonMutationQuote(mutationQuote,true);else await acknowledgeAutomatonQuote(quote.id);
          }else if(mutationQuote&&sent.length&&sent.every(r=>r.code!==ResultCode.Ok))await finishAutomatonMutationQuote(mutationQuote,false);
        }
      }catch(error){logger.warn({err:error},'机巧操作已完成，互动消息暂未送达');}
    }
  }catch(error){await message.send({format:Format.create().addMarkdown(md(alchemyMode?'炼金':'机巧').addText(error instanceof Error?error.message:'操作失败，请稍后重试。'))});}
};

export default async()=>automatonHandler();
export const alchemyCraftHandler=async()=>automatonHandler(true);
