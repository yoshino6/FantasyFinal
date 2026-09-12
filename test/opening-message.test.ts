import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';
import { talentGroups } from '../src/game/talent.config';
import { openingLessonText, openingRoutes, openingRouteVersions, talentDefinitions } from '../src/game/opening-content';
import { openingHubs } from '../src/game/opening-world.config';
import { rootGuildPeople, rootGuildScenes, guildLessons } from '../src/game/opening-guild.config';
import { firstPersonNarrative } from '../src/game/narrative-voice';

const load=(path:string,mocks:Record<string,unknown>,names?:string[])=>{
  const module={exports:{} as any};
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  const input=names?source.statements.filter(s=>ts.isImportDeclaration(s)||ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(source)))).map(s=>s.getText(source)).join('\n'):source.text;
  const code=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)((name:string)=>mocks[name]??{},module,module.exports);return module.exports;
};
const {npcInteractionMarkdown,messageFormat}=load('src/game/message.ts',{alemonjs:{Format}},['npcInteractionMarkdown','messageFormat']);
test('灯火剧情标题、人物详情与引用排版，长选项蓝色输入链接和十键完整转换',()=>{
  const {lamplightFormat}=load('src/response/lamplight.ts',{alemonjs:{Format}},['lamplightFormat']);
  const format=lamplightFormat({title:'灯火所至·核对案卷',npc:'维萝',text:'树影落在纸上。\n“先说你亲眼见过的。”',revision:7,buttons:Array.from({length:10},(_,i)=>({label:i<3?'先核对居民与运输记录再提交完整见证资料':`操作${i}`,action:`action_${i}`}))});
  const md=format.value.find((v:any)=>v.type==='Markdown'),group=format.value.find((v:any)=>v.type==='BT.group');
  const rendered=converter.createMarkdownText(md.value);assert.match(rendered,/【维萝】/);assert.match(rendered,/qqbot-cmd-input/);assert.doesNotMatch(rendered,/qqbot-cmd-enter/);assert.equal(group.value.length,5);
  assert.equal(converter.createButtonsData(group.value).rows.flatMap((r:any)=>r.buttons).length,10);
  const details=md.value.find((v:any)=>v.type==='MD.button'&&v.options.data==='/灯火人物');assert.equal(details.options.autoEnter,false);
});
const source=ts.createSourceFile('sends.js',readFileSync('node_modules/@alemonjs/qq-bot/lib/sends.js','utf8'),ts.ScriptTarget.Latest,true);
const helpers=['MAX_BUTTON_ROWS','MAX_BUTTONS_PER_ROW','createButtonsData','mdFormatters','createMarkdownText'];
const converter=new Function(source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>helpers.includes(d.name.getText(source)))).map(s=>s.getText(source)).join('\n')+'\nreturn {createButtonsData,createMarkdownText};')();
const catalog=load('src/game/divine-message.ts',{alemonjs:{Format},'./talent.config':{talentGroups},'./opening-content':{talentDefinitions}});

test('初行报酬仅在结算首页以加深提示显示，后续剧情与交接不重复',()=>{
  const {openingFormat}=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
  const states=[['arrival',1],['arrival',2],['lesson',1],['completed',1]] as const;
  for(const [state,page] of states){
    const story={route:'F02',branch:'B',title:'微光与王印',text:'她将谢礼放进你的掌心。',state,page,pages:state==='arrival'?3:1,revision:10,choices:[],reward:'1金币、魔界邀请函'};
    const format=openingFormat(story),md=format.value.find((v:any)=>v.type==='Markdown');
    const rendered=converter.createMarkdownText(md.value);
    if(state==='arrival'&&page===1){
      assert.match(rendered,/(?:^|\n)\*\*已获得：1金币、魔界邀请函\*\*/);
      assert.equal(rendered.split('已获得：').length-1,1);
      assert.equal(converter.createMarkdownText(openingFormat(story).value.find((v:any)=>v.type==='Markdown').value),rendered,'断线重发保留结算消息');
    }else assert.doesNotMatch(rendered,/已获得：/);
  }
});

