import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import ts from 'typescript';
import * as talentConfig from '../src/game/talent.config';
import * as constants from '../src/game/constants';
import { attributes } from '../src/game/types';
import * as content from '../src/game/opening-content';
import * as world from '../src/game/opening-world.config';
import * as state from '../src/game/opening-state';
import * as inventory from '../src/game/inventory-binding';
import * as ledger from '../src/game/skill-point-ledger.service';
import * as hiddenAttributes from '../src/game/hidden-attributes.service';
import * as chestConfig from '../src/game/opening-chest.config';
import * as keepsakeConfig from '../src/game/opening-keepsakes.config';
import * as guildConfig from '../src/game/opening-guild.config';
import * as guildMaps from '../src/game/guild-map.service';
import * as replay from '../src/game/opening-replay';
import * as specialArrivals from '../src/game/opening-special-arrivals';
import { grantGoldenRabbit, grantWindbirdChick, openingFeedRabbit } from '../src/game/companion.service';
import { grantOpeningAutomaton } from '../src/game/automaton.service';
import { encumbrance } from '../src/game/encumbrance';
import { initializeOpening } from '../src/database/opening';
import { initializeOpeningChests } from '../src/database/opening-chests';

// 使用实际 SQL 与部署库结构/静态配置的隔离副本；不复制玩家、故事或世界归属数据。
// 完整数值重算和开化进度用固定替身，其余注册、故事、奖励、开箱、入会和凭物交接运行源码。
test('隔离MySQL：113分支从注册到安全公会，关闭改道、保护与重试', {skip:process.env.FF_OPENING_DB_TEST!=='1'},async t=>{
  const {parse}=createRequire(import.meta.url)('yaml'),config=parse(readFileSync('alemon.config.yaml','utf8'));
  const db=config.FantasyFinal?.database??config.mysql,temporary=`ff_opening_journey_${randomUUID().replaceAll('-','')}`;
  const quoted=(s:string)=>'`'+s.replaceAll('`','``')+'`';
  const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,charset:'utf8mb4',connectTimeout:8000});let created=false;
  const tables=['players','characters','registration_sessions','registration_scene_records','character_hidden_attributes','player_skill_point_ledger',
    'map_regions','map_region_areas','map_npcs','map_monster_pools','monster_templates','item_definitions','skill_definitions','profession_definitions','player_inventory','player_quick_items','player_skills','player_appraisal_progress','player_blessings',
    'player_item_instances','player_equipment','player_item_codex','player_events','opening_world','opening_world_events','player_opening_stories','player_opening_actions','player_opening_service_actions',
    'player_opening_keepsakes','player_opening_services','player_opening_visits','player_opening_relations','player_divine_daily','player_story_progress','player_companions','opening_chest_requests','guild_shop_items',
    'combat_sessions','combat_members','player_pvp_battle_sessions','negotiation_sessions','negotiation_participants','player_travels','guild_restaurant_menu','achievement_profiles','player_automatons','automaton_events'];
  const summaries:any[]=[];
  try{
    await c.query(`CREATE DATABASE ${quoted(temporary)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created=true;
    for(const table of tables)await c.query(`CREATE TABLE ${quoted(temporary)}.${quoted(table)} LIKE ${quoted(db.database)}.${quoted(table)}`);
    await c.query(`USE ${quoted(temporary)}`);
    for(const table of ['map_regions','map_region_areas','map_npcs','map_monster_pools','monster_templates','item_definitions','skill_definitions','profession_definitions','guild_restaurant_menu'])await c.query(`INSERT INTO ${quoted(table)} SELECT * FROM ${quoted(db.database)}.${quoted(table)}`);
    await initializeOpening(c as any);await initializeOpeningChests(c as any);
    const database={getPool:async()=>c,withTransaction:async(fn:any)=>{await c.beginTransaction();try{const value=await fn(c);await c.commit();return value;}catch(error){await c.rollback();throw error;}}};
    let random=()=>.5;
    const deps:Record<string,any>={'alemonjs':{},'node:crypto':{randomUUID},'../database/pool':database,'./talent.config':talentConfig,'./constants':constants,'./types':{attributes},
      './opening-content':content,'./opening-world.config':world,'./opening-state':{...state,chooseOpeningSpawn:(connection:any)=>state.chooseOpeningSpawn(connection,random)},
      './inventory-binding':inventory,'./skill-point-ledger.service':ledger,'./hidden-attributes.service':hiddenAttributes,'./opening-chest.config':chestConfig,
      './opening-keepsakes.config':keepsakeConfig,'./opening-guild.config':guildConfig,'./guild-map.service':guildMaps,'./opening-replay':replay,'./opening-special-arrivals':specialArrivals,'./encumbrance':{encumbrance},
      './achievement-state':{updateAchievementState:async()=>{}},'./achievement-events':{recordAchievement:()=>{},takeAchievementEvents:()=>[]},
      './achievement.service':{achievementStatBonus:async()=>({}),flushAchievements:async()=>{}},
      './achievement-hooks':{achievementLevel:async()=>{}},
      './evolution.service':{repairEvolutionProgress:async()=>({corrected:false})}};
    const load=(file:string,names?:string[])=>{
      const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
      const input=names?ast.statements.filter(s=>ts.isImportDeclaration(s)||ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>names.includes(d.name.getText(ast)))).map(s=>s.getText(ast)).join('\n')+'\n'+names.map(name=>`export {${name}};`).join('\n'):ast.text;
      const code=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
      const module={exports:{} as any};new Function('require','module','exports','recalculateCharacterStats',code)((name:string)=>new Proxy({},{get:(_target,key)=>deps[name]?.[key]}),module,module.exports,deps['./character.service']?.recalculateCharacterStats);return module.exports;
    };
    deps['./adventure.service']=load('src/game/adventure.service.ts',['awardRealmExperience']);
    deps['./character.service']={recalculateCharacterStats:async()=>{},effectiveCharacterAttributes:async()=>Object.fromEntries(attributes.map(a=>[a,100]))};
    const story=deps['./opening.service']=load('src/game/opening.service.ts');
    const guild=deps['./opening-guild.service']=load('src/game/opening-guild.service.ts');
    deps['./guild-context']=load('src/game/guild-context.ts');
    deps['./opening-progress.service']=load('src/game/opening-progress.service.ts');
    deps['./opening-pack.service']=load('src/game/opening-pack.service.ts');
    deps['./companion.service']={grantGoldenRabbit,grantWindbirdChick,openingFeedRabbit};
    deps['./automaton.service']={grantOpeningAutomaton};
    deps['./opening-rewards.service']=load('src/game/opening-rewards.service.ts');
    const chests=deps['./opening-chest.service']=load('src/game/opening-chest.service.ts');
    const keepsakes=load('src/game/opening-keepsakes.service.ts');
    const registration=load('src/game/character.service.ts',['jsonRecord','elements','randomBalancedElements','randomInRange','distribute','getPlayer','getSession','completedRegistration','beginRegistration','continueRegistration','askWhereAmI','chooseDestination','requireChoiceSession','chooseGift','registerAdventurer']);
    let sequence=0;
    const prepare=async(routeCode:string)=>{
      const route=content.openingRouteByCode(routeCode)!;
      await c.execute('UPDATE opening_world SET current_goddess=\'aqua\',aqua_character_id=NULL,aqua_stage=0 WHERE id=1');
      await c.execute('UPDATE map_regions SET newbie_spawn_enabled=0');
      await c.execute('UPDATE map_regions SET newbie_spawn_enabled=1,is_enabled=1,is_owner_only=0 WHERE code=?',[route.region]);
      // 此用例逐条覆盖指定剧情；每个独立样本从空轮次开始，抽取轮次另有并发/回滚测试。
      await c.execute('DELETE FROM opening_route_draw_state');
      let rolls=0;
      random=()=>route.code==='A01'?0:route.code.startsWith('A')?(rolls++===0?.99:route.code==='A02'?.25:.75):(Number(route.code.at(-1))-.5)/3;
      const user=`audit_${++sequence}`;
      await registration.beginRegistration(user,'复核旅人');
      await registration.continueRegistration(user,'story');await registration.askWhereAmI(user);await registration.continueRegistration(user,'question');
      await registration.chooseDestination(user,'异世界');await registration.continueRegistration(user,'danger');
      await registration.chooseGift(user,'A03');
      const character=await story.openingCharacter(c,user);
      const opening=await story.openingStatus(user);assert.equal(opening.route,routeCode);assert.equal(opening.state,'armed');
      const [skills]=await c.execute<RowDataPacket[]>('SELECT s.code,p.level FROM player_skills p JOIN skill_definitions s ON s.id=p.skill_id WHERE p.character_id=?',[character.id]);
      assert.ok(skills.some(s=>s.code==='appraisal'&&s.level===1));assert.ok(skills.some(s=>s.code==='talent_combat_03'));assert.equal(character.skill_points,1);
      assert.equal(await registration.chooseGift(user,'A02'),null);
      return{user,id:Number(character.id),route,origin:character.current_region_id};
    };
    const toBranchEnd=async(run:Awaited<ReturnType<typeof prepare>>,branch:string)=>{
      let view=await story.beginOpening(run.user,sequence%2?'move':'hunt');
      const pages:string[]=[];
      while(view.state==='reading'){
        assert.ok(view.page<view.pages,run.route.code+' 最后一页应直接显示选项');
        pages.push(view.text);view=await story.advanceOpening(run.user,view.revision,'next');
      }
      assert.ok(!pages.includes(view.text),run.route.code+' 选项正文不得重复阅读页');
      assert.equal(view.state,'choice');view=await story.advanceOpening(run.user,view.revision,branch);
      while(view.state==='branch'&&view.page<view.pages)view=await story.advanceOpening(run.user,view.revision,'next');
      return view;
    };
    const endBranch=async(run:Awaited<ReturnType<typeof prepare>>,view:any)=>story.advanceOpening(run.user,view.revision,run.route.code==='F02'&&view.branch==='B'?'treat':'next');
    await t.test('全部14地图42路线113分支：落在真实安全公会，奖励与下一步均可办理',async()=>{
      for(const route of content.openingRoutes)for(const branch of route.choices){
        const run=await prepare(route.code);let view=await toBranchEnd(run,branch.code);
        await assert.rejects(state.assertOpeningFree(c as any,run.id),/初行剧情/);
        view=await endBranch(run,view);assert.equal(view.state,'arrival',route.code+branch.code);
        const after=await story.openingCharacter(c,run.user),hubs=await state.openingSafeHubs(c as any);
        const hub=hubs.find(h=>h.id===after.current_region_id)!;assert.ok(hub,route.code+branch.code);
        assert.deepEqual([after.pos_x,after.pos_y,after.pos_z],[hub.pos_x,hub.pos_y,hub.pos_z]);assert.equal(after.current_hp,after.hp_max);assert.equal(after.current_mp,after.mp_max);assert.equal(after.stamina,120);
        if(route.code==='F01'&&branch.code==='B'){const preview=await chests.previewOpeningChest(run.user,'opening_golden_chest',1);await chests.confirmOpeningChest(run.user,preview.token);}
        while(view.state==='arrival')view=await story.advanceOpening(run.user,view.revision,'next');
        assert.equal(view.state,'lesson');view=await story.advanceOpening(run.user,view.revision,'lesson');assert.equal(view.state,'completed');
        assert.equal(Number((await story.openingCharacter(c,run.user)).adventurer_registered),0,`${route.code}${branch.code}: 初行交接不得自动登记`);
        await state.assertOpeningFree(c as any,run.id);
        const first=await story.openingMainQuest(run.user);assert.equal(first.action.command,'/初行入会');
        await guild.enterOpeningGuild(run.user);await deps['./guild-context'].requireGuildService(c,run.id);
        assert.equal(await registration.registerAdventurer(run.user),true,`${route.code}${branch.code}: 前台应能办理首次注册`);
        let quest=await story.openingMainQuest(run.user);
        if(quest.action.command.startsWith('/初行凭物 ')){
          const code=quest.action.command.split(' ')[1];await keepsakes.keepsakeAction(run.user,code,'register');
          quest=await story.openingMainQuest(run.user);
        }
        assert.ok(['/初行公会','/女神'].includes(quest.action.command),`${route.code}${branch.code}: ${quest.action.command}`);
        const final=await story.openingCharacter(c,run.user);assert.equal(final.level,3,route.code+branch.code);
        const [rewards]=await c.execute<RowDataPacket[]>('SELECT code,uses FROM player_opening_services WHERE character_id=? ORDER BY code',[run.id]);
        const beforeReplay=JSON.stringify(rewards);await story.advanceOpening(run.user,view.revision-1,'lesson');
        const [replayed]=await c.execute<RowDataPacket[]>('SELECT code,uses FROM player_opening_services WHERE character_id=? ORDER BY code',[run.id]);assert.equal(JSON.stringify(replayed),beforeReplay);
        summaries.push({route:route.code,branch:branch.code,birth:route.region,destination:hub.code,level:final.level,next:quest.action.command});
      }
      assert.equal(summaries.length,113);
    });
    await t.test('新宝箱100只整批开箱，承载不足不扣箱不改封存结果，重试不重发装备',async()=>{
      for(const [code] of chestConfig.openingThemeChests){
        const run=await prepare('S01');let view=await toBranchEnd(run,'A');view=await endBranch(run,view);
        while(view.state==='arrival')view=await story.advanceOpening(run.user,view.revision,'next');await story.advanceOpening(run.user,view.revision,'lesson');
        const [stock]=await c.execute<RowDataPacket[]>('SELECT p.quantity FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code=?',[run.id,code]);
        await story.grantOpeningItem(c,run.id,code,100-Number(stock[0]?.quantity??0));
        const preview=await chests.previewOpeningChest(run.user,code,100);const [sealed]=await c.execute<RowDataPacket[]>('SELECT result_json FROM opening_chest_requests WHERE token=?',[preview.token]);
        const original=deps['./character.service'].effectiveCharacterAttributes;deps['./character.service'].effectiveCharacterAttributes=async()=>Object.fromEntries(attributes.map(a=>[a,0]));
        try{await assert.rejects(chests.confirmOpeningChest(run.user,preview.token),/承载不足/);}finally{deps['./character.service'].effectiveCharacterAttributes=original;}
        assert.equal((await chests.previewOpeningChest(run.user,code,100)).token,preview.token);
        const [after]=await c.execute<RowDataPacket[]>('SELECT result_json FROM opening_chest_requests WHERE token=?',[preview.token]);assert.deepEqual(after,sealed);
        const result=await chests.confirmOpeningChest(run.user,preview.token);assert.equal(result.items.length,100);assert.deepEqual(await chests.confirmOpeningChest(run.user,preview.token),JSON.parse(JSON.stringify(result)));
        const [gear]=await c.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM player_item_instances WHERE character_id=?',[run.id]);assert.equal(Number(gear[0].n),102);
      }
    });
    await t.test('女神被另一位玩家先带走时重新选择厄里斯返还，不抢归属或重发恩赐',async()=>{
      const run=await prepare('A01'),view=await toBranchEnd(run,'B');
      const [others]=await c.execute<RowDataPacket[]>('SELECT id FROM characters WHERE id<>? ORDER BY id LIMIT 1',[run.id]);
      await c.execute("UPDATE opening_world SET current_goddess='eris',aqua_character_id=? WHERE id=1",[others[0].id]);
      let current=await endBranch(run,view);assert.equal(current.state,'choice');assert.match(current.text,/厄里斯/);
      const [before]=await c.execute<RowDataPacket[]>('SELECT reward_claimed FROM player_opening_stories WHERE character_id=?',[run.id]);assert.equal(before[0].reward_claimed,0);
      current=await story.advanceOpening(run.user,current.revision,'A');assert.match(current.text,/厄里斯/);
      current=await endBranch(run,current);assert.equal(current.state,'arrival');
      const [owner]=await c.query<RowDataPacket[]>('SELECT aqua_character_id,current_goddess FROM opening_world WHERE id=1');assert.equal(owner[0].aqua_character_id,others[0].id);assert.equal(owner[0].current_goddess,'eris');
      const [gifts]=await c.execute<RowDataPacket[]>('SELECT code FROM player_blessings WHERE character_id=?',[run.id]);assert.deepEqual(gifts.map(g=>g.code),['talent_combat_03']);
    });
    await t.test('尚未行动时，旧继续按钮不能绕过首次移动或寻怪',async()=>{
      const run=await prepare('F01'),first=await story.advanceOpening(run.user,0,'next');assert.equal(first.state,'armed');
      assert.match(first.text,/首次移动或寻怪/);
      const second=await story.advanceOpening(run.user,0,'next');assert.deepEqual(JSON.parse(JSON.stringify(second)),JSON.parse(JSON.stringify(first)));
      const started=await story.beginOpening(run.user,'move');assert.equal(started?.state,'reading');
    });
    await t.test('旧存档最后阅读页直接显示选项，旧继续按钮与选择重试均可恢复消息',async()=>{
      const run=await prepare('F03');
      await c.execute("UPDATE player_opening_stories SET state='reading',page_index=? WHERE character_id=?",[run.route.pages.length,run.id]);
      const current=await story.openingStatus(run.user);assert.equal(current.state,'choice');assert.ok(current.choices.length>=2);
      const continued=await story.advanceOpening(run.user,current.revision,'next');assert.deepEqual(continued,current);
      const chosen=await story.advanceOpening(run.user,current.revision,'A');assert.equal(chosen.state,'branch');assert.equal(chosen.branch,'A');
      assert.deepEqual(await story.advanceOpening(run.user,current.revision,'A'),JSON.parse(JSON.stringify(chosen)));
    });
    await t.test('目标关闭或公会坐标非法时改道，全部关闭时不扣草药、不发奖并保留保护',async()=>{
      const run=await prepare('F02'),view=await toBranchEnd(run,'B');
      await c.execute("UPDATE map_regions SET is_enabled=0 WHERE code IN ('baina_town','world_tree','floating_leaf_town','snowlamp_hollow','frost_dragon_inn','sleepwhale_market')");
      const [before]=await c.execute<RowDataPacket[]>('SELECT item_id,quantity FROM player_inventory WHERE character_id=? ORDER BY item_id',[run.id]);
      await assert.rejects(endBranch(run,view),/所有安全接引点/);
      const [after]=await c.execute<RowDataPacket[]>('SELECT item_id,quantity FROM player_inventory WHERE character_id=? ORDER BY item_id',[run.id]);assert.deepEqual(after,before);
      assert.equal((await story.openingStatus(run.user)).revision,view.revision);await assert.rejects(state.assertOpeningFree(c as any,run.id));
      await c.execute("UPDATE map_regions SET is_enabled=1 WHERE code IN ('world_tree','baina_town')");
      await c.execute("UPDATE map_npcs SET pos_x=999999 WHERE code='guild_counter'");
      const arrival=await endBranch(run,view);assert.equal(arrival.destination,'世界树');assert.match(arrival.text,/接引|改道/);
      assert.equal((await story.openingCharacter(c,run.user)).region_code,'world_tree');
    });
    await t.test('缺公会或地图物品时不作为安全终点；全无有效终点时拒绝生成新角色',async()=>{
      await c.execute("UPDATE map_regions SET is_enabled=0 WHERE code IN ('baina_town','floating_leaf_town','snowlamp_hollow','frost_dragon_inn','sleepwhale_market')");
      await c.execute("DELETE FROM map_npcs WHERE code='world_tree_adventurer_guild'");
      assert.equal((await state.openingSafeHubs(c as any)).length,0);
      await c.query(`INSERT INTO map_npcs SELECT * FROM ${quoted(db.database)}.map_npcs WHERE code='world_tree_adventurer_guild'`);
      assert.equal((await state.openingSafeHubs(c as any)).length,1);
      await c.execute("DELETE FROM item_definitions WHERE code='map_world_tree'");
      const hubs=await state.openingSafeHubs(c as any);assert.equal(hubs.length,0);
      await assert.rejects(state.chooseOpeningSpawn(c as any),/安全接引点/);
      const user='audit_no_safe_destination';await registration.beginRegistration(user);
      await registration.continueRegistration(user,'story');await registration.askWhereAmI(user);await registration.continueRegistration(user,'question');
      await registration.chooseDestination(user,'异世界');await registration.continueRegistration(user,'danger');
      await assert.rejects(registration.chooseGift(user,'A03'),/安全接引点/);
      const [characters]=await c.execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=?',[user]);assert.equal(characters.length,0);
      const [sessions]=await c.execute<RowDataPacket[]>('SELECT s.stage FROM registration_sessions s JOIN players p ON p.id=s.player_id WHERE p.qq_user_id=?',[user]);assert.equal(sessions[0].stage,'choice');

    });
    mkdirSync('.data/opening-audit-20260908',{recursive:true});writeFileSync('.data/opening-audit-20260908/journeys.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:'actual registration/story/reward SQL; derived-stat and evolution-profile substitutes',journeys:summaries},null,2));
  }finally{
    if(created){assert.match(temporary,/^ff_opening_journey_[a-f0-9]{32}$/);await c.query(`DROP DATABASE ${quoted(temporary)}`);}
    await c.end();
  }
});
