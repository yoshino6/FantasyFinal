import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Format } from '../node_modules/alemonjs/lib/application/format/message-format.js';

test('剧情队伍页显示状态与继续剧情，普通队伍保留退出和队长管理',async()=>{
  const file=ts.createSourceFile('party.ts',readFileSync('src/response/party-info.ts','utf8'),ts.ScriptTarget.Latest,true);
  const declaration=file.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(file)==='partyFormat'))!;
  const code=ts.transpileModule(declaration.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const story of [true,false]){
    const partyInfo=async()=>({story,name:'小队',ownId:1,leaderId:1,leader:{name:'旅人',gameId:1001},members:[{name:'莱昂',gameId:1002}]});
    const format=await new Function('Format','partyInfo',`${code};return partyFormat;`)(Format,partyInfo)('u');
    const result=JSON.stringify(format.value);
    if(story){assert.match(result,/主线剧情队伍/);assert.match(result,/\/继续剧情/);assert.doesNotMatch(result,/\/退出队伍|\/委任队长|\/修改队伍名|\/组队 加入/);}
    else{assert.match(result,/\/退出队伍/);assert.match(result,/\/委任队长/);assert.match(result,/\/修改队伍名/);}
  }
});
