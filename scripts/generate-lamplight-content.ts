/** Compile the approved task graph; runtime never reads design Markdown. */
import {readFileSync,writeFileSync} from 'node:fs';
import type {LamplightNode} from '../src/game/lamplight.types';
import {lamplightWorldScenes} from '../src/game/lamplight-world.story';
import {lamplightLocalScenes} from '../src/game/lamplight-local.story';
import {lamplightPrivateRewrites} from '../src/game/lamplight-private-rewrites';
const doc=readFileSync('docs/多地图初行后续与主线汇流设计V1.md','utf8').replace(/\r/g,'');
const old=readFileSync('docs/七图旧路线后续主线历史稿20260908.md','utf8').replace(/\r/g,'');
const clean=(s:string)=>s.replace(/\*\*/g,'').replace(/归(?:入)? H[BWFSDM]-\d[。；]?/g,'').replace(/奖励 P[。，]?/g,'').replace(/WM\d{2}/g,'后续调查').replace(/JN(?:-\d)?/g,'联合调查').replace(/初行 ([ABC])/g,'来时选择 $1').trim();
const hubInfo:Record<string,[string,string]>={HB:['baina_town','莫妮卡'],HW:['world_tree','维萝'],HF:['floating_leaf_town','菈芮'],HS:['snowlamp_hollow','温棠'],HD:['frost_dragon_inn','格琳达'],HM:['sleepwhale_market','滴算']};
const choiceLabels=(s:string):[string,string]=>{
 const labels=[...s.matchAll(/【([^】]+)】/g)].map(m=>m[1]).filter(s=>s.length<34);
 return labels.length>=2?[labels[0],labels[1]]:['先保护受影响的人，再核验记录','先请见证人核验，再安排交接'];
};
const privateLines=(source:string)=>Object.fromEntries([...source.matchAll(/^### ([A-Z]\d{2}) (.+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)].map(m=>{
 const [,route,title,text]=m;
 const intro=text.match(/\*\*衔接：\*\*(.+)/)?.[1]??title;
 const npc=text.match(/^> 【([^】]+)】/m)?.[1]??'公会联络员';
 const steps=[...text.matchAll(/^[123]\. \*\*《([^》]+)》\*\*：(.+)$/gm)];
 if(steps.length!==3)throw Error(`Incomplete private arc ${route}`);
 return [route,steps.map((step,index):LamplightNode=>({code:`${route}-${index+1}`,title:step[1],npc,intro:index===0?clean(intro):`${npc}带来《${step[1]}》的下一份记录。\n${clean(step[2])}`,
   findings:[clean(step[2]),`${npc}将《${step[1]}》有关的原记录与这次的见闻并排放好，请你核对来源与接收人。${text.match(/^> (.+)$/m)?.[1]??'原见证人确认自己说过的话，将仍不确定的部分留白。'}`],
   choices:choiceLabels(step[2]),conclusion:clean(text.match(/^> (.+)$/m)?.[1]??`${npc}收好本次交接，约好下一次核验的事。`),minLevel:5,endLevel:7,copper:[60,80,160][index],experienceShare:.1,place:'origin'}))];
}));
const privateArcs={...privateLines(doc),...lamplightPrivateRewrites};
// These eleven drafts were rejected in full. Existing characters on an older
// story version must continue from the replacement arc instead of resurfacing
// the removed cast or incident through the compatibility graph.
const legacyArcs=privateLines(old);
for(const [route,nodes] of Object.entries(lamplightPrivateRewrites))if(legacyArcs[route])legacyArcs[route]=nodes;
const localArcs:Record<string,LamplightNode[]>={};
for(const [prefix,[hub,npc]] of Object.entries(hubInfo)){
 const rows=[...doc.matchAll(new RegExp('^\\| ('+prefix+'-[1-8]) \\| ([^|]+) \\| ([^|]+) \\|$','gm'))];
 localArcs[hub]=rows.map((r,i)=>({code:r[1],title:r[2].match(/《([^》]+)》/)![1],npc,intro:clean(r[2].replace(/^《[^》]+》：/,'')),
   findings:[clean(r[3]),'值守人将当日的人员与交通记录放在桌上。你将现场观察逐项对照，标出差异，再确认还有哪条安全的回程路。'],
   choices:choiceLabels(r[3]),conclusion:`${npc}将已核实的结果收入当地案卷。来路不同的人，终于能在同一份记录里找到彼此。`,
   minLevel:i<4?8:11,endLevel:i<4?9:19,copper:prefix==='HB'&&i>=5?0:i<4?100:200,experienceShare:i<4?.075:prefix==='HB'&&i>=4?0:.075,place:hub,
   gate:i===4?'barrier':prefix==='HB'&&i===5?'goblin':prefix==='HB'&&i===7?'gratitude':undefined}));
 if(rows.length!==8)throw Error(`Incomplete hub ${prefix}`);
}
const join:LamplightNode[]=[...doc.matchAll(/^\| JN-([1-6])《([^》]+)》 \| ([^|]+) \| ([^|]+) \|$/gm)].map(r=>({
 code:`JN-${r[1]}`,title:r[2],npc:Number(r[1])>=4?'噶':'维萝',intro:clean(r[3]),findings:[clean(r[4]),'六地寄来的资料各有出处。你只说明自己亲眼经历过的部分，其他人的见闻由署名的调查记录补足。'],
 choices:['先核对居民与见证记录','先核对设施与运输记录'],conclusion:'公会和图书馆确认本次研究结果，将可以查证的事实与仍待回答的问题分别保存。',
 minLevel:20,endLevel:24,copper:200,experienceShare:Number(r[1])===4||Number(r[1])===5?0:.25/6,place:'world_tree',gate:Number(r[1])===4?'library':Number(r[1])===5?'research':undefined}));
