const historicalCrossPointBalance=111442600;
import {secondaryProfessionMaxLevel,secondaryProfessionProficiencyRequired} from '../src/game/secondary-profession';
import {talentNpcAffinity,talentCraftMultiplier} from '../src/game/talent-rewards';
import {talentGatherReward,talentBeginGather} from '../src/game/talent-exploration';
import {talentMaterialPayment} from '../src/game/talent-production';
import {divineFoodSeconds} from '../src/game/divine-effects';
import {addMaterialCosts,takeMaterialCosts,moveMaterialCosts,recoveryMaterialBudget,scaleMaterialCost} from '../src/game/talent-material-recovery';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { initializeTalentPersistence, readTalentData, saveTalentData, emptyTalentData, applyTalentPanel, neutralTalentSnapshot } from '../src/game/talent-data';
import { talentMovementFactor } from '../src/game/talent-exploration';
import { talentExperience, talentProficiency, talentIntimacy } from '../src/game/talent-rewards';
import { consumeTalentMaterial, fixedTalentMaterials, recordTalentProduct, isTalentProduct, refundTalentFailure } from '../src/game/talent-production';
import { consumeInventory, grantInventory } from '../src/game/inventory-binding';
import { talentActionWithConnection } from '../src/game/talent.service';
import { talentDropPack } from '../src/game/talent-drops';
import { talentCode } from '../src/game/talent.config';
import { CombatRules, emptyRuleState } from '../src/game/combat-rule-registry';
import { talentState } from '../src/game/talent-combat';
import { loadTalentBattle, persistTalentBattle } from '../src/game/talent-battle.service';
import { migrateTalentCodesWithConnection } from '../src/database/talent-codes';
import { settleTalentPurification } from '../src/game/talent-purification';

