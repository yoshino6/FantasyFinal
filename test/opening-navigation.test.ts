import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';
import type { OpeningView } from '../src/game/opening.types';
import { firstPersonNarrative } from '../src/game/narrative-voice';

const load=(file:string,mocks:Record<string,unknown>)=>{
  const module={exports:{} as any};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)((name:string)=>mocks[name]??{},module,module.exports);return module.exports;
};
const message=load('src/game/opening-message.ts',{alemonjs:{Format},'./narrative-voice':{firstPersonNarrative}});
const armed:OpeningView={route:'F01',title:'金光尚未熄灭',state:'armed',revision:0,text:'路边传来微弱的动静。',page:1,pages:2,branch:null,choices:[]};

test('首次移动或寻怪进入私有故事，未选择前不会执行原有世界动作',async()=>{
  for(const key of ['移动','前往','前往地图','前往怪物','寻怪']){
    let next=0;const started:string[]=[];const sent:any[]=[];
    const middleware=load('src/middleware/opening.ts',{alemonjs:{useEvent:()=>[{current:{UserId:'u'}}],useRoute:()=>[{matched:true,key}]},
      '../game/opening-message':message,'../game/use-game-message':{useGameMessage:()=>[{send:async(value:any)=>{sent.push(value);}}]},
      '../game/opening.service':{openingStatus:async()=>armed,beginOpening:async(_user:string,entry:string)=>{started.push(entry);return{...armed,state:'reading',revision:1};}}});
    await middleware.default({},async()=>{next++;});assert.equal(next,0,key);assert.deepEqual(started,[key==='寻怪'?'hunt':'move']);assert.equal(sent.length,1);
  }
});

test('先点击其他功能只重发待开始页并引导打开面板；相似命令前缀不能绕过保护',async()=>{
  for(const key of ['工会商店','随从操作','物品出售','前往商店']){
    let next=0,starts=0,output:any;
    const middleware=load('src/middleware/opening.ts',{alemonjs:{useEvent:()=>[{current:{UserId:'u'}}],useRoute:()=>[{matched:true,key}]},
      '../game/opening-message':message,'../game/use-game-message':{useGameMessage:()=>[{send:async({format}:any)=>{output=format;}}]},
      '../game/opening.service':{openingStatus:async()=>armed,beginOpening:async()=>{starts++;throw Error('不应启动故事');}}});
    await middleware.default({},async()=>{next++;});assert.equal(next,0);assert.equal(starts,0);
    const group=output.value.find((part:any)=>part.type==='BT.group');
    assert.ok(JSON.stringify(group.value).includes('/面板'));assert.ok(!JSON.stringify(group.value).includes('/初行选择 0 next'));
  }
});

test('已进入抉择时只重显选项；无新开局或已完成的角色保留正常行为',async()=>{
  let current:OpeningView|null={...armed,state:'choice',choices:[{code:'A',label:'救助'},{code:'B',label:'离开'}]},next=0,output:any;
  const middleware=load('src/middleware/opening.ts',{alemonjs:{useEvent:()=>[{current:{UserId:'u'}}],useRoute:()=>[{matched:true,key:'寻怪'}]},
    '../game/opening-message':message,'../game/use-game-message':{useGameMessage:()=>[{send:async({format}:any)=>{output=format;}}]},
    '../game/opening.service':{openingStatus:async()=>current,beginOpening:async()=>current}});
  await middleware.default({},async()=>{next++;});assert.equal(next,0);assert.match(JSON.stringify(output.value),/选择 A/);assert.match(JSON.stringify(output.value),/选择 B/);
  current={...armed,state:'completed'};await middleware.default({},async()=>{next++;});current=null;await middleware.default({},async()=>{next++;});assert.equal(next,2);
});
