import { randomBytes } from 'node:crypto';
import type { AutomatonBattleState } from './automaton-combat';
import { automatonMemoryKinds, automatonBondStages } from './automaton-events';
import { automatonSkills } from './automaton-skill-catalog';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { craftCharacterId, craftJson, createCraftRequest, craftRequestFor, completeCraftRequest, recordAlchemyJournal } from './alchemy-journal.service';
import { consumeInventory, grantInventory, productionBinding, type Binding } from './inventory-binding';
import { createAutomaton, cultivateAutomaton, respecAutomaton, feedDefinition, type AutomatonState } from './automaton';
import { automatonFeeds } from './automaton-feeds';
import { realmLevelCap } from './constants';
import { secondaryProfessionBonus, secondaryProfessionMaxLevel, secondaryProfessionProficiencyRequired } from './secondary-profession';
import { validateAutomatonLoadout } from './automaton-personality';
import { cultivationRequired, labels } from './automaton-growth';
import { baseMaterialTradeValues } from './deconstructor-catalog';
import type { AlchemyBatch, AlchemyIngredient, AlchemySnapshot } from './alchemy-journal';
import { assertAlchemyCreationUnlocked } from './alchemy-creation-quest.service';

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
    if(!state.hp)await recordAutomatonEvent(connection,id,characterId,`recovery:${new Date(row.recover_at).toISOString()}`,'recovery',{name:state.name,source:'休整后自动恢复'},new Date(row.recover_at));
    state.hp=Math.floor(state.stats[0]!);state.mp=Math.floor(state.stats[1]!);
    await connection.execute('UPDATE player_automatons SET state_json=?,recover_at=NULL,revision=revision+1 WHERE id=?',[JSON.stringify(state),id]);row.recover_at=null;row.revision++;
  }
  return {row,state};
};
export const saveAutomaton = async (connection: PoolConnection, row: AutomatonRow, state: AutomatonState, revise=true) => {
  await connection.execute('UPDATE player_automatons SET state_json=?,revision=revision+? WHERE id=?',[JSON.stringify(state),revise?1:0,row.id]);
};
export const recordAutomatonEvent = async (connection: PoolConnection, id: number, characterId: number, key: string, kind: string, data: unknown, occurredAt:Date|null=null) => {
  await connection.execute('INSERT INTO automaton_events (automaton_id,character_id,event_key,kind,data_json,created_at) VALUES (?,?,?,?,?,COALESCE(?,NOW()))',[id,characterId,key,kind,JSON.stringify(data),occurredAt]);
};
export const recordAutomatonFirstEvent = async (connection:PoolConnection,id:number,characterId:number,kind:string,data:unknown,identity=kind)=>{
  await connection.execute('INSERT IGNORE INTO automaton_events(automaton_id,character_id,event_key,kind,data_json) VALUES(?,?,?,?,?)',[id,characterId,`first:${characterId}:${identity}`,kind,JSON.stringify(data)]);
};
export const automatonEventPage=(user:string,id:number,page=1)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user),{state}=await automatonFor(connection,character.id,id,false);
  const kinds=Object.keys(automatonMemoryKinds);
  const where=`automaton_id=? AND character_id=? AND kind IN (${kinds.map(()=>'?').join(',')})`,values=[id,character.id,...kinds];
  const [counts]=await connection.execute<RowDataPacket[]>(`SELECT COUNT(*) total FROM automaton_events WHERE ${where}`,values);const pages=Math.max(1,Math.ceil(Number(counts[0]?.total??0)/5));page=Math.min(pages,Math.max(1,Math.floor(page)||1));
  const [events]=await connection.execute<RowDataPacket[]>(`SELECT kind,data_json,created_at FROM automaton_events WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET ${(page-1)*5}`,values);
  return {page,pages,state,events:events.map(e=>({kind:String(e.kind),time:new Date(e.created_at),data:craftJson<Record<string,unknown>>(e.data_json)}))};
});
export const automatonIntimacy = async (connection: PoolConnection, characterId: number, state: AutomatonState, kind:'interaction'|'cultivation'|'victory',automatonId?:number) => {
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await connection.execute('INSERT IGNORE INTO automaton_daily (character_id,day_key) VALUES (?,?)',[characterId,day]);
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT * FROM automaton_daily WHERE character_id=? AND day_key=? FOR UPDATE',[characterId,day]);
  if(!Number(rows[0]![kind])) { const before=state.intimacy;state.intimacy=Math.min(1000,state.intimacy+(kind==='victory'?4:3)); await connection.execute(`UPDATE automaton_daily SET ${kind}=1 WHERE character_id=? AND day_key=?`,[characterId,day]);
    if(automatonId)for(const stage of automatonBondStages.filter(s=>s.value>before&&s.value<=state.intimacy))await recordAutomatonFirstEvent(connection,automatonId,characterId,'bond_milestone',{name:state.name,intimacy:stage.value,stage:stage.name},'bond:'+stage.value);
  }
};
export const automatonList = (user: string) => withTransaction(async connection => {
  const character=await automatonCharacter(connection,user);
  const [rows]=await connection.execute<AutomatonRow[]>('SELECT * FROM player_automatons WHERE holder_id=? ORDER BY following DESC,id',[character.id]);
  const items:{row:AutomatonRow;state:AutomatonState;battle?:AutomatonBattleState}[]=[];
  for(const row of rows){const item=await automatonFor(connection,character.id,Number(row.id),false);let battle:AutomatonBattleState|undefined;
    if(row.combat_id){const [snapshots]=await connection.execute<RowDataPacket[]>('SELECT state_json FROM combat_automatons WHERE session_id=? AND automaton_id=?',[row.combat_id,row.id]);if(snapshots[0])battle=craftJson<AutomatonBattleState>(snapshots[0].state_json);}
    items.push({...item,battle});}
  return {character,items};
});

