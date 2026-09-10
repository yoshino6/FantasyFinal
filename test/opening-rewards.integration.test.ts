import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { grantOpeningPackExtras, openingPackExtras, grantOpeningProfessionWeapon } from '../src/game/opening-pack.service';

test('隔离MySQL：路线补发、实际个人绑定、失败回滚及并发防重复', {skip:process.env.FF_OPENING_DB_TEST!=='1'},async t=>{
  const {parse}=createRequire(import.meta.url)('yaml'),config=parse(readFileSync('alemon.config.yaml','utf8'));
  const db=config.FantasyFinal?.database??config.mysql,name=`ff_opening_rewards_${randomUUID().replaceAll('-','')}`;
  const options={host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,charset:'utf8mb4',connectTimeout:8000};
  const c=await createConnection(options);let created=false;
  try{
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created=true;await c.query(`USE \`${name}\``);
    await c.query('CREATE TABLE characters (id BIGINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB');
    await c.query('CREATE TABLE item_definitions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,code VARCHAR(64) UNIQUE,name VARCHAR(64)) ENGINE=InnoDB');
    await c.query('CREATE TABLE player_inventory (character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,quantity INT,trade_bound_quantity INT,personal_bound_quantity INT,binding_revision INT,PRIMARY KEY(character_id,item_id),FOREIGN KEY(character_id) REFERENCES characters(id),FOREIGN KEY(item_id) REFERENCES item_definitions(id)) ENGINE=InnoDB');
    await c.query('CREATE TABLE player_item_codex (character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,PRIMARY KEY(character_id,item_id)) ENGINE=InnoDB');
    await c.query('CREATE TABLE player_opening_services (character_id BIGINT UNSIGNED,code VARCHAR(64),uses INT UNSIGNED,PRIMARY KEY(character_id,code),FOREIGN KEY(character_id) REFERENCES characters(id)) ENGINE=InnoDB');
    await c.query('CREATE TABLE player_opening_stories (character_id BIGINT UNSIGNED PRIMARY KEY,reward_claimed TINYINT) ENGINE=InnoDB');
    await c.query('CREATE TABLE player_item_instances (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,quality INT,durability INT,durability_max INT,bound_kind VARCHAR(16),bound_at DATETIME) ENGINE=InnoDB');
    const codes=[...new Set(Object.values(openingPackExtras).flatMap(p=>(p.items??[]).map(i=>i[0]))),'opening_normal_sword'];
    for(const code of codes)await c.execute('INSERT INTO item_definitions (code,name) VALUES (?,?)',[code,code]);
    const tx=async<T>(work:()=>Promise<T>)=>{await c.beginTransaction();try{const value=await work();await c.commit();return value;}catch(e){await c.rollback();throw e;}};
    await t.test('八类礼包按设计发放额外部分，重试不重复，物品全部个人绑定',async()=>{
      let id=0;
      for(const[pack,extra]of Object.entries(openingPackExtras)){
        id++;await c.execute('INSERT INTO characters VALUES (?)',[id]);assert.equal(await tx(()=>grantOpeningPackExtras(c as any,id,pack)),true);assert.equal(await tx(()=>grantOpeningPackExtras(c as any,id,pack)),false);
        const[items]=await c.execute<RowDataPacket[]>('SELECT i.code,p.quantity,p.personal_bound_quantity,p.trade_bound_quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=?',[id]);
        assert.deepEqual(Object.fromEntries(items.map(i=>[i.code,i.quantity])),Object.fromEntries(extra.items??[]));for(const item of items){assert.equal(item.personal_bound_quantity,item.quantity);assert.equal(item.trade_bound_quantity,0);}
        const[services]=await c.execute<RowDataPacket[]>("SELECT code,uses FROM player_opening_services WHERE character_id=? AND code<>'pack_extras_v1'",[id]);assert.deepEqual(Object.fromEntries(services.map(s=>[s.code,s.uses])),Object.fromEntries(extra.services??[]));
      }
    });
    await t.test('礼包第三件缺配置时，前两件、领取标记与服务整批回滚',async()=>{
      await c.execute('INSERT INTO characters VALUES (90)');await c.execute("UPDATE item_definitions SET code='temporarily_missing_metal' WHERE code='home_metal'");
      await assert.rejects(tx(()=>grantOpeningPackExtras(c as any,90,'R匠')),/home_metal/);
      const[items]=await c.execute<RowDataPacket[]>('SELECT * FROM player_inventory WHERE character_id=90'),[services]=await c.execute<RowDataPacket[]>('SELECT * FROM player_opening_services WHERE character_id=90');assert.equal(items.length,0);assert.equal(services.length,0);
      await c.execute("UPDATE item_definitions SET code='home_metal' WHERE code='temporarily_missing_metal'");assert.equal(await tx(()=>grantOpeningPackExtras(c as any,90,'R匠')),true);
    });
    await t.test('两个并发领取请求锁住同一角色，最终只有150铜币补给额度',async()=>{
      await c.execute('INSERT INTO characters VALUES (91)');
      const workers=await Promise.all([createConnection({...options,database:name}),createConnection({...options,database:name})]);
      try{
        const result=await Promise.all(workers.map(async worker=>{await worker.beginTransaction();try{await worker.execute('SELECT id FROM characters WHERE id=91 FOR UPDATE');const granted=await grantOpeningPackExtras(worker as any,91,'R商');await worker.commit();return granted;}catch(e){await worker.rollback();throw e;}}));assert.deepEqual(result.sort(),[false,true]);
      }finally{await Promise.all(workers.map(w=>w.end()));}
      const[rows]=await c.execute<RowDataPacket[]>("SELECT uses FROM player_opening_services WHERE character_id=91 AND code='supplies'");assert.equal(rows[0].uses,150);
    });
    await t.test('选职武器只给有新开局记录的角色一次，使用真实装备实例与个人绑定',async()=>{
      await c.execute('INSERT INTO characters VALUES (92),(93)');await c.execute('INSERT INTO player_opening_stories VALUES (92,1)');
      const gear=await tx(()=>grantOpeningProfessionWeapon(c as any,92,'warrior'));assert.ok(gear?.id);assert.equal(await tx(()=>grantOpeningProfessionWeapon(c as any,92,'warrior')),null);assert.equal(await tx(()=>grantOpeningProfessionWeapon(c as any,93,'warrior')),null);
      const[rows]=await c.execute<RowDataPacket[]>('SELECT * FROM player_item_instances WHERE character_id=92');assert.equal(rows.length,1);assert.equal(rows[0].bound_kind,'personal');assert.equal(rows[0].quality,100);
    });
  }finally{if(created)await c.query(`DROP DATABASE \`${name}\``);await c.end();}
});
