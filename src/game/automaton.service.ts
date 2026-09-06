import { randomBytes } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { craftCharacterId, craftJson, createCraftRequest, craftRequestFor, completeCraftRequest, recordAlchemyJournal } from './alchemy-journal.service';
import { consumeInventory, grantInventory, productionBinding, type Binding } from './inventory-binding';
import { createAutomaton, cultivateAutomaton, respecAutomaton, feedDefinition, type AutomatonState } from './automaton';
import { automatonFeeds } from './automaton-feeds';
import { realmLevelCap } from './constants';
import { secondaryProfessionMaxLevel, secondaryProfessionProficiencyRequired } from './secondary-profession';
import { validateAutomatonLoadout } from './automaton-personality';
import { cultivationRequired } from './automaton-growth';
import type { AlchemyBatch, AlchemyIngredient, AlchemySnapshot } from './alchemy-journal';

export type AutomatonRow = RowDataPacket & {id:number;holder_id:number;creator_id:number;owner_id:number|null;following:number;bound_kind:string;state_json:unknown;revision:number;recover_at:Date|null;combat_id:string|null;market_listing_id:number|null};
type Character = RowDataPacket & {id:number;level:number;realm_stage:number;secondary_profession_code:string|null};
export const automatonCharacter = async (connection: PoolConnection, user: string) => {
  const id = await craftCharacterId(connection,user,true);
  const [rows] = await connection.execute<Character[]>('SELECT id,level,realm_stage,secondary_profession_code FROM characters WHERE id=? FOR UPDATE',[id]);
  return rows[0]!;
};
export const assertAutomatonSafe = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<RowDataPacket[]>("SELECT cm.character_id FROM combat_members cm JOIN combat_sessions s ON s.id=cm.session_id WHERE cm.character_id=? AND s.state='active' LIMIT 1",[characterId]);
  if(rows.length) throw new Error('战斗中不能认主、培养、重调、维修或更换机巧配置。');
  const [pvp]=await connection.execute<RowDataPacket[]>("SELECT id FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1",[characterId,characterId]);
  if(pvp.length)throw new Error('玩家对战中不能改变机巧状态。');
};
export const automatonFor = async (connection: PoolConnection, characterId: number, id: number, claimed = true) => {
  if(!Number.isSafeInteger(id) || id < 1) throw new Error('机巧编号无效。');
  const [rows] = await connection.execute<AutomatonRow[]>('SELECT * FROM player_automatons WHERE id=? AND holder_id=? FOR UPDATE',[id,characterId]);
  const row=rows[0]; if(!row || (claimed && Number(row.owner_id)!==characterId))throw new Error('未找到属于你的机巧。');
  const state=craftJson<AutomatonState>(row.state_json);
  if(!row.combat_id && row.recover_at && new Date(row.recover_at).getTime()<=Date.now()) {
    state.hp=Math.floor(state.stats[0]!);state.mp=Math.floor(state.stats[1]!);
    await connection.execute('UPDATE player_automatons SET state_json=?,recover_at=NULL,revision=revision+1 WHERE id=?',[JSON.stringify(state),id]);row.recover_at=null;row.revision++;
  }
  return {row,state};
};
export const saveAutomaton = async (connection: PoolConnection, row: AutomatonRow, state: AutomatonState) => {
  await connection.execute('UPDATE player_automatons SET state_json=?,revision=revision+1 WHERE id=?',[JSON.stringify(state),row.id]);
};
export const recordAutomatonEvent = async (connection: PoolConnection, id: number, characterId: number, key: string, kind: string, data: unknown) => {
  await connection.execute('INSERT INTO automaton_events (automaton_id,character_id,event_key,kind,data_json) VALUES (?,?,?,?,?)',[id,characterId,key,kind,JSON.stringify(data)]);
};
export const automatonIntimacy = async (connection: PoolConnection, characterId: number, state: AutomatonState, kind:'interaction'|'cultivation'|'victory') => {
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await connection.execute('INSERT IGNORE INTO automaton_daily (character_id,day_key) VALUES (?,?)',[characterId,day]);
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT * FROM automaton_daily WHERE character_id=? AND day_key=? FOR UPDATE',[characterId,day]);
  if(!Number(rows[0]![kind])) { state.intimacy=Math.min(1000,state.intimacy+(kind==='victory'?4:3)); await connection.execute(`UPDATE automaton_daily SET ${kind}=1 WHERE character_id=? AND day_key=?`,[characterId,day]); }
};
export const automatonList = (user: string) => withTransaction(async connection => {
  const character=await automatonCharacter(connection,user);
  const [rows]=await connection.execute<AutomatonRow[]>('SELECT * FROM player_automatons WHERE holder_id=? ORDER BY following DESC,id',[character.id]);
  const items:{row:AutomatonRow;state:AutomatonState}[]=[];for(const row of rows)items.push(await automatonFor(connection,character.id,Number(row.id),false));
  return {character,items};
});

