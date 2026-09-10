import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';
import { divineSkillDefinitions } from '../src/game/opening-content';
import { openingHubs } from '../src/game/opening-world.config';
import { rootGuildPeople, rootGuildScenes, guildLessons } from '../src/game/opening-guild.config';

const load=(path:string,mocks:Record<string,unknown>,names?:string[])=>{
  const module={exports:{} as any};
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  const input=names?source.statements.filter(s=>ts.isImportDeclaration(s)||ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(source)))).map(s=>s.getText(source)).join('\n'):source.text;
  const code=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)((name:string)=>mocks[name]??{},module,module.exports);return module.exports;
};
const {npcInteractionMarkdown,messageFormat}=load('src/game/message.ts',{alemonjs:{Format}},['npcInteractionMarkdown','messageFormat']);
const source=ts.createSourceFile('sends.js',readFileSync('node_modules/@alemonjs/qq-bot/lib/sends.js','utf8'),ts.ScriptTarget.Latest,true);
const helpers=['MAX_BUTTON_ROWS','MAX_BUTTONS_PER_ROW','createButtonsData','mdFormatters','createMarkdownText'];
const converter=new Function(source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>helpers.includes(d.name.getText(source)))).map(s=>s.getText(source)).join('\n')+'\nreturn {createButtonsData,createMarkdownText};')();
const catalog=load('src/game/divine-message.ts',{alemonjs:{Format},'./opening-content':{divineSkillDefinitions}});

test('神技全部目录、分类、搜索与详情经本机QQ适配器转换，不产生不支持的cmd-enter show',()=>{
  const pages=[];
  for(const group of ['全部',...Object.keys(catalog.divineGroups)])for(let page=1;page<=3;page++)pages.push(catalog.divineCatalog(page,'',group));
  pages.push(catalog.divineCatalog(1,'不存在的神技'));
  for(const skill of divineSkillDefinitions)pages.push(catalog.divineDetail(skill.number));
  for(const format of pages){
    const md=format.value.find((v:any)=>v.type==='Markdown');
    const text=converter.createMarkdownText(md.value);
    assert.doesNotMatch(text,/<qqbot-cmd-enter\b/);
    const group=format.value.find((v:any)=>v.type==='BT.group');
    assert.ok(group.value.length<=5);
    const converted=converter.createButtonsData(group.value);
    assert.equal(converted.rows.flatMap((r:any)=>r.buttons).length,group.value.flatMap((r:any)=>r.value).length,'适配器不得截掉任何按钮');
    for(const row of converted.rows)for(const button of row.buttons){assert.equal(button.action.enter,true);assert.equal(button.action.type,2);assert.match(button.action.data,/^\/(神技目录|神技详情|选择恩赐) /);}
  }
  const detailCodes=new Set<string>();
  for(let page=1;page<=3;page++){
    const format=catalog.divineCatalog(page);
    const markdown=format.value.find((v:any)=>v.type==='Markdown');
    const links=markdown.value.filter((v:any)=>v.type==='MD.button');
    assert.equal(links.length,6);
    for(const link of links){assert.equal(link.options.autoEnter,false);detailCodes.add(link.options.data.split(' ')[1]);}
    assert.equal((converter.createMarkdownText(markdown.value).match(/<qqbot-cmd-input\b/g)??[]).length,6);
    const group=format.value.find((v:any)=>v.type==='BT.group');
    assert.equal(group.value.length,3,'保留原有翻页及分类按钮排版');
    assert.ok(converter.createButtonsData(group.value).rows.flatMap((r:any)=>r.buttons).every((b:any)=>!b.action.data.startsWith('/神技详情 ')));
  }
  assert.deepEqual([...detailCodes].sort(),divineSkillDefinitions.map(s=>s.number).sort());
});

test('相同注册阶段重发保存的完整正文，女神更替只在新页面明确交接',async()=>{
  const records:any[]=[];let stage='story',goddess='aqua',rolls=0;
  const connection={execute:async(sql:string,args:any[]=[])=>{
    if(sql.startsWith('SELECT s.id'))return[[{id:'s1',stage}]];
    if(sql.startsWith('SELECT stage,goddess'))return[[...records].reverse()];
    if(sql.startsWith('INSERT INTO registration_scene_records')){records.push({stage:args[1],goddess:args[2],text:args[3]});return[{}];}
    throw Error(sql);
  }};
  const scene=load('src/game/divine-message.ts',{alemonjs:{Format},'./opening-content':{divineSkillDefinitions},'../database/pool':{withTransaction:async(fn:any)=>fn(connection)},'./opening-state':{openingWorldFor:async()=>({current_goddess:goddess})},'./message':{randomStoryText:()=>`最后一幕 ${++rolls}`,audienceText:'阿库娅接引',questionText:'阿库娅回答'}}).registrationScene;
  const first=await scene('story','u');assert.deepEqual((await scene('story','u')).value,first.value);assert.equal(records.length,1);
  stage='audience';const audience=await scene('audience','u');goddess='eris';assert.deepEqual((await scene('audience','u')).value,audience.value);
  stage='question';const question=await scene('question','u');assert.match(JSON.stringify(question.value),/阿库娅前辈刚随一位旅人下界/);assert.match(JSON.stringify(question.value),/厄里斯/);
  assert.deepEqual((await scene('question','u')).value,question.value);assert.equal(records.length,3);
  stage='choice';const choice=await scene('danger','u');assert.match(JSON.stringify(choice.value),/选择神技/);
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


test('世界树大厅与百纳镇同为四行七键，有额度也不插入额外服务和翻页',async()=>{
  const source=ts.createSourceFile('adventure.ts',readFileSync('src/response/adventure.ts','utf8'),ts.ScriptTarget.Latest,true);
  const statement=source.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(source)==='guildInteriorFormat'))!;
  const code=ts.transpileModule(statement.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const baina=new Function('Format',code+';return guildInteriorFormat;')(Format)();
  const converted=(format:any)=>converter.createButtonsData(format.value.find((v:any)=>v.type==='BT.group').value);
  const labels=(format:any)=>converted(format).rows.map((r:any)=>r.buttons.map((b:any)=>[b.render_data.label,b.render_data.style,b.action.type,b.action.enter]));
  const guild=load('src/response/opening-guild.ts',{alemonjs:{Format},'../game/opening-guild.service':{openingGuildView:async()=>({hub:openingHubs.world_tree,code:'world_tree',at:true,inside:true,place:{},services:[{code:'meal',uses:3},{code:'repair',uses:1},{code:'supplies',uses:150}],maps:[],world:{}})}});
  for(const area of ['大厅','次页','集结区','委托板']){
    const page=await guild.openingGuildFormat('u',area);
    assert.deepEqual(labels(page),labels(baina));
    assert.deepEqual(converted(page).rows.flatMap((r:any)=>r.buttons.map((b:any)=>b.action.data)),['/初行公会 前台','/初行公会 集结区','/悬赏板','/初行公会 委托板','/餐厅','/工会商店','/初行离会']);
    assert.doesNotMatch(JSON.stringify(page.value),/礼包|核对|补领|免费热食|恢复|维修|教学|下一页|上一页|次页|安全接驳/);
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
  const shop=load('src/response/guild-shop.ts',common),restaurant=load('src/response/guild-restaurant.ts',common);
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
