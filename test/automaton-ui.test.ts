import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';
import { createAutomaton } from '../src/game/automaton';
import { labels } from '../src/game/automaton-growth';
import { automatonInteractionText, automatonBattleInteractionText } from '../src/game/automaton-dialogue';
import { combatUnitLabel } from '../src/game/combat-unit-label';
import { automatonSkills } from '../src/game/automaton-skill-catalog';

const load=(path:string,mocks:Record<string,unknown>)=>{
  const module={exports:{} as any};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)((id:string)=>mocks[id]??{},module,module.exports);return module.exports;
};
const text=(format:any):string=>JSON.stringify(format instanceof Format?format.value:format);
const buttons=(format:any)=>format.value.filter((x:any)=>x.type==='BT.group').flatMap((x:any)=>x.value.map((r:any)=>r.value.map((b:any)=>b.value)));
const log={warn:()=>{}};

test('主面板无刷新，详情只有三类功能及培养维修，隐藏性格且保留成对属性',async()=>{
  const state=createAutomaton('ui');state.progress=[{code:'blade',xp:122}];
  const sends:any[]=[],route={action:'',id:'1'} as Record<string,string>;
  const handler=load('src/response/automaton.ts',{
    alemonjs:{Format,ResultCode:{Ok:2000},logger:log,useEvent:()=>[{current:{UserId:'u',IsPrivate:true}}],useRoute:()=>[{param:(k:string)=>route[k]}]},
    '../game/use-game-message':{useGameMessage:()=>[{send:async({format}:any)=>{sends.push(format);return[{code:2000}];}}]},
    '../game/automaton.service':{automatonList:async()=>({items:[{row:{id:1,owner_id:1,following:0,bound_kind:'personal'},state}]})},
    '../game/automaton-dialogue':{escapeAutomatonText:(s:string)=>s,automatonInteractionText,automatonBattleInteractionText},
    '../game/automaton-portrait.service':{portraitReviewStatus:async()=>null},
    '../game/automaton-growth':{labels,cultivationRequired:()=>244},
    '../game/automaton-skill-catalog':{automatonSkills}
  });
  await handler.default();assert.deepEqual(buttons(sends.pop()),[]);
  route.action='详情';await handler.default();const detail=sends.pop(),body=text(detail);
  assert.deepEqual(buttons(detail),[['技能','成长','回忆'],['培养','维修'],['更换形象'],['返回机巧']]);
  assert(body.includes('▓▓▓▓▓░░░░░ 50.0%'));assert(body.includes('培育度（122/244）'));assert(body.includes('暴免'));assert(body.includes('暴抗'));
  assert(body.includes('[改名]'));assert(!body.includes(state.personality.coreName));assert(!body.includes('技能倾向'));assert(!body.includes('设置'));
  state.portrait={key:'1'.repeat(32)+'.webp',url:'https://example.com/portrait.webp',width:800,height:600};
  await handler.default();const illustrated=sends.pop(),illustratedBody=text(illustrated);
  assert(illustratedBody.indexOf('机巧·详情')<illustratedBody.indexOf(state.portrait.url));
  assert(illustratedBody.indexOf(state.portrait.url)<illustratedBody.indexOf(state.name+' #1'));
  assert.deepEqual(buttons(illustrated),[['技能','成长','回忆'],['培养','维修'],['更换形象','恢复默认形象'],['返回机巧']]);
  assert.equal(illustrated.value.filter((part:any)=>part.type!=='Markdown'&&part.type!=='BT.group').length,0);
});

test('随行直接执行；认主确认后对白单独发送；额外消息失败不反报认主失败',async()=>{
  const sends:any[]=[],route={action:'随行',id:'1',a:'claim'} as Record<string,string>;let confirmed=0,ack=0,failed=false;
  const handler=load('src/response/automaton.ts',{
    alemonjs:{Format,ResultCode:{Ok:2000},logger:log,useEvent:()=>[{current:{UserId:'u',IsPrivate:false}}],useRoute:()=>[{param:(k:string)=>route[k]}]},
    '../game/use-game-message':{useGameMessage:()=>[{send:async({format}:any)=>{sends.push(format);if(failed&&text(format).includes('初次见面'))throw Error('send failed');return[{code:2000}];}}]},
    '../game/automaton.service':{previewAutomatonMutation:async()=>({token:'follow'}),confirmAutomatonMutation:async()=>{confirmed++;return{text:'操作完成'};}},
    '../game/automaton-dialogue':{escapeAutomatonText:(s:string)=>s,automatonInteractionText,automatonBattleInteractionText},
    '../game/automaton-dialogue.service':{quoteForAutomatonMutation:async(_u:string,token:string)=>token==='claim'?{id:5,name:'小光',text:'初次见面，主人。',token}:null,finishAutomatonMutationQuote:async()=>{ack++;}}
  });
  await handler.default();assert.equal(confirmed,1);assert.equal(sends.length,1);assert(!text(sends[0]).includes('确认'));
  sends.length=0;route.action='确认';await handler.default();assert.equal(sends.length,2);assert(!text(sends[0]).includes('初次见面'));assert.equal(sends[1].value[0].value[0].value,'〖小光〗\n“初次见面，主人。”');assert.equal(ack,1);
  sends.length=0;failed=true;await handler.default();assert.equal(sends.length,2);assert.equal(ack,1);
});

