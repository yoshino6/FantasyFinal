import { randomUUID } from 'node:crypto';
import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { automatonList, automatonRecipes, previewAutomatonCraft, confirmAutomatonCraft, previewAutomatonMutation, confirmAutomatonMutation, automatonCharacter, automatonFor } from '../game/automaton.service';
import { escapeAutomatonText } from '../game/automaton-dialogue';
import { acknowledgeAutomatonQuote, greetAutomaton, rateAutomatonQuote } from '../game/automaton-dialogue.service';
import { automatonSkills } from '../game/automaton-skill-catalog';
import { labels, cultivationRequired } from '../game/automaton-growth';
import { withTransaction } from '../database/pool';
import type { RowDataPacket } from 'mysql2/promise';
import { craftJson } from '../game/alchemy-journal.service';
import type { AutomatonBattleState } from '../game/automaton-combat';

const md=()=>Format.createMarkdown().addTitle('机巧').addNewline();
type Markdown=ReturnType<typeof md>;
const link=(m:Markdown,title:string,command:string)=>m.addButton(`[${title}]`,{data:command,autoEnter:false}).addText(' ');
const tabs=(m:Markdown)=>{link(m,'伙伴','/机巧');link(m,'造物','/机巧 造物');link(m,'育成','/机巧 育成');link(m,'炼金手记','/炼金手记');m.addNewline().addNewline();};
const back=(m:Markdown)=>{m.addNewline();link(m,'返回机巧','/机巧');return Format.create().addMarkdown(m);};
export default async()=>{
  const [event]=useEvent(),[route]=useRoute(),[message]=useMessage();
  const user=event.current.UserId,action=String(route.param('action')??''),id=Number(route.param('id'));
  const args=['a','b','c','d','e','f','g','h'].map(k=>route.param(k)).filter(v=>v!==undefined&&v!==null&&String(v)!=='').map(String);
  try{
    let format:ReturnType<typeof Format.create>;let quoteAck:number|undefined;
    const m=md();tabs(m);
    if(!action){
      const {items}=await automatonList(user);
      m.addText(`已认主 ${items.filter(p=>p.row.owner_id).length}/3｜最多一具随行`).addNewline();
      for(const {row,state} of items){m.addText(`#${row.id} ${escapeAutomatonText(state.name)} Lv.${state.level}｜${state.personality.coreName}｜${row.owner_id?row.following?'随行':'休眠':'未认主'}｜${row.bound_kind==='none'?'未绑定':'已绑定'}`).addNewline();
        link(m,'详情',`/机巧 详情 ${row.id}`);if(!row.owner_id)link(m,'认主',`/机巧 认主 ${row.id}`);else{link(m,row.following?'收起':'随行',`/机巧 ${row.following?'收起':'随行'} ${row.id}`);link(m,'打招呼',`/机巧 打招呼 ${row.id}`);}m.addNewline().addNewline();}
      if(!items.length)m.addText('解构师四级构造灵枢素体，炼金师四级点灵制造机巧人偶；所有职业均可认主与培养。');format=back(m);
    }else if(action==='造物'||action==='育成'){
      for(const recipe of automatonRecipes.filter(r=>action==='育成'?r.code.startsWith('automaton_feed_'):!r.code.startsWith('automaton_feed_'))){m.addText(`${recipe.name}｜${recipe.profession==='alchemist'?'炼金师':'解构师'}4级｜成功率${recipe.chance*100}%`).addNewline();m.addText(recipe.ingredients.map(p=>`${p.role} ${p.code}×${p.quantity}`).join('、')).addNewline();link(m,'放入配方',`/机巧 配方 0 ${recipe.code} 1`);m.addNewline().addNewline();}format=back(m);
    }else if(action==='配方'){
      const result=await previewAutomatonCraft(user,args[0]??'',Number(args[1]??1));m.addText(`${result.recipe.name} ×${result.batches} 批，成功率 ${result.recipe.chance*100}%`).addNewline();
      for(const i of result.ingredients)m.addText(`${i.role}：${i.name}×${i.quantity*result.batches}`).addNewline();
      m.addText(result.recipe.code==='automaton'?`成功全部消耗；失败只消耗天空粉尘×2。主线保留 ${result.reserved} 份。`:'成功或失败均消耗本批全部材料；失败无保底。').addNewline();link(m,'确认制造',`/机巧 制造确认 0 ${result.token}`);format=back(m);
    }else if(action==='制造确认'){
      const result=await confirmAutomatonCraft(user,args[0]??'');m.addText(result.text).addNewline();link(m,'继续尝试',`/机巧 配方 0 ${result.code} 1`);link(m,'查看手记',`/炼金手记详情 ${result.journalId}`);format=back(m);
    }else if(action==='确认'){
      const result=await confirmAutomatonMutation(user,args[0]??'');m.addText(result.text);format=back(m);
    }else if(action==='详情'||action==='技能'||action==='成长'||action==='设置'||action==='回忆'){
      const data=await automatonList(user),item=data.items.find(p=>Number(p.row.id)===id);if(!item)throw new Error('未找到你的机巧。');const {row,state}=item;
      m.addText(`${escapeAutomatonText(state.name)} #${id}｜Lv.${state.level}｜${state.personality.coreName}`).addNewline();
      if(action==='详情'){
        m.addText(state.personality.traits.map(t=>t.name).join('、')).addNewline().addText(`技能倾向：${state.personality.aligned.join('、')}`).addNewline();
        m.addText(`HP ${state.hp}/${Math.floor(state.stats[0]!)}｜MP ${state.mp}/${Math.floor(state.stats[1]!)}｜亲密 ${state.intimacy}/1000`).addNewline();
        state.stats.forEach((value,i)=>m.addText(`${labels[i]} ${Math.floor(value)}${i%3===2?'\n':'｜'}`));m.addNewline();
        m.addText(`培养进度 ${state.progress.reduce((s,c)=>s+c.xp,0)}/${cultivationRequired(state.level)}｜原液余额 ${state.reserve.reduce((s,c)=>s+c.xp,0)}`).addNewline();
        if(row.recover_at)m.addText(`恢复时间：${new Date(row.recover_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`).addNewline();
        for(const title of ['技能','成长','回忆','设置'])link(m,title,`/机巧 ${title} ${id}`);
        m.addNewline();link(m,'培养',`/机巧 培养 ${id} balanced 1`);link(m,'重调',`/机巧 重调 ${id} 2 ${state.level} blade`);link(m,'维修',`/机巧 维修 ${id}`);
      }else if(action==='技能'){
        for(const skillId of state.learned){const s=automatonSkills.find(s=>s.id===skillId)!;m.addText(`${state.equipped.includes(s.id)?'已装配':'待装配'} ${s.id} ${s.name}｜${s.cost}\n${s.description}`).addNewline().addNewline();}
        link(m,'修改装配',`/机巧 装配 ${id} ${state.equipped.join(' ')}`);link(m,'本回合指令',`/机巧 战斗指令 ${id} 普攻`);
      }else if(action==='成长'){
        const page=Math.max(1,Math.floor(Number(args[0]??1)||1)),pages=Math.max(1,Math.ceil(state.levels.length/5));
        for(const l of state.levels.slice((page-1)*5,page*5))m.addText(`Lv.${l.level}：${l.contributions.map(c=>`${c.code} ${c.xp}经验`).join('、')}\n${l.gain.map((v,i)=>`${labels[i]}+${v.toFixed(2)}`).join('｜')}`).addNewline().addNewline();
        link(m,'上一页',`/机巧 成长 ${id} ${Math.max(1,page-1)}`);m.addText(`${page}/${pages} `);link(m,'下一页',`/机巧 成长 ${id} ${Math.min(pages,page+1)}`);
      }else if(action==='设置'){
        m.addText(`称呼：${escapeAutomatonText(state.ownerAddress)}｜自称：${escapeAutomatonText(state.selfAddress)}｜策略：${state.strategy}\n公开语录：${state.publicQuotes?'开启':'关闭'}｜挡刀：${state.guard?'开启':'关闭'}`).addNewline();
        for(const [title,value] of [['命名',state.name],['称呼',state.ownerAddress],['自称',state.selfAddress],['策略',state.strategy],['挡刀',state.guard?'关闭':'开启'],['公开语录',state.publicQuotes?'关闭':'开启'],['问候',state.greeting?'关闭':'开启'],['语录','greeting 早安，{称呼}。'],['清除语录','greeting']]){link(m,title!,`/机巧 ${title} ${id} ${value}`);m.addNewline();}
      }else{
        if(!event.current.IsPrivate)m.addText('回忆默认私有，请在私密会话查看。');
        else{const rows=await withTransaction(async connection=>{await automatonCharacter(connection,user);const [rows]=await connection.execute<RowDataPacket[]>('SELECT kind,data_json,created_at FROM automaton_events WHERE automaton_id=? AND character_id=? ORDER BY id DESC LIMIT 20',[id,data.character.id]);return rows;});for(const r of rows)m.addText(`${new Date(r.created_at).toLocaleString('zh-CN')} ${r.kind}`).addNewline();}
      }
      format=back(m);
    }else if(action==='打招呼'){
      const result=await greetAutomaton(user,id,randomUUID(),Boolean(event.current.IsPrivate));m.addText(result.quote?escapeAutomatonText(result.quote.text):result.note);
      if(result.quote){quoteAck=result.quote.id;m.addNewline();link(m,'喜欢',`/机巧 喜欢 ${id} ${result.quote.id}`);link(m,'少说这类',`/机巧 不喜欢 ${id} ${result.quote.id}`);}format=back(m);
    }else if(action==='喜欢'||action==='不喜欢'){await rateAutomatonQuote(user,id,Number(args[0]),action==='喜欢');m.addText('已记录表达偏好，出生性格与技能倾向保持固定。');format=back(m);
    }else if(action==='战斗指令'){
      await withTransaction(async connection=>{const character=await automatonCharacter(connection,user);const {row}=await automatonFor(connection,character.id,id);if(!row.combat_id)throw new Error('机巧当前没有参战。');const [rows]=await connection.execute<RowDataPacket[]>('SELECT state_json FROM combat_automatons WHERE session_id=? AND automaton_id=? FOR UPDATE',[row.combat_id,id]);const battle=craftJson<AutomatonBattleState>(rows[0]?.state_json);if(!battle||battle.exited||!battle.pet.hp)throw new Error('本场机巧已退场。');const skill=args[0]??'';if(!['普攻','防御','待机',...battle.pet.equipped].includes(skill))throw new Error('只能选择已装配技能或普攻、防御、待机。');battle.manual=skill;await connection.execute('UPDATE combat_automatons SET state_json=? WHERE session_id=? AND automaton_id=?',[JSON.stringify(battle),row.combat_id,id]);});m.addText('已设置机巧下次独立行动指令。');format=back(m);
    }else{
      const result=await previewAutomatonMutation(user,id,action,args);m.addText(result.description).addNewline();link(m,'确认',`/机巧 确认 0 ${result.token}`);link(m,'取消',`/机巧 详情 ${id}`);format=back(m);
    }
    await message.send({format});if(quoteAck)await acknowledgeAutomatonQuote(quoteAck);
  }catch(error){await message.send({format:Format.create().addMarkdown(md().addText(error instanceof Error?error.message:'机巧操作失败，请稍后重试。'))});}
};