export type AutomatonRecipe = {code:string;name:string;profession:'alchemist'|'deconstructor';chance:number;ingredients:{code:string;quantity:number;role:string}[]};
export const automatonRecipes: AutomatonRecipe[] = [
  {code:'automaton_body',name:'灵枢素体',profession:'deconstructor',chance:1,ingredients:Object.entries({kinetic_frame:2,servo_bundle:4,memory_polymer:6,shadow_filament:4,pulse_regulator:2,luminous_lens:2,energy_core:4}).map(([code,quantity])=>({code,quantity,role:'构件'}))},
  {code:'pure_soul_trace',name:'纯粹的灵魂痕迹',profession:'alchemist',chance:.8,ingredients:[{code:'mana_dust',quantity:10,role:'主材'},{code:'light_element_dust',quantity:20,role:'辅材'},{code:'magic_unit',quantity:10,role:'催化剂'}]},
  {code:'automaton',name:'机巧人偶·未认主',profession:'alchemist',chance:.6,ingredients:[{code:'automaton_body',quantity:1,role:'主材'},{code:'pure_soul_trace',quantity:1,role:'辅材'},{code:'sky_dust',quantity:20,role:'催化剂'}]},
  ...automatonFeeds.map(f=>({code:`automaton_feed_${f.code}`,name:f.name,profession:'alchemist' as const,chance:.9,ingredients:[...Object.entries(f.main).map(([code,quantity])=>({code,quantity,role:'主材'})),...Object.entries(f.aux).map(([code,quantity])=>({code,quantity,role:'辅材'})),{code:'magic_unit',quantity:2,role:'催化剂'}]}))
];
/** 专用炼金配方的 chance 为四级基准；只叠加四级之后的职业加成。 */
export const automatonCraftChance=(recipe:AutomatonRecipe,level:number)=>recipe.profession==='alchemist'
  ?Math.min(1,(recipe.chance*100+Math.max(0,secondaryProfessionBonus(level)-secondaryProfessionBonus(4)))/100)
  :recipe.chance;
