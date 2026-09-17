import assert from 'node:assert/strict';
import { assertMappedTravelRoute } from '../../src/game/mapped-travel-route';
import { experienceRequiredForLevel } from '../../src/game/constants';
import { monsterCombatStats } from '../../src/game/adventure.service';
import * as floatingContent from '../../src/game/floating-leaf-content';
import * as witnessContent from '../../src/game/worldtree-witness-content';
import * as advancedConfig from '../../src/game/advanced-profession.config';
import * as hiddenConfig from '../../src/game/hidden-profession.config';
import * as spiritConfig from '../../src/game/spirit-summoner.config';
import * as sparring from '../../src/game/npc-sparring.config';
import * as advancedResource from '../../src/game/advanced-resource.config';

// Real SQL/state transitions and the movement service's map validator. Victories,
// gathering and loot are controlled simulation inputs, not a combat balance test.
export const auditOpeningProgression = async ({c,deps,load,run,story,guild}:any) => {
  deps['./floating-leaf-content']=floatingContent;
  deps['./worldtree-witness-content']=witnessContent;
  deps['./advanced-profession.config']=advancedConfig;
  deps['./hidden-profession.config']=hiddenConfig;
  deps['./spirit-summoner.config']=spiritConfig;
  deps['./npc-sparring.config']=sparring;
  deps['./advanced-resource.config']=advancedResource;
  deps['./world-dynamics.service']={snapshotCombatEnvironment:async()=>{}};
  deps['./adventure.service'].monsterCombatStats=monsterCombatStats;
  const evolution=deps['./evolution.service']=load('src/game/evolution.service.ts');
  const leaf=deps['./floating-leaf.service']=load('src/game/floating-leaf.service.ts');
  const witness=deps['./worldtree-witness.service']=load('src/game/worldtree-witness.service.ts');
  const gratitude=deps['./girl-gratitude.service']=load('src/game/girl-gratitude.service.ts');
  deps['./career-quest.service']=load('src/game/career-quest.service.ts');
  const main=load('src/game/main-quest.service.ts');
  const advanced=load('src/game/advanced-profession.service.ts');
  const careers=load('src/game/character.service.ts',['getPlayer','chooseProfession']);
  const maps=deps['./progression-map.service'];
  const char=()=>story.openingCharacter(c,run.user);
  const trace:string[]=[];
  const move=async(x:number,y:number,z=0)=>{
    const from=await char();
    const [regions]=await c.execute(`SELECT r.id,r.code FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id
      WHERE ? BETWEEN a.min_x AND a.max_x AND ? BETWEEN a.min_y AND a.max_y AND ? BETWEEN a.min_z AND a.max_z ORDER BY r.danger_level DESC LIMIT 1`,[x,y,z]);
    assert.ok(regions[0],`coordinate exists: ${x},${y},${z}`);
    await assertMappedTravelRoute(c,run.id,undefined,{x:Number(from.pos_x),y:Number(from.pos_y),z:Number(from.pos_z)},{x,y,z},Number(regions[0].id));
    await c.execute('UPDATE characters SET current_region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE id=?',[regions[0].id,x,y,z,run.id]);
    trace.push(`${regions[0].code}(${x},${y},${z})`);
    return regions[0];
  };
  const npc=async(code:string)=>{
    const [rows]=await c.execute('SELECT pos_x,pos_y,pos_z FROM map_npcs WHERE code=? LIMIT 1',[code]);assert.ok(rows[0],code);
    return move(Number(rows[0].pos_x),Number(rows[0].pos_y),Number(rows[0].pos_z));
  };
  const xp=async(target:number,regionCode:string)=>{
    const [monsters]=await c.execute(`SELECT t.level,t.experience,t.code FROM map_monster_pools p JOIN map_regions r ON r.id=p.region_id
      JOIN monster_templates t ON t.id=p.monster_template_id WHERE r.code=? AND r.is_enabled=1 AND r.is_owner_only=0 AND p.spawn_weight>0 AND t.monster_class<>'boss'
      AND t.level<=? AND t.experience>0 ORDER BY t.level DESC LIMIT 1`,[regionCode,target]);
    assert.ok(monsters[0],`Lv.${target}: ${regionCode} needs a regular XP source`);
    let total=0;const before=await char();
    for(let level=Number(before.level);level<=target;level++)total+=experienceRequiredForLevel(level);
    const fights=Math.ceil(total/Number(monsters[0].experience));
    await deps['./adventure.service'].awardRealmExperience(c,before,fights*Number(monsters[0].experience),{fixed:true});
    const after=await char();assert.equal(Number(after.level),target);assert.equal(Number(after.experience),experienceRequiredForLevel(target));
    trace.push(`XP Lv.${target}: ${monsters[0].code} × ${fights} simulated victories`);
  };

  await careers.chooseProfession(run.user,'warrior');
  // Consume the free pick on a non-starter map, then emulate an old save missing all essential maps.
  await guild.openingGuildAction(run.user,'map_exchange','map_ridge_foothills');
  const [credits]=await c.execute("SELECT uses FROM player_opening_services WHERE character_id=? AND code='registration_map_exchange'",[run.id]);
  assert.equal(Number(credits[0].uses),0);
  await c.execute("DELETE p FROM player_inventory p JOIN item_definitions i ON i.id=p.item_id WHERE p.character_id=? AND i.code IN ('map_world_tree','map_worldtree_meadow','map_dark_forest','map_baina_town')",[run.id]);
  await main.currentMainQuest(run.user);
  const first=await maps.repairProgressionMaps(run.user);assert.deepEqual(first.granted,[],'old-save recovery is idempotent');
  const origin=String((await char()).region_code);
  const isLeaf=run.route.code==='M01'&&origin==='floating_leaf_town';
  if(isLeaf){await leaf.startFloatingTour(run.user);for(let i=0;i<5;i++)await leaf.continueFloatingTour(run.user);}
  if(origin==='world_tree'){await witness.startWorldtreeTour(run.user);for(let i=1;i<witnessContent.aevierTour.length;i++)await witness.continueWorldtreeTour(run.user);}
  if(['floating_leaf_town','frost_dragon_inn'].includes(origin)){
    await npc(origin==='floating_leaf_town'?'windbranch_guild':'dragon_inn_counter');
    await guild.enterOpeningGuild(run.user);await guild.openingTransport(run.user,'world_tree');trace.push('guild transport → world_tree');
  }
  await move(0,-20);await xp(10,'worldtree_meadow');
  if(isLeaf){
    await npc('world_tree_adventurer_guild');await guild.enterOpeningGuild(run.user);await guild.openingTransport(run.user,'floating_leaf_town');
    await leaf.floatingBarrierAdvice(run.user,'guild');await move(13,2,30);await leaf.floatingBarrierAdvice(run.user,'observatory');
  }else{
    await move(-12,-196);await main.advanceRealmBarrier(run.user,'alchemist');
    await move(0,-120);
    const [wolves]=await c.execute("SELECT p.spawn_weight FROM map_monster_pools p JOIN monster_templates t ON t.id=p.monster_template_id JOIN map_regions r ON r.id=p.region_id WHERE r.code='dark_forest' AND t.code='shadow_wolf_king'");
    assert.ok(wolves.length,'sky dust boss remains obtainable');
    await story.grantOpeningItem(c,run.id,'sky_dust');trace.push('simulated wolf boss victory + sky_dust drop');
    await move(-12,-196);await main.advanceRealmBarrier(run.user,'alchemist');
  }
  await main.contemplateSkyDust(run.user);
  await deps['./adventure.service'].awardRealmExperience(c,await char(),1,{fixed:true});assert.equal(Number((await char()).level),11);
  if(origin==='world_tree'){
    await npc('world_tree_adventurer_guild');await witness.startAevierChallenge(run.user);
    for(let i=1;i<witnessContent.aevierChallenge.length;i++)await witness.continueAevierChallenge(run.user);
    await move(6,-4);await witness.enterEternalArena(run.user);const duel=await witness.startAesonDuel(run.user);
    await witness.finishAesonDuel(c,duel.sessionId,'victory');trace.push('simulated Aeson duel victory → actual return and quest completion');
  }
  if(isLeaf){await move(15,0,30);await leaf.floatingRescueStart(run.user);}
  else{await npc('guild_counter');await main.startGoblinKingQuest(run.user);await npc('oddworkshop');await main.consultVivianForJudicator(run.user);
    // A simulated ordinary reward supplies purchase money; this is not an economy speed assertion.
    await c.execute('UPDATE characters SET copper_coins=copper_coins+200 WHERE id=?',[run.id]);await main.buyCelestialJudicator(run.user);}
  const [quests]=await c.execute('SELECT * FROM player_goblin_king_quest WHERE character_id=?',[run.id]);const q=quests[0];
  const region=await move(Number(q.pos_x),Number(q.pos_y),Number(q.pos_z));
  await main.goblinKingArrival(c,run.id,Number(region.id),region.code,Number(q.pos_x),Number(q.pos_y),0);
  await main.goblinKingArrival(c,run.id,Number(region.id),region.code,Number(q.pos_x),Number(q.pos_y),0);
  await main.continueGoblinKingArrival(run.user);await main.continueGoblinKingArrival(run.user);
  const [targets]=await c.execute('SELECT traits_json FROM monster_spawns WHERE id=(SELECT boss_spawn_id FROM player_goblin_king_quest WHERE character_id=?)',[run.id]);
  assert.equal(await main.completeGoblinKingQuest(c,targets),true);trace.push('simulated goblin boss victory → actual quest completion');
  if(isLeaf){
    await leaf.floatingRescueReturn(run.user);await leaf.floatingRescueReport(run.user);await leaf.floatingThanksStart(run.user);
    for(let i=0;i<3;i++)await leaf.continueFloatingThanks(run.user);
  }else{
    await npc('pear_guide');await gratitude.startGirlGratitude(run.user);await npc('world_gate');await gratitude.teleportToWorldTree(run.user);
    await gratitude.continueGirlGratitude(run.user);await gratitude.continueGirlGratitude(run.user);await npc('canopy_exchange');await gratitude.receiveGirlGratitudeGift(run.user);await gratitude.continueGirlGratitude(run.user);
  }
  await move(0,-120);await xp(20,'dark_forest');
  await npc('guild_counter');await main.advanceEvolutionQuest(run.user,'guild');await npc('world_library');
  for(const step of ['hall','reading','archive','rest'])await main.advanceEvolutionQuest(run.user,step);
  const ga=await main.openGaStudy(run.user);const [gaTargets]=await c.execute('SELECT traits_json FROM monster_spawns WHERE id=?',[ga.spawnId]);
  assert.equal(await main.completeEvolutionQuest(c,gaTargets),true);await main.contemplateEvolutionSeed(run.user);
  await maps.repairProgressionMaps(run.user);
  // Validate all ten real injection gates; materials/observations are controlled inputs.
  for(let cap=20;cap<30;cap++){
    if(cap>20){await move(0,-240);await xp(cap,'dark_forest_deep');}
    await move(-6,7);
    if(cap>20){const costs=evolution.evolutionInjectionMaterials(cap,cap===29?'shaping':'conservative');
      for(const [code,quantity] of Object.entries({evolution_active_sample:costs.active,evolution_stable_medium:costs.medium,evolution_catalyst:costs.catalyst}))await story.grantOpeningItem(c,run.id,code,Number(quantity));}
    if(cap===29){const draft=await evolution.shapingDraft(run.user);for(const mutation of draft.traits.slice(0,draft.required))await evolution.toggleShapingTrait(run.user,Number(mutation.id));}
    await evolution.injectEvolution(run.user,cap===29?'shaping':'conservative');assert.equal(Number((await char()).level),cap+1);
    if(cap===24){const profession=advancedConfig.worldTreeAdvancedProfessions[0]!;await move(profession.mentor.x,profession.mentor.y);
      await advanced.beginAdvancedProfession(run.user,profession.code);await move(-221,0);trace.push('Lv.25 advanced trial reachable');}
  }
  const [afterCredits]=await c.execute("SELECT uses FROM player_opening_services WHERE character_id=? AND code='registration_map_exchange'",[run.id]);assert.equal(Number(afterCredits[0].uses),0);
  assert.deepEqual((await maps.repairProgressionMaps(run.user)).granted,[]);
  assert.equal((await main.currentMainQuest(run.user)).title,'【主线·开化完成】');
  return {level:Number((await char()).level),trace,scope:'SQL progression and map continuity; simulated fight outcomes/material drops, no combat difficulty claim'};
};
