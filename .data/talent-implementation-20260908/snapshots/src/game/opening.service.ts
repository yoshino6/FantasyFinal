import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { openingRouteByCode } from './opening-content';
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
  if(row.state==='armed'||row.state==='reading'||row.state==='choice'){
    const entry=row.entry_kind==='hunt'?route.huntEntry:route.moveEntry;
    if(row.route_code==='A01'&&flags.eris){
      const accident=route.pages.map(p=>p.text).join('\n\n').split('再睁眼时，蓝发女神')[0].trim();
      return[{title:route.title,text:entry},{title:'一次过于热情的欢迎',text:accident},...erisPages];
    }
    return[{title:route.title,text:entry},...route.pages];
  }
  if(row.state==='branch'){
    if(row.route_code==='A01'&&flags.eris){
      const texts={A:'厄里斯仔细核对返还记录，将目的地写成世界树。\n\n“这一次，落点有人接。我会等到收到平安抵达的回执，再把这一页合上。”',B:'厄里斯将事故函装进信封，封好火漆。\n\n“交到世界树的女神办事桌就好。如果前辈出门了，柜台仍会收件，不必追着她跑。”\n\n她又看了一遍目的地，才打开返还的光门。',C:'厄里斯将银印与你原有记录核对。\n\n“它不会抹去旅程，只是让我们在记录出了问题时，更快找到彼此。”\n\n原有的神技印记没有改变。她向你轻轻点头，光门在身侧打开。'};
      return[{title:'厄里斯·返还',text:texts[row.branch_code!]}];
    }
    return choice!.pages;
  }
  if(row.state==='arrival'){
    if(row.destination_code!==route.destination)return[{title:'接应改道',text:`引灯人先一步收到停航的消息，立刻请沿路值守改接安全通道。你没有被留在原地等待；${row.route_code==='F02'&&row.branch_code==='B'?'瑟芙菈收起王印，将你一路送到新的接引灯下，才把邀请函交回你手中。':''}\n\n${openingHubs[row.destination_code].description}\n\n原定的${openingHubs[route.destination as OpeningHubCode].name}暂不接待，接引记录与奖励一同转到${openingHubs[row.destination_code].name}。`}];
    if(row.route_code==='F02'&&row.branch_code==='B')return[
      {title:'微光与王印',text:'微光在伤口旁收拢。少女试着活动肩膀，忽然说：“瑟芙菈。我的名字。”\n\n她将一枚金币与火漆完好的信放进你的掌心。“药钱，还有谢礼。将来走到魔界门前，至少有人愿意听你说完。”\n\n她点亮银饰上的半枚王印，红光贴着地面延向林外。“跟着我。你连路都不认识，留在这里，明天恐怕轮到我替你敷药。”'},
      {title:'城门前的找零',text:'百纳镇城门前，摊主把一枚银币推回猫族少女手中。\n\n“多给了一枚。”\n\n“我知道喵！我是……先让它在你这里待一会儿。”她赶紧接过钱，耳尖已经红了。\n\n瑟芙菈停在门外：“这里够安全。后面自己走。信别弄丢。”梨子喵抱着纸袋迎来：“第一次来喵？我叫梨子，公会就在里面，这次我真的记得路。”'},
      {title:'刚刚归来的三人',text:'铁靴踏过碎石，莱昂的盾缘还挂着史莱姆黏液。伊芙用火星烘袖口，希娅将绷带收回药袋。\n\n“史莱姆收拾完了。”莱昂看向你，“新来的？别跟她在摊位研究找零，先去公会。”\n\n“我没有研究找零喵！”\n\n梨子喵拉住你的衣袖，快步入城。背后传来伊芙的笑，希娅温声提醒小心台阶。'}];
    if(row.route_code==='F01'&&row.branch_code==='A')return[{title:'金鼻尖认得的灯',text:'黄金兔嗅着风跑向林间一点微光，又回头等你。它认得附近引灯人的气味，却不敢独自穿过幽深树影。\n\n引灯人俯身看看兔子，再看看你空下来的口粮袋，没多问，抬灯走在前面。兔子一路反复回头，等你跟上才继续蹦跳。城门灯火终于亮起。'}];
    return route.arrival;
  }
  const hub=openingHubs[row.destination_code];
  return[{title:choice?.quest??route.title,text:row.state==='completed'?(choice?.farewell||'你的名字已经写进公会的记录。眼前的旅途，可以继续了。'):`${hub.description}\n\n【${choice!.quest}】\n${choice!.task}。\n\n接引人已经备好所需教具与记录，请完成这一份交接。`}];
};
const view=(row:StoryRow):OpeningView=>{
  const route=openingRouteByCode(row.route_code,row.story_version)!;const ps=scenePages(row);const page=ps[Math.min(Number(row.page_index),ps.length-1)];const choice=selectedChoice(row);const flags=json(row.flags_json);
  let choices=route.choices.map(c=>({code:c.code,label:c.label}));
  if(row.route_code==='A01'&&flags.eris)choices=[{code:'A',label:'接受厄里斯的安全返还'},{code:'B',label:'带事故函去地上的女神办事桌'},{code:'C',label:'留下厄里斯的个人受理印'}];
  return{route:row.route_code,title:page.title,state:row.state,revision:Number(row.revision),text:page.text,page:Number(row.page_index)+1,pages:ps.length,branch:row.branch_code,
    choices:row.state==='choice'?choices:[],action:row.state==='lesson'?choice!.task:undefined,reward:row.reward_claimed?String(flags.rewardName??choice?.rewardName):undefined,destination:row.reward_claimed?openingHubs[row.destination_code].name:undefined};
};
export const openingStatus=async(user:string):Promise<OpeningView|null>=>{
  const pool=await getPool();const [chars]=await pool.execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=?',[user]);
  if(!chars[0])return null;const row=await loadStory(pool,Number(chars[0].id));return row?view(row):null;
};
export const beginOpening=async(user:string,entry:OpeningEntry='continue'):Promise<OpeningView|null>=>withTransaction(async connection=>{
  const character=await openingCharacter(connection,user,true);const row=await loadStory(connection,Number(character.id),true);if(!row||row.state==='completed')return null;
  if(row.state==='armed'){
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
  if(row.route_code==='F01'&&row.branch_code==='A'){
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
  await grantOpeningItem(connection,Number(row.character_id),`map_${row.destination_code}`);
  flags.rewardName=name;flags.rewardCode=code;
  await connection.execute("UPDATE player_opening_stories SET state='arrival',page_index=0,reward_claimed=1,flags_json=? WHERE character_id=?",[JSON.stringify(flags),row.character_id]);
  return true;
};

export const advanceOpening=async(user:string,revision:number,action:string):Promise<OpeningView>=>withTransaction(async connection=>{
  if(!Number.isSafeInteger(revision)||revision<0||!['next','lesson','A','B','C','treat'].includes(action))throw new Error('剧情操作无效，请重新打开当前剧情。');
  const character=await openingCharacter(connection,user,true);const row=await loadStory(connection,Number(character.id),true);if(!row)throw new Error('没有进行中的初行剧情。');
  const [prior]=await connection.execute<RowDataPacket[]>('SELECT action_key,result_json FROM player_opening_actions WHERE character_id=? AND revision=?',[character.id,revision]);
  if(prior[0])return prior[0].action_key===action ? json(prior[0].result_json) as OpeningView : view(row);
  if(Number(row.revision)!==revision)return view(row);
  const route=openingRouteByCode(row.route_code,row.story_version)!;
  if(row.state==='armed'){
    if(action!=='next')throw new Error('请先开始眼前的初行故事。');
    const world=await openingWorldFor(connection);const flags={...json(row.flags_json),eris:world.current_goddess==='eris'};
    await connection.execute("UPDATE player_opening_stories SET state='reading',entry_kind='continue',started_epoch=?,flags_json=? WHERE character_id=?",[world.reception_epoch,JSON.stringify(flags),character.id]);
  }else if(row.state==='choice'){
    if(!route.choices.some(c=>c.code===action))throw new Error('请从眼前的选项中选择。');
    const world=await openingWorldFor(connection);const flags=json(row.flags_json);
    if(row.route_code==='A01'&&!flags.eris&&world.current_goddess==='eris'){
      flags.eris=true;flags.handoff=true;await connection.execute('UPDATE player_opening_stories SET flags_json=?,page_index=0 WHERE character_id=?',[JSON.stringify(flags),character.id]);
    }else{
      if(row.route_code==='F01'&&action==='A')await consumeCode(connection,Number(character.id),'opening_last_ration');
      await connection.execute("UPDATE player_opening_stories SET state='branch',branch_code=?,page_index=0 WHERE character_id=?",[action,character.id]);
    }
  }else if(row.state==='lesson'){
    if(action!=='lesson')throw new Error('请先完成当前入门交接。');
    if(row.route_code==='F01'&&row.branch_code==='B'){
      const [opened]=await connection.execute<RowDataPacket[]>("SELECT 1 FROM opening_chest_requests WHERE character_id=? AND chest_code='opening_golden_chest' AND state='complete' LIMIT 1",[character.id]);
      if(!opened.length)throw new Error('请先打开黄金宝箱，再进行装备教学。');
    }
    if(row.route_code==='F01'&&row.branch_code==='A')await (await import('./companion.service')).openingFeedRabbit(connection,Number(character.id));
    if(!character.adventurer_registered){await connection.execute('UPDATE characters SET adventurer_registered=1 WHERE id=?',[character.id]);await grantOpeningItem(connection,Number(character.id),'adventurer_card');}
    await grantOpeningExperience(connection,Number(character.id),'register');
    if(route.code==='F01'||route.code==='F02'&&row.branch_code==='A'||selectedChoice(row)?.pack)await grantOpeningExperience(connection,Number(character.id),'lesson');
    await connection.execute('UPDATE characters SET current_hp=hp_max,current_mp=mp_max WHERE id=?',[character.id]);
    await grantOpeningItem(connection,Number(character.id),'healing_herb',2);
    await connection.execute("INSERT IGNORE INTO player_opening_services (character_id,code,uses) VALUES (?,'arrival_recovery',1)",[character.id]);
    await connection.execute("INSERT INTO player_opening_services (character_id,code,uses) VALUES (?,'meal',3),(?,'repair',1) ON DUPLICATE KEY UPDATE uses=uses+VALUES(uses)",[character.id,character.id]);
    if(row.route_code==='M01'&&row.destination_code==='floating_leaf_town'){
      const world=await openingWorldFor(connection,true);
      if(!world.leaf_route_open){
        await connection.execute('UPDATE opening_world SET leaf_route_open=1,leaf_discoverer_id=?,revision=revision+1 WHERE id=1',[row.character_id]);
        await connection.execute("INSERT INTO opening_world_events (code,character_id,text) VALUES ('floating_leaf_route',?,'第一位下界旅人完成了浮叶镇航务登记。世界树与浮叶镇之间的公共航路正式开放。')",[row.character_id]);
      }
    }
    await connection.execute("INSERT INTO player_story_progress (character_id,story_code,status,stage) VALUES (?,'forest_guide','completed',0) ON DUPLICATE KEY UPDATE status='completed'",[character.id]);
    await connection.execute("UPDATE player_opening_stories SET state='completed',page_index=0 WHERE character_id=?",[character.id]);
  }else if(['reading','branch','arrival'].includes(row.state)){
    const ps=scenePages(row);
    if(row.state==='branch'&&row.route_code==='F02'&&row.branch_code==='B'&&Number(row.page_index)===ps.length-1){
      if(action!=='treat')throw new Error('请确认敷上微光草药后继续。');await consumeCode(connection,Number(character.id),'healing_herb');
    }else if(action!=='next')throw new Error('请按当前剧情继续。');
    if(Number(row.page_index)<ps.length-1)await connection.execute('UPDATE player_opening_stories SET page_index=page_index+1 WHERE character_id=?',[character.id]);
    else if(row.state==='reading')await connection.execute("UPDATE player_opening_stories SET state='choice' WHERE character_id=?",[character.id]);
    else if(row.state==='branch')await settleArrival(connection,row);
    else await connection.execute("UPDATE player_opening_stories SET state='lesson',page_index=0 WHERE character_id=?",[character.id]);
  }else throw new Error('当前剧情已经结束，或尚未开始。');
  await connection.execute('UPDATE player_opening_stories SET revision=revision+1 WHERE character_id=?',[character.id]);
  const updated=(await loadStory(connection,Number(character.id)))!;const result=view(updated);
  if(json(updated.flags_json).handoff&&updated.state==='choice')result.text='厄里斯接过了接引名册：“前辈刚刚随另一位旅人下去了。你的物品与恩赐都在，请重新选择这次返还的方式。”';
  await connection.execute('INSERT INTO player_opening_actions (character_id,revision,action_key,result_json) VALUES (?,?,?,?)',[character.id,revision,action,JSON.stringify(result)]);
  return result;
});

export const openingMainQuest=async(user:string)=>{
  const status=await openingStatus(user);if(!status)return null;
  if(status.state==='completed')return(await import('./opening-progress.service')).openingFollowupQuest(user);
  return{title:`【主线·${status.title}】`,description:status.state==='armed'?'先观察眼前的动静。首次移动或寻怪会开始你的初行故事。':status.state==='lesson'?status.action!:'眼前的相遇还没有结束，继续故事并作出你的选择。',action:{label:'[继续剧情]',command:'/继续剧情'}};
};
