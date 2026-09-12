import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { openingFirstMeetingText, openingLessonText, openingNarrativeText, openingNewcomerText, openingRouteByCode } from './opening-content';
import { openingHubs, type OpeningHubCode } from './opening-world.config';
import { openingSafeHubs, openingWorldFor, type OpeningConnection } from './opening-state';
import { grantInventory, consumeInventory } from './inventory-binding';
import type { OpeningBranch, OpeningEntry, OpeningPage, OpeningState, OpeningView } from './opening.types';
import { grantOpeningExperience } from './opening-progress.service';

type StoryRow = RowDataPacket & { character_id:number;route_code:string;story_version:number;state:OpeningState;branch_code:OpeningBranch|null;page_index:number;revision:number;entry_kind:OpeningEntry;started_epoch:number;flags_json:unknown;reward_claimed:number;destination_code:OpeningHubCode };
const json = (value:unknown): Record<string,any> => typeof value === 'string' ? JSON.parse(value) : value as Record<string,any> ?? {};
export const openingCharacter = async (connection:OpeningConnection,user:string,lock=false) => {
  const [rows]=await connection.execute<RowDataPacket[]>(`SELECT c.*,r.code AS region_code FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=?${lock?' FOR UPDATE':''}`,[user]);
  if(!rows[0])throw new Error('请先完成转生。');return rows[0];
};
export const grantOpeningItem = async(connection:PoolConnection,id:number,code:string,quantity=1) => {
  const [items]=await connection.execute<RowDataPacket[]>('SELECT id FROM item_definitions WHERE code=?',[code]);
  if(!items[0])throw new Error(`物品尚未初始化：${code}`);
  await grantInventory(connection,id,Number(items[0].id),{personal:quantity,trade:0,unbound:0});
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)',[id,items[0].id]);
};
const consumeCode=async(connection:PoolConnection,id:number,code:string)=>{
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT id FROM item_definitions WHERE code=?',[code]);
  if(!rows[0])throw new Error('所需物品不存在。');await consumeInventory(connection,id,Number(rows[0].id),1);
};
const loadStory=async(connection:OpeningConnection,id:number,lock=false)=>{
  const [rows]=await connection.execute<StoryRow[]>(`SELECT * FROM player_opening_stories WHERE character_id=?${lock?' FOR UPDATE':''}`,[id]);return rows[0];
};
const erisPages:OpeningPage[]=[{title:'神界·又一次敲门',text:'再睁眼时，椅子上坐着银发的厄里斯。她没有露出惊讶，只先将一杯温水推到你面前。\n\n“欢迎回来。我知道，这句话现在并不合适。”\n\n她核对了你尚未消散的接引印。“旧接引点的保护还没有全部修好。那只守门兽也正在学习把欢迎动作改成挥帽子。这次先由我送你平安回去。”'},
  {title:'神界·写清楚再出发',text:'厄里斯将三份材料放到桌上。\n\n“你可以直接安全返回；也可以带一份事故材料去地上找阿库娅前辈。若希望保留个人核验记录，就用这枚银印。”\n\n你看向空下来的另一张椅子。她轻轻点头：“前辈已经在地上。这里的接引由我继续，不会因此停下。”'}];