export type AutomatonRecipe = {code:string;name:string;profession:'alchemist'|'deconstructor';chance:number;ingredients:{code:string;quantity:number;role:string}[]};
export const automatonRecipes: AutomatonRecipe[] = [
  {code:'automaton_body',name:'灵枢素体',profession:'deconstructor',chance:1,ingredients:Object.entries({kinetic_frame:2,servo_bundle:4,memory_polymer:6,shadow_filament:4,pulse_regulator:2,luminous_lens:2,energy_core:4}).map(([code,quantity])=>({code,quantity,role:'构件'}))},
  {code:'pure_soul_trace',name:'纯粹的灵魂痕迹',profession:'alchemist',chance:.8,ingredients:[{code:'mana_dust',quantity:10,role:'主材'},{code:'light_element_dust',quantity:20,role:'辅材'},{code:'magic_unit',quantity:10,role:'催化剂'}]},
  {code:'automaton',name:'机巧人偶·未认主',profession:'alchemist',chance:.9,ingredients:[{code:'automaton_body',quantity:1,role:'主材'},{code:'pure_soul_trace',quantity:1,role:'辅材'},{code:'sky_dust',quantity:20,role:'催化剂'}]},
  ...automatonFeeds.map(f=>({code:`automaton_feed_${f.code}`,name:f.name,profession:'alchemist' as const,chance:.9,ingredients:[...Object.entries(f.main).map(([code,quantity])=>({code,quantity,role:'主材'})),...Object.entries(f.aux).map(([code,quantity])=>({code,quantity,role:'辅材'})),{code:'magic_unit',quantity:2,role:'催化剂'}]}))
];
const recipeFor=(code:string)=>{const r=automatonRecipes.find(r=>r.code===code);if(!r)throw new Error('未知造物配方。');return r;};
const assertProfession=async(connection:PoolConnection,character:Character,recipe:AutomatonRecipe)=>{
  const [rows]=await connection.execute<(RowDataPacket & {level:number})[]>('SELECT level FROM player_secondary_professions WHERE character_id=? AND profession_code=? FOR UPDATE',[character.id,recipe.profession]);
  if(character.secondary_profession_code!==recipe.profession || Number(rows[0]?.level??0)<4)throw new Error(`需要${recipe.profession==='alchemist'?'炼金师':'解构师'}达到 4 级。`);
};
const itemFor=async(connection:PoolConnection,characterId:number,code:string)=>{
  const [rows]=await connection.execute<(RowDataPacket & {id:number;code:string;name:string;quantity:number})[]>(`SELECT i.id,i.code,i.name,COALESCE(p.quantity,0) quantity FROM item_definitions i LEFT JOIN player_inventory p ON p.item_id=i.id AND p.character_id=? WHERE i.code=? FOR UPDATE`,[characterId,code]);
  if(!rows[0])throw new Error(`物品定义缺失：${code}`);return rows[0];
};
export const previewAutomatonCraft=(user:string,code:string,batches=1)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user);await assertAutomatonSafe(connection,character.id);
  const recipe=recipeFor(code);await assertProfession(connection,character,recipe);
  if(!Number.isInteger(batches)||batches<1||batches>(code==='automaton'?1:100))throw new Error('点灵每次一具，其他配方每次 1～100 批。');
  const ingredients:AlchemyIngredient[]=[];
  for(const part of recipe.ingredients){const item=await itemFor(connection,character.id,part.code);ingredients.push({...part,id:Number(item.id),name:item.name});if(Number(item.quantity)<part.quantity*batches+(part.code==='sky_dust'&&Number(character.realm_stage)<2?1:0))throw new Error(`【${item.name}】不足。点灵须额外保留主线需要的天空粉尘。`);}
  const snapshot={kind:code.startsWith('automaton_feed_')?'育成':'造物',source:'automaton',ingredients,level:4,craftsmanship:0,version:'automaton-v3',conditions:code,code,batches};
  const token=await createCraftRequest(connection,character.id,'automaton_craft',snapshot);
  return {token,recipe,batches,ingredients,reserved:code==='automaton'&&Number(character.realm_stage)<2?1:0};
});
export const confirmAutomatonCraft=(user:string,token:string)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user);
  const request=await craftRequestFor<AlchemySnapshot & {code:string;batches:number}>(connection,character.id,'automaton_craft',token);
  if(request.result)return request.result as {text:string;code:string;journalId:number};
  await assertAutomatonSafe(connection,character.id);const snapshot=request.snapshot,recipe=recipeFor(snapshot.code);await assertProfession(connection,character,recipe);
  const batches:(AlchemyBatch & {consumed:AlchemyIngredient[]})[]=[],lines:string[]=[];
  for(let index=0;index<snapshot.batches;index++){
    for(const part of recipe.ingredients){const item=await itemFor(connection,character.id,part.code);if(Number(item.quantity)<part.quantity+(part.code==='sky_dust'&&Number(character.realm_stage)<2?1:0))throw new Error(`【${item.name}】不足，本次批量未扣料。`);}
    const success=Math.random()<recipe.chance,used:Binding={unbound:0,trade:0,personal:0},consumed:AlchemyIngredient[]=[];
    for(const ingredient of snapshot.ingredients){const quantity=snapshot.code==='automaton'&&!success?(ingredient.code==='sky_dust'?2:0):ingredient.quantity;if(!quantity)continue;
      const binding=await consumeInventory(connection,character.id,ingredient.id,quantity);for(const key of ['unbound','trade','personal'] as const)used[key]+=binding[key];consumed.push({...ingredient,quantity});}
    const outputs:AlchemyIngredient[]=[];
    if(success){
      if(snapshot.code==='automaton'){
        const state=createAutomaton(randomBytes(32).toString('hex'));
        const [insert]=await connection.execute<ResultSetHeader>('INSERT INTO player_automatons (holder_id,creator_id,bound_kind,state_json) VALUES (?,?,?,?)',[character.id,character.id,used.personal?'personal':'none',JSON.stringify(state)]);
        await recordAutomatonEvent(connection,insert.insertId,character.id,`birth:${token}:${index}`,'birth',{name:state.name,creatorId:character.id,personality:state.personality,skills:state.learned});
        lines.push(`点灵成功：机巧 #${insert.insertId}，${state.personality.coreName}，尚未认主。`);
        // 日志明细引用素体定义，code/name 明确为生成的独立实例，绝不放入可堆叠背包。
        outputs.push({id:snapshot.ingredients[0]!.id,code:`automaton_instance_${insert.insertId}`,name:`机巧人偶 #${insert.insertId}`,quantity:1,role:'output'});
      }else{const item=await itemFor(connection,character.id,snapshot.code);await grantInventory(connection,character.id,Number(item.id),productionBinding(used,1,true));outputs.push({id:Number(item.id),code:item.code,name:item.name,quantity:1,role:'output'});}
    }
    batches.push({success,outputs,consumed});
  }
  const successes=batches.filter(b=>b.success).length;
  const text=`${recipe.name}：${snapshot.batches} 批，成功 ${successes}，失败 ${snapshot.batches-successes}。\n${lines.join('\n')}\n实际消耗：${batches.flatMap(b=>b.consumed).map(i=>`${i.name}×${i.quantity}`).join('、')}`;
  const result={text,code:snapshot.code,journalId:0};
  const journal=await recordAlchemyJournal(connection,character.id,token,snapshot,batches,result);result.journalId=journal;
  // 熟练度按实际净消耗且每批至多一次，不因粒子数或多条效果重复增加。
  const [progress]=await connection.execute<RowDataPacket[]>('SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code=? FOR UPDATE',[character.id,recipe.profession]);
  let level=Number(progress[0]?.level??4),xp=Number(progress[0]?.proficiency??0)+snapshot.batches;
  while(level<secondaryProfessionMaxLevel&&xp>=secondaryProfessionProficiencyRequired(level)){xp-=secondaryProfessionProficiencyRequired(level);level++;}
  await connection.execute('UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=? AND profession_code=?',[level,level>=secondaryProfessionMaxLevel?0:xp,character.id,recipe.profession]);
  await completeCraftRequest(connection,character.id,token,result);return result;
});

