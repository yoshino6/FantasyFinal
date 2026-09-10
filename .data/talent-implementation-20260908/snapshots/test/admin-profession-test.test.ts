import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as alemon from 'alemonjs';
import { createConnection, type RowDataPacket, type PoolConnection } from 'mysql2/promise';
import { professionTestOptions } from '../src/game/admin-profession-test.service';
import { professionTestFormat } from '../src/response/admin-profession-test';
import { activeSkillCodesForAdvancedProfession, advancedInheritanceSkillCode, worldTreeAdvancedProfessions, registeredAdvancedProfessionByCode, isAdvancedProfessionSkillCode } from '../src/game/advanced-profession.config';
import { initializeAdvancedBoundSkills } from '../src/database/advanced-bound-skills';
import { hiddenProfessions } from '../src/game/hidden-profession.config';
import { spiritSummonerActiveSkillCodes } from '../src/game/spirit-summoner.config';

test('测试菜单完整覆盖所有二转职业，按钮指向对应职业，入口已有管理权限保护',()=>{
  assert.equal(professionTestOptions.length,worldTreeAdvancedProfessions.length+hiddenProfessions.length);
  assert.equal(new Set(professionTestOptions.map(p=>p.code)).size,professionTestOptions.length);
  const nodes:any[]=[];const visit=(value:any)=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){nodes.push(value);Object.values(value).forEach(visit);}};visit(professionTestFormat().value);
  const strings=JSON.stringify(nodes);
  for(const p of professionTestOptions){assert.ok(strings.includes(`[${p.name}]`));assert.ok(strings.includes(`测试二转 ${p.code}`));}
  assert.equal(nodes.filter(n=>n.type==='MD.button'&&JSON.stringify(n).includes('测试二转 ')).length,professionTestOptions.length);
});

test('QQ实际转换器输出命令填入标签，避免生成不支持show的立即发送标签',()=>{
  const path=resolve('node_modules/@alemonjs/qq-bot/lib/sends.js');
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  const declarations=source.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>['mdFormatters','createMarkdownText'].includes(d.name.getText(source))));
  assert.equal(declarations.length,2);
  const render=new Function(declarations.map(s=>s.getText(source)).join('\n')+';return createMarkdownText;')();
  const nodes:any[]=[];const visit=(value:any)=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){if(String(value.type).startsWith('MD.'))nodes.push(value);Object.values(value).forEach(visit);}};visit(professionTestFormat().value);
  const rendered=render(nodes);
  assert.doesNotMatch(rendered,/<qqbot-cmd-enter\b/);
  assert.equal((rendered.match(/<qqbot-cmd-input\b/g)??[]).length,professionTestOptions.length);
  for(const p of professionTestOptions)assert.ok(rendered.includes(`text="测试二转 ${p.code}" show="[${p.name}]"`));
});

