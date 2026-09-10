import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnection} from 'mysql2/promise';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {achievementDefinitions} from '../src/game/achievement.config';
import {achievementSchema} from '../src/database/achievements';
import {achievementThreshold,achievementAttributeKeys} from '../src/game/achievement-rules';
import {recordAchievement,takeAchievementEvents} from '../src/game/achievement-events';
import {flushAchievements,achievementStatBonus,achievementRewardsInDatabase} from '../src/game/achievement.service';

// 本套验证账本契约，不伪装为所有玩法入口的端到端测试。
test('有效静态目录逐项账本验收',{skip:process.env.FF_ACHIEVEMENT_DB_TEST!=='1'},async t=>{
 const yaml=createRequire(import.meta.url)('yaml'),doc=yaml.parseDocument(readFileSync('alemon.config.yaml','utf8'));
 const db=yaml.parse(yaml.stringify(doc.getIn(['FantasyFinal','database'])??doc.get('mysql')));
 const name='ff_achievement_'+randomUUID().replaceAll('-','');assert.match(name,/^ff_achievement_[a-f0-9]{32}$/);
 const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,charset:'utf8mb4',connectTimeout:8000});let created=false;
 const results:any[]=[];
 try{
  await c.query(`CREATE DATABASE \`${name}\``);created=true;await c.query(`USE \`${name}\``);
  await c.query('CREATE TABLE players(id INT PRIMARY KEY,qq_user_id VARCHAR(128))');
  await c.query('CREATE TABLE characters(id INT PRIMARY KEY,player_id INT,name VARCHAR(128),npc_code VARCHAR(64))');
  await c.query('CREATE TABLE bot_group_channels(bot_id VARCHAR(128),group_openid VARCHAR(128))');
  await c.query("INSERT INTO bot_group_channels VALUES ('test','one'),('test','two')");
  for(const sql of achievementSchema)await c.query(sql);
  for(const [i,d] of achievementDefinitions.entries())await t.test(d.id+' '+d.name,async()=>{
   const actor=i*3+1,identity='audit-'+d.id,limit=achievementThreshold(d.id),disabled=/^ACH_L2[1-5]$/.test(d.id);
   await c.execute('INSERT INTO players VALUES (?,?),(?,?)',[actor,identity,actor+1,identity+'-second']);
   await c.execute('INSERT INTO characters VALUES (?,?,?,NULL),(?,?,?,NULL)',[actor,actor,d.name,actor+1,actor+1,'另一人']);
   const grant=async(key:string,value:number,id=actor)=>{recordAchievement(c as any,id,[{metric:d.id,value}],key);await flushAchievements(c as any,takeAchievementEvents(c as any));};
   const completions=async()=>Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_completions WHERE achievement_id=?',[d.id]))[0][0].n);
   try{
    await c.beginTransaction();await grant('before',limit-1);await c.commit();assert.equal(await completions(),0);
    await c.beginTransaction();await grant('finish',1);await c.rollback();assert.equal(await completions(),0);
    await c.beginTransaction();await grant('finish',1);await c.commit();
    assert.equal(await completions(),disabled?0:1);
    if(!disabled){
     const stock=await achievementRewardsInDatabase(c as any,identity);assert.equal(stock.rareBoxes,1);
     await c.beginTransaction();await grant('finish',1);await grant('extra',limit);await grant('second',limit,actor+1);await c.commit();
     assert.equal(await completions(),2);assert.deepEqual(await achievementRewardsInDatabase(c as any,identity),stock);
     assert.equal((await achievementRewardsInDatabase(c as any,identity+'-second')).rareBoxes,0);
     const [ranks]=await c.execute<any[]>('SELECT ordinal,reward_attribute,reward_points,rarity FROM achievement_completions WHERE achievement_id=? ORDER BY ordinal',[d.id]);
     const [attr,points]=d.attribute.split('+');assert.deepEqual(ranks.map(r=>Number(r.ordinal)),[1,2]);
     for(const r of ranks){assert.equal(r.reward_attribute,achievementAttributeKeys[attr]);assert.equal(Number(r.reward_points),Number(points));assert.equal(r.rarity,d.rarity);}
     assert.equal(Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_announcements WHERE achievement_id=?',[d.id]))[0][0].n),1);
     assert.equal(Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_deliveries WHERE achievement_id=?',[d.id]))[0][0].n),2);
     const stats=await achievementStatBonus(c as any,actor);assert.equal(stats[achievementAttributeKeys[attr] as keyof typeof stats],Number(points));
     await c.execute('DELETE FROM characters WHERE id=?',[actor]);await c.execute('DELETE FROM players WHERE id=?',[actor]);
     await c.execute('INSERT INTO players VALUES (?,?)',[actor+2,identity]);await c.execute('INSERT INTO characters VALUES (?,?,?,NULL)',[actor+2,actor+2,'重修']);
     assert.deepEqual(await achievementStatBonus(c as any,actor+2),stats);assert.deepEqual(await achievementRewardsInDatabase(c as any,identity),stock);
    }
    results.push({id:d.id,ledger:disabled?'未开放拦截通过':'通过',threshold:limit});
   }catch(e){await c.rollback();takeAchievementEvents(c as any);results.push({id:d.id,ledger:'失败',error:String(e)});throw e;}
  });
 }finally{
  writeFileSync('.data/achievement-design-20260909/ledger-audit-results.json',JSON.stringify(results,null,2));
  if(created)await c.query(`DROP DATABASE \`${name}\``);await c.end();
 }
});
