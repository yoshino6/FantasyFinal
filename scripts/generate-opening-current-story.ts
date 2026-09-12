import {readFileSync,writeFileSync} from 'node:fs';
import {openingFirstMeetingText,openingNarrativeText,openingNewcomerText,openingRoutes} from '../src/game/opening-content';
import {openingHubs} from '../src/game/opening-world.config';
import {firstPersonNarrative} from '../src/game/narrative-voice';

const target='docs/开局路线分段与分支总汇（当前生效）.md';
const mapNames:Record<string,string>={dark_forest:'幽暗密林',worldtree_meadow:'世界树草原环带',gravelwind_shore:'砾风石滩',fallenstar_swamp:'坠星沼泽',frostcrown_plateau:'霜冠高原'};
const render=(text:string)=>firstPersonNarrative(openingNarrativeText(text)).trim();
let output='# 开局路线分段与分支总汇（当前生效）\n\n';
output+='本文档直接由当前运行时配置生成。现开放 8 条初行路线、5 张出生地图、20 个选择分支；未列出的旧路线不会进入抽取池。\n\n';
output+='新角色获得面包×3、矿泉水×3、草药×3。选择恩赐后先查看面板，首次移动或寻怪才展开初行故事。路线抵达当地冒险者公会后结束，最后一个“进入公会”操作会直接打开建筑面板；其后统一进入冒险者注册、职业选择与升至 Lv.10 的主线。\n\n';
for(const route of openingRoutes){
  output+=`## ${route.code} · ${route.title}\n\n`;
  output+=`- 出生地图：${mapNames[route.region]??route.region}\n- 安全终点：${openingHubs[route.destination].name}·${openingHubs[route.destination].guildName}\n\n`;
  if(!route.entryMergedIntoFirstPage){
    output+='### 首次移动\n\n'+render(route.moveEntry)+'\n\n';
    output+='### 首次寻怪\n\n'+render(route.huntEntry)+'\n\n';
  }
  route.pages.forEach((scene,index)=>{output+=`### ${scene.title}\n\n${render(openingFirstMeetingText(route,scene.text,index))}\n\n`;});
  for(const option of route.choices){
    output+=`### 选择 ${option.code} · ${option.label}\n\n`;
    option.pages.forEach(scene=>{output+=`#### ${scene.title}\n\n${render(scene.text)}\n\n`;});
    if(route.code==='F03')output+='**随后进入真实剧情战斗：玩家与莱昂、伊芙、希娅组成临时队伍，共同迎战虚弱的森林史莱姆。击败后才会播放回城段落。**\n\n';
    output+=`**路线结果：${option.rewardName}**\n\n`;
    for(const arrival of option.arrival??route.arrival)output+=`#### ${arrival.title}\n\n${render(openingNewcomerText(arrival.text))}\n\n`;
  }
  output+='**抵达后：直接进入当地冒险者公会建筑面板，本路线不再追加教学、交接或私人委托。**\n\n';
}
if(process.argv.includes('--check')){
  if(readFileSync(target,'utf8')!==output)throw new Error('Current opening story document is stale; regenerate before release.');
}else writeFileSync(target,output);
console.log(JSON.stringify({routes:openingRoutes.length,branches:openingRoutes.reduce((sum,route)=>sum+route.choices.length,0)}));
