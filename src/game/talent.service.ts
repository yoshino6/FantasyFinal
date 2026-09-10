import { achievementNpcState } from './achievement-hooks';
import { achievementSecondaryLevel } from './achievement-hooks';
import { recordAchievement } from './achievement-events';
import { talentOptions } from './talent-options.service';
import { rollTalentDropPack } from './talent-drops';
import { talentPreparationSkills, talentTransferEffects } from './talent-battle.service';
import { talentActivity, talentActivityActions, talentNpcLinks } from './talent-activities';
import { isTalentProduct } from './talent-production';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { assertCombatLoadoutMutable } from './combat-loadout-lock.service';
import { ownedTalent, emptyTalentData, readTalentData, saveTalentData, talentDay, type TalentData } from './talent-data';
import { secondaryProfessionMaxLevel, secondaryProfessionProficiencyRequired } from './secondary-profession';
import { grantInventory, consumeInventory } from './inventory-binding';
import { talentNpcAffinity } from './talent-rewards';
import type { TalentDefinition } from './talent.config';
import { residentSkillByCode } from './resident-skill.config';

export type TalentView={name:string;description:string;revision:number;text:string;jobs:{id:string;kind:string;remaining:number;detail?:string}[];commands:string[];commandLabels?:Record<string,string>};
const settings:Record<string,{id:string;key:string;values?:string[]}>= {
  险采:{id:'H06',key:'riskGather',values:['开启','关闭']},孤注制作:{id:'H09',key:'riskCraft',values:['开启','关闭']},
  来信:{id:'I03',key:'previewDrops',values:['开启','关闭']},封存:{id:'I08',key:'sealGather',values:['开启','关闭']},倒置:{id:'I09',key:'invertPotion',values:['开启','关闭']},
  星相:{id:'G10',key:'phase',values:['星辉','星隐']},温和:{id:'D07',key:'peaceOpening',values:['开启','关闭']},
  降服:{id:'I10',key:'pacify',values:['开启','关闭']},返程:{id:'B10',key:'returning',values:['开启','关闭']},
  借位:{id:'I07',key:'transferBuff'},预备:{id:'I04',key:'prepareSkill'},指挥:{id:'A10',key:'command'},借材:{id:'I02',key:'substitute',values:['开启','关闭']}
};
const commandsFor=(talent:TalentDefinition)=>{
  const commands=Object.entries(settings).filter(([,s])=>s.id===talent.number).flatMap(([label,s])=>(s.values??(label==='预备'?talentPreparationSkills:[])).map(value=>`设置 ${label} ${value}`));
  if(talent.number==='A10')commands.push('选择 指挥');
  if(talent.number==='I07')commands.push('选择 借位');
  commands.push('勘察','调查 废墟','调查 机关','购买种子','种植');
  if(talent.number==='I06')commands.push('选择 无名拜访');
  if(talent.number==='G06')commands.push('月露');
  if(talent.number==='D05')commands.push('选择 分享料理');
  if(talent.number==='I07')commands.push('选择 投影');
  if(talent.number==='D10')commands.push('选择 同心');
  if(talent.number==='C04')commands.push('选择 旁通');
  if(talent.number==='C10')commands.push('暂停复盘','选择 舍弃复盘','舍弃新复盘','收录新复盘');
  commands.push('选择 赠礼','选择 共餐','选择 委托');
  if(talent.number==='D06')commands.push('选择 引荐');
  if(talent.number==='D04')commands.push('选择 立约委托');
  if(talent.number==='D09')commands.push('人物索引');
  return commands;
};
const view=async(connection:PoolConnection,actor:Record<string,any>,talent:TalentDefinition,text=''):Promise<TalentView>=>{
  const data=await readTalentData(connection,Number(actor.id));
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT revision FROM player_talent_state WHERE character_id=?',[actor.id]);
  const codes=[...new Set<string>(data.jobs.filter(j=>j.kind==='letter').flatMap(j=>j.payload.preview.map((o:any)=>String(o.code))))];
  const [items]=codes.length?await connection.execute<RowDataPacket[]>(`SELECT code,name FROM item_definitions WHERE code IN (${codes.map(()=>'?').join(',')})`,codes):[[]];
  const names=new Map(items.map(i=>[String(i.code),String(i.name)] as const)),notes:string[]=[];
  if(talent.number==='C03'&&data.flags.experienceNotice)notes.push(String(data.flags.experienceNotice));
  if(talent.number==='C04')notes.push('成功换配方熟练度×4；首次或连续同配方×1.5。旧版旁通点不再生成，可投入当前副职业；满级未用余额保留。');
  if(talent.number==='C10'&&data.flags.reviewOverflow)notes.push(`待选择的新复盘：${data.flags.reviewOverflow.kind==='experience'?'角色经验':'副职业熟练度'} ${data.flags.reviewOverflow.amount}。请选择舍弃旧记录以收录它，或舍弃新记录；记录不会自动覆盖。`);
  for(const [label,setting] of Object.entries(settings).filter(([,setting])=>setting.id===talent.number)){
    const value=data.settings[setting.key];notes.push(`${label}：${typeof value==='boolean'?(value?'开启':'关闭'):value===undefined?'未设置':['指挥','借位'].includes(label)?'已指定（可在下方重新选择）':residentSkillByCode(String(value))?.name??value}`);
  }
  if(talent.number==='C04')for(const [key,amount] of Object.entries(data.counters).filter(([key])=>key.startsWith('cross:')))notes.push(`${({blacksmith:'锻造',alchemist:'炼金',deconstructor:'分解',enchanter:'附魔'} as Record<string,string>)[key.slice(6)]??'副职业'}旁通点：${amount}`);
  if(talent.number==='F08'){
    const entries=Object.entries(data.flags).filter(([key])=>key.startsWith('preference:'));
    const monsters=[...new Set(entries.map(([key])=>key.split(':')[1]!))];
    const [known]=monsters.length?await connection.execute<RowDataPacket[]>(`SELECT code,name FROM monster_templates WHERE code IN (${monsters.map(()=>'?').join(',')})`,monsters):[[]];
    const monsterNames=new Map(known.map(row=>[String(row.code),String(row.name)] as const));
    for(const [key,preference] of entries){const [,code,subtype]=key.split(':');notes.push(`喜好笔记·${monsterNames.get(code!)??'已接触的怪物'}：${subtype}—${({like:'喜欢',neutral:'中立',dislike:'不喜欢'} as Record<string,string>)[String(preference)]??'尚未确认'}`);}
  }
  if(talent.number==='D06'){
    const [npcs]=await connection.execute<RowDataPacket[]>('SELECT code,name FROM map_npcs');const npcNames=new Map(npcs.map(n=>[String(n.code),String(n.name)]));
    for(const [from,to] of Object.entries(talentNpcLinks))notes.push(`${npcNames.get(from)??from}可引荐：${to.map(code=>npcNames.get(code)??code).join('、')}`);
  }
  const commands=commandsFor(talent),commandLabels=Object.fromEntries(commands.map(command=>[command,command.replace(/^选择 /,'').replace(/resident_[a-z]\d{2}/g,code=>residentSkillByCode(code)?.name??code)]));
  return{name:talent.name,description:talent.description,revision:Number(rows[0]?.revision??0),text:[text,...notes].filter(Boolean).join('\n'),jobs:data.jobs.map(j=>({id:j.id,kind:j.kind,detail:j.kind==='review'?`${j.payload.kind==='experience'?'角色经验':'副职业熟练度'} ${j.payload.amount}；复盘${j.payload.workSeconds}秒`:j.kind==='letter'?(j.payload.preview.map((o:any)=>`${names.get(o.code)??'物品'}×${o.quantity}`).join('、')||'空包'):undefined,remaining:Math.max(0,Math.ceil((j.ready-Date.now())/1000))})),commands,commandLabels};
};
const active=async(connection:PoolConnection,actor:Record<string,any>,allowRest=false)=>{
  await assertCombatLoadoutMutable(connection,Number(actor.id));
  const [busy]=await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_travels WHERE character_id=? UNION ALL SELECT 1 FROM player_resource_mining WHERE character_id=?',[actor.id,actor.id]);
  if(busy.length||Number(actor.current_hp)<=0||(!allowRest&&actor.activity_status!=='active'))throw new Error('请先结束移动、开采、休息或其他活动。');
};
const localNpc=async(connection:PoolConnection,actor:Record<string,any>,code:string)=>{
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT * FROM map_npcs WHERE code=? AND region_id=? AND pos_x=? AND pos_y=? AND pos_z=?',[code,actor.current_region_id,actor.pos_x,actor.pos_y,actor.pos_z]);
  if(!rows[0])throw new Error('请先前往这名已公开NPC所在坐标。');return rows[0];
};
export const grantTalentProficiency = async(connection:PoolConnection,id:number,profession:string,amount:number)=>{
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code=? FOR UPDATE',[id,profession]);
  if(!rows[0])throw new Error('尚未解锁该副职业。');
  let level=Number(rows[0].level),xp=Number(rows[0].proficiency);
  if(level>=secondaryProfessionMaxLevel)throw new Error('该副职业已经满级。');
  let room=-xp;for(let cursor=level;cursor<secondaryProfessionMaxLevel;cursor++)room+=secondaryProfessionProficiencyRequired(cursor);
  const granted=Math.min(Math.max(0,room),Math.max(0,Math.floor(amount)));
  xp+=granted;while(level<secondaryProfessionMaxLevel&&xp>=secondaryProfessionProficiencyRequired(level)){xp-=secondaryProfessionProficiencyRequired(level);level++;}
  await connection.execute('UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=? AND profession_code=?',[level,level>=secondaryProfessionMaxLevel?0:xp,id,profession]);
  achievementSecondaryLevel(connection,Number(id),level);
  return granted;
};

