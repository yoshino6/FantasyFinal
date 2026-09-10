import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const fixture=(stage:string,registered=false)=>{
  const state={stage,writes:0};
  const connection={execute:async(sql:string,args:unknown[])=>{
    if(sql.startsWith('SELECT id FROM characters'))return[registered?[{id:7}]:[]];
    state.stage=sql.includes("stage='question'")?'question':String(args[0]);state.writes++;return[{}];
  }};
  const source=ts.createSourceFile('character.service.ts',readFileSync('src/game/character.service.ts','utf8'),ts.ScriptTarget.Latest,true);
  const names=['continueRegistration','askWhereAmI','chooseDestination','completedRegistration'];
  const declarations=source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(source))));
  const code=ts.transpileModule(declarations.map(s=>s.getText(source).replace(/^export\s+/,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const dependencies={withTransaction:async(fn:(c:typeof connection)=>unknown)=>fn(connection),getPlayer:async()=>({id:1}),getSession:async()=>registered?undefined:({id:'session',stage:state.stage,expires_at:new Date(Date.now()+60000)})};
  const service=new Function(...Object.keys(dependencies),`${code}\nreturn {${names.join(',')}};`)(...Object.values(dependencies));
  return{state,...service};
};

test('恩赐页与待选择页重复继续时重发当前节点，不再报无法继续',async()=>{
  for(const stage of ['audience','destination','choice']){
    const f=fixture(stage);
    assert.equal(await f.continueRegistration('player'),stage);
    assert.equal(await f.continueRegistration('player'),stage);
    assert.equal(f.state.writes,0);
  }
});
test('带原页面标记的继续按钮只推进一次，旧按钮不会跳过后续场景',async()=>{
  for(const [from,to] of [['story','audience'],['question','destination'],['danger','choice']]){
    const f=fixture(from);
    assert.equal(await f.continueRegistration('player',from),to);
    assert.equal(await f.continueRegistration('player',from),to);
    assert.equal(f.state.writes,1);
  }
});
test('重复询问或选择去向重发当前页面，不回滚已推进的注册',async()=>{
  for(const stage of ['question','destination','danger','choice']){
    const f=fixture(stage);
    assert.equal(await f.askWhereAmI('player'),stage);
    if(stage!=='destination')assert.equal(await f.chooseDestination('player','异世界'),stage);
    assert.equal(f.state.writes,0);
  }
});

test('天堂页持久保存，重发注册继续仍展示天堂；回头转生只推进一次',async()=>{
  const f=fixture('destination');
  assert.equal(await f.chooseDestination('player','天堂'),'heaven');
  assert.equal(await f.continueRegistration('player'),'heaven');
  assert.equal(await f.chooseDestination('player','天堂'),'heaven');
  assert.equal(f.state.writes,1);
  assert.equal(await f.chooseDestination('player','异世界'),'danger');
  assert.equal(await f.chooseDestination('player','异世界'),'danger');
  assert.equal(f.state.writes,2);
});

test('角色已创建但最后一条消息丢失，所有旧注册入口均恢复已完成结果',async()=>{
  const f=fixture('choice',true);
  assert.equal(await f.continueRegistration('player','danger'),'completed');
  assert.equal(await f.askWhereAmI('player'),'completed');
  assert.equal(await f.chooseDestination('player','异世界'),'completed');
  assert.equal(f.state.writes,0);
});