const selectedChoice=(row:StoryRow)=>openingRouteByCode(row.route_code,row.story_version)!.choices.find(c=>c.code===row.branch_code);
const scenePages=(row:StoryRow):OpeningPage[]=>{
  const route=openingRouteByCode(row.route_code,row.story_version);if(!route)throw new Error('这段初行故事的版本暂不可读取，请联系管理员。');
  const flags=json(row.flags_json);const choice=selectedChoice(row);
  if(row.state==='armed')return[{title:'初行之路',text:'天赋的光芒已经散去。先打开操作面板，看看自己落在何处；当你首次移动或寻怪时，眼前的相遇才会真正开始。'}];
  if(row.state==='reading'||row.state==='choice'){
    const entry=row.entry_kind==='hunt'?route.huntEntry:route.moveEntry;
    if(row.route_code==='A01'&&flags.eris){
      const accident=route.pages.map(p=>p.text).join('\n\n').split('再睁眼时，蓝发女神')[0].trim();
      return[{title:route.title,text:entry},{title:'一次过于热情的欢迎',text:accident},...erisPages];
    }
    const pages=route.pages.map((page,index)=>({...page,text:openingFirstMeetingText(route,page.text,index)}));
    return route.entryMergedIntoFirstPage?pages:[{title:route.title,text:entry},...pages];
  }
  if(row.state==='branch'){
    if(row.route_code==='A01'&&flags.eris){
      const texts={A:'厄里斯仔细核对返还记录，将目的地写成世界树。\n\n“这一次，落点有人接。我会等到收到平安抵达的回执，再把这一页合上。”',B:'厄里斯将事故函装进信封，封好火漆。\n\n“交到世界树的女神办事桌就好。如果前辈出门了，柜台仍会收件，不必追着她跑。”\n\n她又看了一遍目的地，才打开返还的光门。',C:'厄里斯将银印与你原有记录核对。\n\n“它不会抹去旅程，只是让我们在记录出了问题时，更快找到彼此。”\n\n原有的神技印记没有改变。她向你轻轻点头，光门在身侧打开。'};
      return[{title:'厄里斯·返还',text:texts[row.branch_code!]}];
    }
    return choice!.pages;
  }
  if(row.state==='arrival'){
    if(row.destination_code!==route.destination)return[{title:'安全改道',text:`原定通往${openingHubs[route.destination as OpeningHubCode].name}的道路临时关闭。初行保护在最近的安全节点开启了单向传送门，将我直接送到${openingHubs[row.destination_code].name}公会门前。\n\n${openingHubs[row.destination_code].description}\n\n路线奖励仍按我亲历的选择结算，没有因改道增加额外剧情。`}];
    return (choice?.arrival??route.arrival).map(page=>({...page,text:openingNewcomerText(page.text)}));
  }
  if(row.state==='lesson')return[{title:choice!.quest,text:openingLessonText(route,choice!)}];
  return[{title:choice?.quest??route.title,text:openingNewcomerText(choice?.farewell||'这段经历已经妥善记下。眼前的旅途，可以继续了。')}];
};
const view=(row:StoryRow):OpeningView=>{
  const route=openingRouteByCode(row.route_code,row.story_version)!;const ps=scenePages(row);const pageIndex=row.state==='choice'?ps.length-1:Math.min(Number(row.page_index),ps.length-1);const page=ps[pageIndex];const choice=selectedChoice(row);const flags=json(row.flags_json);
  const state:OpeningState=row.state==='reading'&&Number(row.page_index)>=ps.length-1?'choice':row.state;
  let choices=route.choices.map(c=>({code:c.code,label:c.label}));
  if(row.route_code==='A01'&&flags.eris)choices=[{code:'A',label:'接受厄里斯的安全返还'},{code:'B',label:'带事故函去地上的女神办事桌'},{code:'C',label:'留下厄里斯的个人受理印'}];
  return{route:row.route_code,title:page.title,state,revision:Number(row.revision),text:openingNarrativeText(page.text),page:pageIndex+1,pages:ps.length,branch:row.branch_code,
    choices:state==='choice'?choices:[],action:row.state==='lesson'?choice!.task:undefined,reward:row.reward_claimed?String(flags.rewardName??choice?.rewardName):undefined,destination:row.reward_claimed?openingHubs[row.destination_code].name:undefined,
    forestBattleChoice:row.route_code==='F03'&&flags.forestBattlePending?(flags.forestBattlePending==='join'?'join':'depart'):undefined};
};
export const openingStatus=async(user:string):Promise<OpeningView|null>=>{
  const pool=await getPool();const [chars]=await pool.execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=?',[user]);
  if(!chars[0])return null;const row=await loadStory(pool,Number(chars[0].id));return row?view(row):null;
};
export const beginOpening=async(user:string,entry:OpeningEntry='continue'):Promise<OpeningView|null>=>withTransaction(async connection=>{
  const character=await openingCharacter(connection,user,true);const row=await loadStory(connection,Number(character.id),true);if(!row||row.state==='completed')return null;
  if(row.state==='armed'){
    // 仅首次移动或寻怪有资格抽取并展开路线；旧按钮和手动“继续剧情”只能恢复提示，不能绕过这个边界。
    if(entry==='continue')return view(row);
    const world=await openingWorldFor(connection);const flags={...json(row.flags_json),eris:world.current_goddess==='eris'};
    await connection.execute("UPDATE player_opening_stories SET state='reading',entry_kind=?,started_epoch=?,flags_json=?,revision=revision+1 WHERE character_id=?",[entry,world.reception_epoch,JSON.stringify(flags),character.id]);
    return view((await loadStory(connection,Number(character.id)))!);
  }
  return view(row);
});