type Mutation={id:number;revision:number;action:string;args:string[]};
export const previewAutomatonMutation=(user:string,id:number,action:string,args:string[]=[])=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user);await assertAutomatonSafe(connection,character.id);
  const {row,state}=await automatonFor(connection,character.id,id,false);
  if(row.market_listing_id)throw new Error('机巧正在寄售，请先撤单。');
  if(row.combat_id)throw new Error('机巧仍在战斗中。');
  if(action!=='认主'&&Number(row.owner_id)!==character.id)throw new Error('请先认主。');
  if(!['认主','随行','收起','培养','重调','维修','装配','命名','称呼','自称','策略','挡刀','公开语录','问候','语录','清除语录'].includes(action))throw new Error('未知机巧操作。');
  let description=`${action}：${state.name} #${id} ${args.join(' ')}`;
  if(action==='培养'){const count=Number(args[1]);const feed=feedDefinition(args[0]??'');if(!Number.isInteger(count)||count<1||count>100)throw new Error('每次投入 1～100 瓶。');cultivateAutomaton(state,[{code:feed.code,count}],Math.min(Number(character.level),realmLevelCap(Number(character.realm_stage)),50),Number(args[2]??50));description+=`\n投入 ${feed.name}×${count}；优先使用已开瓶余额。升级按概率分配属性；剩余经验保留材料类型。预览不展示保密抽签结果。`;}
  if(action==='重调'){const from=Number(args[0]),to=Number(args[1]),feed=feedDefinition(args[2]??'');const levels=Array.from({length:to-from+1},(_,i)=>from+i);if(!Number.isInteger(from)||!Number.isInteger(to)||from<2||to>state.level||to<from)throw new Error('重调范围须为已完成的 2～当前等级。');const xp=levels.reduce((s,l)=>s+cultivationRequired(l-1),0),fee=Math.max(100,Math.ceil(xp*.1));respecAutomaton(state,levels,[{code:feed.code,xp}]);description+=`\n替换经验 ${xp}，手续费 ${fee} 经验，共需 ${Math.ceil((xp+fee)/100)} 瓶 ${feed.name}；原材料不返还，技能不重抽，多余经验留存。`;}
  const token=await createCraftRequest(connection,character.id,'automaton_mutate',{id,revision:Number(row.revision),action,args} satisfies Mutation);
  return {token,description};
});
const cleanText=(text:string,max:number)=>{
  const size=[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text)].length;
  if(size<1||size>max||/[\p{Cc}\p{Cf}\r\n@<>\[\]`]|https?:|www\.|^\s*[/＃#]|系统[:：]/iu.test(text))throw new Error(`内容须为 1～${max} 个可见字，不含链接、提及、换行或指令格式。`);
  return text;
};
export const confirmAutomatonMutation=(user:string,token:string)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user),request=await craftRequestFor<Mutation>(connection,character.id,'automaton_mutate',token);
  if(request.result)return request.result as {text:string};
  await assertAutomatonSafe(connection,character.id);
  const {id,revision,action,args}=request.snapshot;const {row,state:before}=await automatonFor(connection,character.id,id,false);let state=before;
  if(Number(row.revision)!==revision||row.combat_id||row.market_listing_id)throw new Error('机巧状态已变化，请重新预览。');
  if(action!=='认主'&&Number(row.owner_id)!==character.id)throw new Error('请先认主。');
  if(action==='认主'){
    if(row.owner_id)throw new Error('已经认主，不能重复认主。');const [count]=await connection.execute<RowDataPacket[]>('SELECT COUNT(*) total FROM player_automatons WHERE owner_id=?',[character.id]);if(Number(count[0]!.total)>=3)throw new Error('最多认主 3 具机巧。');
    await connection.execute("UPDATE player_automatons SET owner_id=?,bound_kind='personal' WHERE id=?",[character.id,id]);
  }else if(action==='随行'||action==='收起'){
    if(action==='随行'&&!state.hp)throw new Error('暂时停机，等待恢复或使用维修包。');
    if(action==='随行')await connection.execute('UPDATE player_automatons SET following=0 WHERE owner_id=?',[character.id]);
    await connection.execute('UPDATE player_automatons SET following=? WHERE id=?',[action==='随行'?1:0,id]);
  }else if(action==='培养'){
    const feed=feedDefinition(args[0]!),count=Number(args[1]);state=cultivateAutomaton(state,[{code:feed.code,count}],Math.min(Number(character.level),realmLevelCap(Number(character.realm_stage)),50),Number(args[2]??50));
    const item=await itemFor(connection,character.id,`automaton_feed_${feed.code}`);await consumeInventory(connection,character.id,Number(item.id),count);await automatonIntimacy(connection,character.id,state,'cultivation');
  }else if(action==='重调'){
    const from=Number(args[0]),to=Number(args[1]),feed=feedDefinition(args[2]!);if(!Number.isInteger(from)||!Number.isInteger(to)||from<2||to>state.level||to<from)throw new Error('重调等级范围无效。');
    const levels=Array.from({length:to-from+1},(_,i)=>from+i),xp=levels.reduce((s,l)=>s+cultivationRequired(l-1),0);
    const result=respecAutomaton(state,levels,[{code:feed.code,xp}]);const count=Math.ceil((xp+result.fee)/100),item=await itemFor(connection,character.id,`automaton_feed_${feed.code}`);
    await consumeInventory(connection,character.id,Number(item.id),count);state=result.state;const remainder=count*100-xp-result.fee;if(remainder)state.reserve.push({code:feed.code,xp:remainder});
  }else if(action==='维修'){
    if(state.hp>=Math.floor(state.stats[0]!)&&state.mp>=Math.floor(state.stats[1]!))throw new Error('状态已满，不消耗维修包。');
    const item=await itemFor(connection,character.id,'forge_repair_kit');await consumeInventory(connection,character.id,Number(item.id),1);state.hp=Math.floor(state.stats[0]!);state.mp=Math.floor(state.stats[1]!);await connection.execute('UPDATE player_automatons SET recover_at=NULL WHERE id=?',[id]);
  }else if(action==='装配'){validateAutomatonLoadout(state.level,state.learned,args);state.equipped=args;
  }else if(action==='命名')state.name=cleanText(args.join(' '),12);
  else if(action==='称呼')state.ownerAddress=cleanText(args.join(' '),8);
  else if(action==='自称')state.selfAddress=cleanText(args.join(' '),4);
  else if(action==='策略'){if(!['性格','进攻','守护','节能'].includes(args[0]!))throw new Error('请选择性格、进攻、守护或节能。');state.strategy=args[0] as AutomatonState['strategy'];}
  else if(action==='挡刀'||action==='公开语录'||action==='问候'){if(!['开启','关闭'].includes(args[0]!))throw new Error('请选择开启或关闭。');state[action==='挡刀'?'guard':action==='公开语录'?'publicQuotes':'greeting']=args[0]==='开启';}
  else if(action==='语录'){const event=args[0]!,text=cleanText(args.slice(1).join(' '),40);if(!['daily','greeting','battle_start','attack','hurt','owner_danger','intercept','victory','shutdown','level_up','reunion','rest'].includes(event))throw new Error('未知语录事件。');if(/\{(?!主人\}|人偶\}|敌人\}|称呼\}|自称\})[^}]*\}/.test(text))throw new Error('存在未知占位符。');const quotes=state.customQuotes[event]??[];if(quotes.length>=3)throw new Error('每类最多三句，请先清除。');state.customQuotes[event]=[...quotes,text];}
  else if(action==='清除语录')delete state.customQuotes[args[0]!];
  await saveAutomaton(connection,row,state);
  await recordAutomatonEvent(connection,id,character.id,token,action,{name:state.name,previousLevel:before.level,level:state.level,args,previousStats:before.stats,stats:state.stats,previousLevels:action==='重调'?before.levels:undefined,levels:action==='重调'?state.levels:undefined});
  const result={text:`${action}完成：${state.name} #${id}，Lv.${state.level}。${state.level>before.level?` 新领悟：${state.learned.filter(s=>!before.learned.includes(s)).join('、')||'本次未领悟技能'}。`:''}`};await completeCraftRequest(connection,character.id,token,result);return result;
});
