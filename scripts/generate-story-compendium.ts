/** Export the complete player-facing opening and Lamplight scripts from the runtime data. */
import {readFileSync,writeFileSync} from 'node:fs';
import {openingFirstMeetingText,openingLessonText,openingNarrativeText,openingNewcomerText,openingRoutes,openingRouteVersions} from '../src/game/opening-content';
import {openingHubs} from '../src/game/opening-world.config';
import {lamplightPrivate,lamplightLegacy,lamplightLocal,lamplightJoin,lamplightWorld} from '../src/game/lamplight-content.generated';
import {lamplightPublicText} from '../src/game/lamplight.config';
import {lamplightWork} from '../src/game/lamplight-work';
import {keepsakeDefinitions} from '../src/game/opening-keepsakes.config';
import {firstPersonNarrative} from '../src/game/narrative-voice';
import {openingSpecialArrival} from '../src/game/opening-special-arrivals';
import type {OpeningRoute} from '../src/game/opening.types';
import type {LamplightNode,LamplightState} from '../src/game/lamplight.types';

const target='docs/最终剧情完整脚本V1.md';
const openingRegionNames:Record<string,string>={
  dark_forest:'幽暗密林',worldtree_meadow:'世界树草原环带',morningdew_riverbank:'晨露河岸',gravelwind_shore:'砾风石滩',
  dark_forest_deep:'幽暗密林深处',ridge_foothills:'岩脊山麓',rediron_pass:'赤铁山道',mistalgae_marsh:'雾藻湿地',
  fallenstar_swamp:'坠星沼泽',frostcrown_plateau:'霜冠高原',thundercliff:'雷鸣断崖',eclipse_ruins:'蚀月遗迹',
  baina_town:'百纳镇',world_tree:'世界树'
};
const quote=(text:string)=>text.trim().split(/\r?\n/).map(line=>line?`> ${line}`:'>').join('\n');
const narrativeQuote=(text:string)=>quote(firstPersonNarrative(openingNarrativeText(text)));
const title=(level:number,text:string)=>`${'#'.repeat(level)} ${text}\n\n`;
const current=new Set(openingRoutes.map(route=>`${route.code}@${route.version}`));
const stateFor=(route:string,branch:string):Pick<LamplightState,'origin_route'|'origin_branch'>=>({origin_route:route,origin_branch:branch});

const routeText=(route:OpeningRoute)=>{
  let output=title(3,`${route.code} · ${route.title}（V${route.version}）`);
  output+=`- 降临地图：${openingRegionNames[route.region]??route.region}\n- 安全落点：${openingHubs[route.destination]?.name??route.destination}\n\n`;
  output+=title(4,'首次移动');output+=narrativeQuote(route.moveEntry)+'\n\n';
  output+=title(4,'首次寻怪');output+=narrativeQuote(route.huntEntry)+'\n\n';
  output+=title(4,'初遇');
  for(const [index,page] of route.pages.entries()){
    const text=openingFirstMeetingText(route,page.text,index);
    output+=`**第 ${index+1} 段·${page.title}**\n\n${narrativeQuote(text)}\n\n`;
  }
  output+=title(4,'选择与后果');
  for(const choice of route.choices){
    output+=title(5,`${choice.code} · ${choice.label}`);
    for(const [index,page] of choice.pages.entries())output+=`**第 ${index+1} 段·${page.title}**\n\n${narrativeQuote(page.text)}\n\n`;
    output+=`**分支结果：**${choice.rewardName}\n\n`;
    output+=`**前往安全区：**\n\n`;
    for(const [index,page] of (openingSpecialArrival(route.code,choice.code)??route.arrival).entries())output+=`**第 ${index+1} 段·${page.title}**\n\n${narrativeQuote(openingNewcomerText(page.text))}\n\n`;
    output+=`**抵达公会后的剧情：**\n\n${narrativeQuote(openingLessonText(route,choice))}\n\n`;
    output+=`**离别：**\n\n${narrativeQuote(openingNewcomerText(choice.farewell))}\n\n`;
  }
  return output;
};

const nodeText=(node:LamplightNode,state:Pick<LamplightState,'origin_route'|'origin_branch'>,index:number)=>{
  const work=lamplightWork(node),choice=work.test[work.answer];
  let output=title(5,`${index+1}. 《${node.title}》`);
  output+=`**当事人：**${node.npc}\n\n**抵达与委托：**\n\n${quote(lamplightPublicText(node.intro,state))}\n\n`;
  output+=`**现场核验：**\n\n${quote(lamplightPublicText(node.findings[0],state))}\n\n`;
  output+=`**联络记录：**\n\n${quote(lamplightPublicText(node.findings[1],state))}\n\n`;
  output+=`**处理方向：**\n\n${node.choices.map((item,i)=>`${'ABC'[i]??String(i+1)} · ${item}`).join('\n\n')}\n\n`;
  output+=`**现场处理：**${work.object}共 ${work.units} 份。\n\n`;
  output+=`**核验选项：**\n\n${work.test.map((item,i)=>`${i+1}. ${item}`).join('\n\n')}\n\n`;
  output+=`**通过条件：**${choice}\n\n`;
  output+=`**处理步骤：**${work.steps[0]}；${work.steps[1]}。\n\n`;
  output+=`**回执：**${work.receipts[0]}；${work.receipts[1]}。\n\n`;
  output+=`**结语：**\n\n${quote(lamplightPublicText(node.conclusion,state))}\n\n`;
  return output;
};