const recipeFor=(code:string)=>{const r=automatonRecipes.find(r=>r.code===code);if(!r)throw new Error('未知造物配方。');return r;};
const assertProfession=async(connection:PoolConnection,character:Character,recipe:AutomatonRecipe)=>{
  const [rows]=await connection.execute<(RowDataPacket & {level:number})[]>('SELECT level FROM player_secondary_professions WHERE character_id=? AND profession_code=? FOR UPDATE',[character.id,recipe.profession]);
  if(character.secondary_profession_code!==recipe.profession || Number(rows[0]?.level??0)<4)throw new Error(`需要${recipe.profession==='alchemist'?'炼金师':'解构师'}达到 4 级。`);
  if(recipe.profession==='alchemist')await assertAlchemyCreationUnlocked(connection,character.id);
  return Number(rows[0]!.level);
};
const itemFor=async(connection:PoolConnection,characterId:number,code:string)=>{
  const [rows]=await connection.execute<(RowDataPacket & {id:number;code:string;name:string;quantity:number})[]>(`SELECT i.id,i.code,i.name,COALESCE(p.quantity,0) quantity FROM item_definitions i LEFT JOIN player_inventory p ON p.item_id=i.id AND p.character_id=? WHERE i.code=? FOR UPDATE`,[characterId,code]);
  if(!rows[0])throw new Error(`物品定义缺失：${code}`);return rows[0];
};
export const automatonRecipeCatalog=(user:string,kind:string)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user),profession=kind==='构造'?'deconstructor':'alchemist';
  if(character.secondary_profession_code!==profession)throw new Error(kind==='构造'?'请从解构师构造面板进入。':'炼金配方仅对当前炼金师开放。');
  if(profession==='alchemist')await assertAlchemyCreationUnlocked(connection,character.id);
  const [progress]=await connection.execute<RowDataPacket[]>('SELECT level FROM player_secondary_professions WHERE character_id=? AND profession_code=?',[character.id,profession]);
  const level=Number(progress[0]?.level??0);
  const recipes:(Omit<AutomatonRecipe,'ingredients'> & {ingredients:(AutomatonRecipe['ingredients'][number] & {name:string;owned:number})[]})[]=[];
  for(const recipe of automatonRecipes.filter(r=>r.profession===profession&&(kind==='育成'?r.code.startsWith('automaton_feed_'):!r.code.startsWith('automaton_feed_')))){
    const ingredients:(AutomatonRecipe['ingredients'][number] & {name:string;owned:number})[]=[];for(const part of recipe.ingredients){const item=await itemFor(connection,character.id,part.code);ingredients.push({...part,name:item.name,owned:Number(item.quantity)});}recipes.push({...recipe,chance:automatonCraftChance(recipe,level),ingredients});
  }
  return recipes;
});
export const previewAutomatonCraft=(user:string,code:string,batches=1)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user);await assertAutomatonSafe(connection,character.id);
  const baseRecipe=recipeFor(code),level=await assertProfession(connection,character,baseRecipe);
  const recipe={...baseRecipe,chance:automatonCraftChance(baseRecipe,level)};
  if(!Number.isInteger(batches)||batches<1||batches>(code==='automaton'?1:100))throw new Error('点灵每次一具，其他配方每次 1～100 批。');
  const ingredients:AlchemyIngredient[]=[],owned:Record<string,number>={};
  for(const part of recipe.ingredients){const item=await itemFor(connection,character.id,part.code);owned[part.code]=Number(item.quantity);ingredients.push({...part,id:Number(item.id),name:item.name});if(Number(item.quantity)<part.quantity*batches+(part.code==='sky_dust'&&Number(character.realm_stage)<2?1:0))throw new Error(`【${item.name}】不足。`);}
  const snapshot={kind:code.startsWith('automaton_feed_')?'育成':'造物',source:'automaton',ingredients,level,chance:recipe.chance,craftsmanship:0,version:'automaton-v4',conditions:code,code,batches};
  const token=await createCraftRequest(connection,character.id,'automaton_craft',snapshot);
  return {token,recipe,batches,ingredients,owned,reserved:code==='automaton'&&Number(character.realm_stage)<2?1:0};
});
export const confirmAutomatonCraft=(user:string,token:string)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user);
  const request=await craftRequestFor<AlchemySnapshot & {code:string;batches:number;chance:number}>(connection,character.id,'automaton_craft',token);
  if(request.result)return request.result as {text:string;code:string;journalId:number};
  await assertAutomatonSafe(connection,character.id);const snapshot=request.snapshot,recipe=recipeFor(snapshot.code),recipeLevel=await assertProfession(connection,character,recipe);
  const chance=automatonCraftChance(recipe,recipeLevel);
  if(snapshot.version!=='automaton-v4'||snapshot.level!==recipeLevel||snapshot.chance!==chance)throw new Error('职业等级或配方条件已变化，请重新放入配方确认。');
  const batches:(AlchemyBatch & {consumed:AlchemyIngredient[]})[]=[],lines:string[]=[];
  for(let index=0;index<snapshot.batches;index++){
    for(const part of recipe.ingredients){const item=await itemFor(connection,character.id,part.code);if(Number(item.quantity)<part.quantity+(part.code==='sky_dust'&&Number(character.realm_stage)<2?1:0))throw new Error(`【${item.name}】不足，本次批量未扣料。`);}
    const success=Math.random()<chance,used:Binding={unbound:0,trade:0,personal:0},consumed:AlchemyIngredient[]=[];
    for(const ingredient of snapshot.ingredients){const quantity=snapshot.code==='automaton'&&!success?(ingredient.code==='sky_dust'?2:0):ingredient.quantity;if(!quantity)continue;
      const binding=await consumeInventory(connection,character.id,ingredient.id,quantity);for(const key of ['unbound','trade','personal'] as const)used[key]+=binding[key];consumed.push({...ingredient,quantity});}
    const outputs:AlchemyIngredient[]=[];
    if(success){
      if(snapshot.code==='automaton'){
        const state=createAutomaton(randomBytes(32).toString('hex'));
        const [insert]=await connection.execute<ResultSetHeader>('INSERT INTO player_automatons (holder_id,creator_id,bound_kind,state_json) VALUES (?,?,?,?)',[character.id,character.id,used.personal?'personal':'none',JSON.stringify(state)]);
        await recordAutomatonEvent(connection,insert.insertId,character.id,`birth:${token}:${index}`,'birth',{name:state.name,creatorId:character.id,personality:state.personality,skills:state.learned});
        await recordAutomatonFirstEvent(connection,insert.insertId,character.id,'first_met',{name:state.name,source:'亲手点灵'});
        lines.push(`点灵成功：机巧 #${insert.insertId}，尚未认主。`);
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
  await connection.execute('INSERT IGNORE INTO automaton_proficiency_remainders(character_id,profession_code) VALUES(?,?)',[character.id,recipe.profession]);
  const [remainders]=await connection.execute<RowDataPacket[]>('SELECT budget_units FROM automaton_proficiency_remainders WHERE character_id=? AND profession_code=? FOR UPDATE',[character.id,recipe.profession]);
  // 使用 1/89 铜预算单位，精确保留魔力粉尘 58/0.89 的锚价和拆批余量。
  const units=Number(remainders[0]?.budget_units??0)+(['automaton','automaton_body'].includes(snapshot.code)?0:batches.flatMap(b=>b.consumed).reduce((sum,i)=>sum+i.quantity*(i.code==='mana_dust'?5800:2*(baseMaterialTradeValues[i.code]??0)*89),0));
  const proficiencyGain=['automaton','automaton_body'].includes(snapshot.code)?successes*5:Math.floor(units/8900);
  await connection.execute('UPDATE automaton_proficiency_remainders SET budget_units=? WHERE character_id=? AND profession_code=?',[units%8900,character.id,recipe.profession]);
  let level=Number(progress[0]?.level??4),xp=Number(progress[0]?.proficiency??0)+proficiencyGain;
  while(level<secondaryProfessionMaxLevel&&xp>=secondaryProfessionProficiencyRequired(level)){xp-=secondaryProfessionProficiencyRequired(level);level++;}
  await connection.execute('UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=? AND profession_code=?',[level,level>=secondaryProfessionMaxLevel?0:xp,character.id,recipe.profession]);
  await completeCraftRequest(connection,character.id,token,result);return result;
});

type Mutation={id:number;revision:number;action:string;args:string[]};
const mutationActions=['认主','随行','收起','培养','重调','维修','装配','命名','休眠归档','恢复展示'];
export const cultivationInput=(args:string[])=>{
  const bottles=args[0]==='余额'?[]:args[0]?.includes(':')?args[0].split(',').map(part=>{const [code,count]=part.split(':');return{code:feedDefinition(code!).code,count:Number(count)};}):[{code:feedDefinition(args[0]??'').code,count:Number(args[1])}];
  if(bottles.some(b=>!Number.isInteger(b.count)||b.count<1)||bottles.reduce((s,b)=>s+b.count,0)>100)throw new Error('每次投入合计 1～100 瓶，混合格式：blade:2,shell:1。');
  return {bottles,stop:Number(args[0]?.includes(':')||args[0]==='余额'?args[1]??50:args[2]??50)};
};
const assertFeedStock=async(connection:PoolConnection,characterId:number,bottles:{code:string;count:number}[])=>{
  const total=new Map<string,number>();for(const b of bottles)total.set(b.code,(total.get(b.code)??0)+b.count);
  for(const [code,count] of total){const item=await itemFor(connection,characterId,`automaton_feed_${code}`);if(Number(item.quantity)<count)throw new Error(`【${item.name}】不足，需要 ${count} 瓶。`);}
};
export const previewAutomatonMutation=(user:string,id:number,action:string,args:string[]=[])=>withTransaction(async connection=>{
  if(!mutationActions.includes(action))throw new Error('该操作已取消或不存在，机巧会自主行动。');
  const character=await automatonCharacter(connection,user);await assertAutomatonSafe(connection,character.id);
  const {row,state}=await automatonFor(connection,character.id,id,false);
  if(row.market_listing_id)throw new Error('机巧正在寄售，请先撤单。');
  if(row.combat_id)throw new Error('机巧仍在战斗中。');
  if(action!=='认主'&&Number(row.owner_id)!==character.id)throw new Error('请先认主。');
  let description=`${action}：${state.name} #${id} ${args.join(' ')}`;
  if(action==='培养'){
    const {bottles,stop}=cultivationInput(args);if(!bottles.length&&!state.reserve.length)throw new Error('没有可用原液余额。');
    await assertFeedStock(connection,character.id,bottles);const next=cultivateAutomaton(state,bottles,Math.min(Number(character.level),realmLevelCap(Number(character.realm_stage)),50),stop);
    description=`培养：${state.name} #${id}\n投入 ${bottles.map(b=>`${feedDefinition(b.code).name}×${b.count}`).join('、')||'已开瓶余额'}；预计到 Lv.${next.level}，优先使用余额。\n实际成长确认后揭晓，剩余经验保留来源。`;
  }
  if(action==='重调'){const from=Number(args[0]),to=Number(args[1]),feed=feedDefinition(args[2]??'');if(!Number.isInteger(from)||!Number.isInteger(to)||from<2||to>state.level||to<from)throw new Error('重调范围须为已完成的 2～当前等级。');const levels=Array.from({length:to-from+1},(_,i)=>from+i);const xp=levels.reduce((s,l)=>s+cultivationRequired(l-1),0),fee=Math.max(100,Math.ceil(xp*.1));respecAutomaton(state,levels,[{code:feed.code,xp}]);description+=`\n替换经验 ${xp}，手续费 ${fee} 经验，共需 ${Math.ceil((xp+fee)/100)} 瓶 ${feed.name}；原材料不返还，技能不重抽，多余经验留存。`;}
  if(action==='重调'){const xp=Array.from({length:Number(args[1])-Number(args[0])+1},(_,i)=>cultivationRequired(Number(args[0])+i-1)).reduce((s,n)=>s+n,0);await assertFeedStock(connection,character.id,[{code:feedDefinition(args[2]!).code,count:Math.ceil((xp+Math.max(100,Math.ceil(xp*.1)))/100)}]);}
  if(action==='装配')validateAutomatonLoadout(state.level,state.learned,args);
  if(action==='命名')cleanText(args.join(' '),12);
  if(action==='认主'){const [counts]=await connection.execute<RowDataPacket[]>('SELECT COUNT(*) total FROM player_automatons WHERE owner_id=?',[character.id]);if(row.owner_id||Number(counts[0]!.total)>=3)throw new Error('已经认主或已达到三具上限。');description+='\n认主后永久绑定，不能再次交易。';}
  if(action==='维修'){const kit=await itemFor(connection,character.id,'forge_repair_kit');if(!kit.quantity)throw new Error('缺少维修包。');if(state.hp>=Math.floor(state.stats[0]!)&&state.mp>=Math.floor(state.stats[1]!))throw new Error('状态已满，无需维修。');description+='\n消耗维修包×1，完全恢复生命、魔力并结束停机。';}
  if(action==='休眠归档')description+='\n隐藏日常列表并收起，仍占认主名额，可恢复展示。';
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
  const {id,revision,action,args}=request.snapshot;
  if(!mutationActions.includes(action))throw new Error('该操作已取消，旧设置确认已失效。');const {row,state:before}=await automatonFor(connection,character.id,id,false);let state=structuredClone(before);
  if(Number(row.revision)!==revision||row.combat_id||row.market_listing_id)throw new Error('机巧状态已变化，请重新预览。');
  if(action!=='认主'&&Number(row.owner_id)!==character.id)throw new Error('请先认主。');
  if(action==='认主'){
    if(row.owner_id)throw new Error('已经认主，不能重复认主。');const [count]=await connection.execute<RowDataPacket[]>('SELECT COUNT(*) total FROM player_automatons WHERE owner_id=?',[character.id]);if(Number(count[0]!.total)>=3)throw new Error('最多认主 3 具机巧。');
    await connection.execute("UPDATE player_automatons SET owner_id=?,bound_kind='personal' WHERE id=?",[character.id,id]);
    await recordAutomatonFirstEvent(connection,id,character.id,'first_met',{name:state.name,source:'认主相识'});
  }else if(action==='随行'||action==='收起'){
    const [recent]=await connection.execute<RowDataPacket[]>("SELECT id FROM automaton_events WHERE character_id=? AND kind IN ('随行','收起') AND created_at>DATE_SUB(NOW(),INTERVAL 60 SECOND) LIMIT 1",[character.id]);if(recent.length)throw new Error('切换随行后需等待 60 秒。');
    if(action==='随行'&&!state.hp)throw new Error('暂时停机，等待恢复或使用维修包。');
    if(action==='随行'){state.archived=false;await connection.execute('UPDATE player_automatons SET following=0 WHERE owner_id=?',[character.id]);}
    await connection.execute('UPDATE player_automatons SET following=? WHERE id=?',[action==='随行'?1:0,id]);
    if(action==='随行')await recordAutomatonFirstEvent(connection,id,character.id,'first_follow',{name:state.name});
  }else if(action==='培养'){
    const {bottles,stop}=cultivationInput(args);state=cultivateAutomaton(state,bottles,Math.min(Number(character.level),realmLevelCap(Number(character.realm_stage)),50),stop);
    for(const b of bottles){const item=await itemFor(connection,character.id,`automaton_feed_${b.code}`);await consumeInventory(connection,character.id,Number(item.id),b.count);}await automatonIntimacy(connection,character.id,state,'cultivation',id);
  }else if(action==='重调'){
    const from=Number(args[0]),to=Number(args[1]),feed=feedDefinition(args[2]!);if(!Number.isInteger(from)||!Number.isInteger(to)||from<2||to>state.level||to<from)throw new Error('重调等级范围无效。');
    const levels=Array.from({length:to-from+1},(_,i)=>from+i),xp=levels.reduce((s,l)=>s+cultivationRequired(l-1),0);
    const result=respecAutomaton(state,levels,[{code:feed.code,xp}]);const count=Math.ceil((xp+result.fee)/100),item=await itemFor(connection,character.id,`automaton_feed_${feed.code}`);
    await consumeInventory(connection,character.id,Number(item.id),count);state=result.state;const remainder=count*100-xp-result.fee;if(remainder)state.reserve.push({code:feed.code,xp:remainder});
  }else if(action==='维修'){
    if(state.hp>=Math.floor(state.stats[0]!)&&state.mp>=Math.floor(state.stats[1]!))throw new Error('状态已满，不消耗维修包。');
    const item=await itemFor(connection,character.id,'forge_repair_kit');await consumeInventory(connection,character.id,Number(item.id),1);if(!state.hp)await recordAutomatonEvent(connection,id,character.id,`recovery:${token}`,'recovery',{name:state.name,source:'主人使用维修包修复'});state.hp=Math.floor(state.stats[0]!);state.mp=Math.floor(state.stats[1]!);await connection.execute('UPDATE player_automatons SET recover_at=NULL WHERE id=?',[id]);
  }else if(action==='装配'){validateAutomatonLoadout(state.level,state.learned,args);state.equipped=args;
  }else if(action==='命名'){
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(state.renameDay!==day){state.renameDay=day;state.renameCount=0;}if(state.named&&Number(state.renameCount)>=3)throw new Error('每日最多改名三次。');
    const name=cleanText(args.join(' '),12);if(name===state.name)throw new Error('名字没有变化。');if(state.named)state.renameCount=Number(state.renameCount??0)+1;state.named=true;state.name=name;
  }
  else if(action==='休眠归档'||action==='恢复展示'){state.archived=action==='休眠归档';if(state.archived)await connection.execute('UPDATE player_automatons SET following=0 WHERE id=?',[id]);}
  await saveAutomaton(connection,row,state);
  await recordAutomatonEvent(connection,id,character.id,token,action,{name:state.name,previousName:before.name,previousLevel:before.level,level:state.level,args,previousStats:before.stats,stats:state.stats,previousLevels:action==='重调'?before.levels:undefined,levels:action==='重调'?state.levels:undefined});
  if(action==='培养')for(const level of state.levels.filter(l=>l.level>before.level&&l.level%10===0))await recordAutomatonFirstEvent(connection,id,character.id,'breakthrough',{name:state.name,level:level.level,skills:level.skills,gain:level.gain},`breakthrough:${level.level}`);
  if(action==='培养')for(const level of state.levels.filter(l=>l.level>before.level&&l.level%10!==0&&l.skills.length))await recordAutomatonFirstEvent(connection,id,character.id,'skill_learned',{name:state.name,level:level.level,skills:level.skills},`skill_learned:${level.level}`);
  const learned=state.learned.filter(s=>!before.learned.includes(s)).map(id=>automatonSkills.find(s=>s.id===id)?.name??id);
  const growth=action==='培养'||action==='重调'?'\n'+labels.map((label,i)=>`${label} ${Math.floor(before.stats[i]!)} → ${Math.floor(state.stats[i]!)}`).join('｜'):'';
  const result={text:`${action}完成：${state.name} #${id}，Lv.${state.level}。${state.level>before.level?` 新领悟：${learned.join('、')||'本次未领悟技能'}。`:''}${growth}`};await completeCraftRequest(connection,character.id,token,result);return result;
});
