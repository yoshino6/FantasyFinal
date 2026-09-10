import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { TalentData } from './talent-data';
import { talentNpcLinks } from './talent-activities';
import { talentTransferLabels } from './talent-battle.service';
import { spiritDefinitions } from './spirit-summoner.config';

const professions: Record<string,string>={blacksmith:'锻造',alchemist:'炼金',deconstructor:'分解',enchanter:'附魔'};
const slots: Record<string,string>={weapon:'主手',offhand:'副手',shoulder:'肩部',upper:'上身',waist:'腰部',lower:'下身',feet:'足部',necklace:'项链',bracelet:'手镯',ring:'戒指'};
const families=[['weapon','offhand'],['shoulder','upper','waist','lower','feet'],['necklace','bracelet','ring']];
export type TalentOption={label:string;command:string};
export const talentOptions=async(c:PoolConnection,actor:Record<string,any>,data:TalentData,action:string,state='')=>{
  const separator=state.lastIndexOf('~'), chosen=separator<0?'':state.slice(0,separator),requested=Number(separator<0?state:state.slice(separator+1))||1;
  const options:TalentOption[]=[];const id=Number(actor.id);
  let preview='';
  const add=(label:string,command:string)=>options.push({label,command});
  const next=(label:string,value:string)=>add(label,`选择 ${action} ${value}~1`);
  const localNpcs=async()=> (await c.execute<RowDataPacket[]>('SELECT code,name FROM map_npcs WHERE region_id=? AND pos_x=? AND pos_y=? AND pos_z=? ORDER BY id',[actor.current_region_id,actor.pos_x,actor.pos_y,actor.pos_z]))[0];
  const party=async()=> (await c.execute<RowDataPacket[]>('SELECT c.id,c.name FROM party_members a JOIN party_members b ON b.party_id=a.party_id JOIN characters c ON c.id=b.character_id WHERE a.character_id=? AND c.id<>? AND c.npc_code IS NULL ORDER BY c.id',[id,id]))[0];
  if(['赠礼','共餐','委托','立约委托','无名拜访','引荐'].includes(action)&&!chosen){
    for(const npc of await localNpcs()){
      if(['委托','立约委托','引荐'].includes(action)&&!talentNpcLinks[String(npc.code)])continue;
      if(['赠礼','共餐','引荐','委托','立约委托'].includes(action))next(String(npc.name),String(npc.code));else add(String(npc.name),`${action} ${npc.code}`);
    }
  }else if(['委托','立约委托'].includes(action)&&chosen&&talentNpcLinks[chosen]){
    const npc=(await localNpcs()).find(n=>n.code===chosen);
    const [items]=await c.execute<RowDataPacket[]>('SELECT name FROM item_definitions WHERE code=?',[chosen==='alchemy_sweetshop'?'living_wood':'blood_residue']);
    if(npc&&items[0]){
      const pledge=action==='立约委托';
      preview=`\n委托人：${npc.name}\n交付：${items[0].name}×3；承接后限时2小时。\n基础奖励：好感+10、地区声望+10。${pledge?'\n立约后按时完成：好感+40、地区声望+40；逾期或放弃：好感−5。承接时必须尚未备齐材料。':''}`;
      add(pledge?'承接并立约':'承接委托',`${action} ${chosen}`);
    }
  }else if(['赠礼','共餐','分享料理'].includes(action)&&chosen){
    const [items]=await c.execute<RowDataPacket[]>("SELECT i.id,i.name,i.item_category,pi.quantity,pi.personal_bound_quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.rarity='普通' AND i.item_type IN ('material','consumable') ORDER BY i.name,i.id",[id]);
    for(const item of items){if(action!=='赠礼'&&item.item_category!=='食物'||action==='分享料理'&&Number(item.quantity)<=Number(item.personal_bound_quantity))continue;add(`${item.name}（持有${item.quantity}）`,`${action} ${chosen} ${item.id}`);}
  }else if(action==='分享料理'){
    for(const friend of await party())next(String(friend.name),String(friend.id));
  }else if(action==='引荐'&&chosen){
    const [npcs]=await c.execute<RowDataPacket[]>('SELECT code,name FROM map_npcs ORDER BY id');
    for(const npc of npcs)if(talentNpcLinks[chosen]?.includes(String(npc.code))&&!data.flags[`introduced:${npc.code}`])add(String(npc.name),`引荐 ${chosen} ${npc.code}`);
  }else if(action==='同心'||action==='指挥'){
    const [pets]=await c.execute<RowDataPacket[]>('SELECT id,name FROM player_companions WHERE character_id=? AND released_at IS NULL ORDER BY id',[id]);
    for(const pet of pets)add(`随从·${pet.name}`,action==='同心'?`同心 ${pet.id}`:`设置 指挥 companion:${pet.id}`);
    if(action==='指挥'){
      const [machines]=await c.execute<RowDataPacket[]>('SELECT id,state_json FROM player_automatons WHERE holder_id=? ORDER BY id',[id]);
      for(const machine of machines){const state=typeof machine.state_json==='string'?JSON.parse(machine.state_json):machine.state_json;add(`机巧·${state.name}`,`设置 指挥 automaton:${machine.id}`);}
      const [skills]=await c.execute<RowDataPacket[]>('SELECT s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=?',[id]);
      for(const spirit of spiritDefinitions)if(skills.some(s=>s.code===spirit.skillCode))add(`契灵·${spirit.name}`,`设置 指挥 spirit:${spirit.code}`);
    }
  }else if(action==='借位'){
    if(!chosen){for(const [code,label] of Object.entries(talentTransferLabels))next(label,code);}
    else if(talentTransferLabels[chosen])for(const friend of await party())add(String(friend.name),`设置 借位 ${chosen}:member:${friend.id}`);
  }else if(action==='旁通'){
    const [rows]=await c.execute<RowDataPacket[]>('SELECT profession_code,level FROM player_secondary_professions WHERE character_id=? ORDER BY profession_code',[id]);
    for(const row of rows){const code=String(row.profession_code);if(code!==actor.secondary_profession_code||chosen&&chosen!==code)continue;
      const available=Object.entries(data.counters).filter(([key])=>key.startsWith('cross:')).reduce((sum,[,n])=>sum+n,0);
      if(!available)continue;
      if(!chosen)next(`${professions[code]??'副职业'}（可用${available}点）`,code);
      else for(const amount of [...new Set([1,5,10,available])].filter(n=>n<=available))add(`投入${amount}点`,`旁通 ${code} ${amount}`);
    }
  }else if(action==='投影'){
    const [items]=await c.execute<RowDataPacket[]>('SELECT pe.slot,i.name FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id=? ORDER BY pe.slot',[id]);
    for(const item of items){const slot=String(item.slot);if(!slots[slot])continue;if(!chosen)next(`${slots[slot]}·${item.name}`,slot);else if(chosen!==slot&&families.some(f=>f.includes(slot)&&f.includes(chosen)))add(`投影到${slots[slot]}·${item.name}`,`投影 ${chosen} ${slot}`);}
  }else if(action==='舍弃复盘'){
    for(const job of data.jobs.filter(j=>j.kind==='review'&&!j.payload.working))add(`复盘${job.payload.kind==='experience'?'经验':'熟练度'}${job.payload.amount}（${new Date(job.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}）`,`舍弃复盘 ${job.id}`);
  }
  const pages=Math.max(1,Math.ceil(options.length/5)),page=Math.max(1,Math.min(pages,Math.floor(requested)));
  const current=options.slice((page-1)*5,page*5);
  if(page>1)current.push({label:'上一页',command:`选择 ${action} ${chosen}~${page-1}`});
  if(page<pages)current.push({label:'下一页',command:`选择 ${action} ${chosen}~${page+1}`});
  return {options:current,text:`${action}：${chosen?'请选择下一项':'请选择对象'}（${page}/${pages}）${preview}${options.length?'':'\n当前没有可选项，请确认所在位置、背包或队伍。'}`};
};