const keepRecord=async(connection:PoolConnection,row:StoryRow,code:string,name:string,use:string,future:string)=>{
  await grantOpeningItem(connection,Number(row.character_id),code);
  await connection.execute('INSERT INTO player_opening_keepsakes (character_id,code,record_json) VALUES (?,?,?)',[row.character_id,code,JSON.stringify({name,use,future,route:row.route_code,branch:row.branch_code})]);
};
const settleArrival=async(connection:PoolConnection,row:StoryRow)=>{
  const choice=selectedChoice(row)!;const flags=json(row.flags_json);let code=choice.rewardCode;let name=choice.rewardName;
  const world=await openingWorldFor(connection,true);
  if(row.route_code==='A01'&&row.branch_code==='B'&&!flags.eris&&world.current_goddess!=='aqua'){
    flags.eris=true;flags.handoff=true;
    await connection.execute("UPDATE player_opening_stories SET state='choice',branch_code=NULL,page_index=0,flags_json=? WHERE character_id=?",[JSON.stringify(flags),row.character_id]);return false;
  }
  const safeHubs=await openingSafeHubs(connection,true);
  let destination=safeHubs.find(h=>h.code===row.destination_code);
  if(!destination){
    const [characters]=await connection.execute<RowDataPacket[]>('SELECT pos_x,pos_y FROM characters WHERE id=?',[row.character_id]);
    const character=characters[0];
    safeHubs.sort((a,b)=>Number(!['world_tree','baina_town'].includes(a.code))-Number(!['world_tree','baina_town'].includes(b.code))
      || (Math.abs(a.pos_x-character.pos_x)+Math.abs(a.pos_y-character.pos_y))-(Math.abs(b.pos_x-character.pos_x)+Math.abs(b.pos_y-character.pos_y)) || Number(a.id)-Number(b.id));
    destination=safeHubs[0];
    if(!destination)throw new Error('所有安全接引点暂时关闭或无法使用。你仍受剧情保护，重新开放后可从本页继续。');
    row.destination_code=String(destination.code) as OpeningHubCode;
    await connection.execute('UPDATE player_opening_stories SET destination_code=? WHERE character_id=?',[row.destination_code,row.character_id]);
  }
  if(row.route_code==='S03'&&row.branch_code==='A'){
    const companion=await(await import('./companion.service')).grantWindbirdChick(connection,Number(row.character_id));
    name=`旅程变化：${companion}破壳后选择与你同行`;
  }else if(row.route_code==='S03'&&row.branch_code==='B'){
    await connection.execute('UPDATE characters SET copper_coins=copper_coins+2000 WHERE id=?',[row.character_id]);
    code='opening_s03_rescue_reward';name='2000铜币';
  }else if(choice.rewardKind){
    name=await(await import('./opening-rewards.service')).grantOpeningRouteReward(connection,Number(row.character_id),openingRouteByCode(row.route_code,row.story_version)!,choice);
  }else if(row.route_code==='F01'&&row.branch_code==='A'){
    await (await import('./companion.service')).grantGoldenRabbit(connection,Number(row.character_id));
  }else if(row.route_code==='F01'&&row.branch_code==='B'){
    await grantOpeningItem(connection,Number(row.character_id),'opening_golden_chest');
  }else if(row.route_code==='F02'){
    await connection.execute(`INSERT INTO player_opening_relations (character_id,npc_code,affection,hatred,flags_json) VALUES (?,'seraphra',?,?,?)`,[row.character_id,row.branch_code==='B'?1:0,row.branch_code==='A'?1:0,JSON.stringify({opening:row.branch_code})]);
    if(row.branch_code==='A')await (await import('./opening-chest.service')).grantCrimsonArmor(connection,Number(row.character_id));
    else{await connection.execute('UPDATE characters SET copper_coins=copper_coins+10000 WHERE id=?',[row.character_id]);await keepRecord(connection,row,code,'魔界邀请函','鉴物员查看后归还，凭它留下魔界见闻','魔界的正式邀请');}
  }else if(choice.pack){
    await grantOpeningItem(connection,Number(row.character_id),'healing_herb',choice.pack==='R医'?3:1);
    if(choice.pack==='R契')await grantOpeningItem(connection,Number(row.character_id),'opening_companion_feed',3);
    await (await import('./opening-pack.service')).grantOpeningPackExtras(connection,Number(row.character_id),choice.pack);
  }else{
    if(row.route_code==='A01'&&flags.eris){if(row.branch_code==='A'){code='opening_eris_return';name='厄里斯核验的返还单';}if(row.branch_code==='B'){code='opening_aqua_letter';name='给地上女神的未读事故函';}}
    await keepRecord(connection,row,code,name,choice.rewardUse,choice.future);
  }
  if(row.route_code==='A01'&&row.branch_code==='B'&&!flags.eris){
    await connection.execute("UPDATE opening_world SET current_goddess='eris',reception_epoch=reception_epoch+1,aqua_character_id=?,aqua_location='world_tree',revision=revision+1 WHERE id=1",[row.character_id]);
    await connection.execute("INSERT INTO opening_world_events (code,character_id,text) VALUES ('aqua_descends',?,'蓝发女神来到地上，厄里斯接过接引名册。从此，新的旅人将在银色神辉中醒来。')",[row.character_id]);
  }
  await connection.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=?,current_hp=hp_max,current_mp=mp_max,stamina=120,stamina_updated_at=NOW(),activity_status=\'active\' WHERE id=?',[destination.id,destination.pos_x,destination.pos_y,destination.pos_z,row.character_id]);
  await grantOpeningExperience(connection,Number(row.character_id),'arrival');
  await connection.execute('UPDATE characters SET current_hp=hp_max,current_mp=mp_max WHERE id=?',[row.character_id]);
  if(row.route_code!=='M01'||row.destination_code!=='floating_leaf_town')await grantOpeningItem(connection,Number(row.character_id),`map_${row.destination_code}`);
  flags.rewardName=name;flags.rewardCode=code;
  await connection.execute("UPDATE player_opening_stories SET state='arrival',page_index=0,reward_claimed=1,flags_json=? WHERE character_id=?",[JSON.stringify(flags),row.character_id]);
  return true;
};