test('日常问候与战斗语录均独立发送，保留战报及按钮并按实际回执落账',async()=>{
  const sends:any[]=[],receipts:boolean[]=[],battleAcks:string[]=[];let daily:any={id:9,name:'小光',text:'早安。'},extraCode=2000;
  const wrapper=load('src/game/use-game-message.ts',{
    alemonjs:{Format,ResultCode:{Ok:2000},logger:log,useEvent:()=>[{current:{UserId:'u'}}],useRoute:()=>[{matched:true}],useMessage:()=>[{send:async(params:any)=>{sends.push(params.format);return[{code:sends.length===1?2000:extraCode}];}}]},
    './automaton-dialogue':{escapeAutomatonText:(s:string)=>s,automatonInteractionText,automatonBattleInteractionText},
    './automaton-dialogue.service':{reserveDailyAutomaton:async()=>daily,finishDailyAutomaton:async(_q:any,ok:boolean)=>receipts.push(ok),acknowledgeAutomatonBattleText:async(_u:string,q:string)=>battleAcks.push(q)}
  });
  const sender=wrapper.useGameMessage()[0];
  await sender.send({format:Format.create().addMarkdown(Format.createMarkdown().addText('状态正文'))});
  assert.equal(sends.length,2);assert(!text(sends[0]).includes('早安'));assert.equal(sends[1].value[0].value[0].value,'〖小光〗\n“早安。”');assert.deepEqual(receipts,[true]);
  sends.length=0;daily=null;const quote='〖小光〗「我会保护你。」',markedQuote='\u2063'+quote;
  const original=Format.create().addMarkdown(Format.createMarkdown().addBlockquote(markedQuote).addBlockquote('【晴儿】「旅途平安。」').addText('伤害 100')).addButtonGroup(Format.createButtonGroup().addRow().addButton('攻击','/攻击'));
  await sender.send({format:original});assert.equal(sends.length,2);assert(!text(sends[0]).includes('我会保护你'));assert(text(sends[0]).includes('伤害 100'));assert(text(sends[0]).includes('攻击'));assert.deepEqual(battleAcks,[quote]);assert(text(sends[0]).includes('旅途平安'));assert(!text(sends[1]).includes('\u2063'));assert(!text(sends[1]).includes('（机巧）'));assert(text(original).includes('我会保护你'));
  sends.length=0;extraCode=5000;await sender.send({format:Format.create().addMarkdown(Format.createMarkdown().addCode('伤害 100\n'+markedQuote,{language:'text'}))});assert.equal(battleAcks.length,1);assert(!text(sends[0]).includes('我会保护你'));
});

test('召唤物与随从使用中空括号，人物和敌人保留原括号，互动统一两行',()=>{
  assert.equal(combatUnitLabel({name:'同名',key:'automaton:1'}),'〖同名〗');
  assert.equal(combatUnitLabel({name:'同名',companion:true}),'〖同名〗');
  assert.equal(combatUnitLabel({name:'同名',npc_code:'npc_forest_warrior'}),'〖同名〗');
  assert.equal(combatUnitLabel({name:'同名',key:'member:1'}),'【同名】');
  assert.equal(combatUnitLabel({name:'同名',key:'target:1'}),'【同名】');
  assert.equal(automatonInteractionText('小光','嗨，要打起精神啊!'),'〖小光〗\n“嗨，要打起精神啊\\!”');
  assert.equal(automatonBattleInteractionText('〖小光〗「嗨，要打起精神啊!」'),'〖小光〗\n“嗨，要打起精神啊\\!”');
});
