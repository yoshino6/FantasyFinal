import { achievementAlchemySurprises, achievementGatherSurprises } from '../src/game/achievement-surprise';
import { achievementAlchemyRecovery, achievementAutomatonFeeds, achievementSocialPair, achievementBookSource, achievementBookLearned, achievementBookSkillUsed, achievementCraftedWeapon, achievementInstanceVictory, achievementPeerProgress, updateAchievementState } from '../src/game/achievement-state';
import { achievementActivity, achievementSecondaryLevel } from '../src/game/achievement-hooks';
import { achievementTrade } from '../src/game/achievement-trade';
import { achievementBattleOutcome } from '../src/game/achievement-easter';
import { migrateBossAchievementRewards } from '../src/game/achievement-boss-reward-migration';
import { achievementCombatVictory } from '../src/game/achievement-combat';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'mysql2/promise';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { achievementSchema } from '../src/database/achievements';
import { flushAchievements, achievementStatBonus, achievementListInDatabase, achievementRewardsInDatabase, openAchievementBoxInDatabase } from '../src/game/achievement.service';
import { recordAchievement, takeAchievementEvents } from '../src/game/achievement-events';
import { recordPvpAchievements } from '../src/game/achievement-pvp';
import { ensureBossAchievement, loadBossAchievementDefinitions, bossAchievementDefinition, achievementBossTargets } from '../src/game/achievement-boss';
import { achievementById } from '../src/game/achievement-rules';