const completeOpening=async(connection:PoolConnection,row:StoryRow)=>{
  if(row.route_code==='M01'&&row.destination_code==='floating_leaf_town'){
    const world=await openingWorldFor(connection,true);
    if(!world.leaf_route_open){
      await connection.execute('UPDATE opening_world SET leaf_route_open=1,leaf_discoverer_id=?,revision=revision+1 WHERE id=1',[row.character_id]);
      await connection.execute("INSERT INTO opening_world_events (code,character_id,text) VALUES ('floating_leaf_route',?,'第一位下界旅人完成了浮叶镇航务登记。世界树与浮叶镇之间的公共航路正式开放。')",[row.character_id]);
    }
  }
  await connection.execute("INSERT INTO player_story_progress (character_id,story_code,status,stage) VALUES (?,'forest_guide','completed',0) ON DUPLICATE KEY UPDATE status='completed'",[row.character_id]);
  await connection.execute("UPDATE player_opening_stories SET state='completed',page_index=0 WHERE character_id=?",[row.character_id]);
};

export const advanceOpening=async(user:string,revision:number,action:string):Promise<OpeningView>=>withTransaction(async connection=>{
  if(!Number.isSafeInteger(revision)||revision<0||!['next','lesson','A','B','C','treat'].includes(action))throw new Error('剧情操作无效，请重新打开当前剧情。');
  const character=await openingCharacter(connection,user,true);const row=await loadStory(connection,Number(character.id),true);if(!row)throw new Error('没有进行中的初行剧情。');
  if(row.state==='completed')return view(row);
  const [prior]=await connection.execute<RowDataPacket[]>('SELECT action_key FROM player_opening_actions WHERE character_id=? AND revision=?',[character.id,revision]);
  // 历史 action 只用于阻止重复结算；重发时按当前配置重建页面，避免旧缓存继续显示已删除的抵达文案。
  if(prior[0])return view(row);
  if(Number(row.revision)!==revision)return view(row);
  // 兼容更新前已停在最后阅读页的记录：直接接收选择；旧“继续”只补显选项。
  if(row.state==='reading'&&Number(row.page_index)>=scenePages(row).length-1){
    if(action==='next')return view(row);
    row.state='choice';
  }
  const route=openingRouteByCode(row.route_code,row.story_version)!;
  if(row.state==='armed'){
    if(action!=='next')throw new Error('请先从操作面板移动或寻怪，再展开初行故事。');
    // 旧“继续”按钮可能被重复点击；保留当前提示，不能让它替代首次行动。
    return view(row);
  }else if(row.state==='choice'){
    if(!route.choices.some(c=>c.code===action))throw new Error('请从眼前的选项中选择。');
    const world=await openingWorldFor(connection);const flags=json(row.flags_json);
    if(row.route_code==='A01'&&!flags.eris&&world.current_goddess==='eris'){
      flags.eris=true;flags.handoff=true;await connection.execute("UPDATE player_opening_stories SET state='choice',flags_json=?,page_index=0 WHERE character_id=?",[JSON.stringify(flags),character.id]);
    }else{
      if(row.route_code==='F01'&&action==='A'){
        await consumeCode(connection,Number(character.id),'opening_last_ration');
        await consumeCode(connection,Number(character.id),'opening_mineral_water');
        await consumeCode(connection,Number(character.id),'healing_herb');
      }
      await connection.execute("UPDATE player_opening_stories SET state='branch',branch_code=?,page_index=0 WHERE character_id=?",[action,character.id]);
    }
  }else if(row.state==='lesson'){
    if(action!=='lesson')throw new Error('请先读完当前的公会剧情。');
    await completeOpening(connection,row);
  }else if(['reading','branch','arrival'].includes(row.state)){
    const ps=scenePages(row);
    if(row.state==='branch'&&row.route_code==='F02'&&row.branch_code==='B'&&Number(row.page_index)===ps.length-1){
      if(action!=='treat')throw new Error('请确认敷上微光草药后继续。');await consumeCode(connection,Number(character.id),'healing_herb');
    }else if(action!=='next')throw new Error('请按当前剧情继续。');
    if(row.state==='reading'&&Number(row.page_index)+1>=ps.length-1)await connection.execute("UPDATE player_opening_stories SET state='choice',page_index=? WHERE character_id=?",[ps.length-1,character.id]);
    else if(Number(row.page_index)<ps.length-1)await connection.execute('UPDATE player_opening_stories SET page_index=page_index+1 WHERE character_id=?',[character.id]);
    else if(row.state==='reading')await connection.execute("UPDATE player_opening_stories SET state='choice' WHERE character_id=?",[character.id]);
    else if(row.state==='branch'){
      if(row.route_code==='F03'){
        const flags=json(row.flags_json);flags.forestBattlePending=row.branch_code==='A'?'join':'depart';
        await connection.execute(`INSERT INTO player_story_progress (character_id,story_code,status,stage) VALUES (?,'forest_guide','met',5)
          ON DUPLICATE KEY UPDATE status='met',stage=5`,[character.id]);
        await connection.execute('UPDATE player_opening_stories SET flags_json=? WHERE character_id=?',[JSON.stringify(flags),character.id]);
      }else await settleArrival(connection,row);
    }
    else await completeOpening(connection,row);
  }else throw new Error('当前剧情已经结束，或尚未开始。');
  await connection.execute('UPDATE player_opening_stories SET revision=revision+1 WHERE character_id=?',[character.id]);
  const updated=(await loadStory(connection,Number(character.id)))!;const result=view(updated);
  if(json(updated.flags_json).handoff&&updated.state==='choice')result.text='厄里斯接过了接引名册：“前辈刚刚随另一位旅人下去了。你的物品与恩赐都在，请重新选择这次返还的方式。”';
  await connection.execute('INSERT INTO player_opening_actions (character_id,revision,action_key,result_json) VALUES (?,?,?,?)',[character.id,revision,action,JSON.stringify(result)]);
  return result;
});

