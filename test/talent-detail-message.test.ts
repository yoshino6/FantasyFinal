import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const module = { exports: {} as any };
const warnings: string[] = [];
new Function('require','module','exports',ts.transpileModule(readFileSync('src/game/talent-detail-message.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((name:string)=>name==='alemonjs'?{ResultCode:{Ok:200,FailParams:400},logger:{warn:(s:string)=>warnings.push(s)}}:{},module,module.exports);
const {scheduleTalentRecall,talentRecallTarget}=module.exports;
test('详情仅在成功回执后安排60秒撤回，逐条撤回且不使用用户消息ID',async()=>{
  let task:()=>Promise<void>=async()=>{};let delay=0;const deleted:string[]=[];
  scheduleTalentRecall([{code:200,data:{id:'bot-1'}},{code:200,data:{id:'bot-1'}},{code:500,data:{id:'failed'}},{code:200,data:{}},{code:200,data:{id:'bot-2'}}],async(id:string)=>{deleted.push(id);return [{code:200}];},(fn:any,ms:number)=>{task=fn;delay=ms;});
  assert.equal(delay,60_000);assert.deepEqual(deleted,[]);await task();assert.deepEqual(deleted,['bot-1','bot-2']);
});
test('发送失败或没有消息ID不安排撤回；单条撤回异常不阻止后续消息',async()=>{
  scheduleTalentRecall([{code:500,data:{id:'failed'}},{code:200,data:{}}],async()=>[],()=>assert.fail('不应安排任务'));
  let task:any;const deleted:string[]=[];
  scheduleTalentRecall([{code:200,data:{id:'one'}},{code:200,data:{id:'two'}}],async(id:string)=>{deleted.push(id);if(id==='one')throw Error('offline');return[{code:200}];},(fn:any)=>{task=fn;});
  await task();assert.deepEqual(deleted,['one','two']);assert.equal(warnings.length,1);
});
test('QQ群聊、私聊、频道、频道私信和按钮会话使用各自目标',()=>{
  for(const [event,target] of [
    [{IsPrivate:false,SpaceId:'GROUP:g'}, {scope:'group',targetId:'g'}],
    [{IsPrivate:false,SpaceId:'GUILD:c',OpenId:'DIRECT:d'}, {scope:'channel',targetId:'c'}],
    [{IsPrivate:true,OpenId:'C2C:u'}, {scope:'c2c',targetId:'u'}],
    [{IsPrivate:true,OpenId:'DIRECT:d'}, {scope:'direct',targetId:'d'}],
    [{Target:{scope:'group',targetId:'button-g'}}, {scope:'group',targetId:'button-g'}]
  ])assert.deepEqual(talentRecallTarget(event),target);
  assert.equal(talentRecallTarget({IsPrivate:true}),undefined);
});