test('初行结束页只引导进入公会，不再展开路线后续',()=>{
  const {openingFormat}=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
  const format=openingFormat({route:'F01',branch:'A',title:'草窝里的金光',text:'我推开公会大门。',state:'completed',page:1,pages:1,revision:12,choices:[]});
  const buttons=converter.createButtonsData(format.value.find((value:any)=>value.type==='BT.group').value).rows.flatMap((row:any)=>row.buttons);
  assert.deepEqual(buttons.map((button:any)=>button.action.data),['/初行公会','/任务']);
  assert.ok(!buttons.some((button:any)=>button.action.data==='/初行见闻'));
});

test('伙伴认主与破壳使用旅程变化提示，不伪装成物品报酬',()=>{
  const {openingFormat}=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
  for(const reward of ['旅程变化：风羽幼鸟破壳后选择与你同行','旅程变化：无主机偶 #7 主动认主并开始随行']){
    const format=openingFormat({route:'S03',branch:'A',title:'第一次学飞',text:'新的同伴来到我身边。',state:'arrival',page:1,pages:1,revision:11,choices:[],reward});
    const markdown=format.value.find((value:any)=>value.type==='Markdown');
    const rendered=converter.createMarkdownText(markdown.value);
    assert.match(rendered,/\*\*【旅程变化】/);
    assert.doesNotMatch(rendered,/已获得：|旅程变化：/);
  }
});

test('天赋确认先引导打开面板，初行场景使用正文而选项保持正文',()=>{
  const {giftSelectionFormat}=load('src/game/registration-message.ts',{alemonjs:{Format}});
  const gift=giftSelectionFormat({giftName:'星火余烬',regionName:'幽暗密林'});
  const giftMarkdown=gift.value.find((value:any)=>value.type==='Markdown');
  const giftText=converter.createMarkdownText(giftMarkdown.value);
  const giftButtons=converter.createButtonsData(gift.value.find((value:any)=>value.type==='BT.group').value).rows.flatMap((row:any)=>row.buttons);
  assert.equal(giftMarkdown.value.filter((value:any)=>value.type==='MD.blockquote').length,1,'降临叙事合并为一个引用块，避免QQ显示空引用行');
  assert.match(giftText,/> 你的天赋【星火余烬】觉醒了/);
  assert.match(giftText,/首次移动或寻怪时，初行故事才会展开/);
  assert.deepEqual(giftButtons.map((button:any)=>button.action.data),['/面板','/角色','/背包']);

  const {openingFormat}=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
  const story=openingFormat({route:'F01',title:'草窝里的金光',text:'风从树根旁穿过。\n\n“别靠太近。”\n\n兔子缩回草窝。',state:'choice',page:1,pages:1,revision:7,branch:null,reward:undefined,person:{code:'F01',name:'黄金兔'},choices:[{code:'A',label:'递出最后的口粮'}]});
  const markdown=story.value.find((value:any)=>value.type==='Markdown');
  const text=converter.createMarkdownText(markdown.value);
  assert.match(text,/风从树根旁穿过。\s*“别靠太近。”\s*兔子缩回草窝。/);
  assert.doesNotMatch(text,/> 风从树根旁穿过。/);
  assert.match(text,/\n\*\*A · 递出最后的口粮\*\*/);
  assert.doesNotMatch(text,/> A · 递出最后的口粮/);
  assert.doesNotMatch(text,/黄金兔|详情/);
  const storyButtons=converter.createButtonsData(story.value.find((value:any)=>value.type==='BT.group').value).rows.flatMap((row:any)=>row.buttons);
  assert.deepEqual(storyButtons.map((button:any)=>button.action.data),['/初行选择 7 A','/任务']);
});

