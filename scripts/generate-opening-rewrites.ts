/** Export the eleven runtime rewrite routes without copying their text into a second source. */
import {readFileSync,writeFileSync} from 'node:fs';
import {openingFirstMeetingText,openingLessonText,openingNarrativeText,openingNewcomerText,openingRouteByCode} from '../src/game/opening-content';
import {firstPersonNarrative} from '../src/game/narrative-voice';
import {openingSpecialArrival} from '../src/game/opening-special-arrivals';

const codes=['R01','R02','R03','S03','D03','H01','H03','I02','I03','W03','A03'];
const target='docs/十一条初行最终剧情全文.md';
const quote=(text:string)=>text.trim().split(/\r?\n/).map(line=>line?`> ${line}`:'>').join('\n');
const narrative=(text:string)=>quote(firstPersonNarrative(openingNarrativeText(text)));
let output='# 十一条初行最终剧情全文\n\n';
output+='> 本文从当前运行时开局数据直接导出。全文展示本轮替换的玩家可见剧情、选择后果与安全区衔接。部分选择会改变同行关系或开启长期羁绊，并非都以领取物品收尾。\n\n';
for(const code of codes){
  const route=openingRouteByCode(code);
  if(!route)throw Error(`Missing opening route: ${code}`);
  output+=`## ${route.code} · ${route.title}\n\n`;
  output+=`**降临地图：**${route.region}　**安全落点：**${route.destination}\n\n`;
  output+=`### 首次移动\n\n${narrative(route.moveEntry)}\n\n`;
  output+=`### 首次寻怪\n\n${narrative(route.huntEntry)}\n\n`;
  output+='### 初遇\n\n';
  route.pages.forEach((item,index)=>{output+=`**第 ${index+1} 段·${item.title}**\n\n${narrative(openingFirstMeetingText(route,item.text,index))}\n\n`;});
  output+='### 选择\n\n';
  for(const choice of route.choices){
    output+=`#### ${choice.code} · ${choice.label}\n\n`;
    choice.pages.forEach((item,index)=>{output+=`**第 ${index+1} 段·${item.title}**\n\n${narrative(item.text)}\n\n`;});
    output+=`**主线记录：**${choice.quest}\n\n**分支结果：**${choice.rewardName}\n\n`;
    const arrival=openingSpecialArrival(route.code,choice.code)??route.arrival;
    output+='**前往安全区：**\n\n';
    arrival.forEach((item,index)=>{output+=`**第 ${index+1} 段·${item.title}**\n\n${narrative(openingNewcomerText(item.text))}\n\n`;});
    output+=`**抵达公会后的剧情：**\n\n${narrative(openingLessonText(route,choice))}\n\n`;
    output+=`**离别：**\n\n${narrative(openingNewcomerText(choice.farewell))}\n\n`;
    output+=`**后续线索：**${choice.future}\n\n`;
  }
}
if(process.argv.includes('--check')){
  if(readFileSync(target,'utf8')!==output)throw Error('十一条初行最终剧情全文已过期，请重新导出。');
}else writeFileSync(target,output);
console.log(JSON.stringify({routes:codes.length,target}));
