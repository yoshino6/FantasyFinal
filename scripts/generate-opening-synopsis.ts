/** Export a compact, runtime-derived overview of every currently selectable opening route. */
import {readFileSync,writeFileSync} from 'node:fs';
import {openingHubs,openingSpawnRegions} from '../src/game/opening-world.config';
import {openingRoutes} from '../src/game/opening-content';

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
output+='本文件由当前运行时的 42 条可选初行路线生成。每条路线均在首次移动或寻怪后触发，分支完成后抵达对应安全区。\n\n';
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
    output+=`${person}**开端：**${route.moveEntry.trim()}\n\n`;
    output+=`**核心抉择：**${choices}。\n\n`;
    output+=`**安全交接：**${route.arrival[0]?.text.trim()??'完成当事人的引导后抵达安全区。'}\n\n`;
    output+=`**落点与主线：**${hub.name}·${hub.guildName}；《${quests}》。\n\n`;
    output+=`**分支结果：**${rewards}。\n\n`;
  }
}
if(process.argv.includes('--check')){
  if(readFileSync(target,'utf8')!==output)throw new Error('Opening synopsis is stale; regenerate before release.');
}else writeFileSync(target,output);
console.log(JSON.stringify({routes:openingRoutes.length,maps:mapOrder.length}));