test('初行阅读页的进度紧跟标题，选项页不重复显示',()=>{
  const {openingFormat}=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
  const reading=openingFormat({route:'F01',title:'草窝里的金光',text:'林风掠过草叶。',state:'reading',page:1,pages:2,revision:7,branch:null,choices:[]});
  const choice=openingFormat({route:'F01',title:'草窝里的金光',text:'兔子静静看着你。',state:'choice',page:2,pages:2,revision:8,branch:null,choices:[{code:'A',label:'递出最后的口粮'}]});
  const text=(format:any)=>converter.createMarkdownText(format.value.find((value:any)=>value.type==='Markdown').value);
  assert.match(text(reading),/^# 初章·草窝里的金光（1\/2）/);
  assert.doesNotMatch(text(reading),/\n（1\/2）/);
  assert.match(text(choice),/^# 初章·草窝里的金光 /);
  assert.doesNotMatch(text(choice),/（2\/2）/);
});

test('初行叙事以第一人称呈现，NPC对白仍以对主角说话的口吻保留',()=>{
  assert.equal(firstPersonNarrative('你摸到你的背包。“你先别动。”她说。你们退到树后。'),'我摸到我的背包。“你先别动。”她说。我们退到树后。');
  const {openingFormat}=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
  const format=openingFormat({route:'S01',title:'石滩修桥剑',text:'你沿石滩后退。“你先别碰剑。”对方说。',state:'reading',page:1,pages:2,revision:7,branch:null,choices:[]});
  const text=converter.createMarkdownText(format.value.find((value:any)=>value.type==='Markdown').value);
  assert.match(text,/我沿石滩后退。/);assert.match(text,/“你先别碰剑。”/);
});

test('全部初行路线抵达公会后延续当事人物，不再落入通用接引文案',()=>{
  assert.equal(openingRoutes.length,8);
  assert.equal(openingRouteVersions.length,8);
  for(const route of openingRouteVersions){
    const text=openingLessonText(route,route.choices[0]);
    assert.doesNotMatch(text,/接引人已经备好所需教具|请根据自己亲眼见到的事/,
      `${route.code} V${route.version} 应有与本路线人物或事件相关的公会剧情`);
  }
  assert.match(openingLessonText(openingRoutes.find(route=>route.code==='M02')!,openingRoutes.find(route=>route.code==='M02')!.choices[0]),/艾蕾诺/);
  assert.match(openingLessonText(openingRoutes.find(route=>route.code==='F01')!,openingRoutes.find(route=>route.code==='F01')!.choices.find(choice=>choice.code==='A')!),/黄金兔/);
});

test('抵达公会后使用进入公会按钮，不再显示完成交接',()=>{
  const {openingFormat}=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
  const format=openingFormat({route:'S03',branch:'A',title:'云巢新生',text:'幼鸟在桌边自己选择了同行。',state:'lesson',page:1,pages:1,revision:12,choices:[]});
  const buttons=converter.createButtonsData(format.value.find((value:any)=>value.type==='BT.group').value).rows.flatMap((row:any)=>row.buttons);
  assert.deepEqual(buttons.map((button:any)=>button.render_data.label),['进入公会','任务']);
  assert.deepEqual(buttons.map((button:any)=>button.action.data),['/初行选择 12 lesson','/任务']);
  assert.doesNotMatch(JSON.stringify(format.value),/完成交接/);
});

test('三人冒险团分支末页进入真实史莱姆战斗',()=>{
  const {openingFormat}=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
  const format=openingFormat({route:'F03',branch:'A',title:'并肩入林',text:'森林史莱姆堵住了去路。',state:'branch',page:1,pages:1,revision:12,choices:[]});
  const buttons=converter.createButtonsData(format.value.find((value:any)=>value.type==='BT.group').value).rows.flatMap((row:any)=>row.buttons);
  assert.deepEqual(buttons.map((button:any)=>button.render_data.label),['迎战史莱姆','任务']);
  assert.deepEqual(buttons.map((button:any)=>button.action.data),['/初行选择 12 next','/任务']);
});

const visibleTalents=talentDefinitions.filter(t=>t.group!=='？？？');

test('神技全部目录、分类、搜索与详情经本机QQ适配器转换，不产生不支持的cmd-enter show',()=>{
  const pages=[];
  for(const group of ['全部',...Object.keys(catalog.divineGroups)])for(let page=1;page<=Math.ceil(visibleTalents.length/5);page++){
    const format=catalog.divineCatalog(page,'',group);pages.push(format);
    const buttons=format.value.find((v:any)=>v.type==='BT.group');
    const selected=converter.createButtonsData(buttons.value).rows.slice(1).flatMap((r:any)=>r.buttons).filter((b:any)=>b.render_data.style===1);
    assert.deepEqual(selected.map((b:any)=>b.action.data),[`/天赋目录 1 ${group}`]);
  }
  pages.push(catalog.divineCatalog(1,'不存在的神技'));
  for(const skill of visibleTalents)pages.push(catalog.divineDetail(skill.number));
  for(const format of pages){
    const md=format.value.find((v:any)=>v.type==='Markdown');
    const text=converter.createMarkdownText(md.value);
    assert.doesNotMatch(text,/<qqbot-cmd-enter\b/);
    const group=format.value.find((v:any)=>v.type==='BT.group');
    assert.ok(group.value.length<=5);
    const converted=converter.createButtonsData(group.value);
    assert.equal(converted.rows.flatMap((r:any)=>r.buttons).length,group.value.flatMap((r:any)=>r.value).length,'适配器不得截掉任何按钮');
    for(const row of converted.rows)for(const button of row.buttons){assert.equal(button.action.enter,true);assert.equal(button.action.type,2);assert.match(button.action.data,/^\/(天赋目录|天赋详情|选择恩赐) /);}
  }
  const detailCodes=new Set<string>();
  for(let page=1;page<=Math.ceil(visibleTalents.length/5);page++){
    const format=catalog.divineCatalog(page);
    const markdown=format.value.find((v:any)=>v.type==='Markdown');
    const links=markdown.value.filter((v:any)=>v.type==='MD.button');
    assert.equal(links.length,Math.min(5,visibleTalents.length-(page-1)*5));
    for(const link of links){assert.equal(link.options.autoEnter,false);detailCodes.add(link.options.data.split(' ')[1]);}
    assert.equal((converter.createMarkdownText(markdown.value).match(/<qqbot-cmd-input\b/g)??[]).length,links.length);
    const group=format.value.find((v:any)=>v.type==='BT.group');
    assert.equal(group.value.length,3,'翻页和九个可见分类完整显示');
    assert.ok(converter.createButtonsData(group.value).rows.flatMap((r:any)=>r.buttons).every((b:any)=>!b.action.data.startsWith('/天赋详情 ')));
  }
  assert.deepEqual([...detailCodes].sort(),visibleTalents.map(s=>s.number).sort());
});

test('相同注册阶段重发保存的完整正文，女神更替只在新页面明确交接',async()=>{
  const records:any[]=[];let stage='story',goddess='aqua',rolls=0;
  const connection={execute:async(sql:string,args:any[]=[])=>{
    if(sql.startsWith('SELECT s.id'))return[[{id:'s1',stage}]];
    if(sql.startsWith('SELECT stage,goddess'))return[[...records].reverse()];
    if(sql.startsWith('INSERT INTO registration_scene_records')){records.push({stage:args[1],goddess:args[2],text:args[3]});return[{}];}
    throw Error(sql);
  }};
  const scene=load('src/game/divine-message.ts',{alemonjs:{Format},'./talent.config':{talentGroups},'./opening-content':{talentDefinitions},'../database/pool':{withTransaction:async(fn:any)=>fn(connection)},'./opening-state':{openingWorldFor:async()=>({current_goddess:goddess})},'./message':{randomStoryText:()=>`最后一幕 ${++rolls}`,audienceText:'阿库娅接引',questionText:'阿库娅回答'}}).registrationScene;
  const first=await scene('story','u');assert.deepEqual((await scene('story','u')).value,first.value);assert.equal(records.length,1);
  stage='audience';const audience=await scene('audience','u');goddess='eris';assert.deepEqual((await scene('audience','u')).value,audience.value);
  stage='question';const question=await scene('question','u');assert.match(JSON.stringify(question.value),/阿库娅前辈刚随一位旅人下界/);assert.match(JSON.stringify(question.value),/厄里斯/);
  assert.deepEqual((await scene('question','u')).value,question.value);assert.equal(records.length,3);
  stage='choice';const choice=await scene('danger','u');assert.match(JSON.stringify(choice.value),/选择天赋/);
});

test('世界树人物页和满员随从名册经过QQ转换，不丢人物、邀请或返回按钮',async()=>{
  const assertButtons=(format:any,count:number)=>{const group=format.value.find((v:any)=>v.type==='BT.group');assert.ok(group.value.length<=5);const converted=converter.createButtonsData(group.value);assert.equal(converted.rows.flatMap((r:any)=>r.buttons).length,count);};
  const guild=load('src/response/opening-guild.ts',{alemonjs:{Format},'../game/opening-guild.config':{rootGuildPeople,guildLessons},'../game/opening-world.config':{openingHubs},'../game/opening-guild.service':{openingGuildView:async()=>({hub:openingHubs.world_tree,code:'world_tree',at:true,inside:true,place:{},services:[],maps:[],world:{}})}});
  assertButtons(await guild.openingGuildFormat('u','人物'),9);
  let output:any;
  const companion=load('src/response/companion.ts',{alemonjs:{Format,useEvent:()=>[{current:{UserId:'u'}}],useRoute:()=>[{param:()=>undefined}]},'../game/use-game-message':{useGameMessage:()=>[{send:async({format}:any)=>{output=format;}}]},'../game/companion.service':{companionPanel:async()=>({companions:Array.from({length:6},(_,i)=>({id:i+1,name:`随从${i+1}`,level:1,intimacy:10})),invitation:{name:'等待同行的球兔'}})}});
  await companion.companionHandler('panel')();assertButtons(output,10);
});


test('世界树前台沿用百纳镇业务分组，登记和闲聊均留在维萝柜台，QQ按钮完整',async()=>{
  let registered=false,context:any={code:'world_tree',hub:openingHubs.world_tree},output:any;
  const chats:any[]=[];
  const adventure=load('src/response/adventure.ts',{
    alemonjs:{Format,useEvent:()=>[{current:{UserId:'u'}}]},
    '../game/use-game-message':{useGameMessage:()=>[{send:async({format}:any)=>{output=format;}}]},
    '../game/message':{npcInteractionMarkdown},
    '../game/character.service':{adventurerProfile:async()=>({adventurer_registered:registered}),registerAdventurer:async()=>true},
    '../game/guild-context':{requireCurrentGuild:async()=>context},
    '../game/opening-guild.service':{openingGuildAction:async(...args:any[])=>{chats.push(args);return '维萝将笔搁好：“我记得你的名字。”';}},
    '../game/main-quest.service':{currentMainQuest:async()=>({title:''})},
    '../game/adventure.service':{nearbyPoints:async()=>({npcDetailsUnlocked:true})},
    '../game/dungeon-quest.service':{dungeonSecretProgress:async()=>({stage:0})}
  },['guildFrontDeskFormat','guildChatHandler','guildRegistrationHandler']);
  const rows=(format:any)=>{
    const group=format.value.find((v:any)=>v.type==='BT.group');
    const converted=converter.createButtonsData(group.value);
    assert.equal(converted.rows.flatMap((r:any)=>r.buttons).length,group.value.flatMap((r:any)=>r.value).length);
    return converted.rows.map((r:any)=>r.buttons);
  };
  let local=await adventure.guildFrontDeskFormat('u');
  assert.deepEqual(rows(local).map((r:any[])=>r.map(b=>b.render_data.label)),[['冒险者 注册','职业选择'],['闲聊 维萝','返回公会大厅']]);
  assert.doesNotMatch(JSON.stringify(local.value),/莫妮卡|guild_counter/);
  context={code:'baina_town',hub:openingHubs.baina_town};
  const baina=await adventure.guildFrontDeskFormat('u','百纳镇接待');
  assert.deepEqual(rows(local)[0],rows(baina)[0],'首行标签、操作和样式与百纳镇一致');
  context={code:'world_tree',hub:openingHubs.world_tree};registered=true;
  local=await adventure.guildFrontDeskFormat('u');assert.equal(rows(local)[0][0].render_data.label,'冒险者 晋升');
  await adventure.guildChatHandler();assert.deepEqual(chats,[['u','chat','root_guild_clerk']]);
  assert.deepEqual(rows(output)[0].map((b:any)=>b.action.data),['/前台闲聊','/初行公会']);
  await adventure.guildRegistrationHandler();assert.match(JSON.stringify(output.value),/维萝/);assert.doesNotMatch(JSON.stringify(output.value),/莫妮卡/);
  assert.equal(rows(output)[0][0].action.data,'/初行公会 前台');
  const guild=load('src/response/opening-guild.ts',{alemonjs:{Format},'../game/opening-guild.service':{openingGuildView:async()=>({hub:openingHubs.world_tree,code:'world_tree',at:true,inside:true,place:{},services:[],maps:[],world:{}})},'./adventure':adventure});
  assert.deepEqual((await guild.openingGuildFormat('u','前台')).value,local.value,'大厅前台入口与登记选职后的前台使用同一页面');
});


test('四地大厅统一五行九键，第四行后勤与休息，服务归入对应区域',async()=>{
  const source=ts.createSourceFile('adventure.ts',readFileSync('src/response/adventure.ts','utf8'),ts.ScriptTarget.Latest,true);
  const statement=source.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(source)==='guildInteriorFormat'))!;
  const code=ts.transpileModule(statement.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const baina=new Function('Format',code+';return guildInteriorFormat;')(Format)();
  const converted=(format:any)=>converter.createButtonsData(format.value.find((v:any)=>v.type==='BT.group').value);
  const labels=(format:any)=>converted(format).rows.map((r:any)=>r.buttons.map((b:any)=>[b.render_data.label,b.render_data.style,b.action.type,b.action.enter]));
  let hub:keyof typeof openingHubs='world_tree';
  const guild=load('src/response/opening-guild.ts',{alemonjs:{Format},'../game/opening-world.config':{openingHubs},'../game/opening-guild.config':{rootGuildPeople,guildLessons},'../game/opening-guild.service':{openingGuildView:async()=>({hub:openingHubs[hub],code:hub,at:true,inside:true,place:{},services:[{code:'meal',uses:3},{code:'repair',uses:1},{code:'supplies',uses:150}],maps:[],world:{leaf_route_open:1}})}});
  for(hub of Object.keys(openingHubs) as (keyof typeof openingHubs)[])for(const area of ['大厅','次页']){
    const page=await guild.openingGuildFormat('u',area);
    assert.deepEqual(labels(page),labels(baina));
    assert.deepEqual(converted(page).rows.flatMap((r:any)=>r.buttons.map((b:any)=>b.action.data)),['/初行公会 前台','/初行公会 集结区','/悬赏板','/初行公会 委托板','/餐厅','/工会商店','/初行公会 后勤区','/初行公会 休息区','/初行离会']);
    assert.doesNotMatch(JSON.stringify(page.value),/礼包|核对|补领|免费热食|恢复|维修|教学|下一页|上一页|次页|安全接驳/);
  }
  const areas:Record<string,string[]>={集结区:['/队伍','/队伍列表','/组队 创建','/组队 加入 '],休息区:['/初行公会 人物','/初行见闻','/初行公会 地图','/初行服务 recover'],后勤区:['/初行公会 兽栏','/初行公会 工艺','/初行公会 接驳'],委托板:['/任务分类 委托','/任务分类 主线','/初行公会 礼包','/初行公会 教学']};
  for(hub of Object.keys(openingHubs) as (keyof typeof openingHubs)[])for(const area of [...Object.keys(areas),'人物','地图','工艺','兽栏','教学','接驳','礼包']){
    const page=await guild.openingGuildFormat('u',area),group=page.value.find((v:any)=>v.type==='BT.group');
    const rows=converted(page).rows,commands=rows.flatMap((r:any)=>r.buttons.map((b:any)=>b.action.data));
    assert.ok(group.value.length<=5);assert.equal(commands.length,group.value.flatMap((r:any)=>r.value).length,'QQ不得截断区域按钮');
    for(const row of rows.slice(0,-1))assert.ok(row.buttons.every((b:any)=>!b.render_data.label.startsWith('返回')),`${hub}/${area}返回按钮必须在最低行`);
    for(const command of areas[area]??[])assert.ok(commands.includes(command),`${hub}/${area}缺少${command}`);
    const markdown=page.value.find((v:any)=>v.type==='Markdown');
    assert.ok(markdown.value.some((v:any)=>v.type==='MD.blockquote'),`${hub}/${area}场景应为引用`);
    assert.doesNotMatch(converter.createMarkdownText(markdown.value),/qqbot-cmd-enter/);
  }
});


test('公会交接逐段引用场景与对白，结算提示独立显示',()=>{
  const {openingGuildServiceFormat}=load('src/response/opening-guild.ts',{alemonjs:{Format}},['openingGuildServiceFormat']);
  const text=guildLessons.find(l=>l.code==='contract')!.text+'\n\n已领取本次练习用品。';
  const md=openingGuildServiceFormat(text).value.find((v:any)=>v.type==='Markdown');
  const rendered=converter.createMarkdownText(md.value);
  assert.match(rendered,/> 契兽员/);assert.match(rendered,/> “礼物只能/);assert.match(rendered,/> 你在练习册/);
  assert.match(rendered,/\n已领取本次练习用品。/);assert.doesNotMatch(rendered,/> 已领取本次练习用品。/);
});

test('旧建筑按键进入和离开四地公会使用同一状态，区域入口仍可抵达各服务',async()=>{
  let code='guild_counter',area='休息区';const visits:any[]=[],panels:any[]=[],sent:any[]=[],services:string[]=[];
  const {buildingHandler}=load('src/response/adventure.ts',{
    alemonjs:{Format,useEvent:()=>[{current:{UserId:'u'}}],useRoute:()=>[{param:(key:string)=>key==='code'?code:area}]},
    '../game/use-game-message':{useGameMessage:()=>[{send:async(value:any)=>sent.push(value)}]},
    '../game/adventure.service':{requireNpcAtCurrentPosition:async()=>({interaction_kind:'building'})},
    '../game/opening-world.config':{openingHubs},
    '../game/opening-guild.service':{enterOpeningGuild:async(...args:any[])=>visits.push(args)},
    './opening-guild':{openingGuildFormat:async(...args:any[])=>{panels.push(args);return Format.create();}},
    './guild-restaurant':{default:async()=>services.push('餐厅')},
    './guild-shop':{guildShopHandler:async()=>services.push('工会商店')},
    './bounty':{bountyBoardHandler:async()=>services.push('悬赏板')}
  },['buildingHandler']);
  for(const hub of Object.values(openingHubs)){
    code=hub.guild;visits.length=0;panels.length=0;services.length=0;
    await buildingHandler('enter')();await buildingHandler('leave')();
    assert.deepEqual(visits,[['u',true],['u',false]]);
    for(area of ['集结区','委托板','后勤区','休息区']){await buildingHandler('area')();assert.deepEqual(panels.at(-1),['u',area]);}
    for(area of ['餐厅','工会商店','悬赏板'])await buildingHandler('area')();
    assert.deepEqual(services,['餐厅','工会商店','悬赏板']);
  }
});

test('公会交谈只发人物引用消息，详情链接正确且保留鉴识和当地公会限制',async()=>{
  let personCode:string=rootGuildPeople[0].code,unlocked=true,region='world_tree';const sent:any[]=[];
  const common:any={alemonjs:{Format,useEvent:()=>[{current:{UserId:'u'}}],useRoute:()=>[{param:(key:string)=>key==='action'?'chat':personCode}]},
    '../game/use-game-message':{useGameMessage:()=>[{send:async({format}:any)=>{sent.push(format);}}]},
    '../game/message':{npcInteractionMarkdown,messageFormat},
    '../game/opening-guild.config':{rootGuildPeople,rootGuildScenes,guildLessons},
    '../game/adventure.service':{nearbyPoints:async()=>({npcDetailsUnlocked:unlocked})},
    '../game/guild-context':{requireCurrentGuild:async()=>({code:region,hub:openingHubs.world_tree,row:{pos_x:-5,pos_y:-3}})},
    '../game/opening-guild.service':{openingGuildAction:async()=>{const person=rootGuildPeople.find(p=>p.code===personCode)!;return `${rootGuildScenes[personCode]}\n“${person.first}”`;}}
  };
  const guild=load('src/response/opening-guild.ts',common),detail=load('src/response/npc-detail.ts',common);
  for(const person of rootGuildPeople){
    personCode=person.code;sent.length=0;
    await guild.openingGuildHandler('service')();assert.equal(sent.length,1,'交谈之后不再重发大厅');
    const md=sent[0].value.find((v:any)=>v.type==='Markdown');const rendered=converter.createMarkdownText(md.value);
    assert.match(rendered,/冒险者公会·/);assert.ok(rendered.includes(`【${person.name.split('·').at(-1)}】`));
    assert.match(rendered,/> /);assert.match(rendered,/<qqbot-cmd-input\b/);assert.doesNotMatch(rendered,/公会交接|qqbot-cmd-enter/);
    const links=md.value.filter((v:any)=>v.type==='MD.button');assert.equal(links.length,1);assert.equal(links[0].options.autoEnter,false);assert.equal(links[0].options.data,`/域民详情 ${person.code}`);
    sent.length=0;await detail.default();assert.match(JSON.stringify(sent[0].value),/域民资料/);assert.ok(JSON.stringify(sent[0].value).includes(person.name));
  }
  const shop=load('src/response/guild-shop.ts',common),restaurant=load('src/response/guild-restaurant.ts',{...common,'../game/guild-restaurant.service':{freeGuildMealUses:async()=>3}});
  for(const[handler,title,code]of [[shop.guildShopHandler,'商店','root_guild_shopkeeper'],[restaurant.default,'餐厅','root_guild_cook']] as const){
    sent.length=0;await handler();assert.equal(sent.length,1);
    const md=sent[0].value.find((v:any)=>v.type==='Markdown');const rendered=converter.createMarkdownText(md.value);
    assert.ok(rendered.includes(`冒险者公会·${title}`));assert.match(rendered,/> /);assert.doesNotMatch(rendered,/赫伯特|半身人|百纳镇/);
    assert.equal(md.value.find((v:any)=>v.type==='MD.button').options.data,`/域民详情 ${code}`);
  }
  unlocked=false;sent.length=0;await guild.openingGuildHandler('service')();
  assert.equal(sent[0].value.find((v:any)=>v.type==='Markdown').value.filter((v:any)=>v.type==='MD.button').length,0);
  sent.length=0;await detail.default();assert.match(JSON.stringify(sent[0].value),/识珠 Lv.3/);
  unlocked=true;region='baina_town';sent.length=0;await detail.default();assert.match(JSON.stringify(sent[0].value),/不在当前分会/);
});


test('天赋分类引言随分类和翻页显示，详情不依赖设计文档章节',()=>{
  for(const group of talentGroups.filter(g=>g!=='？？？')) for(const page of [1,2]){
    const format=catalog.divineCatalog(page,'',group);
    const text=converter.createMarkdownText(format.value.find((v:any)=>v.type==='Markdown').value);
    assert.ok(text.includes(catalog.talentGroupIntroductions[group]));
    assert.ok(!text.includes('神器已散布世界各地'));
  }
  for(const talent of talentDefinitions)assert.doesNotMatch(talent.description,/(?:细则|时序|详)[^。\n]*见\s*\d|需新建|需先有|设计基准|不得标成/);
  const phoenix=talentDefinitions.find(t=>t.number==='F01')!.description;
  for(const key of ['2个','2.5%','护盾','刷新','抗性','部位'])assert.ok(phoenix.includes(key));
});

 test('未解锁隐藏路线不泄漏分类、搜索或详情，旧分类回退普通目录',()=>{
 const hidden=talentDefinitions.filter(t=>t.group==='？？？');
 for(const skill of hidden){
   assert.throws(()=>catalog.divineDetail(skill.number),/请从天赋目录中选择/);
   assert.throws(()=>catalog.divineDetail(skill.code),/请从天赋目录中选择/);
   const search=JSON.stringify(catalog.divineCatalog(1,skill.name));
   assert.ok(!search.includes(skill.name));
 }
 for(const group of ['全部','？？？']){const value=JSON.stringify(catalog.divineCatalog(1,'',group));assert.ok(!value.includes('？？？'));}
 });