/** 剧情战斗已经建立后再结束初行锁，并只结算一次该分支的开局补给。 */
export const completeOpeningForestBattleStart=async(user:string)=>withTransaction(async connection=>{
  const character=await openingCharacter(connection,user,true);const row=await loadStory(connection,Number(character.id),true);
  if(!row||row.route_code!=='F03')throw new Error('当前没有待开始的三人冒险团战斗。');
  const flags=json(row.flags_json);const choice=selectedChoice(row);
  if(row.state==='completed')return String(flags.rewardName??choice?.rewardName??'');
  if(row.state!=='branch'||!choice||!flags.forestBattlePending)throw new Error('三人冒险团尚未准备好迎战。');
  if(!row.reward_claimed){
    if(choice.pack){
      await grantOpeningItem(connection,Number(row.character_id),'healing_herb',choice.pack==='R医'?3:1);
      if(choice.pack==='R契')await grantOpeningItem(connection,Number(row.character_id),'opening_companion_feed',3);
      await (await import('./opening-pack.service')).grantOpeningPackExtras(connection,Number(row.character_id),choice.pack);
    }
    flags.rewardName=choice.rewardName;flags.rewardCode=choice.rewardCode;
  }
  delete flags.forestBattlePending;flags.forestBattleStarted=true;
  await connection.execute("UPDATE player_opening_stories SET state='completed',page_index=0,reward_claimed=1,flags_json=?,revision=revision+1 WHERE character_id=?",[JSON.stringify(flags),row.character_id]);
  return choice.rewardName;
});

export const openingMainQuest=async(user:string)=>{
  const status=await openingStatus(user);if(!status)return null;
  // 初行故事抵达冒险者公会即告结束；后续由通用的注册、选职与等级主线接管。
  if(status.state==='completed')return null;
  return{title:`【主线·${status.title}】`,description:status.state==='armed'?'先观察眼前的动静。首次移动或寻怪会开始你的初行故事。':status.state==='lesson'?status.action!:'眼前的相遇还没有结束，继续故事并作出你的选择。',action:{label:'[继续剧情]',command:'/继续剧情'}};
};
