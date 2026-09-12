import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { randomInt } from 'node:crypto';
import { achievementBoxes, achievementBoxLoot, achievementBoxRewardForRarity, achievementRewardItemByKey, type AchievementBoxKey } from './achievement-rewards.config';
import { grantInventory } from './inventory-binding';
import { getPool, withTransaction } from '../database/pool';
import { achievementCategories } from './achievement.config';
import { achievementAttributeKeys, achievementById, achievementThreshold, completionPercent } from './achievement-rules';
import { isCooperativeAchievement, type AchievementEvent } from './achievement-events';
import { retiredAchievementIdSet } from './achievement-retired.config';

const json = (v: unknown): any => typeof v === 'string' ? JSON.parse(v) : v;
export const achievementStatBonus = async (db: Pool | PoolConnection, characterId: number): Promise<Record<string,number>> => {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT a.reward_attribute,SUM(a.reward_points) AS points FROM achievement_completions a JOIN players p ON p.qq_user_id=a.identity_key JOIN characters c ON c.player_id=p.id WHERE c.id=? AND c.npc_code IS NULL GROUP BY a.reward_attribute`,[characterId]);
  return Object.fromEntries(rows.map(r=>[String(r.reward_attribute),Number(r.points)]));
};

export const flushAchievements = async (connection: PoolConnection, events: AchievementEvent[]) => {
  if (!events.length) return [] as number[];
  const ids = [...new Set(events.map(e=>e.characterId))].sort((a,b)=>a-b);
  const [actors] = await connection.query<RowDataPacket[]>(`SELECT c.id,c.name,p.qq_user_id FROM characters c JOIN players p ON p.id=c.player_id WHERE c.npc_code IS NULL AND c.id IN (?)`,[ids]);
  const candidates = new Map<string, Set<string>>();
  const cooperation=new Map<string,Map<string,string>>();
  const byIdentity = new Map(actors.map(a=>[String(a.qq_user_id),a]));
  for (const actor of [...actors].sort((a,b)=>String(a.qq_user_id).localeCompare(String(b.qq_user_id)))) {
    const identity=String(actor.qq_user_id);
    await connection.execute('INSERT IGNORE INTO achievement_profiles(identity_key) VALUES (?)',[identity]);
    await connection.execute('SELECT identity_key FROM achievement_profiles WHERE identity_key=? FOR UPDATE',[identity]);
    const unlocked=new Set<string>(); candidates.set(identity,unlocked);
    for (const event of events.filter(e=>e.characterId===Number(actor.id))) {
      const [receipt]=await connection.execute<any>('INSERT IGNORE INTO achievement_events(identity_key,event_key) VALUES (?,?)',[identity,event.key]);
      if (!receipt.affectedRows) continue;
      for (const fact of event.facts) {
        // 不接受隐藏天赋路线、无定义的指标或非正有限数值。
        const definition=achievementById.get(fact.metric);
        if (!definition || /^ACH_L2[1-5]$/.test(definition.id)) continue;
        const life=fact.life || definition.scope==='世' ? String(actor.id) : '';
        const [rows]=await connection.execute<RowDataPacket[]>('SELECT value_json FROM achievement_progress WHERE identity_key=? AND life_key=? AND metric=? FOR UPDATE',[identity,life,fact.metric]);
        const state=json(rows[0]?.value_json)??{count:0,seen:[]};
        if (fact.distinct!==undefined) { if (!state.seen.includes(fact.distinct)) { state.seen.push(fact.distinct);state.count++; } }
        else { const value=fact.value??1;if(!Number.isSafeInteger(value)||value<0)throw new Error('成就结算值无效。');state.count=fact.maximum?Math.max(state.count,value):state.count+value; }
        await connection.execute('INSERT INTO achievement_progress(identity_key,life_key,metric,value_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)',[identity,life,fact.metric,JSON.stringify(state)]);
        if(state.count>=achievementThreshold(definition.id)&&!unlocked.has(definition.id)){
          unlocked.add(definition.id);
          if(fact.cooperationKey&&isCooperativeAchievement(definition.id)){
            const group=cooperation.get(definition.id)??new Map<string,string>();group.set(identity,fact.cooperationKey);cooperation.set(definition.id,group);
          }
        }
      }
    }
  }
  const dirty = new Set<number>();
  for (const id of [...new Set([...candidates.values()].flatMap(s=>[...s]))].sort()) {
    await connection.execute('INSERT IGNORE INTO achievement_counters(achievement_id) VALUES (?)',[id]);
    const [counter]=await connection.execute<RowDataPacket[]>('SELECT completed_count FROM achievement_counters WHERE achievement_id=? FOR UPDATE',[id]);
    let rank=Number(counter[0].completed_count);
    const identities=[...candidates].filter(([,s])=>s.has(id)).map(([identity])=>identity);
    // 同一事务共同达成时公平抽取次序；最终结果只随事务提交。
    for(let i=identities.length-1;i>0;i--){const j=randomInt(i+1);[identities[i],identities[j]]=[identities[j],identities[i]];}
    const firstCooperation=rank===0?cooperation.get(id)?.get(identities[0]):undefined;
    for (const identity of identities) {
      const [existing]=await connection.execute<RowDataPacket[]>('SELECT ordinal FROM achievement_completions WHERE identity_key=? AND achievement_id=?',[identity,id]);
      if(existing.length)continue;
      const d=achievementById.get(id)!,actor=byIdentity.get(identity)!;
      const [attribute,points]=d.attribute.split('+');
      await connection.execute('INSERT INTO achievement_completions(identity_key,achievement_id,ordinal,reward_attribute,reward_points,rarity,name_snapshot) VALUES (?,?,?,?,?,?,?)',[identity,id,++rank,achievementAttributeKeys[attribute],Number(points),d.rarity,actor.name]);
      dirty.add(Number(actor.id));
      const first=rank===1||!!firstCooperation&&cooperation.get(id)?.get(identity)===firstCooperation;
      const baseBox=achievementBoxRewardForRarity(d.rarity);
      const [rewardReceipt]=await connection.execute<any>('INSERT IGNORE INTO achievement_box_rewards(identity_key,achievement_id,reward_key,quantity) VALUES (?,?,?,?)',[identity,id,baseBox.key,baseBox.quantity]);
      if(rewardReceipt.affectedRows)await connection.execute('INSERT INTO achievement_rewards(identity_key,reward_key,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[identity,baseBox.key,baseBox.quantity]);
      if(first)await connection.execute("INSERT INTO achievement_rewards(identity_key,reward_key,quantity) VALUES (?,'rare_box',1) ON DUPLICATE KEY UPDATE quantity=quantity+1",[identity]);
      if(first)await connection.execute('INSERT INTO achievement_first_members(achievement_id,identity_key,name_snapshot) VALUES (?,?,?)',[id,identity,actor.name]);
      if(rank===1){
        await connection.execute('INSERT INTO achievement_announcements(achievement_id,name_snapshot,rarity) VALUES (?,?,?)',[id,actor.name,d.rarity]);
        await connection.execute('INSERT IGNORE INTO achievement_deliveries(achievement_id,bot_id,group_id) SELECT ?,bot_id,group_openid FROM bot_group_channels',[id]);
      }
    }
    await connection.execute('UPDATE achievement_counters SET completed_count=? WHERE achievement_id=?',[rank,id]);
  }
  return [...dirty].sort((a,b)=>a-b);
};

/** 角色尚未生成时使用的账号级成就授予入口；永久记录仍只按 QQ 身份保存。 */
export const unlockAccountAchievement = async (connection: PoolConnection, identity: string, name: string, achievementId: string, eventKey: string) => {
  const definition = achievementById.get(achievementId);
  if (!definition || retiredAchievementIdSet.has(achievementId)) throw new Error('成就配置尚未完成。');
  await connection.execute('INSERT IGNORE INTO achievement_profiles(identity_key) VALUES (?)', [identity]);
  await connection.execute('SELECT identity_key FROM achievement_profiles WHERE identity_key=? FOR UPDATE', [identity]);
  const [eventReceipt] = await connection.execute<any>('INSERT IGNORE INTO achievement_events(identity_key,event_key) VALUES (?,?)', [identity, eventKey]);
  const [existing] = await connection.execute<RowDataPacket[]>('SELECT ordinal FROM achievement_completions WHERE identity_key=? AND achievement_id=?', [identity, achievementId]);
  if (existing.length || !eventReceipt.affectedRows) return { definition, unlocked: false };

  const [progressRows] = await connection.execute<RowDataPacket[]>('SELECT value_json FROM achievement_progress WHERE identity_key=? AND life_key=\'\' AND metric=? FOR UPDATE', [identity, achievementId]);
  const state = json(progressRows[0]?.value_json) ?? { count: 0, seen: [] };
  state.count = Math.max(Number(state.count ?? 0), achievementThreshold(achievementId));
  await connection.execute('INSERT INTO achievement_progress(identity_key,life_key,metric,value_json) VALUES (?,\'\',?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)', [identity, achievementId, JSON.stringify(state)]);

  await connection.execute('INSERT IGNORE INTO achievement_counters(achievement_id) VALUES (?)', [achievementId]);
  const [counters] = await connection.execute<RowDataPacket[]>('SELECT completed_count FROM achievement_counters WHERE achievement_id=? FOR UPDATE', [achievementId]);
  const ordinal = Number(counters[0]?.completed_count ?? 0) + 1;
  const [attribute, points] = definition.attribute.split('+');
  await connection.execute('INSERT INTO achievement_completions(identity_key,achievement_id,ordinal,reward_attribute,reward_points,rarity,name_snapshot) VALUES (?,?,?,?,?,?,?)', [identity, achievementId, ordinal, achievementAttributeKeys[attribute], Number(points), definition.rarity, name]);
  await connection.execute('UPDATE achievement_counters SET completed_count=? WHERE achievement_id=?', [ordinal, achievementId]);
  const reward = achievementBoxRewardForRarity(definition.rarity);
  const [rewardReceipt] = await connection.execute<any>('INSERT IGNORE INTO achievement_box_rewards(identity_key,achievement_id,reward_key,quantity) VALUES (?,?,?,?)', [identity, achievementId, reward.key, reward.quantity]);
  if (rewardReceipt.affectedRows) await connection.execute('INSERT INTO achievement_rewards(identity_key,reward_key,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [identity, reward.key, reward.quantity]);
  if (ordinal === 1) {
    await connection.execute("INSERT INTO achievement_rewards(identity_key,reward_key,quantity) VALUES (?,'rare_box',1) ON DUPLICATE KEY UPDATE quantity=quantity+1", [identity]);
    await connection.execute('INSERT INTO achievement_first_members(achievement_id,identity_key,name_snapshot) VALUES (?,?,?)', [achievementId, identity, name]);
    await connection.execute('INSERT INTO achievement_announcements(achievement_id,name_snapshot,rarity) VALUES (?,?,?)', [achievementId, name, definition.rarity]);
    await connection.execute('INSERT IGNORE INTO achievement_deliveries(achievement_id,bot_id,group_id) SELECT ?,bot_id,group_openid FROM bot_group_channels', [achievementId]);
  }
  return { definition, unlocked: true, reward };
};

export type AchievementEntry = {id:string;name:string;category:string;description:string;rarity:string;attribute:string;rank:number;percentage:string;completedAt:string};
export const achievementListInDatabase = async (db:Pool|PoolConnection,identity:string,category='全部',requestedPage=1) => {
  if(!achievementCategories.includes(category as any))throw new Error('未知成就分类。');
  if(!Number.isSafeInteger(requestedPage)||requestedPage<1)throw new Error('页码须为正整数。');
  await (await import('./achievement-boss')).loadBossAchievementDefinitions(db);
  // 同一个SQL快照生成分子与分母。只查询本人已达成，详情也复用这条权限边界。
  const [rows]=await db.execute<RowDataPacket[]>(`SELECT a.*,c.completed_count,(SELECT COUNT(*) FROM achievement_profiles) AS population FROM achievement_completions a JOIN achievement_counters c ON c.achievement_id=a.achievement_id WHERE a.identity_key=? ORDER BY a.completed_at DESC,a.achievement_id`,[identity]);
  const entries:AchievementEntry[]=rows.flatMap(r=>{const d=achievementById.get(String(r.achievement_id));return d&&(category==='全部'||d.category===category)?[{id:d.id,name:d.name,category:d.category,description:d.description,rarity:String(r.rarity),attribute:Object.keys(achievementAttributeKeys).find(k=>achievementAttributeKeys[k]===r.reward_attribute)+'+'+r.reward_points,rank:Number(r.ordinal),percentage:completionPercent(Number(r.completed_count),Number(r.population)),completedAt:new Date(r.completed_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}]:[];});
  const totalPages=Math.max(1,Math.ceil(entries.length/10)),page=Math.min(requestedPage,totalPages);
  const visibleCategories=achievementCategories.filter(c=>c==='全部'||rows.some(r=>achievementById.get(String(r.achievement_id))?.category===c));
  return {category,page,totalPages,total:entries.length,visibleCategories,entries:entries.slice((page-1)*10,page*10)};
};
export const achievementList = async(identity:string,category='全部',requestedPage=1)=>achievementListInDatabase(await getPool(),identity,category,requestedPage);
export const achievementDetail = async(identity:string,id:string) => {
  // 未解锁/不存在使用同一错误，不泄露名称、条件或是否存在。
  const db=await getPool();const [owned]=await db.execute<RowDataPacket[]>('SELECT achievement_id FROM achievement_completions WHERE identity_key=? AND achievement_id=?',[identity,id]);
  await (await import('./achievement-boss')).loadBossAchievementDefinitions(db);
  if(!owned.length||!achievementById.has(id))throw new Error('没有可查看的成就记录。');
  const definition=achievementById.get(id)!;
  const first=await achievementList(identity,definition.category);
  for(let page=1;page<=first.totalPages;page++){const data=page===1?first:await achievementList(identity,definition.category,page);const entry=data.entries.find(e=>e.id===id);if(entry)return entry;}
  throw new Error('没有可查看的成就记录。');
};

export const achievementRewardsInDatabase=async(db:Pool|PoolConnection,identity:string)=>{
  const [rows]=await db.execute<RowDataPacket[]>("SELECT reward_key,quantity FROM achievement_rewards WHERE identity_key=?",[identity]);
  const boxes=Object.fromEntries(Object.keys(achievementBoxes).map(key=>[key,Number(rows.find(r=>r.reward_key===key)?.quantity??0)])) as Record<AchievementBoxKey,number>;
  const items=[...achievementRewardItemByKey.values()].map(item=>({...item,quantity:Number(rows.find(r=>r.reward_key===item.key)?.quantity??0)})).filter(item=>item.quantity>0);
  return {boxes,items,oddBoxes:boxes.odd_box,rareBoxes:boxes.rare_box,collectorBoxes:boxes.collector_box};
};
const syncAchievementRewardInventory=async(connection:PoolConnection,identity:string)=>{
  const [characters]=await connection.execute<RowDataPacket[]>('SELECT c.id FROM players p JOIN characters c ON c.player_id=p.id WHERE p.qq_user_id=? AND c.npc_code IS NULL FOR UPDATE',[identity]);
  if(!characters[0])return;
  const characterId=Number(characters[0].id),keys=[...achievementRewardItemByKey.keys()];
  const [definitions]=await connection.execute<RowDataPacket[]>(`SELECT id,code FROM item_definitions WHERE code IN (${keys.map(()=>'?').join(',')})`,keys);
  const byCode=new Map(definitions.map(row=>[String(row.code),Number(row.id)]));
  const [stocks]=await connection.execute<RowDataPacket[]>(`SELECT reward_key,quantity FROM achievement_rewards WHERE identity_key=? AND reward_key IN (${keys.map(()=>'?').join(',')})`,[identity,...keys]);
  const quantityByKey=new Map(stocks.map(row=>[String(row.reward_key),Number(row.quantity)]));
  for(const key of keys){
    const itemId=byCode.get(key);if(!itemId)continue;
    const quantity=quantityByKey.get(key)??0;
    if(quantity>0){
      await connection.execute(`INSERT INTO player_inventory(character_id,item_id,quantity,trade_bound_quantity,personal_bound_quantity,binding_revision) VALUES (?,?,?,?,?,1)
        ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),trade_bound_quantity=0,personal_bound_quantity=VALUES(personal_bound_quantity),binding_revision=binding_revision+1,acquired_at=IF(quantity<VALUES(quantity),NOW(),acquired_at)`,[characterId,itemId,quantity,0,quantity]);
      await connection.execute('INSERT IGNORE INTO player_item_codex(character_id,item_id) VALUES (?,?)',[characterId,itemId]);
    }else await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=?',[characterId,itemId]);
  }
};
export const achievementRewards=async(identity:string)=>withTransaction(async connection=>{await syncAchievementRewardInventory(connection,identity);return achievementRewardsInDatabase(connection,identity);});

export const consumeAchievementRewardItem=async(connection:PoolConnection,characterId:number,itemCode:string,quantity=1)=>{
  if(!achievementRewardItemByKey.has(itemCode))return;
  const [paid]=await connection.execute<any>(`UPDATE achievement_rewards ar JOIN players p ON p.qq_user_id=ar.identity_key JOIN characters c ON c.player_id=p.id
    SET ar.quantity=ar.quantity-? WHERE c.id=? AND ar.reward_key=? AND ar.quantity>=?`,[quantity,characterId,itemCode,quantity]);
  if(!paid.affectedRows)throw new Error('足迹中的永久道具库存不足，已取消使用。');
};

const drawAchievementBox=(boxKey:AchievementBoxKey)=>{
  const pool=achievementBoxLoot[boxKey],total=pool.reduce((sum,item)=>sum+item.weight,0);let roll=randomInt(total);
  for(const item of pool){roll-=item.weight;if(roll<0)return item;}
  return pool[pool.length-1]!;
};

export const openAchievementBoxInDatabase=async(connection:PoolConnection,identity:string,boxKey:AchievementBoxKey,token:string,quantity=1)=>{
  const box=achievementBoxes[boxKey];if(!box)throw new Error('未知的成就道具匣。');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(token))throw new Error('打开凭据无效，请重新查看背包。');
  const [profile]=await connection.execute<RowDataPacket[]>('SELECT identity_key FROM achievement_profiles WHERE identity_key=? FOR UPDATE',[identity]);
  if(!profile.length)throw new Error(`没有可打开的${box.name}。`);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100)throw new Error('每次可打开1～100个，请输入整数。');
  const metric=`${boxKey}_open:${token}`;
  const [receipt]=await connection.execute<RowDataPacket[]>("SELECT value_json FROM achievement_progress WHERE identity_key=? AND life_key='' AND metric=?",[identity,metric]);
  if(receipt.length){
    const old=json(receipt[0].value_json);const result=old.items?{...old,boxKey,boxName:box.name}:{boxKey,boxName:box.name,quantity:1,items:[{...old,quantity:1}]};
    if(result.quantity!==quantity)throw new Error('此凭据已用于其他数量，请重新查看背包获取新的打开按钮。');
    return result as {boxKey:AchievementBoxKey;boxName:string;quantity:number;items:{key:string;name:string;description:string;quantity:number}[]};
  }
  const [paid]=await connection.execute<any>('UPDATE achievement_rewards SET quantity=quantity-? WHERE identity_key=? AND reward_key=? AND quantity>=?',[quantity,identity,boxKey,quantity]);
  if(!paid.affectedRows)throw new Error(`没有可打开的${box.name}。`);
  const [characters]=await connection.execute<RowDataPacket[]>('SELECT c.id FROM players p JOIN characters c ON c.player_id=p.id WHERE p.qq_user_id=? AND c.npc_code IS NULL FOR UPDATE',[identity]);
  if(!characters[0])throw new Error('当前没有可接收道具的角色。');
  const counts=new Map<string,number>();
  for(let i=0;i<quantity;i++){const loot=drawAchievementBox(boxKey);counts.set(loot.key,(counts.get(loot.key)??0)+(loot.quantity??1));}
  const items=[...counts].map(([key,itemQuantity])=>({...achievementRewardItemByKey.get(key)!,quantity:itemQuantity}));
  for(const item of items){
    const [definitions]=await connection.execute<RowDataPacket[]>('SELECT id FROM item_definitions WHERE code=?',[item.key]);
    if(!definitions[0])throw new Error(`道具【${item.name}】尚未完成初始化，未消耗道具匣。`);
    await connection.execute('INSERT INTO achievement_rewards(identity_key,reward_key,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[identity,item.key,item.quantity]);
    await grantInventory(connection,Number(characters[0].id),Number(definitions[0].id),{unbound:0,trade:0,personal:item.quantity});
    await connection.execute('INSERT IGNORE INTO player_item_codex(character_id,item_id) VALUES (?,?)',[characters[0].id,definitions[0].id]);
  }
  const result={boxKey,boxName:box.name,quantity,items};
  await connection.execute("INSERT INTO achievement_progress(identity_key,life_key,metric,value_json) VALUES (?,'',?,?)",[identity,metric,JSON.stringify(result)]);
  return result;
};
export const openAchievementBox=async(identity:string,boxKey:AchievementBoxKey,token:string,quantity=1)=>withTransaction(connection=>openAchievementBoxInDatabase(connection,identity,boxKey,token,quantity));

export const backfillAchievementBoxRewards=async(pool:Pool)=>{
  const connection=await pool.getConnection();
  try{
    await connection.beginTransaction();
    const [marker]=await connection.execute<any>("INSERT IGNORE INTO game_data_migrations(code) VALUES ('achievement_rarity_boxes_v1')");
    if(marker.affectedRows){
      const [rows]=await connection.execute<RowDataPacket[]>('SELECT identity_key,achievement_id,rarity FROM achievement_completions ORDER BY identity_key,achievement_id FOR UPDATE');
      for(const row of rows){const reward=achievementBoxRewardForRarity(String(row.rarity));await connection.execute('INSERT IGNORE INTO achievement_box_rewards(identity_key,achievement_id,reward_key,quantity) VALUES (?,?,?,?)',[row.identity_key,row.achievement_id,reward.key,reward.quantity]);await connection.execute('INSERT INTO achievement_rewards(identity_key,reward_key,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[row.identity_key,reward.key,reward.quantity]);}
    }
    await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
};