test('隔离MySQL：天赋账本、实付材料、产物来源与旧指令重放',{skip:process.env.FF_TALENT_DB_TEST!=='1'},async t=>{
  const {parse,parseDocument,stringify}=createRequire(import.meta.url)('yaml'),document=parseDocument(readFileSync('alemon.config.yaml','utf8'));
  // Only this database section is needed; unrelated platform login entries are not test configuration.
  const section=document.getIn(['FantasyFinal','database'])??document.get('mysql');
  const db=parse(stringify(section));
  const name=`ff_talent_${randomUUID().replaceAll('-','')}`,c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,charset:'utf8mb4',connectTimeout:8000});let created=false;
  try{
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created=true;await c.query(`USE \`${name}\``);
    const schema=[
      'CREATE TABLE players(id BIGINT UNSIGNED PRIMARY KEY,qq_user_id VARCHAR(30))',
      "CREATE TABLE characters(id BIGINT UNSIGNED PRIMARY KEY,player_id BIGINT UNSIGNED,npc_code VARCHAR(64),secondary_profession_code VARCHAR(30) DEFAULT 'alchemist',current_hp INT DEFAULT 100,hp_max INT DEFAULT 100,current_mp INT DEFAULT 100,mp_max INT DEFAULT 100,activity_status VARCHAR(20) DEFAULT 'active',rest_started_at DATETIME NULL)",
      'CREATE TABLE player_blessings(character_id BIGINT UNSIGNED,code VARCHAR(64),PRIMARY KEY(character_id,code))',
      'CREATE TABLE skill_definitions(id BIGINT UNSIGNED PRIMARY KEY,code VARCHAR(64) UNIQUE)',
      'CREATE TABLE player_skills(character_id BIGINT UNSIGNED,skill_id BIGINT UNSIGNED,PRIMARY KEY(character_id,skill_id),FOREIGN KEY(skill_id) REFERENCES skill_definitions(id))',
      'CREATE TABLE item_definitions(id BIGINT UNSIGNED PRIMARY KEY,code VARCHAR(64),name VARCHAR(64),rarity VARCHAR(12),item_type VARCHAR(20),item_category VARCHAR(20),required_level INT,trade_price INT,effect_json JSON)',
      'CREATE TABLE player_inventory(character_id BIGINT UNSIGNED,item_id BIGINT UNSIGNED,quantity INT NOT NULL,trade_bound_quantity INT NOT NULL DEFAULT 0,personal_bound_quantity INT NOT NULL DEFAULT 0,binding_revision INT NOT NULL DEFAULT 0,PRIMARY KEY(character_id,item_id))',
      'CREATE TABLE player_opening_stories(character_id BIGINT UNSIGNED,state VARCHAR(20))',
      'CREATE TABLE negotiation_participants(character_id BIGINT UNSIGNED,session_id VARCHAR(40))',
      'CREATE TABLE negotiation_sessions(id VARCHAR(40),state VARCHAR(20))',
      'CREATE TABLE combat_members(character_id BIGINT UNSIGNED,session_id VARCHAR(40))',
      'CREATE TABLE combat_sessions(id VARCHAR(40),state VARCHAR(20))',
      'CREATE TABLE player_pvp_battle_sessions(id VARCHAR(40),state VARCHAR(20),attacker_character_id BIGINT UNSIGNED,defender_character_id BIGINT UNSIGNED)',
      'CREATE TABLE player_travels(character_id BIGINT UNSIGNED)',
      'CREATE TABLE player_resource_mining(character_id BIGINT UNSIGNED)'
    ];for(const sql of schema)await c.query(sql);
    await c.query('CREATE TABLE monster_templates(code VARCHAR(64),name VARCHAR(64))');
    await initializeTalentPersistence(c as any);await initializeTalentPersistence(c as any);
    await t.test('NPC负好感迁移保留旧无符号最大值，重复初始化不改已存负值',async()=>{
      await c.query('CREATE TABLE player_npc_affinity(character_id INT,npc_code VARCHAR(64),affinity INT UNSIGNED NOT NULL DEFAULT 0)');
      await c.query("INSERT INTO player_npc_affinity VALUES (1,'test',4294967295)");await initializeTalentPersistence(c as any);
      let [rows]=await c.query<RowDataPacket[]>('SELECT affinity FROM player_npc_affinity');assert.equal(Number(rows[0].affinity),4294967295);
      await c.query('UPDATE player_npc_affinity SET affinity=-5');await initializeTalentPersistence(c as any);
      [rows]=await c.query<RowDataPacket[]>('SELECT affinity FROM player_npc_affinity');assert.equal(Number(rows[0].affinity),-5);await c.query('DROP TABLE player_npc_affinity');
    });
    await c.execute("INSERT INTO players VALUES (1,'talent_test')");await c.execute('INSERT INTO characters(id,player_id) VALUES (1,1)');
    for(const [id,code,price] of [[1,'main',10],[2,'aux',10],[3,'substitute',5]] as const)await c.execute("INSERT INTO item_definitions VALUES (?,?,?,'普通','material','建材',10,?,'{}')",[id,code,code,price]);
    const setTalent=async(code:string)=>{await c.execute('DELETE FROM player_blessings');await c.execute('INSERT INTO player_blessings VALUES (1,?)',[talentCode(code)]);await saveTalentData(c as any,1,emptyTalentData());};
    const tx=async<T>(work:()=>Promise<T>)=>{await c.beginTransaction();try{const result=await work();await c.commit();return result;}catch(error){await c.rollback();throw error;}};
    await t.test('C02 每种每日前三次三倍，多敌按各份经验加权且不合格不占次数',async()=>{
      await setTalent('C02');
      const reward=(eligible=true)=>talentExperience(c as any,1,100,{kind:'combat',parts:[{key:'wolf',amount:100,eligible}]});
      assert.equal(await reward(false),100);
      for(const want of [300,300,300,100])assert.equal(await reward(),want);
      assert.equal(await talentExperience(c as any,1,200,{kind:'combat',parts:[{key:'wolf',amount:100,eligible:true},{key:'bear',amount:100,eligible:true}]}),400);
    });
    await t.test('C05 仅探索生产社交经验2.5倍，战斗与派生奖励排除',async()=>{
      await setTalent('C05');for(const kind of ['exploration','production','social'] as const)assert.equal(await talentExperience(c as any,1,10,{kind}),25);
      assert.equal(await talentExperience(c as any,1,10,{kind:'combat'}),10);assert.equal(await talentExperience(c as any,1,10,{kind:'social',derived:true}),10);
    });
    await t.test('C09 每个NPC首次四倍后续1.5，不同NPC独立',async()=>{
      await setTalent('C09');for(const [npc,want] of [['a',40],['a',15],['b',40]] as const)assert.equal(await talentExperience(c as any,1,10,{kind:'social',npc}),want);
      assert.equal(await talentExperience(c as any,1,10,{kind:'combat'}),10);
    });
    await t.test('D03 D05 D06 D08 F08 I06 正向好感逐种核验，不放大负反馈',async()=>{
      for(const [code,kind,crafted,want] of [['D03','gift',false,30],['D03','chat',false,10],['D05','meal',false,40],['D08','gift',true,50],['D08','gift',false,10],['I06','chat',false,30]] as const){
        await setTalent(code);assert.equal(await talentNpcAffinity(c as any,1,'npc',10,kind,crafted),want);assert.equal(await talentNpcAffinity(c as any,1,'npc',-10,kind,crafted),-10);
      }
      await setTalent('D05');assert.equal(await talentNpcAffinity(c as any,1,'npc',10,'meal'),40);assert.equal(await talentNpcAffinity(c as any,1,'npc',10,'meal'),10);
      await setTalent('D06');let data=await readTalentData(c as any,1);data.counters['introduced:npc']=5;await saveTalentData(c as any,1,data);
      for(let i=0;i<6;i++)assert.equal(await talentNpcAffinity(c as any,1,'npc',10,'chat'),i<5?50:10);
      await setTalent('F08');for(let i=0;i<6;i++)assert.equal(await talentNpcAffinity(c as any,1,'npc',10,'chat'),i<5?40:10);
      assert.equal(await talentNpcAffinity(c as any,1,'another',10,'chat'),40);
    });
    await t.test('D02 D10 随从正向亲密各自倍率与余数，其他随从不借用同心对象',async()=>{
      await setTalent('D02');assert.equal(await talentIntimacy(c as any,1,7,10),30);
      await setTalent('D10');const data=await readTalentData(c as any,1);data.settings.companion=7;await saveTalentData(c as any,1,data);
      assert.equal(await talentIntimacy(c as any,1,7,10),40);
      let total=0;for(let i=0;i<4;i++)total+=await talentIntimacy(c as any,1,8,1);assert.equal(total,3);
    });
    await t.test('E06 维修35%预付与制造成功熟练三倍，商店无折扣',async()=>{
      await setTalent('E06');let paid=0;for(let i=0;i<20;i++)paid+=await talentMaterialPayment(c as any,1,1,1,'automatonRepair',true,true);assert.equal(paid,7);
      assert.equal(await talentMaterialPayment(c as any,1,1,20,'automatonRepair',false,true),20);
      const data=await readTalentData(c as any,1);data.flags.productionAutomaton=true;await saveTalentData(c as any,1,data);
      assert.equal(await talentProficiency(c as any,1,10,{profession:'blacksmith',successfulBase:10}),30);
      assert.equal(await talentProficiency(c as any,1,10,{profession:'blacksmith',successfulBase:10}),10);
    });
    await t.test('E07 普通成功锻造存三倍纹印，下次同配方兑现一次，失败不取走',async()=>{
      await setTalent('E07');const context={profession:'blacksmith',recipe:'forge:sword',successfulBase:10};
      assert.equal(await talentProficiency(c as any,1,10,context),10);
      assert.equal(await talentProficiency(c as any,1,1,{...context,successfulBase:0}),1);
      assert.equal(await talentProficiency(c as any,1,10,{...context,recipe:'forge:bow'}),10);
      assert.equal(await talentProficiency(c as any,1,10,context),40);
    });
    await t.test('E08 H09 药剂与孤注产量只认普通白名单，投掷物不吃恢复倍率',async()=>{
      const item={rarity:'普通',item_type:'consumable',item_category:'药剂',effect_json:{heal:10}};
      await setTalent('E08');assert.equal(await talentCraftMultiplier(c as any,1,item),3.5);
      for(const changed of [{rarity:'稀有'},{effect_json:{heal:10,throwable:true}},{effect_json:{heal:10,status:'x'}}])assert.equal(await talentCraftMultiplier(c as any,1,{...item,...changed}),1);
      await setTalent('H09');assert.equal(await talentCraftMultiplier(c as any,1,item),1);const data=await readTalentData(c as any,1);data.settings.riskCraft=true;await saveTalentData(c as any,1,data);
      assert.equal(await talentCraftMultiplier(c as any,1,item),4);assert.equal(await talentCraftMultiplier(c as any,1,{...item,rarity:'稀有'}),1);
    });
    await t.test('B01 B04 移动与记录路线倍率，未记录反向路线不凭空生效',async()=>{
      const actor={id:1,pos_x:0,pos_y:0,pos_z:0,current_region_id:1},to={regionId:1,x:1,y:0,z:0};
      await setTalent('B01');assert.equal(await talentMovementFactor(c as any,actor,to),.5);
      await setTalent('B04');const data=await readTalentData(c as any,1);data.flags.routes=['1:0:0:0>1:1:0:0'];await saveTalentData(c as any,1,data);
      assert.equal(await talentMovementFactor(c as any,actor,to),.4);assert.equal(await talentMovementFactor(c as any,actor,{...to,x:2}),1);
    });
    await t.test('B07 E01 矿物3.5普通采集3，整数余数累计且稀有不增幅',async()=>{
      const actor={id:1};await setTalent('B07');let amount=0;for(let i=0;i<2;i++)amount+=await talentGatherReward(c as any,actor,1,1,'矿石');assert.equal(amount,7);
      assert.equal(await talentGatherReward(c as any,actor,1,2,'草药'),2);
      await setTalent('E01');assert.equal(await talentGatherReward(c as any,actor,1,2,'草药'),6);
      await c.execute("UPDATE item_definitions SET rarity='稀有' WHERE id=1");assert.equal(await talentGatherReward(c as any,actor,1,2,'矿石'),2);await c.execute("UPDATE item_definitions SET rarity='普通' WHERE id=1");
    });
    await t.test('I08 封存只放基础产物，24小时各批独立，立即产物为零',async()=>{
      await setTalent('I08');const data=await readTalentData(c as any,1);data.settings.sealGather=true;await saveTalentData(c as any,1,data);
      const actor={id:1,hp_max:100,current_hp:100};await talentBeginGather(c as any,actor,11);
      assert.equal(await talentGatherReward(c as any,actor,1,2,'矿石'),0);
      const [job]=(await readTalentData(c as any,1)).jobs;assert.equal(job.kind,'sealed');assert.equal(job.payload.base,2);assert.equal(job.payload.amount,7);assert.equal(job.ready-job.created,86400000);
    });
    await t.test('H06 险采先付15%HP，不能由失败或护盾免付，保留1HP门槛',async()=>{
      await setTalent('H06');const data=await readTalentData(c as any,1);data.settings.riskGather=true;await saveTalentData(c as any,1,data);
      const actor={id:1,hp_max:100,current_hp:100};await talentBeginGather(c as any,actor,11);assert.equal(actor.current_hp,85);
      await assert.rejects(()=>talentBeginGather(c as any,{...actor,current_hp:15},12),/15%/);
      await c.execute('UPDATE characters SET current_hp=100 WHERE id=1');
    });
    await t.test('B10 外出与返程的取消不吞路线，只有真实到达才确认记录边',async()=>{
      await c.query('CREATE TABLE map_npcs(id INT,code VARCHAR(64),region_id INT,pos_x INT,pos_y INT,pos_z INT,interaction_kind VARCHAR(20))');
      await c.query("INSERT INTO map_npcs VALUES (1,'guild_counter',1,0,0,0,'building')");await setTalent('B10');
      const actor=(x:number)=>({id:1,current_region_id:1,pos_x:x,pos_y:0,pos_z:0}),to=(x:number)=>({regionId:1,x,y:0,z:0});
      assert.equal(await talentMovementFactor(c as any,actor(0),to(1)),.6);
      assert.equal(await talentMovementFactor(c as any,actor(0),to(1)),.6);
      assert.equal(await talentMovementFactor(c as any,actor(1),to(2)),.6);
      let data=await readTalentData(c as any,1);data.settings.returning=true;await saveTalentData(c as any,1,data);
      assert.equal(await talentMovementFactor(c as any,actor(1),to(0)),.25);
      assert.equal(await talentMovementFactor(c as any,actor(1),to(0)),.25);
      assert.equal(await talentMovementFactor(c as any,actor(1),to(9)),1);
      assert.equal(await talentMovementFactor(c as any,actor(1),to(0)),.25);
      await c.query('DROP TABLE map_npcs');
    });
    await t.test('C04 接近满级时只扣实际投入，未用旁通点保留，重放不重复扣',async()=>{
      await c.query('CREATE TABLE player_secondary_professions(character_id INT,profession_code VARCHAR(30),level INT,proficiency INT)');
      const level=secondaryProfessionMaxLevel-1;await c.execute("INSERT INTO player_secondary_professions VALUES (1,'alchemist',?,?)",[level,secondaryProfessionProficiencyRequired(level)-3]);
      await setTalent('C04');const data=await readTalentData(c as any,1);data.counters['cross:blacksmith']=100;await saveTalentData(c as any,1,data);
      const [rows]=await c.execute<RowDataPacket[]>('SELECT revision FROM player_talent_state WHERE character_id=1');
      const result=await tx(()=>talentActionWithConnection(c as any,'talent_test',Number(rows[0].revision),'旁通','alchemist','100'));
      assert.match(result.text,/旁通3点/);assert.equal((await readTalentData(c as any,1)).counters['cross:blacksmith'],97);
      await tx(()=>talentActionWithConnection(c as any,'talent_test',Number(rows[0].revision),'旁通','alchemist','100'));assert.equal((await readTalentData(c as any,1)).counters['cross:blacksmith'],97);
      await c.query('DROP TABLE player_secondary_professions');
    });
    await t.test('C03 容量通知落库；C04 保留全部历史点但不再生成',async()=>{
      await setTalent('C03');const notice:{text?:string}={};await talentExperience(c as any,1,100,{remaining:10,notice});assert.match(notice.text!,/本金5/);assert.match(notice.text!,/超出部分不收存/);assert.equal((await readTalentData(c as any,1)).flags.experienceNotice,notice.text);
      const panel=await talentActionWithConnection(c as any,'talent_test');assert.match(panel.text,/合法成长容量/);
      await setTalent('C04');let data=await readTalentData(c as any,1);data.counters['cross:blacksmith']=historicalCrossPointBalance-1;await saveTalentData(c as any,1,data);
      await talentProficiency(c as any,1,10,{profession:'alchemist'});data=await readTalentData(c as any,1);assert.equal(data.counters['cross:alchemist'],undefined);
      await talentProficiency(c as any,1,10,{profession:'alchemist'});assert.equal((await readTalentData(c as any,1)).counters['cross:alchemist'],undefined);
      data.counters['cross:blacksmith']=historicalCrossPointBalance+100;await saveTalentData(c as any,1,data);await talentProficiency(c as any,1,10,{profession:'blacksmith'});assert.equal((await readTalentData(c as any,1)).counters['cross:blacksmith'],historicalCrossPointBalance+100);
      assert.match((await talentActionWithConnection(c as any,'talent_test')).text,/旧版旁通点不再生成/);
    });
    await t.test('C10 完整复盘路径：生成、满额选择、阻止覆盖、开工暂停续办、领取重放',async()=>{
      await c.query("CREATE TABLE player_secondary_professions(character_id INT,profession_code VARCHAR(30),level INT,proficiency INT)");await c.query("INSERT INTO player_secondary_professions VALUES (1,'alchemist',1,0)");await setTalent('C10');
      for(const n of [10,20,30,40])await tx(()=>talentProficiency(c as any,1,n,{profession:'alchemist'}));
      let data=await readTalentData(c as any,1);assert.equal(data.jobs.length,3);assert.equal(data.flags.reviewOverflow.amount,100);
      await assert.rejects(tx(()=>talentProficiency(c as any,1,50,{profession:'alchemist'})),/不会被覆盖/);assert.equal((await readTalentData(c as any,1)).flags.reviewOverflow.amount,100);
      const call=async(action:string,arg='')=>{const panel=await talentActionWithConnection(c as any,'talent_test');return tx(()=>talentActionWithConnection(c as any,'talent_test',panel.revision,action,arg));};
      await assert.rejects(call('收录新复盘'),/最多同时保留3条/);
      const old=data.jobs[1].id;await call('舍弃复盘',old);data=await readTalentData(c as any,1);assert.equal(data.jobs.length,3);assert.equal(data.flags.reviewOverflow,undefined);assert.ok(data.jobs.some(j=>j.payload.amount===100));
      const job=data.jobs[0];await call('复盘',job.id);await call('暂停复盘');await call('复盘',job.id);
      data=await readTalentData(c as any,1);data.jobs.find(j=>j.id===job.id)!.ready=Date.now()-1;await saveTalentData(c as any,1,data);
      const panel=await talentActionWithConnection(c as any,'talent_test');await tx(()=>talentActionWithConnection(c as any,'talent_test',panel.revision,'领取',job.id));await tx(()=>talentActionWithConnection(c as any,'talent_test',panel.revision,'领取',job.id));
      const [rows]=await c.query<RowDataPacket[]>('SELECT proficiency FROM player_secondary_professions');assert.equal(Number(rows[0].proficiency),25);assert.equal((await readTalentData(c as any,1)).jobs.length,2);
      await c.query('DROP TABLE player_secondary_professions');
    });
    await t.test('D05 完整共餐路径：陌生拒绝不扣食物，相识首次四倍，重放只扣一次',async()=>{
      await c.query('ALTER TABLE characters ADD current_region_id INT DEFAULT 1, ADD pos_x INT DEFAULT 0, ADD pos_y INT DEFAULT 0, ADD pos_z INT DEFAULT 0');
      await c.query('CREATE TABLE map_npcs(code VARCHAR(64),name VARCHAR(64),region_id INT,pos_x INT,pos_y INT,pos_z INT)');await c.query("INSERT INTO map_npcs VALUES ('test_npc','测试人物',1,0,0,0)");
      await c.query('CREATE TABLE player_npc_affinity(character_id INT,npc_code VARCHAR(64),affinity INT,daily_date DATE,daily_interactions INT,PRIMARY KEY(character_id,npc_code))');
      await c.query("INSERT INTO item_definitions VALUES (800,'test_food','测试料理','普通','consumable','食物',1,1,'{}')");await grantInventory(c as any,1,800,{personal:0,trade:0,unbound:3});await setTalent('D05');
      const panel=await talentActionWithConnection(c as any,'talent_test');await assert.rejects(tx(()=>talentActionWithConnection(c as any,'talent_test',panel.revision,'共餐','test_npc','800')),/先与这名NPC相识/);
      let [stock]=await c.query<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE item_id=800');assert.equal(Number(stock[0].quantity),3);
      await c.query("INSERT INTO player_npc_affinity VALUES(1,'test_npc',1,CURDATE(),0)");
      const result=await tx(()=>talentActionWithConnection(c as any,'talent_test',panel.revision,'共餐','test_npc','800'));assert.match(result.text,/好感\+20/);
      await tx(()=>talentActionWithConnection(c as any,'talent_test',panel.revision,'共餐','test_npc','800'));[stock]=await c.query<RowDataPacket[]>('SELECT quantity FROM player_inventory WHERE item_id=800');assert.equal(Number(stock[0].quantity),2);
      const [affinity]=await c.query<RowDataPacket[]>('SELECT affinity FROM player_npc_affinity');assert.equal(Number(affinity[0].affinity),21);
      await c.query('DROP TABLE map_npcs');await c.query('DROP TABLE player_npc_affinity');await c.query('DELETE FROM player_inventory WHERE item_id=800');await c.query('DELETE FROM item_definitions WHERE id=800');
    });
    await t.test('实付成本随寄售、部分成交与撤单保留，拆解不能按原配方退回',async()=>{
      await grantInventory(c as any,1,901,{personal:0,trade:0,unbound:4});
      await addMaterialCosts(c as any,'stock',1,901,{quantity:4,paid:{main:4}});
      await moveMaterialCosts(c as any,'stock',1,'market',999,901,4);await consumeInventory(c as any,1,901,4,true);
      await moveMaterialCosts(c as any,'market',999,'stock',2,901,2);await grantInventory(c as any,2,901,{personal:0,trade:2,unbound:0});
      await moveMaterialCosts(c as any,'market',999,'stock',1,901,2);await grantInventory(c as any,1,901,{personal:0,trade:0,unbound:2});
      for(const owner of [1,2]){
        const cost=await takeMaterialCosts(c as any,'stock',owner,901,2);
        assert.deepEqual(recoveryMaterialBudget(cost,2,[{code:'main',quantity:10}]),[{code:'main',quantity:2}]);
        await consumeInventory(c as any,owner,901,2);
      }
      assert.equal((await takeMaterialCosts(c as any,'market',999,901,10)).quantity,0);
    });
    await t.test('中间构件的低实付记录可随上层拆解还原；旧SQL消耗只缩减预算',async()=>{
      const child={quantity:2,paid:{ore:4}};
      await grantInventory(c as any,1,902,{personal:0,trade:0,unbound:2});
      await addMaterialCosts(c as any,'stock',1,902,{quantity:2,paid:{component:2},children:{component:child}});
      await c.execute('UPDATE player_inventory SET quantity=1 WHERE character_id=1 AND item_id=902');
      const cost=await takeMaterialCosts(c as any,'stock',1,902,1);
      assert.equal(cost.paid.component,1);assert.equal(cost.children!.component!.paid.ore,2);
      const returned=scaleMaterialCost(cost.children!.component!,1);
      await addMaterialCosts(c as any,'stock',1,903,returned);await grantInventory(c as any,1,903,{personal:0,trade:0,unbound:1});
      const inner=await takeMaterialCosts(c as any,'stock',1,903,1);
      assert.deepEqual(recoveryMaterialBudget(inner,1,[{code:'ore',quantity:10}]),[{code:'ore',quantity:2}]);
      await c.execute('DELETE FROM player_inventory WHERE item_id IN (902,903)');
      assert.equal((await takeMaterialCosts(c as any,'stock',1,902,1)).quantity,0);
    });
    await t.test('失败返材保留低成本来源；共享料理与百味时长取高，亲密负增长不放大',async()=>{
      await setTalent('E02');await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:3});
      await addMaterialCosts(c as any,'stock',1,1,{quantity:3,paid:{ore:3}});
      const payment=await consumeTalentMaterial(c as any,1,1,3,'craft');
      assert.equal(await refundTalentFailure(c as any,1,[{itemId:1,...payment}]),2);
      const cost=await takeMaterialCosts(c as any,'stock',1,1,2);assert.equal(cost.quantity,2);assert.equal(cost.paid.ore,2);
      await c.execute('DELETE FROM player_inventory WHERE character_id=1');
      await setTalent('E03');assert.equal(await divineFoodSeconds(c as any,1,60,3),180);
      await setTalent('D10');assert.equal(await talentIntimacy(c as any,1,99,-10),-10);
      const data=await readTalentData(c as any,1);data.settings.companion=99;await saveTalentData(c as any,1,data);
      assert.equal(await talentIntimacy(c as any,1,99,10),40);assert.equal(await talentIntimacy(c as any,1,98,-10),-10);
    });
    await t.test('旧身份迁移成分类编号，保持真实技能ID与持有关系；重跑不重复',async()=>{
      await c.execute("INSERT INTO skill_definitions VALUES (101,'divine_g01')");await c.execute('INSERT INTO player_skills VALUES (1,101)');await c.execute("INSERT INTO player_blessings VALUES (1,'divine_g01')");
      assert.equal(await tx(()=>migrateTalentCodesWithConnection(c as any)),1);assert.equal(await tx(()=>migrateTalentCodesWithConnection(c as any)),0);
      const [skills]=await c.execute<RowDataPacket[]>('SELECT s.id,s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=1');
      assert.deepEqual(skills.map(s=>[Number(s.id),s.code]),[[101,'talent_physique_01']]);
      const [holders]=await c.execute<RowDataPacket[]>('SELECT code FROM player_blessings WHERE character_id=1');assert.equal(holders[0].code,'talent_physique_01');
    });
    await t.test('角色经验与熟练度分别1.75和2.5；延迟经验先预留翻倍后的容量',async()=>{
      await setTalent('C01');assert.equal(await talentExperience(c as any,1,100),175);assert.equal(await talentProficiency(c as any,1,100,{profession:'alchemist'}),250);
      await setTalent('C03');assert.equal(await talentExperience(c as any,1,100,{remaining:199}),0);assert.equal((await readTalentData(c as any,1)).jobs[0]?.payload.amount,198);
      await talentExperience(c as any,1,100,{remaining:199});assert.equal((await readTalentData(c as any,1)).jobs.length,1);
    });
    await t.test('C04 成功换方四倍、同方一点五倍，失败不推进；C07 排除异类垫次数',async()=>{
      await setTalent('C04');assert.equal(await talentProficiency(c as any,1,10,{profession:'alchemist',recipe:'first'}),15);
      assert.equal(await talentProficiency(c as any,1,10,{profession:'alchemist',recipe:'first'}),15);
      assert.equal(await talentProficiency(c as any,1,10,{profession:'alchemist',recipe:'failed',successfulBase:0}),10);
      assert.equal((await readTalentData(c as any,1)).flags.crossRecipe,'first');
      assert.equal(await talentProficiency(c as any,1,10,{profession:'alchemist',recipe:'second',successfulBase:6}),28);
      assert.equal(await talentProficiency(c as any,1,10,{profession:'alchemist'}),10);
      await setTalent('C07');for(let i=0;i<4;i++)await talentExperience(c as any,1,10,{kind:'social'});assert.equal(await talentExperience(c as any,1,1000,{kind:'combat'}),1000);assert.equal(await talentExperience(c as any,1,100,{kind:'social'}),160);
    });
    await t.test('玄武仅增加50%生命，没有冰抗；PVP还原面板与血量比例',async()=>{
      await setTalent('F03');const stats={hpMax:1000},elements={mastery:{雷:10},resistance:{冰:12}};
      await applyTalentPanel(c as any,1,stats,elements);assert.equal(stats.hpMax,1500);assert.equal(elements.resistance.冰,12);
      const row={id:1,hp_max:1500,current_hp:750,mp_max:100,current_mp:50,element_mastery_json:elements.mastery,element_resistance_json:elements.resistance};
      await neutralTalentSnapshot(c as any,row,true);assert.equal(row.hp_max,1000);assert.equal(row.current_hp,500);assert.equal(row.element_resistance_json.冰,12);
    });
    await t.test('青龙每次移动都减半，不需要命中；鲲鹏和应龙旧移动标记不再生效',async()=>{
      const actor={id:1,pos_x:0,pos_y:0,pos_z:0,current_region_id:1},to={x:1,y:0,z:0,regionId:1};
      await setTalent('F02');assert.equal(await talentMovementFactor(c as any,actor,to),.5);assert.equal(await talentMovementFactor(c as any,actor,to),.5);
      for(const code of ['F07','F10']){await setTalent(code);const data=await readTalentData(c as any,1);data.flags.quickMove=true;data.flags.weatherMove=true;await saveTalentData(c as any,1,data);assert.equal(await talentMovementFactor(c as any,actor,to),1);}
    });
    await t.test('磐心护盾消耗写入敌人生命记录，同敌撤退重进不刷新，新敌重置',async()=>{
      await setTalent('G02');
      const create=()=>{const unit:any={key:'member:1',name:'测试',side:'member',hp:1000,hpMax:1000,mp:100,mpMax:100,passives:[],resistance:{},state:emptyRuleState(),cooldowns:{},opening:{pve:true,divines:[talentCode('G02')],weapons:[],crimson:0}};
        const rules=new CombatRules([unit],1,[],{absorb:async()=>0,legacyEffects:()=>[],removeLegacy:async()=>{},extraAction:()=>{},swapThreat:async()=>{}});return {unit,rules};};
      const members=[{id:1,current_hp:1000,level:10}],targets=[{id:20,level:10}];
      const first=create();await loadTalentBattle(c as any,first.rules,members,targets,new Set());await first.rules.take(first.unit,350);await persistTalentBattle(c as any,first.rules,members,targets);
      const retry=create();await loadTalentBattle(c as any,retry.rules,members,targets,new Set());assert.equal(talentState(retry.unit).stoneShield,150);
      const fresh=create();await loadTalentBattle(c as any,fresh.rules,members,[{id:21,level:10}],new Set());assert.equal(talentState(fresh.unit).stoneShield,500);
    });
    await t.test('笨鸟失败不关闭连续配方；败因奖励只放大一份匹配敌种经验',async()=>{
      await setTalent('C08');assert.equal(await talentProficiency(c as any,1,10,{profession:'blacksmith',recipe:'a',successfulBase:10}),35);
      assert.equal(await talentProficiency(c as any,1,10,{profession:'blacksmith',recipe:'b',successfulBase:0}),10);
      assert.equal(await talentProficiency(c as any,1,10,{profession:'blacksmith',recipe:'a',successfulBase:10}),35);
      await talentProficiency(c as any,1,10,{profession:'blacksmith',recipe:'b',successfulBase:10});assert.equal(await talentProficiency(c as any,1,10,{profession:'blacksmith',recipe:'a',successfulBase:10}),10);
      await setTalent('C06');const data=await readTalentData(c as any,1);data.flags.defeatSpecies='wolf';await saveTalentData(c as any,1,data);
      assert.equal(await talentExperience(c as any,1,100,{kind:'combat',parts:[{key:'wolf',amount:20,eligible:true},{key:'boss',amount:80,eligible:true}]}),160);
      assert.equal((await readTalentData(c as any,1)).flags.defeatSpecies,undefined);
    });
    await t.test('拆成五次与一次制作实付相同；预付余量保留个人绑定',async()=>{
      await setTalent('E09');await grantInventory(c as any,1,1,{personal:2,trade:0,unbound:0});let total=0;
      for(let i=0;i<5;i++){const paid=await tx(()=>consumeTalentMaterial(c as any,1,1,1,'craft'));total+=paid.paid;assert.ok(paid.binding.personal>0);}assert.equal(total,2);
    });
    await t.test('纸上借材扣真实同价替代材料，不生成缺失辅材',async()=>{
      await setTalent('I02');const data=await readTalentData(c as any,1);data.settings.substitute=true;await saveTalentData(c as any,1,data);
      await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:2});await grantInventory(c as any,1,3,{personal:0,trade:0,unbound:2});
      await tx(async()=>{const materials=await fixedTalentMaterials(c as any,1,[{code:'main',quantity:2},{code:'aux',quantity:1}],['aux']);assert.deepEqual(materials.map(m=>[m.item.code,m.quantity]),[['main',2],['substitute',2]]);for(const m of materials)await consumeTalentMaterial(c as any,1,Number(m.item.id),m.quantity,'craft');});
      const [rows]=await c.execute<RowDataPacket[]>('SELECT * FROM player_inventory WHERE character_id=1 AND item_id=2');assert.equal(rows.length,0);
    });
    await t.test('任何库存扣除都消耗自产来源，买回同名物品不能伪装成亲制',async()=>{
      await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:2});await recordTalentProduct(c as any,1,1,2);assert.equal(await isTalentProduct(c as any,1,1),true);
      await c.execute('UPDATE player_inventory SET quantity=quantity-2 WHERE character_id=1 AND item_id=1');await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:2});assert.equal(await isTalentProduct(c as any,1,1),false);
      await recordTalentProduct(c as any,1,1,1);await tx(async()=>{await consumeInventory(c as any,1,1,1);await c.rollback();});assert.equal(await isTalentProduct(c as any,1,1),true);
    });
    await t.test('提纯按成功投入计算熟练；高阶额外产量不重复放大，失败返料保留绑定',async()=>{
      await setTalent('E02');await c.execute('DELETE FROM player_inventory');
      await grantInventory(c as any,1,1,{personal:3,trade:3,unbound:3});
      const input={id:1,code:'main',quantity:9,success:0,valueMultiplier:3,proficiencyPerInput:1,personal:true};
      const failure=await tx(()=>settleTalentPurification(c as any,1,input));
      assert.equal(failure.outputQuantity,0);assert.equal(failure.refunded,6);assert.equal(failure.proficiencyGain,9);
      const [stock]=await c.execute<RowDataPacket[]>('SELECT * FROM player_inventory WHERE character_id=1 AND item_id=1');
      assert.equal(Number(stock[0].quantity),6);assert.equal(Number(stock[0].personal_bound_quantity),2);assert.equal(Number(stock[0].trade_bound_quantity),2);
      const success=await tx(()=>settleTalentPurification(c as any,1,{...input,quantity:6,success:100}));
      assert.equal(success.successes,6);assert.equal(success.outputQuantity,18);assert.equal(success.proficiencyGain,18);assert.equal(success.refunded,0);
    });
    await t.test('提纯普通材料实付四成，按原配方产出；商店不减耗也不发个人熟练',async()=>{
      await setTalent('E09');await c.execute('DELETE FROM player_inventory');await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:14});
      const input={id:1,code:'main',quantity:10,success:100,valueMultiplier:1,proficiencyPerInput:1,personal:true};
      const personal=await tx(()=>settleTalentPurification(c as any,1,input));assert.equal(personal.paid,4);assert.equal(personal.outputQuantity,10);assert.equal(personal.proficiencyGain,10);
      const shop=await tx(()=>settleTalentPurification(c as any,1,{...input,personal:false}));assert.equal(shop.paid,10);assert.equal(shop.proficiencyGain,0);
    });
    await t.test('批量提纯逐配方锁定笨鸟；失败配方不关闭，成功换方后立即关闭',async()=>{
      await setTalent('C08');await c.execute('DELETE FROM player_inventory');await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:12});
      const input={id:1,code:'a',quantity:2,success:100,valueMultiplier:1,proficiencyPerInput:1,personal:true};
      assert.equal((await settleTalentPurification(c as any,1,input)).proficiencyGain,7);
      assert.equal((await settleTalentPurification(c as any,1,{...input,code:'b',success:0})).proficiencyGain,2);
      assert.equal((await settleTalentPurification(c as any,1,input)).proficiencyGain,7);
      assert.equal((await settleTalentPurification(c as any,1,{...input,code:'b'})).proficiencyGain,2);
      assert.equal((await settleTalentPurification(c as any,1,input)).proficiencyGain,2);
    });
    await t.test('C04 批次逐配方判定，失败不换方；代工无熟练也不写个人记录',async()=>{
      await setTalent('C04');await c.execute('DELETE FROM player_inventory');await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:20});
      const input={id:1,code:'a',quantity:2,success:100,valueMultiplier:1,proficiencyPerInput:1,personal:true};
      await tx(async()=>{
        assert.equal((await settleTalentPurification(c as any,1,input)).proficiencyGain,3);
        assert.equal((await settleTalentPurification(c as any,1,{...input,code:'b',success:0})).proficiencyGain,2);
        assert.equal((await settleTalentPurification(c as any,1,input)).proficiencyGain,3);
        assert.equal((await settleTalentPurification(c as any,1,{...input,code:'b'})).proficiencyGain,8);
        assert.equal((await settleTalentPurification(c as any,1,input)).proficiencyGain,8);
      });
      const before=await readTalentData(c as any,1);assert.equal((await settleTalentPurification(c as any,1,{...input,code:'proxy',personal:false})).proficiencyGain,0);
      assert.deepEqual(await readTalentData(c as any,1),before);
    });
    await t.test('家园材料累计实付四成；贵重材料不减耗',async()=>{
      await setTalent('E04');await c.execute('DELETE FROM player_inventory');await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:4});
      let paid=0;for(let i=0;i<10;i++)paid+=(await consumeTalentMaterial(c as any,1,1,1,'home')).paid;assert.equal(paid,4);
      await c.execute("UPDATE item_definitions SET rarity='稀有' WHERE id=1");await grantInventory(c as any,1,1,{personal:0,trade:0,unbound:10});
      assert.equal((await consumeTalentMaterial(c as any,1,1,10,'home')).paid,10);await c.execute("UPDATE item_definitions SET rarity='普通' WHERE id=1");
    });
    await t.test('九尾笔记从真实交涉记录展示已知喜好，不显示未接触对象',async()=>{
      await setTalent('F08');await c.execute("INSERT INTO monster_templates VALUES ('test_rat','林间鼠'),('unknown_rat','未知鼠')");
      const data=await readTalentData(c as any,1);data.flags['preference:test_rat:草药']='like';await saveTalentData(c as any,1,data);
      const result=await talentActionWithConnection(c as any,'talent_test');assert.match(result.text,/林间鼠：草药—喜欢/);assert.doesNotMatch(result.text,/未知鼠/);
    });
    await t.test('设置入口核验天赋、版本、活动状态；成功请求重试不重复',async()=>{
      await setTalent('H09');const before=await talentActionWithConnection(c as any,'talent_test');
      const result=await tx(()=>talentActionWithConnection(c as any,'talent_test',before.revision,'设置','孤注制作','开启'));assert.equal((await readTalentData(c as any,1)).settings.riskCraft,true);
      assert.deepEqual(await tx(()=>talentActionWithConnection(c as any,'talent_test',before.revision,'设置','孤注制作','开启')),result);
      await assert.rejects(tx(()=>talentActionWithConnection(c as any,'talent_test',before.revision,'设置','孤注制作','关闭')),/状态已变化/);
      await c.execute("UPDATE characters SET activity_status='resting' WHERE id=1");await assert.rejects(tx(()=>talentActionWithConnection(c as any,'talent_test',result.revision,'设置','孤注制作','关闭')),/结束移动/);await c.execute("UPDATE characters SET activity_status='active' WHERE id=1");
    });
    await t.test('昨日来信在首抽前扣次数，最多五包，空包也不退次数',async()=>{
      await setTalent('I03');const data=await readTalentData(c as any,1);data.settings.previewDrops=true;await saveTalentData(c as any,1,data);
      for(let i=0;i<7;i++)await talentDropPack(c as any,1,[{code:'main',chance:.01,probability:1,min:1,max:1}],`event:${i}`,false);
      assert.equal((await readTalentData(c as any,1)).jobs.filter(j=>j.kind==='letter').length,5);
    });
    await t.test('编号冲突只清除未引用的新定义，保留旧ID、等级、SP流水与持有关系',async()=>{
      await c.query("ALTER TABLE skill_definitions ADD category VARCHAR(20) DEFAULT 'bound',ADD skill_kind VARCHAR(20) DEFAULT '绑定'");
      await c.query('ALTER TABLE player_skills ADD level INT DEFAULT 1');
      await c.query('CREATE TABLE player_skill_point_ledger(id INT PRIMARY KEY,skill_id BIGINT UNSIGNED,amount INT,FOREIGN KEY(skill_id) REFERENCES skill_definitions(id) ON DELETE SET NULL)');
      await c.execute("INSERT INTO skill_definitions(id,code) VALUES (901,'divine_g15'),(902,'talent_combat_01')");
      await c.execute('INSERT INTO player_skills(character_id,skill_id,level) VALUES (1,901,4)');
      await c.execute('INSERT INTO player_skill_point_ledger VALUES (1,901,-6)');
      await c.execute('DELETE FROM player_blessings');await c.execute("INSERT INTO player_blessings VALUES (1,'divine_g15')");
      assert.equal(await tx(()=>migrateTalentCodesWithConnection(c as any)),1);assert.equal(await tx(()=>migrateTalentCodesWithConnection(c as any)),0);
      const [definition]=await c.execute<RowDataPacket[]>('SELECT id,code FROM skill_definitions WHERE id IN (901,902)');assert.deepEqual(definition.map(d=>[Number(d.id),d.code]),[[901,'talent_combat_01']]);
      const [skill]=await c.execute<RowDataPacket[]>('SELECT skill_id,level FROM player_skills WHERE skill_id=901');assert.equal(Number(skill[0].level),4);
      const [ledger]=await c.execute<RowDataPacket[]>('SELECT skill_id,amount FROM player_skill_point_ledger WHERE id=1');assert.equal(Number(ledger[0].skill_id),901);assert.equal(Number(ledger[0].amount),-6);
    });
    await t.test('新定义有无外键的快捷栏引用时也拒绝删除，前面已迁移的条目整批回滚',async()=>{
      await c.query('CREATE TABLE player_auto_battle_actions(character_id BIGINT UNSIGNED,skill_id BIGINT UNSIGNED)');
      await c.execute("UPDATE skill_definitions SET code='divine_g15' WHERE id=901");await c.execute("INSERT INTO skill_definitions(id,code) VALUES (902,'talent_combat_01'),(903,'divine_g14'),(904,'talent_combat_02')");
      await c.execute('INSERT INTO player_auto_battle_actions VALUES (1,904)');
      await assert.rejects(tx(()=>migrateTalentCodesWithConnection(c as any)),/player_auto_battle_actions已有引用/);
      const [unchanged]=await c.execute<RowDataPacket[]>('SELECT id,code FROM skill_definitions WHERE id IN (901,902) ORDER BY id');assert.deepEqual(unchanged.map(d=>[Number(d.id),d.code]),[[901,'divine_g15'],[902,'talent_combat_01']]);
      await c.execute('DELETE FROM player_auto_battle_actions');
      await c.execute('INSERT INTO player_skill_point_ledger VALUES (2,904,-2)');
      await assert.rejects(tx(()=>migrateTalentCodesWithConnection(c as any)),/player_skill_point_ledger已有引用/);
      const [ledger]=await c.execute<RowDataPacket[]>('SELECT skill_id FROM player_skill_point_ledger WHERE id=2');assert.equal(Number(ledger[0].skill_id),904);
    });
  }finally{if(created)await c.query(`DROP DATABASE \`${name}\``);await c.end();}
});
