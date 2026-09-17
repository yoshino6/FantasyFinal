import { randomUUID, createHash } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { epicForgeRecipes } from '../config/epic-forging';
import { characterIdFor, blacksmithProgressFor, addBlacksmithProficiency, forgeRequirements, forgeFee, tierForgeMaterial, forgePrimaryKeys, forgeEquipmentCapsFor, randomSecondaryAffixPool, pickRandomSecondaryAffix, randomForgeValue, secondaryAffixCount, specialAffixChance, forgeName } from './blacksmith.service';
import { refinementCounts, rerollRatios, breakthroughs, refinementGain, fusionQualityLoss, qualityDescription, lowForgeMaterials, verifiedLegacyLayers, allocateLowMaterials } from './equipment-workshop-rules';
import { currentSecondaryShop } from './secondary-shop-context';
import { assertCombatLoadoutMutable, assertHiddenInstanceMutable } from './combat-loadout-lock.service';
import { consumeInventory } from './inventory-binding';
import { recalculateCharacterStats } from './character.service';
import { recordCharacterOperation } from './character-operation.service';
import { recordAchievement } from './achievement-events';
import { talentMaterialPayment, consumeTalentMaterial, fixedTalentMaterials } from './talent-production';

export type WorkshopMode = 'fusion'|'reroll'|'refine';
type Cost = { id:number; code:string; name:string; quantity:number; recipeQuantity?:number };
const object = (value:any):Record<string,any> => typeof value==='string'?JSON.parse(value):value??{};
const source = () => currentSecondaryShop()?.shop ?? 'profession';
const fingerprint = (row:RowDataPacket) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
const load = async (c:PoolConnection, owner:number, id:number) => {
  const [rows] = await c.execute<RowDataPacket[]>(`SELECT ii.*,i.code,i.name,i.item_type,i.item_category,i.weapon_type,i.rarity,i.required_level,i.effect_json AS definition_effect,
    s.budget_level,s.failures,s.revision,s.layers_json,EXISTS(SELECT 1 FROM player_equipment pe WHERE pe.instance_id=ii.id) AS equipped,
    EXISTS(SELECT 1 FROM equipment_fusions f WHERE f.instance_id=ii.id) AS legacy
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id LEFT JOIN equipment_workshop_states s ON s.instance_id=ii.id
    WHERE ii.id=? AND ii.character_id=? FOR UPDATE`,[id,owner]);
  const row=rows[0];
  if(!row||row.item_type!=='equipment'||row.item_category==='异械'||!refinementCounts[row.rarity])throw new Error('请选择自己背包中的常规装备。');
  if(row.equipped)throw new Error('请先卸下装备。');
  if(row.market_listing_id)throw new Error('请先取回寄售中的装备。');
  await assertCombatLoadoutMutable(c,owner);
  await assertHiddenInstanceMutable(c,owner,id);
  return row;
};
const layersFor=async(c:PoolConnection,row:RowDataPacket)=>{
  if(row.layers_json)return object(row.layers_json) as {base:Record<string,any>;frozen:Record<string,number>;randomSpecial?:boolean};
  const current=object(row.effect_json??row.definition_effect);
  const randomSpecial=row.rarity!=='史诗'&&/^(crafted_|reforged_|owner_test_)/.test(row.code);
  if(!row.legacy)return {base:{...current},frozen:{} as Record<string,number>,randomSpecial};
  const [ledger]=await c.execute<RowDataPacket[]>('SELECT effect_json FROM equipment_fusions WHERE instance_id=? ORDER BY id',[row.id]);
  const verified=verifiedLegacyLayers(row.code,object(row.definition_effect),current,ledger.map(r=>object(r.effect_json)));
  return verified?{...verified,randomSpecial}:null;
};
const requirementsFor = (row:RowDataPacket,mode:WorkshopMode) => {
  const level=Number(row.required_level), quality=Number(row.quality);
  if(mode==='refine') {
    if(quality>=100&&!breakthroughs[row.rarity])throw new Error('该装备已臻圆满，无法继续常规精炼。');
    return [{code:tierForgeMaterial(row.item_category,row.weapon_type,level),quantity:quality>=100?breakthroughs[row.rarity].count:refinementCounts[row.rarity]}];
  }
  if(mode==='fusion'&&(row.rarity==='史诗'||![5,10,15,20,25].includes(level)))throw new Error('当前仅能熔铸升级尚未达到本阶段顶点的常规装备；史诗需专属升阶配方。');
  if(mode==='reroll'&&!rerollRatios[row.rarity])throw new Error('普通装备尚无副词条，请先精炼突破。');
  const effect=object(row.effect_json??row.definition_effect);
  const epic=epicForgeRecipes.find(r=>r.code===effect.epicEquipmentCode);
  if(row.rarity==='史诗'&&!epic)throw new Error('未找到该史诗装备的打造配方。');
  const recipe=epic?.materials??forgeRequirements(row.item_category,row.weapon_type,level+(mode==='fusion'?5:0));
  return recipe.map(r=>({...r,quantity:Math.max(1,Math.ceil(r.quantity*(mode==='fusion'?.25:rerollRatios[row.rarity])))}));
};
/** Preview binds exact inventory items; confirmation never silently selects replacement materials. */
export const workshopCosts = async (c:PoolConnection,owner:number,requirements:Array<{code:string;quantity:number}>,selected:Array<{code:string;quantity:number}>=[],discounted=false) => {
  const costs:Cost[]=[];
  for(const requirement of requirements) {
    const codes=requirement.code==='living_wood'?[...lowForgeMaterials]:[requirement.code];
    const [rows]=await c.execute<RowDataPacket[]>(`SELECT i.id,i.code,i.name,COALESCE(pi.quantity,0) AS quantity FROM item_definitions i
      LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE i.code IN (${codes.map(()=>'?').join(',')}) FOR UPDATE`,[owner,...codes]);
    if(discounted)for(const row of rows){
      let low=0,high=requirement.quantity;
      while(low<high){const mid=Math.ceil((low+high)/2);if(await talentMaterialPayment(c,owner,Number(row.id),mid,'craft',!currentSecondaryShop())<=Number(row.quantity))low=mid;else high=mid-1;}
      row.quantity=low;
    }
    let remaining=requirement.quantity;
    if(requirement.code==='living_wood'){
      const allocation=allocateLowMaterials(rows.map(r=>({code:r.code,quantity:Number(r.quantity),selected:selected.find(s=>s.code===r.code)?.quantity??0})),remaining);
      if(allocation.remaining)throw new Error(`低级主材不足，还需 ${allocation.remaining} 个（活纹木胚、根心、河壳、潮壳可混用）。`);
      costs.push(...allocation.result.map(r=>({...r,id:Number(rows.find(item=>item.code===r.code)!.id),name:String(rows.find(item=>item.code===r.code)!.name)})));
      continue;
    }
    for(const code of codes) {
      const row=rows.find(r=>r.code===code);if(!row)continue;
      const used=costs.find(r=>r.id===Number(row.id))?.quantity??0;
      const quantity=Math.min(remaining,Math.max(0,Number(row.quantity)-used));
      if(quantity>0){const existing=costs.find(r=>r.id===Number(row.id));if(existing)existing.quantity+=quantity;else costs.push({id:Number(row.id),code,name:row.name,quantity});remaining-=quantity;}
    }
    if(remaining)throw new Error(`${requirement.code==='living_wood'?'低级主材（活纹木胚、根心、河壳、潮壳可混用）':rows[0]?.name??requirement.code}不足，还需 ${remaining} 个。`);
  }
  if(discounted)for(const cost of costs){cost.recipeQuantity=cost.quantity;cost.quantity=await talentMaterialPayment(c,owner,cost.id,cost.recipeQuantity,'craft',!currentSecondaryShop());}
  return costs;
};
export const workshopList = async (user:string) => withTransaction(async c=>{
  const owner=await characterIdFor(c,user,true);await blacksmithProgressFor(c,owner,true);
  const [rows]=await c.execute<RowDataPacket[]>(`SELECT ii.id,i.name,i.rarity,i.required_level,ii.quality FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    WHERE ii.character_id=? AND i.item_type='equipment' AND i.rarity<>'神器' AND i.item_category<>'异械' AND ii.market_listing_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM player_equipment pe WHERE pe.instance_id=ii.id) ORDER BY ii.id DESC`,[owner]);
  return rows.map(r=>({id:Number(r.id),name:String(r.name),rarity:String(r.rarity),level:Number(r.required_level),quality:qualityDescription(Number(r.quality))}));
});
export const workshopPreview = async (user:string,id:number,mode:WorkshopMode) => withTransaction(async c=>{
  const owner=await characterIdFor(c,user,true);await blacksmithProgressFor(c,owner,true);
  const row=await load(c,owner,id);
  // An old fusion may have overwritten part of its original base. Never infer and erase it.
  if(!await layersFor(c,row)&&(mode==='reroll'||mode==='refine'&&Number(row.quality)>=100))throw new Error('这件装备的旧版熔铸记录与现有属性不一致，需核验后才能洗练或突破；仍可精炼品质与熔铸升级。');
  const requirements=requirementsFor(row,mode),fee=mode==='refine'?0:forgeFee(requirements);
  const expanded=requirements[0]?.code==='living_wood'?[...(await workshopCosts(c,owner,[requirements[0]],[],true)).map(r=>({code:r.code,quantity:r.recipeQuantity??r.quantity})),...requirements.slice(1)]:requirements;
  const materials=await fixedTalentMaterials(c,owner,expanded,mode==='refine'?[]:requirements.slice(1).map(r=>r.code),!currentSecondaryShop());
  const costs:Cost[]=[];
  for(const material of materials)costs.push({id:Number(material.item.id),code:material.item.code,name:material.item.name,recipeQuantity:material.quantity,quantity:await talentMaterialPayment(c,owner,Number(material.item.id),material.quantity,'craft',!currentSecondaryShop())});
  const token=randomUUID(),breakthrough=mode==='refine'&&Number(row.quality)>=100;
  await c.execute(`INSERT INTO equipment_workshop_quotes(token,character_id,instance_id,source,mode,snapshot_json,costs_json,fee,expires_at)
    VALUES (?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE))`,[token,owner,id,source(),mode,JSON.stringify({hash:fingerprint(row),breakthrough}),JSON.stringify(costs),fee]);
  return {token,name:String(row.name),rarity:String(row.rarity),quality:qualityDescription(Number(row.quality)),level:Number(row.required_level),costs,fee,breakthrough};
});
const rollAffixes = (row:RowDataPacket,effect:Record<string,any>,budget:number,rarity:string,keep:boolean) => {
  const primary=new Set(forgePrimaryKeys(row.item_category,row.weapon_type));
  const pool=randomSecondaryAffixPool(row.item_category,row.weapon_type,budget,rarity);
  const caps=forgeEquipmentCapsFor(row.item_category,row.weapon_type,budget,rarity,[...primary]);
  const randomSpecial=Boolean(row.workshop_random_special);
  if(!keep){for(const {key} of pool)delete effect[key];if(randomSpecial){delete effect.damageBonusPct;delete effect.damageReductionPct;}}
  let count=pool.filter(({key})=>Number(effect[key])>0).length;
  const available=pool.filter(({key})=>!effect[key]);
  while(count<secondaryAffixCount(rarity)&&available.length){const key=pickRandomSecondaryAffix(available);effect[key]=randomForgeValue(caps[key]);count++;}
  if(!keep&&randomSpecial&&Math.random()<specialAffixChance(budget))effect[row.item_category==='武器'&&row.weapon_type!=='盾牌'?'damageBonusPct':'damageReductionPct']=Math.round(randomForgeValue(5)*10)/10;
};
export const workshopExecute = async (user:string,token:string,expectedMode:WorkshopMode) => withTransaction(async c=>{
  const owner=await characterIdFor(c,user,true);await blacksmithProgressFor(c,owner,true);
  const [quotes]=await c.execute<RowDataPacket[]>('SELECT *,expires_at<=NOW() AS expired FROM equipment_workshop_quotes WHERE token=? AND character_id=? FOR UPDATE',[token,owner]);
  const quote=quotes[0];if(!quote||quote.source!==source()||quote.mode!==expectedMode)throw new Error('确认凭据与本次操作或入口不符，请重新预览。');
  if(quote.result_json)return object(quote.result_json) as {text:string;instanceId:number};
  if(quote.expired)throw new Error('预览已过期，请重新放入装备。');
  const row=await load(c,owner,Number(quote.instance_id)),snapshot=object(quote.snapshot_json);
  if(fingerprint(row)!==snapshot.hash)throw new Error('装备状态已经变化，请重新预览。');
  requirementsFor(row,expectedMode);
  const costs=object(quote.costs_json) as unknown as Cost[];
  const [paid]=await c.execute<any>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?',[quote.fee,owner,quote.fee]);
  if(paid.affectedRows!==1)throw new Error('铜币不足。');
  let bound=row.bound_kind;
  for(const cost of costs){
    if(cost.recipeQuantity!==undefined){
      const expected=await talentMaterialPayment(c,owner,cost.id,cost.recipeQuantity,'craft',!currentSecondaryShop());
      if(expected!==cost.quantity)throw new Error('材料减耗状态已变化，请重新预览。');
      const used=await consumeTalentMaterial(c,owner,cost.id,cost.recipeQuantity,'craft',!currentSecondaryShop());
      if(used.paid!==cost.quantity)throw new Error('材料结算发生变化，请重新预览。');
      if(used.binding.personal)bound='personal';
    }else{const used=await consumeInventory(c,owner,cost.id,cost.quantity);if(used.personal)bound='personal';}
  }
  const layers=await layersFor(c,row);
  row.workshop_random_special=layers?.randomSpecial??false;
  if(!layers&&(expectedMode==='reroll'||snapshot.breakthrough))throw new Error('旧版词条来源尚未核验。');
  const budget=Number(row.budget_level??row.required_level),before=object(row.effect_json??row.definition_effect),effect={...(layers?.base??before)};
  let quality=Number(row.quality),rarity=String(row.rarity),level=Number(row.required_level),failures=Number(row.failures??0),name=String(row.name),outcome='完成';
  if(expectedMode==='fusion'){quality=Math.round((quality-fusionQualityLoss(rarity,quality))*10)/10;level+=5;outcome='装备等级提升，火候有所回落，原有词条完整保留。';}
  if(expectedMode==='reroll'){rollAffixes(row,effect,budget,rarity,false);quality=Math.min(100,quality+2+Math.floor(Math.random()*3));outcome='副词条已重新淬炼，火候略有精进。';}
  if(expectedMode==='refine'&&!snapshot.breakthrough){const gain=refinementGain();quality=Math.min(100,Math.round((quality+gain)*10)/10);outcome=gain>=7?'炉火相合，品质获得了可喜的提升。':'精炼成功，装备火候进一步精进。';}
  if(snapshot.breakthrough){
    const rule=breakthroughs[rarity];
    if(failures+1>=rule.pity||Math.random()<rule.chance){
      const oldCaps=forgeEquipmentCapsFor(row.item_category,row.weapon_type,budget,rarity,forgePrimaryKeys(row.item_category,row.weapon_type));
      const caps=forgeEquipmentCapsFor(row.item_category,row.weapon_type,budget,rule.next,forgePrimaryKeys(row.item_category,row.weapon_type));
      for(const [key,cap] of Object.entries(oldCaps))if(typeof effect[key]==='number'&&cap>0)effect[key]=Math.round(Math.min(1,effect[key]/cap)*(caps[key]??cap)*100)/100;
      rarity=rule.next;failures=0;rollAffixes(row,effect,budget,rarity,true);outcome='突破成功，装备迈入了新的稀有度。';
    }else{failures++;outcome='突破未成，装备仍保持圆满火候，积累的淬炼心得将在后续尝试中发挥作用。';}
  }
  const nextLayers=layers?{base:{...effect},frozen:layers.frozen,randomSpecial:layers.randomSpecial??false}:null;
  if(layers)for(const [key,value] of Object.entries(layers.frozen))effect[key]=Math.round((Number(effect[key]??0)+value)*10000)/10000;
  // Copy the definition instead of changing other instances sharing the same item_id.
  if(expectedMode!=='refine'||rarity!==row.rarity){
    if(rarity!=='史诗'){
      const main=level<=20?(costs.filter(r=>(lowForgeMaterials as readonly string[]).includes(r.code)).sort((a,b)=>b.quantity-a.quantity+(b.quantity===a.quantity?((lowForgeMaterials as readonly string[]).indexOf(a.code)-(lowForgeMaterials as readonly string[]).indexOf(b.code)):0))[0]?.code??'living_wood'):tierForgeMaterial(row.item_category,row.weapon_type,level);
      name=forgeName(row.weapon_type,level,effect,main,row.item_category,rarity,budget);
    }
    const [definition]=await c.execute<any>(`INSERT INTO item_definitions(code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
      SELECT ?,?,description,obtain_source,item_type,item_category,weapon_type,?,?,weight,trade_price,stack_limit,stackable,is_tradeable,? FROM item_definitions WHERE id=?`,
      [`workshop_${randomUUID()}`,name,rarity,level,JSON.stringify(effect),row.item_id]);
    await c.execute('UPDATE player_item_instances SET item_id=?,effect_json=? WHERE id=? AND character_id=?',[definition.insertId,JSON.stringify(effect),row.id,owner]);
  }
  await c.execute("UPDATE player_item_instances SET quality=?,bound_kind=?,bound_at=IF(?='personal',COALESCE(bound_at,NOW()),bound_at) WHERE id=? AND character_id=?",[quality,bound,bound,row.id,owner]);
  await c.execute(`INSERT INTO equipment_workshop_states(instance_id,budget_level,failures,revision,layers_json) VALUES (?,?,?,1,?)
    ON DUPLICATE KEY UPDATE failures=VALUES(failures),revision=revision+1,layers_json=VALUES(layers_json)`,[row.id,budget,failures,nextLayers?JSON.stringify(nextLayers):null]);
  await recalculateCharacterStats(c,owner);await addBlacksmithProficiency(c,owner);
  if(expectedMode==='refine'&&quality>Number(row.quality)&&!currentSecondaryShop())recordAchievement(c,owner,['ACH_I16']);
  const result={instanceId:Number(row.id),text:`【${name}】\n${outcome}\n${rarity}｜${qualityDescription(quality)}${quality>=100&&breakthroughs[rarity]?'\n已达到当前品质极限，可重新预览精炼并尝试突破。':''}\n消耗：${costs.map(r=>`${r.name}×${r.quantity}`).join('、')}${Number(quote.fee)?`；铜币×${quote.fee}`:''}`};
  await recordCharacterOperation(c,{characterId:owner,kind:`craft.workshop_${snapshot.breakthrough?(rarity===row.rarity?'breakthrough_failed':'breakthrough'):expectedMode}`,source:{system:'equipment_workshop',id:token,step:'settled'},outcome:snapshot.breakthrough?(rarity===row.rarity?'突破失败':'突破成功'):'完成',scoreKey:`workshop:${expectedMode}:${row.id}`,summary:`${name}：${outcome}`,detail:{instanceId:row.id,oldItemId:row.item_id,budgetLevel:budget,oldQuality:row.quality,quality,oldRarity:row.rarity,rarity,level,failures,before,after:effect,costs,fee:quote.fee}});
  await c.execute('UPDATE equipment_workshop_quotes SET result_json=? WHERE token=?',[JSON.stringify(result),token]);
  return result;
});