/** Every mutation has an owner lock and a revision-specific replay result. */
export const talentActionWithConnection=async(connection:PoolConnection,user:string,revision?:number,action='状态',arg='',value='')=>{
  const [actors]=await connection.execute<RowDataPacket[]>('SELECT c.* FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND c.npc_code IS NULL FOR UPDATE',[user]);
  const actor=actors[0];if(!actor)throw new Error('请先完成角色创建。');const id=Number(actor.id),talent=await ownedTalent(connection,id);
  if(!talent)throw new Error('当前角色没有本期初始天赋。');
  await connection.execute('INSERT IGNORE INTO player_talent_state(character_id,data_json) VALUES (?,?)',[id,JSON.stringify(emptyTalentData())]);
  if(action==='状态')return view(connection,actor,talent);
  if(action==='选择'){
    if(!commandsFor(talent).includes(`选择 ${arg}`))throw new Error('这不是当前天赋的可选操作。');
    const options=await talentOptions(connection,actor,await readTalentData(connection,id),arg,value);
    const panel=await view(connection,actor,talent);
    return {...panel,text:options.text,jobs:[],commands:options.options.map(o=>o.command),commandLabels:Object.fromEntries(options.options.map(o=>[o.command,o.label]))};
  }
  const eventKey=`action:${revision}:${action}:${arg}:${value}`;if(eventKey.length>160)throw new Error('指令参数过长。');
  const [prior]=await connection.execute<RowDataPacket[]>('SELECT result_json FROM player_talent_events WHERE character_id=? AND event_key=?',[id,eventKey]);
  if(prior[0])return (typeof prior[0].result_json==='string'?JSON.parse(prior[0].result_json):prior[0].result_json) as TalentView;
  const [versions]=await connection.execute<RowDataPacket[]>('SELECT revision FROM player_talent_state WHERE character_id=? FOR UPDATE',[id]);
  if(!Number.isSafeInteger(revision)||revision!==Number(versions[0].revision))throw new Error('天赋状态已变化，请用 /天赋 刷新后再操作。');
  let data=await readTalentData(connection,id),text='';
  if(action==='设置'){
    const setting=settings[arg];if(!setting||setting.id!==talent.number)throw new Error('这不是当前天赋的可选效果。');await active(connection,actor);
    if(setting.values&&!setting.values.includes(value))throw new Error(`请选择：${setting.values.join('、')}。`);
    if(arg==='预备'){
      if(!talentPreparationSkills.includes(value))throw new Error(`可预备技能：${talentPreparationSkills.map(code=>residentSkillByCode(code)?.name??code).join('、')}`);
      const [owned]=await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code=?',[id,value]);if(!owned.length)throw new Error('尚未学会这个技能。');
    }
    if(arg==='借位'&&!talentTransferEffects.some(code=>new RegExp(`^${code}:member:[1-9][0-9]*$`).test(value)))throw new Error('格式：普通增益代码:member:队友编号。');
    if(arg==='指挥'&&!/^(automaton|companion|spirit):[a-zA-Z0-9_]+$/.test(value))throw new Error('请填写 automaton:编号 或 companion:编号；入战时再核验所属关系。');
    data.settings[setting.key]=value==='开启'?true:value==='关闭'?false:value;text=['指挥','借位','预备'].includes(arg)?`已设置${arg}。`:`已设置${arg}：${value}。`;
  }else if(talentActivityActions.includes(action)){
    await active(connection,actor,['完成调查','取消调查'].includes(action));
    text=await talentActivity(connection,actor,talent,data,action,arg,value);
  }else if(action==='同心'){
    if(talent.number!=='D10')throw new Error('需要同心结天赋。');await active(connection,actor);
    if(Number(data.flags.companionChangeAt??0)>Date.now())throw new Error('更换同心对象的7天冷却尚未结束。');
    const [pets]=await connection.execute<RowDataPacket[]>('SELECT id FROM player_companions WHERE id=? AND character_id=? AND released_at IS NULL',[Number(arg),id]);if(!pets.length)throw new Error('没有这个随从。');
    data.settings.companion=Number(arg);data.flags.companionChangeAt=Date.now()+7*86400000;text='同心结已经缔结。';
  }else if(action==='月露'){
    if(talent.number!=='G06')throw new Error('需要太阴玄体。');await active(connection,actor,true);if(actor.activity_status!=='resting')throw new Error('请先开始休息。');
    if(Number(data.flags.moonAt??0)>Date.now())throw new Error('月露尚未凝结。');
    const amount=Math.min(Number(actor.mp_max)-Number(actor.current_mp),Math.floor(Number(actor.mp_max)*.3));if(amount<=0)throw new Error('魔力已满。');
    await connection.execute('UPDATE characters SET current_mp=current_mp+? WHERE id=?',[amount,id]);data.flags.moonAt=Date.now()+600000;text=`月露恢复${amount} MP。`;
  }else if(action==='旁通'){
    if(talent.number!=='C04')throw new Error('需要触类旁通。');await active(connection,actor);
    const amount=Number(value);if(arg!==actor.secondary_profession_code)throw new Error('旧旁通点只能投入当前副职业。');
    if(!Number.isSafeInteger(amount)||amount<=0||amount>Object.entries(data.counters).filter(([key])=>key.startsWith('cross:')).reduce((sum,[,n])=>sum+n,0))throw new Error('旧旁通点不足或投入数量无效。');
    const granted=await grantTalentProficiency(connection,id,arg,amount);let remaining=granted;for(const key of Object.keys(data.counters).filter(key=>key.startsWith('cross:'))){const used=Math.min(remaining,data.counters[key]!);data.counters[key]-=used;remaining-=used;}text=`旁通${granted}点熟练度。${granted<amount?'目标已满级，未投入的旁通点仍保留。':''}`;
  }else if(action==='舍弃新复盘'||action==='收录新复盘'){
    if(talent.number!=='C10'||!data.flags.reviewOverflow)throw new Error('没有待选择的新复盘记录。');
    if(action==='收录新复盘'){
      if(data.jobs.filter(j=>j.kind==='review').length>=3)throw new Error('请先完成或舍弃一条旧复盘，最多同时保留3条。');
      data.jobs.push({id:randomUUID(),kind:'review',created:Date.now(),ready:0,payload:data.flags.reviewOverflow});
    }
    delete data.flags.reviewOverflow;text=action==='收录新复盘'?'已收录新复盘。':'已舍弃新复盘，旧记录保持。';
  }else if(action==='舍弃复盘'){
    if(talent.number!=='C10')throw new Error('需要温故生新。');
    const job=data.jobs.find(j=>j.id===arg&&j.kind==='review');if(!job||job.payload.working)throw new Error('请选一条未在进行中的复盘。');data.jobs=data.jobs.filter(j=>j.id!==job.id);
    if(data.flags.reviewOverflow){data.jobs.push({id:randomUUID(),kind:'review',created:Date.now(),ready:0,payload:data.flags.reviewOverflow});delete data.flags.reviewOverflow;}text='已舍弃选定记录；若有待替换记录，已加入队列。';
  }else if(action==='复盘'){
    if(talent.number!=='C10')throw new Error('需要温故生新。');await active(connection,actor);
    const job=data.jobs.find(j=>j.id===arg&&j.kind==='review');if(!job)throw new Error('没有这条待复盘记录。');
    if(data.jobs.some(j=>j.payload.working))throw new Error('一次只能复盘一条。');job.payload.working=true;job.ready=Date.now()+Number(job.payload.workSeconds)*1000;
    await connection.execute("UPDATE characters SET activity_status='resting',rest_started_at=NULL WHERE id=?",[id]);text='已开始复盘，完成前占用本人活动。';
  }else if(action==='暂停复盘'){
    const job=data.jobs.find(j=>j.kind==='review'&&j.payload.working);if(!job)throw new Error('当前没有进行中的复盘。');
    job.payload.workSeconds=Math.max(0,Math.ceil((job.ready-Date.now())/1000));delete job.payload.working;job.ready=0;
    await connection.execute("UPDATE characters SET activity_status='active',rest_started_at=NULL WHERE id=?",[id]);text='已暂停复盘，进度保留。';
  }else if(action==='接受来信'||action==='重抽来信'){
    await active(connection,actor,true);const job=data.jobs.find(j=>j.kind==='letter'&&j.id===arg);if(!job||talent.number!=='I03')throw new Error('这封来信已经结清或不属于当前天赋。');
    const outputs=action==='接受来信'?job.payload.preview:rollTalentDropPack(job.payload.table);data.jobs=data.jobs.filter(j=>j.id!==job.id);
    const names:string[]=[];for(const output of outputs){const [items]=await connection.execute<RowDataPacket[]>('SELECT id,name FROM item_definitions WHERE code=?',[output.code]);if(!items[0])throw new Error('来信物品定义不完整。');await grantInventory(connection,id,Number(items[0].id),{personal:0,trade:0,unbound:Number(output.quantity)*2});names.push(`${items[0].name}×${Number(output.quantity)*2}`);}text=names.length?names.join('、'):'来信是空包，本次已结清。';
  }else if(action==='领取'||action==='取消封存'){
    await active(connection,actor,true);const job=data.jobs.find(j=>j.id===arg);if(!job)throw new Error('记录不存在或已经领取。');
    if(action==='取消封存'&&job.kind!=='sealed')throw new Error('只能取消封存记录。');
    if(action==='领取'&&(job.ready>Date.now()||job.kind==='review'&&!job.payload.working))throw new Error('这条记录尚未完成。');
    data.jobs=data.jobs.filter(j=>j.id!==job.id);await saveTalentData(connection,id,data);
    if(job.kind==='sealed'&&action!=='取消封存')recordAchievement(connection,id,['ACH_H08'],'sealed:'+job.id);
    if(job.kind==='sealed')await grantInventory(connection,id,Number(job.payload.itemId),{personal:0,trade:0,unbound:Number(action==='取消封存'?job.payload.base:job.payload.amount)});
    else if(job.kind==='experience'||job.kind==='review'&&job.payload.kind==='experience')await(await import('./adventure.service')).awardRealmExperience(connection,actor as any,Number(job.payload.amount),{fixed:true});
    else if(job.kind==='review')await grantTalentProficiency(connection,id,String(job.payload.profession),Number(job.payload.amount));
    else throw new Error('请使用该活动的专属领取入口。');
    data=await readTalentData(connection,id);if(job.kind==='review')await connection.execute("UPDATE characters SET activity_status='active',rest_started_at=NULL WHERE id=?",[id]);text=action==='领取'?'已领取，额外奖励不再次触发天赋。':'已取消封存，只返还原始材料。';
  }else if(action==='投影'){
    await active(connection,actor);if(talent.number!=='I07')throw new Error('需要万物借位。');
    const families=[['weapon','offhand'],['shoulder','upper','waist','lower','feet'],['necklace','bracelet','ring']];
    if(arg===value||!families.some(slots=>slots.includes(arg)&&slots.includes(value)))throw new Error('请选择两个不同的同类外观槽。');
    const [items]=await connection.execute<RowDataPacket[]>('SELECT pe.slot,i.name FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id=? AND pe.slot IN (?,?)',[id,arg,value]);if(items.length!==2)throw new Error('两个槽位都需要穿戴装备。');
    data.flags.appearance={...(data.flags.appearance??{}),[value]:arg};text='外观投影已保存，属性与装备身份不变。';
  }else if(action==='分享料理'){
    await active(connection,actor);if(talent.number!=='D05')throw new Error('需要共席之人。');
    const [friends]=await connection.execute<RowDataPacket[]>('SELECT c.* FROM party_members a JOIN party_members b ON b.party_id=a.party_id JOIN characters c ON c.id=b.character_id WHERE a.character_id=? AND c.id=? AND c.id<>? AND c.npc_code IS NULL FOR UPDATE',[id,Number(arg),id]);const friend=friends[0];if(!friend||['current_region_id','pos_x','pos_y','pos_z'].some(k=>Number(friend[k])!==Number(actor[k])))throw new Error('需要同队、同坐标的玩家队友。');await active(connection,friend,true);
    const [meals]=await connection.execute<RowDataPacket[]>('SELECT m.*,i.name,i.rarity,pi.personal_bound_quantity,pi.trade_bound_quantity,pi.quantity FROM guild_restaurant_menu m JOIN item_definitions i ON i.id=m.item_id JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE i.id=? FOR UPDATE',[id,Number(value)]);const meal=meals[0];if(!meal||meal.rarity!=='普通'||Number(meal.quantity)-Number(meal.personal_bound_quantity)<1)throw new Error('需要一份可分享的普通料理，个人绑定料理不能交给队友。');
    const [old]=await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_food_buffs WHERE character_id=? AND expires_at>NOW()',[friend.id]);if(old.length)throw new Error('队友已有料理增益，本次未消耗。');
    // Preserve bound stock: sharing consumes a non-personal unit, never a personal-bound meal.
    await connection.execute('UPDATE player_inventory SET quantity=quantity-1,trade_bound_quantity=trade_bound_quantity-IF(trade_bound_quantity>0,1,0),binding_revision=binding_revision+1 WHERE character_id=? AND item_id=?',[id,Number(value)]);
    const raw=typeof meal.buff_json==='string'?JSON.parse(meal.buff_json):meal.buff_json;
    const buff=await(await import('./divine-effects')).divineFoodValues(connection,Number(friend.id),raw,Number(meal.duration_minutes)*60),seconds=await(await import('./divine-effects')).divineFoodSeconds(connection,Number(friend.id),Number(meal.duration_minutes)*60,3);
    (buff as Record<string,unknown>).__talentFoodSource=id;
    await connection.execute('DELETE FROM player_food_buffs WHERE character_id=?',[friend.id]);await connection.execute('INSERT INTO player_food_buffs(character_id,item_id,buff_json,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL ? SECOND))',[friend.id,Number(value),JSON.stringify(buff),seconds]);
    await(await import('./character.service')).recalculateCharacterStats(connection,Number(friend.id));text=`已分享${meal.name}，队友的料理增益持续${seconds/60}分钟。`;
  }else if(action==='无名拜访'){
    await active(connection,actor);const npc=await localNpc(connection,actor,arg);if(talent.number!=='I06'||data.flags[`nameless:${arg}`])throw new Error('每名陌生NPC只能无名拜访一次。');
    const [old]=await connection.execute<RowDataPacket[]>('SELECT daily_chat_count FROM player_npc_affinity WHERE character_id=? AND npc_code=? AND daily_date=CURDATE()',[id,arg]);if(Number(old[0]?.daily_chat_count??0)>0)throw new Error('今天已经与对方交谈，请正常拜访。');
    data.flags[`nameless:${arg}`]=true;await saveTalentData(connection,id,data);const gain=await talentNpcAffinity(connection,id,arg,5,'chat');data=await readTalentData(connection,id);
    await connection.execute('INSERT INTO player_npc_affinity(character_id,npc_code,affinity,daily_date,daily_interactions,daily_chat_count) VALUES (?,?,?,CURDATE(),0,1) ON DUPLICATE KEY UPDATE affinity=affinity+VALUES(affinity),daily_chat_count=IF(daily_date=CURDATE(),daily_chat_count+1,1),daily_date=CURDATE()',[id,arg,gain]);await achievementNpcState(connection,id,arg,gain>0);text=`${npc.name}把你当作初次到来的旅人，听完了你的话。好感+${gain}；过去的关系记录仍然保留。`;
  }else if(action==='赠礼'||action==='共餐'){
    await active(connection,actor);await localNpc(connection,actor,arg);
    if(action==='共餐'){
      const [known]=await connection.execute<RowDataPacket[]>('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=?',[id,arg]);
      if(!known.length||Number(known[0].affinity)<0)throw new Error('请先与这名NPC相识并改善敌对关系，再邀请共餐；料理未消耗。');
    }
    const [items]=await connection.execute<RowDataPacket[]>('SELECT i.*,pi.quantity FROM item_definitions i JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE i.id=?',[id,Number(value)]);const item=items[0];if(!item)throw new Error('背包里没有这个物品。');
    if(item.rarity!=='普通'||!['material','consumable'].includes(String(item.item_type))||action==='共餐'&&item.item_category!=='食物')throw new Error('需要普通礼物或普通料理。');
    const key=`${action}:${talentDay()}:${arg}`,count=data.counters[key]??0;if(count>=3)throw new Error('该NPC今天此类互动已完成3次。');
    // Explicit public preferences are based on profession; rejected goods stay in inventory.
    const liked=action==='共餐'||/blacksmith|forge/.test(arg)&&/铁|铜|银|矿|骨/.test(String(item.name))||/alchemy|sweetshop/.test(arg)&&/草|药|花|露/.test(String(item.name))||/guild|inn|book|oddworkshop/.test(arg)&&Number(item.trade_price)>0;
    if(!liked)throw new Error('对方婉拒了这份礼物，物品仍在背包。');
    const gain=await talentNpcAffinity(connection,id,arg,5,action==='共餐'?'meal':'gift',await isTalentProduct(connection,id,Number(item.id)));
    await consumeInventory(connection,id,Number(item.id),1);
    await connection.execute('INSERT INTO player_npc_affinity(character_id,npc_code,affinity,daily_date,daily_interactions) VALUES (?,?,?,CURDATE(),0) ON DUPLICATE KEY UPDATE affinity=affinity+VALUES(affinity)',[id,arg,gain]);await achievementNpcState(connection,id,arg,gain>0);
    data=await readTalentData(connection,id);data.counters[key]=count+1;text=`${action}完成，好感+${gain}。`;
  }else throw new Error('未知天赋操作，请查看 /天赋。');
  await saveTalentData(connection,id,data);const result=await view(connection,actor,talent,text);
  await connection.execute('INSERT INTO player_talent_events(character_id,event_key,result_json) VALUES (?,?,?)',[id,eventKey,JSON.stringify(result)]);return result;
};
export const talentAction=(user:string,revision?:number,action='状态',arg='',value='')=>withTransaction(c=>talentActionWithConnection(c,user,revision,action,arg,value));

export const addTalentJob=(data:TalentData,kind:string,seconds:number,payload:Record<string,any>)=>{
  const id=randomUUID();data.jobs.push({id,kind,created:Date.now(),ready:Date.now()+seconds*1000,payload});return id;
};