const arcText=(name:string,arcs:Record<string,LamplightNode[]>,legacy=false)=>{
  let output=title(3,name);
  for(const [route,nodes] of Object.entries(arcs)){
    const opening=openingRouteVersions.find(item=>item.code===route&&(legacy?item.version<4:true))??openingRoutes.find(item=>item.code===route);
    const branch=opening?.choices[0]?.code??'A';
    output+=title(4,`${route} · ${opening?.title??'旧冒险记录'}`);
    nodes.forEach((node,index)=>output+=nodeText(node,stateFor(route,branch),index));
  }
  return output;
};

const rewrittenCodes=['R01','R02','R03','S03','D03','H01','H03','I02','I03','W03','A03'];
const rewriteStoryTarget='docs/本次十一条路线新增剧情全文.md';
let rewriteStory='# 本次十一条路线新增剧情全文\n\n';
rewriteStory+='> 本文由本次实装后的运行数据直接导出。完整收录 11 条路线的开局触发、初遇、全部分支、奖励、抵达安全区过程、33 个个人后续节点，以及仍然有效的三项专属线索服务。\n\n';
rewriteStory+=title(2,'第一部分 · 完整初行剧情');
for(const code of rewrittenCodes){
  const route=openingRoutes.find(item=>item.code===code);
  if(!route)throw Error(`Missing rewritten opening ${code}`);
  rewriteStory+=routeText(route);
}
rewriteStory+=title(2,'第二部分 · 完整个人后续');
for(const code of rewrittenCodes){
  const route=openingRoutes.find(item=>item.code===code);
  const nodes=lamplightPrivate[code];
  if(!route||!nodes)throw Error(`Missing rewritten story ${code}`);
  rewriteStory+=title(2,`${code} · ${route.title}`);
  rewriteStory+=`**初行地点：**${openingRegionNames[route.region]??route.region}\n\n**安全区：**${openingHubs[route.destination]?.name??route.destination}\n\n`;
  nodes.forEach((node,index)=>rewriteStory+=nodeText(node,stateFor(code,route.choices[0]?.code??'A'),index));
}
rewriteStory+=title(2,'第三部分 · 专属线索服务');
for(const service of keepsakeDefinitions.filter(item=>rewrittenCodes.includes(item.branch.slice(0,3)))){
  rewriteStory+=title(3,`${service.branch} · ${service.desk}`);
  rewriteStory+=`**经办人：**${service.npc}\n\n**办理过程：**\n\n${quote(service.dialogue)}\n\n**办理结果：**${service.result}\n\n`;
}

const specialOpeningPages=`
## 服务端专属插曲

### 恶魔少女·救援线抵达百纳镇

**微光与王印**

> 微光在伤口旁收拢。少女试着活动肩膀，忽然说：“瑟芙菈。我的名字。”
>
> 她将一枚金币与火漆完好的信放进你的掌心。“药钱，还有谢礼。将来走到魔界门前，至少有人愿意听你说完。”
>
> 她点亮银饰上的半枚王印，红光贴着地面延向林外。“跟着我。你连路都不认识，留在这里，明天恐怕轮到我替你敷药。”

**城门前的找零**

> 百纳镇城门前，摊主把一枚银币推回猫族少女手中。
>
> “多给了一枚。”
>
> “我知道喵！我是……先让它在你这里待一会儿。”她赶紧接过钱，耳尖已经红了。
>
> 瑟芙菈停在门外：“这里够安全。后面自己走。信别弄丢。”梨子喵抱着纸袋迎来：“第一次来喵？我叫梨子，公会就在里面，这次我真的记得路。”

**刚刚归来的三人**

> 铁靴踏过碎石，莱昂的盾缘还挂着史莱姆黏液。伊芙用火星烘袖口，希娅将绷带收回药袋。
>
> “史莱姆收拾完了。”莱昂看向你，“新来的？别跟她在摊位研究找零，先去公会。”
>
> “我没有研究找零喵！”
>
> 梨子喵拉住你的衣袖，快步入城。背后传来伊芙的笑，希娅温声提醒小心台阶。

### 黄金兔·同行线抵达百纳镇

> 黄金兔嗅着风跑向林间一点微光，又回头等你。它认得附近引灯人的气味，却不敢独自穿过幽深树影。
>
> 引灯人俯身看看兔子，再看看你空下来的口粮袋，没多问，抬灯走在前面。兔子一路反复回头，等你跟上才继续蹦跳。城门灯火终于亮起。

### 女神殿事故后的厄里斯返还

**又一次敲门**

> 再睁眼时，椅子上坐着银发的厄里斯。她没有露出惊讶，只先将一杯温水推到你面前。
>
> “欢迎回来。我知道，这句话现在并不合适。”
>
> 她核对了你尚未消散的接引印。“旧接引点的保护还没有全部修好。那只守门兽也正在学习把欢迎动作改成挥帽子。这次先由我送你平安回去。”

**写清楚再出发**

> 厄里斯将三份材料放到桌上。
>
> “你可以直接安全返回；也可以带一份事故材料去地上找阿库娅前辈。若希望保留个人核验记录，就用这枚银印。”
>
> 你看向空下来的另一张椅子。她轻轻点头：“前辈已经在地上。这里的接引由我继续，不会因此停下。”
`;