test('隔离MySQL：原子达成、首位、回滚、重试、跨重修属性与无效身份排除',{skip:process.env.FF_ACHIEVEMENT_DB_TEST!=='1'},async()=>{
  const {parseDocument,parse,stringify}=createRequire(import.meta.url)('yaml');
  const doc=parseDocument(readFileSync('alemon.config.yaml','utf8'));
  const db=parse(stringify(doc.getIn(['FantasyFinal','database'])??doc.get('mysql')));
  const name='ff_achievement_'+randomUUID().replaceAll('-','');
  assert.match(name,/^ff_achievement_[a-f0-9]{32}$/);
  const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,charset:'utf8mb4',connectTimeout:8000});
  let created=false;
  try{
    await c.query(`CREATE DATABASE \`${name}\``);created=true;await c.query(`USE \`${name}\``);
    await c.query('CREATE TABLE players(id INT PRIMARY KEY,qq_user_id VARCHAR(128))');
    await c.query('CREATE TABLE characters(id INT PRIMARY KEY,player_id INT,name VARCHAR(128),npc_code VARCHAR(64))');
    await c.query('CREATE TABLE player_equipment(character_id INT,instance_id INT)');await c.query('CREATE TABLE player_item_instances(id INT,character_id INT,item_id INT)');await c.query('CREATE TABLE item_definitions(id INT,item_category VARCHAR(32))');await c.query('CREATE TABLE player_companions(id INT PRIMARY KEY,character_id INT,is_out INT,released_at DATETIME NULL)');
    await c.query('CREATE TABLE bot_group_channels(bot_id VARCHAR(128),group_openid VARCHAR(128))');
    for(const sql of achievementSchema)await c.query(sql);
    await c.query("INSERT INTO players VALUES (1,'identity-one'),(2,'identity-two'),(3,'npc')");
    await c.query("INSERT INTO characters VALUES (1,1,'甲',NULL),(2,2,'乙',NULL),(3,3,'域民','test_npc')");
    await c.query("INSERT INTO bot_group_channels VALUES ('bot','group-one'),('bot','group-two')");
    const award=async(id:number,key:string,metric='ACH_B25',value=1)=>{recordAchievement(c as any,id,[{metric,value}],key);return flushAchievements(c as any,takeAchievementEvents(c as any));};
    await c.beginTransaction();await award(1,'rolled-back');await c.rollback();
    const count=async(table:string)=>Number((await c.query<any[]>(`SELECT COUNT(*) n FROM ${table}`))[0][0].n);
    assert.equal(await count('achievement_completions'),0);assert.equal(await count('achievement_announcements'),0);
    await c.beginTransaction();await award(1,'kill-one');await c.commit();
    await c.beginTransaction();await award(1,'kill-one');await award(1,'another-kill');await award(2,'kill-two');await award(3,'npc-kill');await c.commit();
    assert.equal(await count('achievement_completions'),2);assert.equal(await count('achievement_announcements'),1);assert.equal(await count('achievement_deliveries'),2);
    const [ranks]=await c.query<any[]>('SELECT ordinal FROM achievement_completions ORDER BY ordinal');assert.deepEqual(ranks.map(r=>Number(r.ordinal)),[1,2]);
    assert.equal((await achievementStatBonus(c as any,1)).strength,5);
    const empty=await achievementListInDatabase(c as any,'not-unlocked');assert.deepEqual(empty.visibleCategories,['全部']);assert.equal(empty.entries.length,0);
    const page=await achievementListInDatabase(c as any,'identity-one');assert.deepEqual(page.visibleCategories,['全部','战斗']);assert.equal(page.entries[0].rank,1);assert.equal(page.entries[0].percentage,'100.00%');assert.ok(!('condition' in page.entries[0]));
    await c.query('DELETE FROM characters WHERE id=1');await c.query('DELETE FROM players WHERE id=1');
    await c.query("INSERT INTO players VALUES(11,'identity-one')");await c.query("INSERT INTO characters VALUES(11,11,'重修甲',NULL)");
    assert.equal((await achievementStatBonus(c as any,11)).strength,5);
    assert.equal((await achievementRewardsInDatabase(c as any,'identity-one')).rareBoxes,1);
    assert.equal((await achievementRewardsInDatabase(c as any,'identity-two')).rareBoxes,0);
    const openingToken=randomUUID();
    await c.beginTransaction();await openAchievementBoxInDatabase(c as any,'identity-one',openingToken);await c.rollback();
    assert.equal((await achievementRewardsInDatabase(c as any,'identity-one')).rareBoxes,1);
    await c.beginTransaction();const opened=await openAchievementBoxInDatabase(c as any,'identity-one',openingToken);await c.commit();
    await c.beginTransaction();assert.deepEqual(await openAchievementBoxInDatabase(c as any,'identity-one',openingToken),opened);await c.commit();
    const inventory=await achievementRewardsInDatabase(c as any,'identity-one');assert.equal(inventory.rareBoxes,0);assert.equal(inventory.items.length,1);assert.equal(inventory.items[0].quantity,1);
    await c.beginTransaction();await assert.rejects(openAchievementBoxInDatabase(c as any,'identity-two',openingToken),/没有可打开/);await c.rollback();
    await c.beginTransaction();await assert.rejects(openAchievementBoxInDatabase(c as any,'identity-one',randomUUID()),/没有可打开/);await c.rollback();
    await c.execute("UPDATE achievement_rewards SET quantity=5 WHERE identity_key='identity-one' AND reward_key='rare_box'");
    const batchToken=randomUUID();
    await c.beginTransaction();const batch=await openAchievementBoxInDatabase(c as any,'identity-one',batchToken,3);await c.commit();
    assert.equal(batch.quantity,3);assert.equal(batch.items.reduce((n,item)=>n+item.quantity,0),3);
    await c.beginTransaction();assert.deepEqual(await openAchievementBoxInDatabase(c as any,'identity-one',batchToken,3),batch);await c.commit();
    assert.equal((await achievementRewardsInDatabase(c as any,'identity-one')).rareBoxes,2);
    await c.beginTransaction();await assert.rejects(openAchievementBoxInDatabase(c as any,'identity-one',batchToken,2),/其他数量/);await c.rollback();
    for(const quantity of [0,101,1.5,3]){await c.beginTransaction();await assert.rejects(openAchievementBoxInDatabase(c as any,'identity-one',randomUUID(),quantity));await c.rollback();}
    assert.equal((await achievementRewardsInDatabase(c as any,'identity-one')).rareBoxes,2);
    assert.equal((await achievementRewardsInDatabase(c as any,'identity-one')).items.reduce((n,item)=>n+item.quantity,0),4);
    await c.beginTransaction();await award(11,'reborn-kill');await award(11,'threshold-99','ACH_B04',99);await c.commit();
    assert.equal(await count('achievement_completions'),2);
    await c.beginTransaction();await award(11,'threshold-100','ACH_B04');await c.commit();assert.equal(await count('achievement_completions'),3);
    await c.beginTransaction();await award(11,'hidden','ACH_SECRET_01');await c.commit();assert.equal(await count('achievement_completions'),3);
    await c.beginTransaction();achievementActivity(c as any,11);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.rollback();
    assert.equal(Number((await c.query<any[]>("SELECT COUNT(*) n FROM achievement_progress WHERE identity_key='identity-one' AND metric='ACH_A24'"))[0][0].n),0);
    await c.beginTransaction();achievementActivity(c as any,11);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    const [activityProgress]=await c.query<any[]>("SELECT metric,value_json FROM achievement_progress WHERE identity_key='identity-one' AND metric IN ('ACH_A24','ACH_A25') ORDER BY metric");
    assert.equal(activityProgress.length,2);for(const row of activityProgress){const state=typeof row.value_json==='string'?JSON.parse(row.value_json):row.value_json;assert.equal(Number(state.count),1);assert.equal(state.seen.length,1);}
    await c.beginTransaction();achievementActivity(c as any,11);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    const [activityRetry]=await c.query<any[]>("SELECT value_json FROM achievement_progress WHERE identity_key='identity-one' AND metric='ACH_A24'");const activityRetryState=typeof activityRetry[0].value_json==='string'?JSON.parse(activityRetry[0].value_json):activityRetry[0].value_json;assert.equal(Number(activityRetryState.count),1);
    await c.query('ALTER TABLE characters ADD level INT DEFAULT 10,ADD hp_max INT DEFAULT 100,ADD current_region_id INT DEFAULT 1');
    await c.query('CREATE TABLE player_pvp_battle_sessions(id VARCHAR(40) PRIMARY KEY,attacker_character_id INT,defender_character_id INT,state VARCHAR(24),attacker_cooldowns JSON,defender_cooldowns JSON,attacker_hp INT,defender_hp INT,turn_no INT)');
    const evidence=JSON.stringify({__rules:{memory:{achievement:{damage:50}}}});
    await c.execute("INSERT INTO player_pvp_battle_sessions VALUES ('pvp1',11,2,'attacker_win',?,?,8,0,11)",[evidence,evidence]);
    await c.beginTransaction();await recordPvpAchievements(c as any,'pvp1',11);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.rollback();
    assert.ok(!(await achievementListInDatabase(c as any,'identity-one','PVP')).entries.some(e=>e.id==='ACH_P02'));
    await c.beginTransaction();await recordPvpAchievements(c as any,'pvp1',11);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    const pvp=await achievementListInDatabase(c as any,'identity-one','PVP');assert.ok(pvp.entries.some(e=>e.id==='ACH_P02'));assert.ok(pvp.entries.some(e=>e.id==='ACH_P23'));assert.ok(pvp.entries.some(e=>e.id==='ACH_P24'));
    const pvpRewardsBeforeRetry=await achievementRewardsInDatabase(c as any,'identity-one');
    const [pvpCompletionsBeforeRetry]=await c.query<any[]>("SELECT COUNT(*) n FROM achievement_completions WHERE identity_key='identity-one' AND achievement_id LIKE 'ACH_P%'");
    await c.beginTransaction();await recordPvpAchievements(c as any,'pvp1',11);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    assert.deepEqual(await achievementRewardsInDatabase(c as any,'identity-one'),pvpRewardsBeforeRetry);
    const [pvpCompletionsAfterRetry]=await c.query<any[]>("SELECT COUNT(*) n FROM achievement_completions WHERE identity_key='identity-one' AND achievement_id LIKE 'ACH_P%'");
    assert.equal(Number(pvpCompletionsAfterRetry.n),Number(pvpCompletionsBeforeRetry.n));
    await c.execute("INSERT INTO player_pvp_battle_sessions VALUES ('pvp2',11,2,'defender_win',?,?,0,50,3)",[evidence,evidence]);
    await c.beginTransaction();await recordPvpAchievements(c as any,'pvp2',2);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    const sameDay=await achievementListInDatabase(c as any,'identity-two','PVP');assert.ok(!sameDay.entries.some(e=>e.id==='ACH_P02'));
    await c.query('CREATE TABLE monster_templates(id INT PRIMARY KEY,code VARCHAR(64),name VARCHAR(64))');await c.query("INSERT INTO monster_templates VALUES(1,'test_formal_wolf','试验狼王')");
    await c.beginTransaction();const boss=await ensureBossAchievement(c as any,{template_id:1,traits_json:[{code:'dreamlike'}]});assert.ok(boss);await award(11,'boss-dream',boss!);await c.commit();
    achievementById.delete(boss!);await loadBossAchievementDefinitions(c as any);assert.equal(achievementById.get(boss!)?.rarity,'史诗');
    const bossPage=await achievementListInDatabase(c as any,'identity-one','首领');assert.equal(bossPage.entries.length,1);assert.ok(bossPage.entries[0].name.includes('梦幻首杀'));assert.equal(bossPage.entries[0].rank,1);

    // 旧定义仅更新展示字段，不修改既有编号、奖励和名次。
    const renamed=bossAchievementDefinition('shadow_wolf_king','幽影狼王','ordinary');
    await c.execute('INSERT INTO achievement_boss_definitions VALUES (?,?,?,?)',[renamed.id,'shadow_wolf_king','ordinary',JSON.stringify({...renamed,name:'幽影狼王·普通首杀',description:'旧简介'})]);
    await loadBossAchievementDefinitions(c as any);assert.equal(achievementById.get(renamed.id)?.name,'月下少一声');
    const [stored]=await c.execute<any[]>('SELECT definition_json FROM achievement_boss_definitions WHERE id=?',[renamed.id]);
    const saved=typeof stored[0].definition_json==='string'?JSON.parse(stored[0].definition_json):stored[0].definition_json;assert.equal(saved.name,'月下少一声');assert.equal(saved.attribute,renamed.attribute);
    await c.query('CREATE TABLE map_regions(id INT PRIMARY KEY,name VARCHAR(64))');await c.query("INSERT INTO map_regions VALUES (1,'幽暗密林')");
    await c.query('CREATE TABLE combat_sessions(id VARCHAR(40) PRIMARY KEY,character_id INT)');await c.query("INSERT INTO combat_sessions VALUES ('team-first',11)");
    await c.query("INSERT INTO monster_templates VALUES (2,'shadow_wolf_king','幽影狼王')");
    const makeMember=(id:number,damage:number,healed:number)=>({id,level:10,current_hp:80,stamina_eligible:true,cooldowns:{__rules:{memory:{achievement:{damage,healed,kills:[],elements:[],crit:false,dodged:false,shield:false,received:0,receivedHits:0,lowHeal:false}}}}});
    await c.query("INSERT INTO players VALUES (4,'inactive')");await c.query("INSERT INTO characters(id,player_id,name) VALUES (4,4,'旁观者')");
    const members=[makeMember(4,0,0),makeMember(11,100,0),makeMember(2,0,50),{...makeMember(3,0,0),npc_code:'test_npc'}];
    const target={id:100,template_id:2,level:12,monster_class:'boss',traits_json:[{code:'ordinary'}]};
    await c.beginTransaction();await achievementCombatVictory(c as any,'team-first',members,[target]);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.rollback();
    assert.equal(Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_first_members WHERE achievement_id=?',[renamed.id]))[0][0].n),0);
    const rewardState=async(identity:string)=>{
      const [r]=await c.execute<any[]>("SELECT (SELECT COALESCE(MAX(quantity),0) FROM achievement_rewards WHERE identity_key=? AND reward_key='rare_box') boxes,(SELECT COUNT(*) FROM achievement_completions WHERE identity_key=?) n,(SELECT COUNT(*) FROM achievement_first_members WHERE identity_key=?) f",[identity,identity,identity]);return r[0];
    };
    const states=new Map(await Promise.all(['identity-one','identity-two'].map(async identity=>[identity,await rewardState(identity)] as const)));
    await c.beginTransaction();await achievementCombatVictory(c as any,'team-first',members,[target]);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    for(const [identity,before] of states){const after=await rewardState(identity);assert.ok(after.f>before.f);assert.equal(Number(after.boxes)-Number(before.boxes),Number(after.f)-Number(before.f)+Math.floor(after.n/10)-Math.floor(before.n/10));}
    assert.equal(Number((await c.query<any[]>("SELECT COUNT(*) n FROM achievement_completions WHERE identity_key='inactive'"))[0][0].n),0);

    const [firstMembers]=await c.execute<any[]>('SELECT identity_key FROM achievement_first_members WHERE achievement_id=? ORDER BY identity_key',[renamed.id]);assert.deepEqual(firstMembers.map(m=>m.identity_key),['identity-one','identity-two']);
    assert.equal(Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_first_members WHERE achievement_id=?',['ACH_G07']))[0][0].n),2);
    assert.equal(Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_announcements WHERE achievement_id=?',[renamed.id]))[0][0].n),1);
    const beforeRetry=await achievementRewardsInDatabase(c as any,'identity-one');
    await c.beginTransaction();await achievementCombatVictory(c as any,'team-first',members,[target]);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();assert.deepEqual(await achievementRewardsInDatabase(c as any,'identity-one'),beforeRetry);
    // 相同事务的不同合作事件不能共同首发；个人条件也不因附带合作标记变为共同首发。
    for(const [metric,shared] of [['ACH_G12',true],['ACH_C23',false]] as const){
      await c.beginTransaction();recordAchievement(c as any,11,[{metric,cooperationKey:'team-a'}],'other-'+metric);recordAchievement(c as any,2,[{metric,cooperationKey:shared?'team-b':'team-a'}],'other-'+metric);
      await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
      assert.equal(Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_first_members WHERE achievement_id=?',[metric]))[0][0].n),1);
    }

    await c.beginTransaction();const hero=await ensureBossAchievement(c as any,{template_id:2,traits_json:[{code:'heroic'}]});await award(11,'hero-old',hero!);await c.commit();
    await c.execute("UPDATE achievement_completions SET reward_attribute='strength',reward_points=3,rarity='精良' WHERE identity_key='identity-one' AND achievement_id=?",[hero]);
    const history=async()=>({completion:(await c.execute<any[]>("SELECT ordinal,completed_at,name_snapshot FROM achievement_completions WHERE identity_key='identity-one' AND achievement_id=?",[hero]))[0][0],rewards:await achievementRewardsInDatabase(c as any,'identity-one'),announcements:await count('achievement_announcements'),members:await count('achievement_first_members')});
    const beforeMigration=await history();
    await c.beginTransaction();await migrateBossAchievementRewards(c as any);await c.rollback();
    assert.equal(Number((await c.execute<any[]>("SELECT reward_points FROM achievement_completions WHERE identity_key='identity-one' AND achievement_id=?",[hero]))[0][0].reward_points),3);
    await c.beginTransaction();assert.ok((await migrateBossAchievementRewards(c as any)).includes(11));await c.commit();
    const [changed]=await c.execute<any[]>("SELECT reward_attribute,reward_points,rarity FROM achievement_completions WHERE identity_key='identity-one' AND achievement_id=?",[hero]);
    assert.equal(changed[0].rarity,'优秀');assert.equal(Number(changed[0].reward_points),2);assert.deepEqual(await history(),beforeMigration);
    await c.beginTransaction();assert.deepEqual(await migrateBossAchievementRewards(c as any),[]);await c.commit();

    await c.query("INSERT INTO monster_templates VALUES(3,'goblin_king','哥布林国王'),(4,'habadragon','哈巴龙'),(5,'scholar_ga','大学者·噶'),(6,'goblin_royal_guard','王庭护卫'),(7,'dungeon_warden','迷宫镇守者')");
    const court=[3,4,6].map((template_id,i)=>({id:200+i,template_id,level:32,monster_class:'boss',traits_json:[{code:'ordinary'},{code:'kingbeast_encounter',groupId:'court-one',role:template_id===3?'king':template_id===4?'dragon':'guard'}]}));
    const scholar={id:300,template_id:5,level:22,monster_class:'boss',traits_json:[]};
    assert.deepEqual((await achievementBossTargets(c as any,[...court,scholar])).map(t=>t.template_id),[3]);
    assert.equal(await ensureBossAchievement(c as any,court[1]),null);assert.equal(await ensureBossAchievement(c as any,scholar),null);assert.equal(await ensureBossAchievement(c as any,{...scholar,template_id:7}),null);
    await c.query("INSERT INTO combat_sessions VALUES ('court-victory',11)");
    const countBefore=Number((await c.query<any[]>("SELECT COUNT(*) n FROM achievement_boss_definitions"))[0][0].n);
    await c.beginTransaction();await achievementCombatVictory(c as any,'court-victory',members,court);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    assert.equal(Number((await c.query<any[]>("SELECT COUNT(*) n FROM achievement_boss_definitions"))[0][0].n),countBefore+1);
    const courtId=bossAchievementDefinition('goblin_king','哥布林国王','ordinary').id;
    assert.equal(Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_first_members WHERE achievement_id=?',[courtId]))[0][0].n),2);
    assert.equal(Number((await c.execute<any[]>('SELECT COUNT(*) n FROM achievement_announcements WHERE achievement_id=?',[courtId]))[0][0].n),1);

    const loss={...makeMember(4,0,0),current_hp:0};loss.cooldowns.__rules.memory.achievement.received=10;
    const eggTarget={...target,id:900};
    const settleEgg=async(key:string,result:'defeat'|'victory'|'escape',m:any=loss,t:any=eggTarget)=>{await achievementBattleOutcome(c as any,key,result,[m],[t]);await flushAchievements(c as any,takeAchievementEvents(c as any));};
    const hasEgg=async(id:string)=>Number((await c.execute<any[]>("SELECT COUNT(*) n FROM achievement_completions WHERE identity_key='inactive' AND achievement_id=?",[id]))[0][0].n);
    const streak=async()=>{const [rows]=await c.query<any[]>("SELECT value_json FROM achievement_progress WHERE identity_key='inactive' AND life_key='4' AND metric='egg_losing_streak'");const value=typeof rows[0]?.value_json==='string'?JSON.parse(rows[0].value_json):rows[0]?.value_json;return Number(value?.count??0);};
    for(let i=1;i<=9;i++){await c.beginTransaction();await settleEgg('loss-'+i,'defeat');await c.commit();}
    assert.equal(await hasEgg('ACH_EGG01'),0);assert.equal(await streak(),9);
    await c.beginTransaction();await settleEgg('loss-9','defeat');await c.commit();assert.equal(await streak(),9);
    await c.beginTransaction();await settleEgg('loss-10','defeat');await c.rollback();assert.equal(await streak(),9);assert.equal(await hasEgg('ACH_EGG01'),0);
    await c.beginTransaction();await settleEgg('redemption','victory',{...makeMember(4,100,0),current_hp:50});await c.commit();assert.equal(await hasEgg('ACH_EGG02'),1);assert.equal(await streak(),0);
    for(let i=1;i<=10;i++){await c.beginTransaction();await settleEgg('second-loss-'+i,'defeat');await c.commit();}
    assert.equal(await hasEgg('ACH_EGG01'),1);assert.equal(await streak(),10);
    await c.beginTransaction();await settleEgg('other-enemy','defeat',loss,{...eggTarget,id:901});await c.commit();assert.equal(await streak(),1);
    await c.beginTransaction();await settleEgg('escape-streak','escape');await c.commit();assert.equal(await streak(),0);
    const colourful={...makeMember(4,200,0),current_hp:1,hp_max:100};colourful.cooldowns.__rules.memory.achievement.elements=['火','冰','雷','风','光','暗'];colourful.cooldowns.__rules.memory.achievement.receivedHits=30;
    await c.query("INSERT INTO combat_sessions VALUES ('egg-solo',4),('egg-party',11),('egg-boundary',4)");
    await c.beginTransaction();await achievementCombatVictory(c as any,'egg-boundary',[{...colourful,current_hp:2,cooldowns:{__rules:{memory:{achievement:{...colourful.cooldowns.__rules.memory.achievement,elements:['火','冰','雷','风','光'],receivedHits:29}}}}}],[target]);
    const boundaryEvents=takeAchievementEvents(c as any);assert.ok(!boundaryEvents.some(e=>e.facts.some(f=>['ACH_EGG03','ACH_EGG04','ACH_EGG06'].includes(f.metric))));await c.rollback();
    await c.beginTransaction();await achievementCombatVictory(c as any,'egg-solo',[colourful],[target]);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    for(const id of ['ACH_EGG03','ACH_EGG04','ACH_EGG06'])assert.equal(await hasEgg(id),1);
    const fragileTeam=[11,2,4].map(id=>({...makeMember(id,100,0),current_hp:10,hp_max:100}));
    await c.beginTransaction();await achievementCombatVictory(c as any,'egg-party',fragileTeam,[target]);await flushAchievements(c as any,takeAchievementEvents(c as any));await c.commit();
    assert.equal(Number((await c.query<any[]>("SELECT COUNT(*) n FROM achievement_first_members WHERE achievement_id='ACH_EGG05'"))[0][0].n),3);
    // 第二批秘闻：门槛前不解锁，重复事件/同种输入不推进，回滚后可安全重试。
    for(const [metric,threshold,distinct] of [['ACH_EGG07',10,false],['ACH_EGG08',50,false],['ACH_EGG09',30,true],['ACH_EGG10',12,true],['ACH_EGG11',30,true],['ACH_EGG12',1000,true]] as const){
      const submit=async(key:string,facts:any[])=>{recordAchievement(c as any,4,facts,key);await flushAchievements(c as any,takeAchievementEvents(c as any));};
      await c.beginTransaction();
      await submit(metric+'-before',distinct?Array.from({length:threshold-1},(_,i)=>({metric,distinct:String(i)})):[{metric,value:threshold-1}]);
      await c.commit();assert.equal(await hasEgg(metric),0);
      await c.beginTransaction();await submit(metric+'-before',[{metric,value:1000}]);
      if(distinct)await submit(metric+'-same',[{metric,distinct:'0'}]);
      await c.commit();assert.equal(await hasEgg(metric),0);
      const last=distinct?[{metric,distinct:'last'}]:[{metric,value:1}];
      await c.beginTransaction();await submit(metric+'-last',last);assert.equal(await hasEgg(metric),1);await c.rollback();assert.equal(await hasEgg(metric),0);
      await c.beginTransaction();await submit(metric+'-last',last);await c.commit();assert.equal(await hasEgg(metric),1);
      const stock=await achievementRewardsInDatabase(c as any,'inactive');
      await c.beginTransaction();await submit(metric+'-last',last);await c.commit();assert.deepEqual(await achievementRewardsInDatabase(c as any,'inactive'),stock);
      const [completion]=await c.execute<any[]>('SELECT reward_points,ordinal FROM achievement_completions WHERE achievement_id=? AND identity_key=?',[metric,'inactive']);
      assert.equal(Number(completion[0].reward_points),5);assert.equal(Number(completion[0].ordinal),1);
    }
    // 现有玩法补全：跨次记录使用实际MySQL事务，测试对象隔离、回滚与事件重试。
    const flush=async()=>flushAchievements(c as any,takeAchievementEvents(c as any));
    await c.beginTransaction();await achievementAlchemyRecovery(c as any,4,'recovery-fail','1:2:3',0,1);await c.rollback();
    await c.beginTransaction();await achievementAlchemyRecovery(c as any,4,'recovery-success','1:2:3',1,0);assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    await c.beginTransaction();await achievementAlchemyRecovery(c as any,4,'recovery-fail-real','1:2:3',0,1);await achievementAlchemyRecovery(c as any,4,'recovery-other','3:2:1',1,0);assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    await c.beginTransaction();await achievementAlchemyRecovery(c as any,4,'recovery-win','1:2:3',1,0);await flush();await c.commit();assert.equal(await hasEgg('ACH_H20'),1);
    await c.beginTransaction();await achievementAlchemyRecovery(c as any,4,'recovery-win','1:2:3',1,0);assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    await c.beginTransaction();await achievementAutomatonFeeds(c as any,4,100,'feeds-a',['a','b','c','d']);await achievementAutomatonFeeds(c as any,4,101,'feeds-b',['e']);await flush();await c.commit();assert.equal(await hasEgg('ACH_J07'),0);
    await c.beginTransaction();await achievementAutomatonFeeds(c as any,4,100,'feeds-c',['e']);await flush();await c.rollback();assert.equal(await hasEgg('ACH_J07'),0);
    await c.beginTransaction();await achievementAutomatonFeeds(c as any,4,100,'feeds-c',['e']);await achievementAutomatonFeeds(c as any,4,101,'feeds-all',['f','g','h','i','j','k','l']);await flush();await c.commit();assert.equal(await hasEgg('ACH_J07'),1);assert.equal(await hasEgg('ACH_J08'),1);
    for(let i=0;i<9;i++){await c.beginTransaction();await achievementSocialPair(c as any,4,11,'oath','oath-'+i);await flush();await c.commit();}
    assert.equal(await hasEgg('ACH_G19'),0);
    await c.beginTransaction();await achievementSocialPair(c as any,4,2,'oath','other-oath');await flush();await c.commit();assert.equal(await hasEgg('ACH_G19'),0);
    await c.beginTransaction();await achievementSocialPair(c as any,4,11,'oath','oath-9');await flush();await c.commit();assert.equal(await hasEgg('ACH_G19'),1);
    await c.beginTransaction();await achievementSocialPair(c as any,4,11,'oath','oath-9');assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    await c.beginTransaction();achievementSecondaryLevel(c as any,4,2);assert.equal(takeAchievementEvents(c as any)[0].facts.length,0);achievementSecondaryLevel(c as any,4,11);await flush();await c.commit();for(const id of ['ACH_A19','ACH_A20'])assert.equal(await hasEgg(id),1);
    await c.beginTransaction();await achievementTrade(c as any,4,11,0,10000,9000,'paid-trade');const tradeFacts=takeAchievementEvents(c as any);assert.equal(tradeFacts.find(e=>e.characterId===4)!.facts.find(f=>f.metric==='ACH_K08')!.value,10000);assert.equal(tradeFacts.find(e=>e.characterId===11)!.facts.find(f=>f.metric==='ACH_K09')!.value,9000);await flushAchievements(c as any,tradeFacts);await c.commit();assert.equal(await hasEgg('ACH_K08'),1);
    // 同一实例计数不会跨实例拼凑，重试与回滚不多计。
    for(let n=0;n<19;n++){await c.beginTransaction();await achievementInstanceVictory(c as any,4,700,'instance-'+n,'ACH_J11');await flush();await c.commit();}
    await c.beginTransaction();await achievementInstanceVictory(c as any,4,701,'instance-19','ACH_J11');await flush();await c.commit();assert.equal(await hasEgg('ACH_J11'),0);
    await c.beginTransaction();await achievementInstanceVictory(c as any,4,700,'instance-19','ACH_J11');await flush();await c.rollback();assert.equal(await hasEgg('ACH_J11'),0);
    await c.beginTransaction();await achievementInstanceVictory(c as any,4,700,'instance-19','ACH_J11');await flush();await c.commit();assert.equal(await hasEgg('ACH_J11'),1);
    await c.beginTransaction();await achievementInstanceVictory(c as any,4,700,'instance-19','ACH_J11');assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    // 只读书不计学习；非书本学习不计；两本不达标，第三本真实学习后落库。
    await c.beginTransaction();await achievementBookLearned(c as any,4,800);assert.equal(takeAchievementEvents(c as any).length,0);await achievementBookSource(c as any,4,800,80);assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    for(const [skill,book] of [[800,80],[801,81]]){await c.beginTransaction();await achievementBookSource(c as any,4,skill,book);await achievementBookLearned(c as any,4,skill);await flush();await c.commit();}assert.equal(await hasEgg('ACH_J18'),0);
    await c.beginTransaction();await achievementBookSource(c as any,4,802,82);await achievementBookLearned(c as any,4,802);await flush();await c.rollback();assert.equal(await hasEgg('ACH_J18'),0);
    await c.beginTransaction();await achievementBookSource(c as any,4,802,82);await achievementBookLearned(c as any,4,802);await flush();await c.commit();assert.equal(await hasEgg('ACH_J18'),1);
    // J17 必须先读书、再学习、后实际使用；回滚和重复使用均不提前或重复达成。
    await c.beginTransaction();await achievementBookSource(c as any,4,803,83);await achievementBookSkillUsed(c as any,4,803,'book-use-before-learn');assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    await c.beginTransaction();await achievementBookLearned(c as any,4,803);await flush();await c.commit();
    await c.beginTransaction();await achievementBookSkillUsed(c as any,4,803,'book-use-rollback');await flush();await c.rollback();assert.equal(await hasEgg('ACH_J17'),0);
    await c.beginTransaction();await achievementBookSkillUsed(c as any,4,803,'book-use-commit');await flush();await c.commit();assert.equal(await hasEgg('ACH_J17'),1);
    await c.beginTransaction();await achievementBookSkillUsed(c as any,4,803,'book-use-commit');assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    // 跨日自然日进度：已有四天，同日重复只推进一次；不同好友不能拼接。
    await c.beginTransaction();await updateAchievementState(c as any,4,'social_friend','seed-four',false,state=>{state.peers={'identity-one':['2000-01-01','2000-01-02','2000-01-03','2000-01-04']};});await achievementPeerProgress(c as any,4,'identity-two','friend','friend-other');await flush();await c.commit();assert.equal(await hasEgg('ACH_G15'),0);
    await c.beginTransaction();await achievementPeerProgress(c as any,4,'identity-one','friend','friend-fifth');await flush();await c.rollback();assert.equal(await hasEgg('ACH_G15'),0);
    await c.beginTransaction();await achievementPeerProgress(c as any,4,'identity-one','friend','friend-fifth');await flush();await c.commit();assert.equal(await hasEgg('ACH_G15'),1);
    // 本世初始化事件在重修后允许再次执行，不能被旧生涯回执吞掉。
    await c.beginTransaction();await updateAchievementState(c as any,4,'pve_life_history','birth',true,state=>{state.fromBirth=true;});await c.commit();
    await c.query("INSERT INTO characters(id,player_id,name,npc_code) VALUES(44,4,'重修测试',NULL)");await c.beginTransaction();await updateAchievementState(c as any,44,'pve_life_history','birth',true,state=>{state.fromBirth=true;});await c.commit();
    const [birth]=await c.query<any[]>("SELECT value_json FROM achievement_progress WHERE identity_key='inactive' AND life_key='44' AND metric='pve_life_history'");assert.equal((typeof birth[0].value_json==='string'?JSON.parse(birth[0].value_json):birth[0].value_json).fromBirth,true);
    // 正式PVE胜利结算的边界，事件先由业务判定生成，再交给同一账本。
    const victoryFacts=async(key:string,party:any[],enemy:any=target)=>{await c.beginTransaction();await achievementCombatVictory(c as any,key,party,[enemy]);const events=takeAchievementEvents(c as any);await c.rollback();return events.flatMap(e=>e.facts.map(f=>({id:e.characterId,...f})));};
    const frontline={...makeMember(4,100,0),current_hp:10,hp_max:100};frontline.cooldowns.__rules.memory.achievement.receivedActions=['enemy:1','enemy:2','enemy:3'];frontline.cooldowns.__rules.memory.achievement.playerSupport=3;
    let vf=await victoryFacts('verify-frontline',[frontline,makeMember(11,100,0)]);for(const metric of ['ACH_G08','ACH_G09','ACH_G10','ACH_C15','ACH_B03'])assert.ok(vf.some(f=>f.id===4&&f.metric===metric),metric);
    frontline.cooldowns.__rules.memory.achievement.receivedActions=['enemy:1','enemy:2'];frontline.cooldowns.__rules.memory.achievement.playerSupport=2;frontline.cooldowns.__rules.memory.achievement.friendlyDamage=true;
    vf=await victoryFacts('verify-frontline-boundary',[frontline,{...makeMember(11,100,0),current_hp:0}]);for(const metric of ['ACH_G08','ACH_G09','ACH_G10','ACH_C15'])assert.ok(!vf.some(f=>f.id===4&&f.metric===metric),metric);
    vf=await victoryFacts('verify-mentor',[{...makeMember(4,100,0),level:30},{...makeMember(11,100,0),level:10}],{...target,level:10});assert.ok(vf.some(f=>f.id===4&&f.metric==='ACH_G11'));assert.ok(!vf.some(f=>f.id===4&&f.metric==='ACH_B03'));
    await c.query("INSERT INTO players VALUES (6,'higher-level')");await c.query("INSERT INTO characters(id,player_id,name) VALUES (6,6,'越阶验收员')");
    vf=await victoryFacts('verify-higher-level',[makeMember(6,100,0)],{...target,level:12});assert.ok(vf.some(f=>f.id===6&&f.metric==='ACH_C14'));
    const higherC14=async()=>Number((await c.query<any[]>("SELECT COUNT(*) n FROM achievement_completions WHERE identity_key='higher-level' AND achievement_id='ACH_C14'"))[0][0].n);
    await c.beginTransaction();await achievementCombatVictory(c as any,'higher-level-rollback',[makeMember(6,100,0)],[{...target,level:12}]);await flush();await c.rollback();assert.equal(await higherC14(),0);
    await c.beginTransaction();await achievementCombatVictory(c as any,'higher-level-commit',[makeMember(6,100,0)],[{...target,level:12}]);await flush();await c.commit();assert.equal(await higherC14(),1);
    await c.beginTransaction();await achievementCombatVictory(c as any,'higher-level-commit',[makeMember(6,100,0)],[{...target,level:12}]);await flush();await c.commit();assert.equal(await higherC14(),1);
    await c.query("INSERT INTO players VALUES (7,'low-hp')");await c.query("INSERT INTO characters(id,player_id,name) VALUES (7,7,'濒死验收员')");
    const lowHpMember=(hp:number,friendly=false)=>({ ...makeMember(7,100,0),current_hp:hp,hp_max:100,cooldowns:{__rules:{memory:{achievement:{...makeMember(7,100,0).cooldowns.__rules.memory.achievement,friendlyDamage:friendly}}}}});
    vf=await victoryFacts('verify-low-hp',[lowHpMember(10)],{...target,level:10});assert.ok(vf.some(f=>f.id===7&&f.metric==='ACH_C15'));
    vf=await victoryFacts('verify-low-hp-friendly',[lowHpMember(10,true)],{...target,level:10});assert.ok(!vf.some(f=>f.id===7&&f.metric==='ACH_C15'));
    vf=await victoryFacts('verify-low-hp-boundary',[lowHpMember(11)],{...target,level:10});assert.ok(!vf.some(f=>f.id===7&&f.metric==='ACH_C15'));
    const lowHpC15=async()=>Number((await c.query<any[]>("SELECT COUNT(*) n FROM achievement_completions WHERE identity_key='low-hp' AND achievement_id='ACH_C15'"))[0][0].n);
    await c.beginTransaction();await achievementCombatVictory(c as any,'low-hp-rollback',[lowHpMember(10)],[{...target,level:10}]);await flush();await c.rollback();assert.equal(await lowHpC15(),0);
    await c.beginTransaction();await achievementCombatVictory(c as any,'low-hp-commit',[lowHpMember(10)],[{...target,level:10}]);await flush();await c.commit();assert.equal(await lowHpC15(),1);
    await c.beginTransaction();await achievementCombatVictory(c as any,'low-hp-commit',[lowHpMember(10)],[{...target,level:10}]);await flush();await c.commit();assert.equal(await lowHpC15(),1);
    assert.equal(await hasEgg('ACH_A23'),1);assert.equal(await hasEgg('ACH_B24'),1);assert.equal(await hasEgg('ACH_B25'),0);
    await c.beginTransaction();await achievementBattleOutcome(c as any,'new-life-first-boss','victory',[{...makeMember(44,100,0),current_hp:100}],[target],[target]);await flush();await c.commit();assert.equal(await hasEgg('ACH_B25'),1);
    // 99场只属于同一武器；第100场从正式战斗结算查询本人当前实例，重试不再增加。
    await c.query("INSERT INTO item_definitions VALUES(900,'武器')");await c.query('INSERT INTO player_item_instances VALUES(900,4,900)');await c.query('INSERT INTO player_equipment VALUES(4,900)');
    for(let n=0;n<99;n++){await c.beginTransaction();await achievementInstanceVictory(c as any,4,900,'weapon-'+n,'ACH_I15');await flush();await c.commit();}assert.equal(await hasEgg('ACH_I15'),0);
    await c.beginTransaction();await achievementCombatVictory(c as any,'weapon-final',[{...makeMember(4,100,0),current_hp:100}],[target]);await flush();await c.commit();assert.equal(await hasEgg('ACH_I15'),1);
    // I21 要同时具备本人锻造实例、本人装备、普通攻击实际扣血和正式 PVE 胜利；来源状态与结算均可回滚，重试不重复。
    await c.query("INSERT INTO item_definitions VALUES(901,'武器')");await c.query('INSERT INTO player_item_instances VALUES(901,4,901)');await c.query('INSERT INTO player_equipment VALUES(4,901)');
    await c.beginTransaction();await achievementCraftedWeapon(c as any,4,901);await c.commit();
    const craftedMember=(normalAttackDamage:boolean)=>({ ...makeMember(4,100,0),current_hp:100,cooldowns:{__rules:{memory:{achievement:{...makeMember(4,100,0).cooldowns.__rules.memory.achievement,normalAttackDamage}}}}});
    await c.beginTransaction();await achievementCombatVictory(c as any,'crafted-weapon-no-hit',[craftedMember(false)],[target]);await flush();await c.commit();assert.equal(await hasEgg('ACH_I21'),0);
    await c.beginTransaction();await achievementCombatVictory(c as any,'crafted-weapon-hit',[craftedMember(true)],[target]);await flush();await c.commit();assert.equal(await hasEgg('ACH_I21'),1);
    await c.beginTransaction();await achievementCombatVictory(c as any,'crafted-weapon-hit',[craftedMember(true)],[target]);await flush();await c.commit();assert.equal(await hasEgg('ACH_I21'),1);
    // G23 只在同伴仍跟随且本人有效参战的正式胜利推进；同一场重试不重复。
    await c.query('INSERT INTO player_companions VALUES(701,4,1,NULL)');
    for(let n=0;n<19;n++){await c.beginTransaction();await achievementCombatVictory(c as any,'companion-'+n,[{...makeMember(4,100,0),current_hp:100}],[target]);await flush();await c.commit();}assert.equal(await hasEgg('ACH_G23'),0);
    await c.beginTransaction();await achievementCombatVictory(c as any,'companion-final',[{...makeMember(4,100,0),current_hp:100}],[target]);await flush();await c.commit();assert.equal(await hasEgg('ACH_G23'),1);
    await c.query('UPDATE player_companions SET is_out=0 WHERE id=701');await c.beginTransaction();await achievementCombatVictory(c as any,'companion-away',[{...makeMember(4,100,0),current_hp:100}],[target]);assert.equal(takeAchievementEvents(c as any).some(event=>event.facts.some(f=>f.metric==='ACH_G23')),false);await c.rollback();
    // 新彩蛋：正式Boss战败证据、濒死胜利边界及重试落库。
    const fastLoss={...makeMember(4,600,0),current_hp:0,hp_max:100};(fastLoss.cooldowns.__rules.memory.achievement as any).bossOpeningKnockout='target:'+target.id;
    const dyingBoss={...target,hp_max:1000,current_hp:10};
    const lossFacts=async(key:string,m:any,t:any)=>{await c.beginTransaction();await achievementBattleOutcome(c as any,key,'defeat',[m],[t]);const f=takeAchievementEvents(c as any).flatMap(e=>e.facts.map(f=>f.metric));await c.rollback();return f;};
    const goodLoss=await lossFacts('fast-loss',fastLoss,dyingBoss);for(const id of ['ACH_EGG13','ACH_EGG14'])assert.ok(goodLoss.includes(id));
    assert.ok(!(await lossFacts('too-high',fastLoss,{...dyingBoss,level:13})).includes('ACH_EGG13'));
    assert.ok(!(await lossFacts('hp-boundary',fastLoss,{...dyingBoss,current_hp:11})).includes('ACH_EGG14'));
    assert.ok(!(await lossFacts('not-boss',fastLoss,{...dyingBoss,monster_class:'normal'})).includes('ACH_EGG13'));
    await c.beginTransaction();await achievementBattleOutcome(c as any,'fast-loss','defeat',[fastLoss],[dyingBoss]);await flush();await c.commit();assert.equal(await hasEgg('ACH_EGG13'),1);assert.equal(await hasEgg('ACH_EGG14'),1);
    await c.beginTransaction();await achievementBattleOutcome(c as any,'fast-loss','defeat',[fastLoss],[dyingBoss]);assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    let finalFacts=await victoryFacts('empty-mana',[{...makeMember(4,100,0),current_hp:10,hp_max:100,current_mp:0}]);assert.ok(finalFacts.some(f=>f.metric==='ACH_EGG15'));assert.ok(!finalFacts.some(f=>f.metric==='ACH_EGG16'));
    finalFacts=await victoryFacts('one-each',[{...makeMember(4,100,0),current_hp:1,hp_max:100,current_mp:1}]);assert.ok(finalFacts.some(f=>f.metric==='ACH_EGG16'));assert.ok(!finalFacts.some(f=>f.metric==='ACH_EGG15'));
    finalFacts=await victoryFacts('too-healthy',[{...makeMember(4,100,0),current_hp:11,hp_max:100,current_mp:0}]);assert.ok(!finalFacts.some(f=>f.metric==='ACH_EGG15'));
    // 新长期胜利入口确实发出事件，而非只有定义。
    const milestones=await victoryFacts('endurance',[makeMember(4,100,0),makeMember(11,100,0)]);for(const id of ['ACH_END01','ACH_END02','ACH_END03'])assert.ok(milestones.some(f=>f.metric===id));
    // 同一身份队友必须共同有效贡献十场；换人、旁观和回滚均不能凑数。
    await c.query("INSERT INTO players VALUES (20,'pair-left'),(21,'pair-right'),(22,'pair-idle')");await c.query("INSERT INTO characters(id,player_id,name) VALUES (20,20,'同行甲'),(21,21,'同行乙'),(22,22,'旁观丙')");
    const pairLeft=()=>makeMember(20,100,0),pairRight=()=>makeMember(21,100,0),pairIdle=()=>makeMember(22,0,0);
    const pairProgress=async()=>{const [rows]=await c.execute<any[]>("SELECT value_json FROM achievement_progress WHERE identity_key='pair-left' AND life_key='' AND metric='battle_peers'");const state=typeof rows[0]?.value_json==='string'?JSON.parse(rows[0].value_json):rows[0]?.value_json;return Number(state?.peers?.['pair-right']??0);};const pairCompletion=async()=>Number((await c.execute<any[]>("SELECT COUNT(*) AS n FROM achievement_completions WHERE identity_key='pair-left' AND achievement_id='ACH_G05'"))[0][0].n);
    let pairFacts=await victoryFacts('pair-idle',[pairLeft(),pairIdle()]);assert.ok(!pairFacts.some(f=>f.id===20&&f.metric==='ACH_G05'));
    for(let index=0;index<9;index++){await c.beginTransaction();await achievementCombatVictory(c as any,`pair-win-${index}`,[pairLeft(),pairRight()],[target]);await flush();await c.commit();}assert.equal(await pairProgress(),9);assert.equal(await pairCompletion(),0);
    await c.beginTransaction();await achievementCombatVictory(c as any,'pair-win-10',[pairLeft(),pairRight()],[target]);await flush();await c.rollback();assert.equal(await pairProgress(),9);assert.equal(await pairCompletion(),0);
    await c.beginTransaction();await achievementCombatVictory(c as any,'pair-win-10',[pairLeft(),pairRight()],[target]);await flush();await c.commit();assert.equal(await pairProgress(),10);assert.equal(await pairCompletion(),1);
    await c.beginTransaction();await achievementCombatVictory(c as any,'pair-win-10',[pairLeft(),pairRight()],[target]);await flush();await c.commit();assert.equal(await pairProgress(),10);assert.equal(await pairCompletion(),1);
    // 对队友实际生效的护盾与治疗同为贡献；空放/单纯防御不应搭乘队友胜利。99/100、回滚和同局重放均由正式胜利账本处理。
    await c.query("INSERT INTO players VALUES (8,'shield-support'),(9,'shield-striker')");await c.query("INSERT INTO characters(id,player_id,name) VALUES (8,8,'护盾验收员'),(9,9,'队友验收员')");
    const shieldMember=(support=1)=>{const member=makeMember(8,0,0);member.cooldowns.__rules.memory.achievement.playerSupport=support;return member;};const striker=()=>makeMember(9,100,0);
    let shieldFacts=await victoryFacts('shield-effective',[shieldMember(),striker()]);assert.ok(shieldFacts.some(f=>f.id===8&&f.metric==='ACH_G04'));assert.ok(shieldFacts.some(f=>f.id===8&&f.metric==='ACH_G07'));shieldFacts=await victoryFacts('shield-empty',[shieldMember(0),striker()]);assert.ok(!shieldFacts.some(f=>f.id===8&&f.metric==='ACH_G04'));shieldFacts=await victoryFacts('shield-non-boss',[shieldMember(),striker()],{...target,monster_class:'normal',traits_json:[]});assert.ok(!shieldFacts.some(f=>f.id===8&&f.metric==='ACH_G07'));
    const shieldProgress=async()=>{const [rows]=await c.execute<any[]>("SELECT value_json FROM achievement_progress WHERE identity_key='shield-support' AND life_key='' AND metric='ACH_G04'");const state=typeof rows[0]?.value_json==='string'?JSON.parse(rows[0].value_json):rows[0]?.value_json;return Number(state?.count??0);};const shieldCompletion=async()=>Number((await c.execute<any[]>("SELECT COUNT(*) AS n FROM achievement_completions WHERE identity_key='shield-support' AND achievement_id='ACH_G04'"))[0][0].n);
    const shieldBossCompletion=async()=>Number((await c.execute<any[]>("SELECT COUNT(*) AS n FROM achievement_completions WHERE identity_key='shield-support' AND achievement_id='ACH_G07'"))[0][0].n);
    await c.beginTransaction();await achievementCombatVictory(c as any,'shield-boss-rollback',[shieldMember(),striker()],[target]);await flush();await c.rollback();assert.equal(await shieldBossCompletion(),0);
    for(let index=0;index<99;index++){await c.beginTransaction();await achievementCombatVictory(c as any,`shield-win-${index}`,[shieldMember(),striker()],[target]);await flush();await c.commit();}assert.equal(await shieldProgress(),99);assert.equal(await shieldCompletion(),0);assert.equal(await shieldBossCompletion(),1);
    await c.beginTransaction();await achievementCombatVictory(c as any,'shield-win-100',[shieldMember(),striker()],[target]);await flush();await c.rollback();assert.equal(await shieldProgress(),99);assert.equal(await shieldCompletion(),0);
    await c.beginTransaction();await achievementCombatVictory(c as any,'shield-win-100',[shieldMember(),striker()],[target]);await flush();await c.commit();assert.equal(await shieldProgress(),100);assert.equal(await shieldCompletion(),1);
    await c.beginTransaction();await achievementCombatVictory(c as any,'shield-win-100',[shieldMember(),striker()],[target]);await flush();await c.commit();assert.equal(await shieldProgress(),100);assert.equal(await shieldCompletion(),1);
    // 已退役的低门槛条目不能经旧按钮/旧事件再领取，百战仍有效。
    await c.beginTransaction();for(const id of ['ACH_B03','ACH_C07','ACH_J04','ACH_P19','ACH_P21'])await award(4,'retired-v2-'+id,id,99999);await c.commit();for(const id of ['ACH_B03','ACH_C07','ACH_J04','ACH_P19','ACH_P21'])assert.equal(await hasEgg(id),0);
    // 炼金彩蛋依实际订单持久化：非炸炉打断，重复/回滚不推进。
    const brew=async(token:string,exploded:boolean,successes=0,great=0,signature='recipe-a')=>{await achievementAlchemySurprises(c as any,4,token,signature,successes,exploded,great);await flush();};
    for(let i=0;i<4;i++){await c.beginTransaction();await brew('smoke-'+i,true);await c.commit();}assert.equal(await hasEgg('ACH_EGG35'),0);
    await c.beginTransaction();await brew('smoke-break',false);await c.commit();
    for(let i=0;i<4;i++){await c.beginTransaction();await brew('smoke-again-'+i,true);await c.commit();}assert.equal(await hasEgg('ACH_EGG35'),0);
    await c.beginTransaction();await brew('smoke-final',true);await c.rollback();assert.equal(await hasEgg('ACH_EGG35'),0);await c.beginTransaction();await brew('smoke-final',true);await c.commit();assert.equal(await hasEgg('ACH_EGG35'),1);
    await c.beginTransaction();await achievementAlchemySurprises(c as any,4,'smoke-final','recipe-a',0,true,0);assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    await c.beginTransaction();await updateAchievementState(c as any,4,'alchemy_surprises','test-near-formula',false,state=>{state.recipes['recipe-a'].explosions=49;state.recipes['recipe-a'].successes=999;});await brew('near-formula',false,1,1,'other-recipe');await c.commit();assert.equal(await hasEgg('ACH_EGG36'),0);assert.equal(await hasEgg('ACH_EGG40'),0);
    await c.beginTransaction();await brew('fiftieth-smoke',true);await brew('formula-redemption',false,1,1);await c.commit();assert.equal(await hasEgg('ACH_EGG36'),1);assert.equal(await hasEgg('ACH_EGG40'),1);
    // 三个地区各99处的边界；同种材料999处，错误地区/物品不能代替门槛。
    await c.beginTransaction();await updateAchievementState(c as any,4,'gather_surprises','near-gather',false,state=>{state.regions={'1':99,'2':99,'3':99};state.items={'10':999};});await c.commit();
    for(const region of [1,2]){await c.beginTransaction();await achievementGatherSurprises(c as any,4,10000+region,11,region);await flush();await c.commit();}assert.equal(await hasEgg('ACH_EGG43'),0);assert.equal(await hasEgg('ACH_EGG44'),0);
    await c.beginTransaction();await achievementGatherSurprises(c as any,4,10003,10,3);await flush();await c.rollback();assert.equal(await hasEgg('ACH_EGG43'),0);assert.equal(await hasEgg('ACH_EGG44'),0);
    await c.beginTransaction();await achievementGatherSurprises(c as any,4,10003,10,3);await flush();await c.commit();assert.equal(await hasEgg('ACH_EGG43'),1);assert.equal(await hasEgg('ACH_EGG44'),1);
    await c.beginTransaction();await achievementGatherSurprises(c as any,4,10003,10,3);assert.equal(takeAchievementEvents(c as any).length,0);await c.commit();
    // 删除低门槛条目后，旧奖励保留，但旧入口与查询均不能重新解锁或展示。
    await c.query("INSERT INTO achievement_counters VALUES ('ACH_A01',1)");
    await c.query("INSERT INTO achievement_completions(identity_key,achievement_id,ordinal,reward_attribute,reward_points,rarity,name_snapshot) VALUES ('identity-one','ACH_A01',1,'constitution',1,'普通','旧记录')");
    const inherited=await achievementStatBonus(c as any,11);
    await c.beginTransaction();await award(2,'retired-entry','ACH_A01');await c.commit();
    assert.equal(Number((await c.query<any[]>("SELECT COUNT(*) n FROM achievement_completions WHERE achievement_id='ACH_A01'"))[0][0].n),1);assert.deepEqual(await achievementStatBonus(c as any,11),inherited);
    const retiredPage=await achievementListInDatabase(c as any,'identity-one','初行');assert.equal(retiredPage.entries.length,0);assert.ok(!retiredPage.visibleCategories.includes('初行'));
  }finally{if(created)await c.query(`DROP DATABASE \`${name}\``);await c.end();}
});
