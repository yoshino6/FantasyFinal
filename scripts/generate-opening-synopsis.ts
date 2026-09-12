/** Export a compact, runtime-derived overview of every currently selectable opening route. */
import {readFileSync,writeFileSync} from 'node:fs';
import {openingHubs,openingSpawnRegions} from '../src/game/opening-world.config';
import {openingRoutes} from '../src/game/opening-content';
import {forestArrivalGuildScenes,forestArrivalTownScenes} from '../src/game/forest-arrival-content';

const target='docs/地图初始路线剧情简介.md';
const mapNames:Record<string,string>={
  dark_forest:'幽暗密林',worldtree_meadow:'世界树草原环带',morningdew_riverbank:'晨露河岸',
  gravelwind_shore:'砾风石滩',dark_forest_deep:'幽暗密林深处',ridge_foothills:'岩脊山麓',
  rediron_pass:'赤铁山道',mistalgae_marsh:'雾藻湿地',fallenstar_swamp:'坠星沼泽',
  frostcrown_plateau:'霜冠高原',thundercliff:'雷鸣断崖',eclipse_ruins:'蚀月遗迹',
  baina_town:'百纳镇',world_tree:'世界树'
};
const mapOrder=Object.keys(openingSpawnRegions);
let output='# 地图初始路线剧情简介\n\n';
output+=`本文件由当前运行时的 ${openingRoutes.length} 条可选初行路线生成。每条路线均在首次移动或寻怪后触发，分支完成后抵达对应安全区的冒险者公会。\n\n`;
output+='新角色初始获得面包×3、矿泉水×3、草药×3。黄金兔救助分支会各消耗1份。读完最后一段抵达剧情后，玩家会直接进入所在地的公会建筑面板。\n\n';
output+='开局路线在抵达公会后结束，不再自动接入个人后续剧情。此后所有玩家进入同一条主线：注册冒险者、选择主职业、提升至 Lv.10 并积满当前经验、触发《无形的禁锢》、前往百纳镇糖水屋向老板请教、取得天空粉尘并完成突破、提升至 Lv.11，随后进入《失踪的少女》，寻找梨子喵并讨伐哥布林国王。\n\n';
output+='初行抵达时只获得当前安全区的当地地图；冒险者注册本身不会赠送其他地区地图。身处其他安全区的玩家需要通过现有公会接驳与地图兑换前往百纳镇。\n\n';
for(const region of mapOrder){
  const routes=openingRoutes.filter(route=>route.region===region).sort((a,b)=>a.code.localeCompare(b.code));
  output+=`## ${mapNames[region]??region}\n\n`;
  for(const route of routes){
    const hub=openingHubs[route.destination];
    const person=route.person?`**相遇人物：**${route.person.name}，${route.person.description.replace(`${route.person.name}是`,'')}\n\n`:'';
    const choices=route.choices.map(choice=>`${choice.code}·${choice.label}`).join('；');
    const rewards=[...new Set(route.choices.map(choice=>choice.rewardName))].join('／');
    const quests=[...new Set(route.choices.map(choice=>choice.quest))].join('／');
    output+=`### ${route.code} · ${route.title}\n\n`;
    output+=`${person}**开端：**${(route.entryMergedIntoFirstPage?route.pages[0]?.text:route.moveEntry)?.trim()??''}\n\n`;
    output+=`**核心抉择：**${choices}。\n\n`;
    if(route.code==='F03')output+='**剧情战斗：**选择后与三人冒险团组成临时队伍，进入真实的森林史莱姆战斗；胜利后才返回百纳镇。\n\n';
    if(route.code==='F03')output+=`**抵达方式：**${forestArrivalTownScenes[1]}\n\n${forestArrivalTownScenes[4]}\n\n${forestArrivalTownScenes[6]}\n\n${forestArrivalGuildScenes[1]}\n\n${forestArrivalGuildScenes[2]}\n\n${forestArrivalGuildScenes[3]}\n\n`;
    else{
    const arrivals=route.choices.map(choice=>({code:choice.code,text:(choice.arrival??route.arrival).map(scene=>scene.text.trim()).join('\n\n')}));
    if(new Set(arrivals.map(arrival=>arrival.text)).size===1)output+=`**抵达方式：**${arrivals[0]?.text??'沿安全道路抵达附近公会。'}\n\n`;
    else for(const arrival of arrivals)output+=`**${arrival.code} 分支抵达：**${arrival.text}\n\n`;
    }
    output+=`**安全落点与分支收束：**${hub.name}·${hub.guildName}；《${quests}》。\n\n`;
    output+=`**分支结果：**${rewards}。\n\n`;
  }
}
if(process.argv.includes('--check')){
  if(readFileSync(target,'utf8')!==output)throw new Error('Opening synopsis is stale; regenerate before release.');
}else writeFileSync(target,output);
console.log(JSON.stringify({routes:openingRoutes.length,maps:mapOrder.length}));