test('真实数据库：全部职业转职、任务完成、权限/战斗保护、重复点击、失败回滚（临时角色全部回滚）',{skip:process.env.FF_PROFESSION_TEST_DB!=='1'},async()=>{
  const require=createRequire(import.meta.url),config=require('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=config.FantasyFinal?.database??config.mysql;
  const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectTimeout:8000}) as PoolConnection;
  try {
    await c.beginTransaction();
    await initializeAdvancedBoundSkills(c);
    const [templates]=await c.query<RowDataPacket[]>('SELECT id FROM characters WHERE npc_id IS NULL AND npc_code IS NULL LIMIT 1');assert.ok(templates[0]);
    const user=`test_${randomUUID().replaceAll('-','').slice(0,20)}`;
    const [player]=await c.execute<any>('INSERT INTO players (qq_user_id) VALUES (?)',[user]);
    const [columns]=await c.query<RowDataPacket[]>('SHOW COLUMNS FROM characters');const names=columns.filter(col=>col.Field!=='id'&&!String(col.Extra).includes('GENERATED')).map(col=>String(col.Field));
    const [clone]=await c.execute<any>(`INSERT INTO characters (${names.map(n=>'`'+n+'`').join(',')}) SELECT ${names.map(n=>n==='player_id'?'?':n==='name'?"'转职验收影像'":n==='game_id'?'NULL':'`'+n+'`').join(',')} FROM characters WHERE id=?`,[player.insertId,templates[0].id]);
    const id=Number(clone.insertId);await c.execute('UPDATE characters SET level=1,skill_points=1,adventurer_registered=0,profession_code=NULL,secondary_profession_code=NULL,current_hp=1,current_mp=1 WHERE id=?',[id]);
    const cache=new Map<string,any>();let failAudit=false;let sent:any;let routeCode='';let savepoint=0;
    const proxy=new Proxy(c,{get(target,key){if(key==='execute')return async(sql:string,values?:any[])=>{if(failAudit&&sql.startsWith('INSERT INTO admin_operation_logs'))throw new Error('模拟审计写入失败');return target.execute(sql,values);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
    const load=(relative:string):any=>{
      const path=resolve(relative.endsWith('.ts')?relative:relative+'.ts');if(cache.has(path))return cache.get(path).exports;
      const module={exports:{} as any};cache.set(path,module);
      const local=(name:string):any=>name==='alemonjs'?{...alemon,useEvent:()=>[{current:{UserId:user}}],useRoute:()=>[{param:()=>routeCode}]}:name.endsWith('/use-game-message')?{useGameMessage:()=>[{send:async(value:any)=>{sent=value;}}]}:name.endsWith('/pool')?{getPool:async()=>proxy,withTransaction:async(work:any)=>{const point=`profession_test_${++savepoint}`;await c.query(`SAVEPOINT ${point}`);try {const result=await work(proxy);await c.query(`RELEASE SAVEPOINT ${point}`);return result;}catch(error){await c.query(`ROLLBACK TO SAVEPOINT ${point}`);await c.query(`RELEASE SAVEPOINT ${point}`);throw error;}}}:name.startsWith('.')?load(resolve(dirname(path),name)):require(name);
      const compiled=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      new Function('require','module','exports',compiled)(local,module,module.exports);return module.exports;
    };
    const service=load('src/game/admin-profession-test.service');
    await assert.rejects(service.adminTestProfession(user,'inventor'),/管理员权限/);
    await c.execute("INSERT INTO game_permissions (qq_user_id,role,granted_by) VALUES (?,'admin',?)",[user,user]);
    await assert.rejects(service.adminTestProfession(user,'不存在的职业'),/有效的二转职业/);
    for(const p of professionTestOptions) {
      const result=await service.adminTestProfession(user,p.name);assert.equal(result.code,p.code);assert.equal(result.changed,true);
      const [current]=await c.execute<RowDataPacket[]>('SELECT profession_code FROM player_advanced_professions WHERE character_id=?',[id]);assert.equal(current[0].profession_code,p.code);
      const [skills]=await c.execute<RowDataPacket[]>('SELECT s.code,s.category,ps.passive_linked FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=?',[id]);
      const passive=registeredAdvancedProfessionByCode(p.code)!.passive.code;
      const expected=[passive,advancedInheritanceSkillCode(p.code),...activeSkillCodesForAdvancedProfession(p.code),...(p.code==='spirit_summoner'?spiritSummonerActiveSkillCodes:[])];
      assert.deepEqual(skills.filter(s=>isAdvancedProfessionSkillCode(s.code)).map(s=>s.code).sort(),[...new Set(expected)].sort(),p.name);
      const bound=skills.filter(s=>s.code===passive||s.code===advancedInheritanceSkillCode(p.code));
      assert.equal(bound.length,2);assert.ok(bound.every(s=>s.category==='bound'&&Number(s.passive_linked)===0));
      const hidden=hiddenProfessions.some(h=>h.code===p.code);
      const [quests]=await c.execute<RowDataPacket[]>(`SELECT * FROM ${hidden?'player_hidden_profession_quests':'player_advanced_profession_quests'} WHERE character_id=? AND profession_code=?`,[id,p.code]);
      assert.equal(Number(quests[0].stage),hidden?11:4);assert.ok(quests[0][hidden?'qualified_at':'completed_at']);
      if(hidden){const history=typeof quests[0].completed_json==='string'?JSON.parse(quests[0].completed_json):quests[0].completed_json;assert.equal(Object.keys(history).length,10);assert.equal(quests[0].accepted_at,null);}
    }
    // 模拟旧数据分类和缺失传承；反复初始化只补当前职业，不恢复已离开的职业。
    await c.execute("UPDATE skill_definitions SET category='passive' WHERE code='hidden_passive_tactician'");
    await c.execute('DELETE ps FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code=?',[id,advancedInheritanceSkillCode('tactician')]);
    await initializeAdvancedBoundSkills(c);await initializeAdvancedBoundSkills(c);
    const visible=await load('src/game/adventure.service').skillList(user);
    const ownBound=visible.skills.filter((s:any)=>s.category==='bound'&&isAdvancedProfessionSkillCode(s.code));
    assert.equal(ownBound.length,2);assert.ok(ownBound.some((s:any)=>s.code===advancedInheritanceSkillCode('tactician')));
    for(const s of ownBound)await assert.rejects(load('src/game/adventure.service').togglePassiveLink(user,s.id),/只有被动技能/);
    const [before]=await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?',[id]);
    const repeat=await service.adminTestProfession(user,'tactician');assert.equal(repeat.changed,false);assert.equal(repeat.restoredPoints,0);
    const [after]=await c.execute<RowDataPacket[]>('SELECT * FROM characters WHERE id=?',[id]);
    assert.equal(after[0].skill_points,before[0].skill_points);assert.equal(Number(after[0].level),1);assert.equal(after[0].profession_code,null);assert.equal(after[0].secondary_profession_code,null);assert.equal(Number(after[0].current_hp),1);
    const [inventory]=await c.execute<RowDataPacket[]>('SELECT * FROM player_inventory WHERE character_id=?',[id]);assert.equal(inventory.length,0);
    const [logs]=await c.execute<RowDataPacket[]>('SELECT * FROM admin_operation_logs WHERE operator_qq_user_id=?',[user]);assert.equal(logs.length,professionTestOptions.length+1);
    const [skill]=await c.execute<RowDataPacket[]>('SELECT ps.skill_id FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code=\'hidden_order\'',[id]);
    await c.execute('INSERT INTO player_auto_battle_actions (character_id,sequence_no,skill_id) VALUES (?,1,?)',[id,skill[0].skill_id]);
    await c.execute('INSERT INTO player_pvp_auto_battle_actions (character_id,sequence_no,skill_id) VALUES (?,1,?)',[id,skill[0].skill_id]);
    await service.adminTestProfession(user,'inventor');
    for(const table of ['player_auto_battle_actions','player_pvp_auto_battle_actions']){const [actions]=await c.execute<RowDataPacket[]>(`SELECT skill_id FROM ${table} WHERE character_id=?`,[id]);assert.equal(actions[0].skill_id,null);}
    failAudit=true;await assert.rejects(service.adminTestProfession(user,'weapon_master'),/模拟审计写入失败/);failAudit=false;
    const [rollback]=await c.execute<RowDataPacket[]>('SELECT profession_code FROM player_advanced_professions WHERE character_id=?',[id]);assert.equal(rollback[0].profession_code,'inventor');
    const session=randomUUID();await c.execute('INSERT INTO player_pvp_battle_sessions (id,attacker_character_id,defender_character_id,attacker_hp,attacker_mp,defender_hp,defender_mp,attacker_cooldowns,defender_cooldowns) VALUES (?,?,?,1,1,1,1,JSON_OBJECT(),JSON_OBJECT())',[session,id,id]);
    await assert.rejects(service.adminTestProfession(user,'weapon_master'),/战斗中不能/);
    await c.execute('DELETE FROM player_pvp_battle_sessions WHERE id=?',[session]);
    await load('src/response/admin-profession-test').default();assert.ok(JSON.stringify(sent.format.value).includes('测试二转'));
    routeCode='weapon_master';await load('src/response/admin-profession-test').default();assert.ok(JSON.stringify(sent.format.value).includes('测试二转完成'));
  } finally {await c.rollback();await c.end();}
});