const levels=[[25,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,89],[90,100]];
const budgets=[2000,3000,4000,5000,6000,8000,10000,12000];
const people=['艾蕾诺','温棠','伊赛','瑟芙菈','接引女神','布隆','维萝','诺维恩'];
const world:LamplightNode[]=[];
for(const m of doc.matchAll(/^### WM(0[1-8]) (.+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)){
 const chapter=Number(m[1])-1,body=m[3],sequence=body.match(/\*\*任务顺序：\*\*(.+)/)?.[1];
 if(!sequence)throw Error(`Missing chapter ${m[1]}`);
 const tasks=[...sequence.matchAll(/[①②③④⑤]《([^》]+)》([^→]+)/g)];
 const last=body.match(/\*\*章节结束：\*\*(.+)/)?.[1]??'界路的选择权回到居民与各地共同维护者手中。诺维恩失去强制改线权限，接受追责。';
 for(const [i,task] of tasks.entries())world.push({code:`WM${m[1]}-${i+1}`,title:task[1],npc:people[chapter],intro:clean(task[2]),
  findings:[clean(body.match(/\*\*关键选择：\*\*(.+)/)?.[1]??'先隔离改线核心，保留维生节点。每条撤离路都必须有另一端的接应。'),
    clean(body.match(/\*\*私人回响：\*\*(.+)/)?.[1]??'各地送来自己的接应结果。救援是否完成，由人员到达与物资交接共同确认。')],
  choices:chapter===7&&i===3?['公开分权，由六地保有本地维护权','暂交有任期与监督的联合维护组']:choiceLabels(body.match(/\*\*关键选择：\*\*(.+)/)?.[1]??''),
  conclusion:clean(i===4?last:`${people[chapter]}确认本次行动的结果，保留必要的安全措施，再继续下一处调查。`),
  minLevel:levels[chapter][0],endLevel:levels[chapter][1],copper:budgets[chapter]/5,experienceShare:.05,place:`lamplight_wm${m[1]}`,
  gate:chapter===7&&i===1?'boss':undefined});
 if(tasks.length!==5)throw Error(`Incomplete world chapter ${m[1]}`);
}
if(Object.keys(privateArcs).length!==42||Object.keys(legacyArcs).length!==21||join.length!==6||world.length!==40)throw Error('Incomplete lamplight graph');
for(const nodes of Object.values(localArcs))for(const node of nodes){
 const scene=lamplightLocalScenes[node.code];if(!scene)throw Error(`Missing public scene ${node.code}`);
 node.intro=scene[0];node.findings=[scene[1],`${node.npc}将本次登记与现场的回讯放在一起，保留每一位见证人的署名。\n${scene[0]}`];
}
const joined:[string,string][]=[
 ['维萝','六封信铺在同一张桌上。维萝先请你说明自己的案件，再读其他五地署名的摘要。不同的事故里，都出现了未经居民确认的改线。'],
 ['澄叶','澄叶拼好六份图，笔尖停在一条不该出现的直线上。居民、运输和机关记录分别来自不同地方，却使用了相同的旧设施编号。'],
 ['图书馆值守','公会研究委托只写了旧路网的题目。值守将总目录转向你：“先从目录找。名字和答案，都要有能查到的来处。”'],
 ['图书馆值守','纸页摩擦声从阅览室传来。大厅的索引指向一份旧笔记，笔记又指向封存资料；每个房间都只留着下一段能够查证的线索。'],
 ['噶','噶先将茶杯挪远，腾出放证据的位置。“看懂一张图，和知道它会让什么发生，是两回事。我们做一次验证。”'],
 ['维萝','噶确认旧设施会依照获得授权的道路连接空间。维萝接过研究结果，请澄叶保管唯一的合并案卷：“以后，一起查下去。”']
];
for(const [i,node] of join.entries()){node.npc=joined[i][0];node.intro=joined[i][1];node.findings=[joined[i][1],`${node.npc}将馆藏索引、地面观察与署名回讯逐项并排。你只记录能够对应来源的事实；不能核实的部分保留为问题，不替未到场的人补写结论。`];}
join[1].choices=['先比对居民见闻','先比对运输记录','先比对机关证据'];
for(const node of world){const scene=lamplightWorldScenes[node.code];if(!scene)throw Error(`Missing public scene ${node.code}`);node.npc=scene[0];node.intro=scene[1];node.findings=[scene[2],`${scene[0]}将《${node.title}》相关的原始记录、现场观察和接收端回讯分开摆在桌上。你只核对有人署名、能够追溯的事实；未到场的人不被代签，暂时无从判断的问题继续留在案卷中。`];node.conclusion=scene[3];
 // Current ordinary growth ends at Lv.30. Keep the approved chapter order without inventing new realms.
 node.minLevel=Math.min(30,node.minLevel);node.endLevel=Math.min(30,node.endLevel);
}
const output=`// Generated by scripts/generate-lamplight-content.ts; runtime uses this versioned graph.\nimport type {LamplightNode} from './lamplight.types';\nexport const lamplightPrivate:Record<string,LamplightNode[]> = ${JSON.stringify(privateArcs,null,2)};\nexport const lamplightLegacy:Record<string,LamplightNode[]> = ${JSON.stringify(legacyArcs,null,2)};\nexport const lamplightLocal:Record<string,LamplightNode[]> = ${JSON.stringify(localArcs,null,2)};\nexport const lamplightJoin:LamplightNode[] = ${JSON.stringify(join,null,2)};\nexport const lamplightWorld:LamplightNode[] = ${JSON.stringify(world,null,2)};\n`;
const target='src/game/lamplight-content.generated.ts';
if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==output)throw Error('Lamplight graph is stale');}else writeFileSync(target,output);
console.log(JSON.stringify({private:126,legacy:63,local:48,join:6,world:40}));