const openingTargets=['docs/开局路线分段与分支总汇.md','docs/开局路线分段与分支总汇（当前生效）.md'];
let currentOpening='# 开局路线分段与分支总汇（当前生效）\n\n';
currentOpening+='> 本文由当前运行时的 42 条初行路线直接导出，只包含新角色当前能够抽取的剧情。已否决旧稿与历史兼容文本不列入本文件。\n\n';
for(const route of openingRoutes)currentOpening+=routeText(route);

let output='# 最终剧情完整脚本 V1\n\n';
output+='> 本文由当前运行时开局路线、灯火所至任务图和共用处理规则直接导出。保留所有玩家可读的完整段落、分支、交接、处理选项与结语；旧版本仅供已在途角色继续读取。\n\n';
output+=title(2,'本轮文案复核与修改');
output+='- 将全部安全区交接改为由路线当事人、随身线索或现场事件自然引出，不再使用“接引人备好教具”的统一段落。\n- 将灯火世界线的第二份核验记录改为明确的原件、观察和回讯交接，删除重复描述与指代不明的“接收端值守”。\n- 所有以下正文均保留行动者、受影响对象、行动目的和结果；系统任务、奖励和玩法条件与剧情正文分列。\n\n';
output+='- 玩家可见叙事统一采用第一人称；引号中的 NPC 对话保留对主角说“你”的自然口吻。\n- 新旅人初见路线人物时，角色会以符合自身性格的方式报出姓名；失忆、无法言语或暂不信任主角的角色，则将姓名留在后续情节揭示。\n\n';
output+=title(2,'降临与初行');
output+='## 新角色当前使用的 42 条路线\n\n';
for(const route of openingRoutes)output+=routeText(route);
output+='## 已在途角色的旧版 21 条路线\n\n';
for(const route of openingRouteVersions.filter(route=>!current.has(`${route.code}@${route.version}`)))output+=routeText(route);
output+=firstPersonNarrative(openingNarrativeText(specialOpeningPages));
output+=title(2,'灯火所至');
output+=arcText('个人后续·当前路线',lamplightPrivate);
output+=arcText('个人后续·旧版兼容',lamplightLegacy,true);
output+=title(3,'地区汇流');
for(const [hub,nodes] of Object.entries(lamplightLocal)){output+=title(4,hub);nodes.forEach((node,index)=>output+=nodeText(node,stateFor('LEGACY','A'),index));}
output+=title(3,'联合调查');lamplightJoin.forEach((node,index)=>output+=nodeText(node,stateFor('LEGACY','A'),index));
output+=title(3,'世界主线');lamplightWorld.forEach((node,index)=>output+=nodeText(node,stateFor('LEGACY','A'),index));

if(process.argv.includes('--check')){
  for(const openingTarget of openingTargets)if(readFileSync(openingTarget,'utf8')!==currentOpening)throw Error(`${openingTarget} 已过期，请重新导出。`);
  if(readFileSync(rewriteStoryTarget,'utf8')!==rewriteStory)throw Error(`${rewriteStoryTarget} 已过期，请重新导出。`);
  if(readFileSync(target,'utf8')!==output)throw Error('最终剧情完整脚本已过期，请重新导出。');
}else{
  for(const openingTarget of openingTargets)writeFileSync(openingTarget,currentOpening);
  writeFileSync(rewriteStoryTarget,rewriteStory);
  writeFileSync(target,output);
}
console.log(JSON.stringify({openingCurrent:openingRoutes.length,openingLegacy:openingRouteVersions.length-openingRoutes.length,lamplightNodes:Object.values(lamplightPrivate).flat().length+Object.values(lamplightLegacy).flat().length+Object.values(lamplightLocal).flat().length+lamplightJoin.length+lamplightWorld.length}));
