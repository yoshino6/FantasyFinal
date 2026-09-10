import { withTransaction } from '../database/pool';
import type { PoolConnection,RowDataPacket } from 'mysql2/promise';
import { automatonCharacter,assertAutomatonSafe,automatonRecipes } from './automaton.service';
import { constructionRecipeByCode } from './deconstructor-catalog';
import { constructItemFor } from './deconstructor.service';
import { createCraftRequest,craftRequestFor,completeCraftRequest } from './alchemy-journal.service';
import { alchemyFingerprint } from './alchemy-journal';

// 已有构件优先，只有缺少的部分向下展开；只遍历灵枢素体这一条链。
export const planAutomatonComponents=(stock:Map<string,number>,bodies:number)=>{
  if(!Number.isInteger(bodies)||bodies<1||bodies>100)throw new Error('素体目标为 1～100 具。');
  const available=new Map(stock),missing=new Map<string,number>(),used=new Map<string,number>(),steps:string[]=[];
  const need=(code:string,count:number,depth=0)=>{
    if(depth>20)throw new Error('构造链存在循环。');const take=Math.min(count,available.get(code)??0);available.set(code,(available.get(code)??0)-take);if(take)used.set(code,(used.get(code)??0)+take);count-=take;if(!count)return;
    const recipe=constructionRecipeByCode.get(code);if(!recipe){missing.set(code,(missing.get(code)??0)+count);return;}
    if(recipe.outputType!=='material'||recipe.recommendedSecondaryLevel>4)throw new Error('素体前置配方超出四级制造范围。');
    for(let n=0;n<count;n++){for(const part of recipe.ingredients)need(part.code,part.quantity,depth+1);steps.push(code);}
  };
  for(const part of automatonRecipes.find(r=>r.code==='automaton_body')!.ingredients)need(part.code,part.quantity*bodies);
  return{missing:[...missing].map(([code,count])=>({code,count})),used:[...used].map(([code,count])=>({code,count})),steps};
};
const planFor=async(connection:PoolConnection,user:string,bodies:number)=>{
  const character=await automatonCharacter(connection,user);await assertAutomatonSafe(connection,character.id);
  const [progress]=await connection.execute<RowDataPacket[]>("SELECT level FROM player_secondary_professions WHERE character_id=? AND profession_code='deconstructor' FOR UPDATE",[character.id]);if(character.secondary_profession_code!=='deconstructor'||Number(progress[0]?.level??0)<4)throw new Error('解构师四级解锁素体构造链。');
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT i.code,i.name,COALESCE(p.quantity,0) quantity,p.binding_revision FROM item_definitions i LEFT JOIN player_inventory p ON p.item_id=i.id AND p.character_id=? WHERE i.item_type=\'material\' ORDER BY i.id FOR UPDATE',[character.id]);
  const plan=planAutomatonComponents(new Map(rows.map(r=>[String(r.code),Number(r.quantity)])),bodies),names=new Map(rows.map(r=>[String(r.code),String(r.name)]));
  const fingerprint=alchemyFingerprint(rows.map(r=>[r.code,r.quantity,r.binding_revision]));return{character,plan,names,fingerprint};
};
export const previewAutomatonComponents=(user:string,bodies=1)=>withTransaction(async connection=>{
  const {character,plan,names,fingerprint}=await planFor(connection,user,bodies);
  const token=plan.missing.length||!plan.steps.length?null:await createCraftRequest(connection,character.id,'automaton_components',{bodies,fingerprint});
  const counts=new Map<string,number>();for(const code of plan.steps)counts.set(code,(counts.get(code)??0)+1);
  return{token,bodies,missing:plan.missing.map(p=>({...p,name:names.get(p.code)??p.code})),used:plan.used.map(p=>({...p,name:names.get(p.code)??p.code})),steps:[...counts].map(([code,count])=>({name:names.get(code)??code,count}))};
});
export const confirmAutomatonComponents=(user:string,token:string)=>withTransaction(async connection=>{
  const character=await automatonCharacter(connection,user),request=await craftRequestFor<{bodies:number;fingerprint:string}>(connection,character.id,'automaton_components',token);if(request.result)return request.result as {text:string};
  const {plan,fingerprint}=await planFor(connection,user,request.snapshot.bodies);if(plan.missing.length||fingerprint!==request.snapshot.fingerprint)throw new Error('构造链库存已变化，请重新预览。');
  for(const code of plan.steps){const result=await constructItemFor(connection,user,code);if(!result.success)throw new Error('四级素体前置构造出现异常，本批已回滚。');}
  const result={text:`已补齐 ${request.snapshot.bodies} 具素体所需构件，共完成 ${plan.steps.length} 次前置构造。可以继续合成灵枢素体。`};await completeCraftRequest(connection,character.id,token,result);return result;
});
