import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { activeSkillCodesForAdvancedProfession, advancedInheritanceSkillCode, worldTreeAdvancedProfessions } from './advanced-profession.config';
import { hiddenProfessions, hiddenPassiveCode, hiddenSkills } from './hidden-profession.config';
import { spiritSummonerActiveSkillCodes } from './spirit-summoner.config';
import { revokeAdvancedProfessionSkills } from './advanced-profession.service';
import { resetSkillPointAllocation } from './skill-point-ledger.service';
import { recalculateCharacterStats } from './character.service';
import { assertCombatLoadoutMutable } from './combat-loadout-lock.service';
import { requireAdministrator } from './permission.service';
import { recordAdminOperation } from './admin-log.service';
import { simulateEvolutionToLevel30 } from './evolution.service';
import { epicForgeRecipes } from '../config/epic-forging';
import { epicTestForgeDraft } from './blacksmith.service';
import { answerTestHeartQuestions } from './heart-question.service';

export const professionTestOptions = [
  ...worldTreeAdvancedProfessions.map(p=>({code:p.code,name:p.name,group:p.baseProfession,role:p.role})),
  ...hiddenProfessions.map(p=>({code:p.code,name:p.name,group:'店铺二转',role:p.role}))
];
const object = (value: unknown): Record<string,unknown> => {
  if (value && typeof value==='object' && !Array.isArray(value)) return value as Record<string,unknown>;
  try {const parsed=JSON.parse(String(value??'{}'));return parsed && typeof parsed==='object' && !Array.isArray(parsed)?parsed:{};} catch {return {};}
};

const baseCodes: Record<string,string> = { '战士':'warrior','法师':'mage','盗贼':'rogue','牧师':'priest' };
const slotNames: Record<string,string> = { '头肩':'shoulder','上装':'upper','腰部':'waist','下装':'lower','脚部':'feet' };
const equipmentProfiles: Record<string,{set:string;weapons:string[]}> = {
  warrior:{set:'mountainheart_regalia',weapons:['epic_zhenling_longsword','epic_mountaingate_shield']},
  mage:{set:'mistmother_cocoon',weapons:['epic_mistcrown_staff','epic_threehead_grimoire']},
  rogue:{set:'goblin_court_hunt',weapons:['epic_court_hunter_dagger','epic_vanguard_fistblade']},
  priest:{set:'mistmother_cocoon',weapons:['epic_threehead_grimoire','epic_marshmoon_orb']}
};
const ensureFirstProfession = async (connection: PoolConnection, characterId: number, preferred: string) => {
  const [characters]=await connection.execute<RowDataPacket[]>('SELECT profession_code FROM characters WHERE id=? FOR UPDATE',[characterId]);
  if(characters[0]?.profession_code){await connection.execute('UPDATE characters SET adventurer_registered=1 WHERE id=?',[characterId]);return String(characters[0].profession_code);}
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT growth_json,skill_codes_json FROM profession_definitions WHERE code=?',[preferred]);
  const row=rows[0];if(!row)throw new Error('一转职业资料尚未初始化。');
  const growth=object(row.growth_json),skills=Array.isArray(row.skill_codes_json)?row.skill_codes_json:JSON.parse(String(row.skill_codes_json??'[]')) as string[];
  await connection.execute('UPDATE characters SET profession_code=?,adventurer_registered=1,constitution_growth=constitution_growth+?,spirit_growth=spirit_growth+?,strength_growth=strength_growth+?,intelligence_growth=intelligence_growth+?,agility_growth=agility_growth+?,perception_growth=perception_growth+? WHERE id=?',[preferred,...['constitution','spirit','strength','intelligence','agility','perception'].map(key=>Number(growth[key]??0)),characterId]);
  for(const skill of skills)await connection.execute('INSERT IGNORE INTO player_skills (character_id,skill_id) SELECT ?,id FROM skill_definitions WHERE code=?',[characterId,skill]);
  return preferred;
};
const equipEpicTestSet = async (connection: PoolConnection, characterId: number, base: string) => {
  const profile=equipmentProfiles[base]??equipmentProfiles.warrior!;
  const recipes=[...epicForgeRecipes.filter(recipe=>recipe.setCode===profile.set),...profile.weapons.map(code=>epicForgeRecipes.find(recipe=>recipe.code===code))].filter((recipe):recipe is (typeof epicForgeRecipes)[number]=>Boolean(recipe));
  if(recipes.length!==7)throw new Error('职业史诗套装配方尚未备齐。');
  const equipped:string[]=[];
  for(const [index,recipe] of recipes.entries()){
    const slot=index<5?slotNames[recipe.category]:index===5?'weapon':'offhand';
    if(!slot)throw new Error('装备栏位配置错误。');
    const draft=epicTestForgeDraft(recipe),code=`admin_profession_${characterId}_${Date.now()}_${index}_${Math.floor(Math.random()*1e6)}`;
    const [definition]=await connection.execute<any>('INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,is_tradeable,effect_json) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?)',[code,`测试·${recipe.name}`,recipe.description,'管理测试','equipment',recipe.category,recipe.subtype,'史诗',30,2,JSON.stringify(draft.effect)]);
    const [instance]=await connection.execute<any>("INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,bound_kind,bound_at,effect_json,forge_primary_json) VALUES (?,?,?,100,100,'personal',NOW(),?,?)",[characterId,definition.insertId,draft.quality,JSON.stringify(draft.effect),JSON.stringify(draft.primaryKeys)]);
    await connection.execute('INSERT INTO player_equipment (character_id,slot,item_id,instance_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE item_id=VALUES(item_id),instance_id=VALUES(instance_id)',[characterId,slot,definition.insertId,instance.insertId]);
    equipped.push(recipe.name);
  }
  return equipped;
};
const hasEpicTestSet = async (connection: PoolConnection, characterId: number) => {
  const [rows]=await connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS count FROM player_equipment e JOIN item_definitions i ON i.id=e.item_id WHERE e.character_id=? AND e.slot IN ('weapon','offhand','shoulder','upper','waist','lower','feet') AND i.obtain_source='管理测试' AND i.rarity='史诗' AND i.required_level=30",[characterId]);
  return Number(rows[0]?.count??0)===7;
};

/** 仅供已鉴权的管理测试入口调用。任务、技能、面板与审计由调用者放在同一事务。 */
const applyTestProfession = async (connection: PoolConnection, characterId: number, user: string, code: string) => {
  const option=professionTestOptions.find(p=>p.code===code||p.name===code);if(!option)throw new Error('请选择有效的二转职业。');
  const normal=worldTreeAdvancedProfessions.find(p=>p.code===option.code),hidden=hiddenProfessions.find(p=>p.code===option.code);
  const [characters]=await connection.execute<RowDataPacket[]>('SELECT id,name,level,skill_points,profession_code FROM characters WHERE id=? AND npc_code IS NULL AND npc_id IS NULL FOR UPDATE',[characterId]);
  const character=characters[0];if(!character)throw new Error('未找到玩家角色。');
  await assertCombatLoadoutMutable(connection,characterId);
  const base=await ensureFirstProfession(connection,characterId,baseCodes[normal?.baseProfession??'']??(option.code==='magical_scholar'?'mage':option.code==='tactician'?'priest':'warrior'));
  const growth=await simulateEvolutionToLevel30(connection,user);
  const [current]=await connection.execute<RowDataPacket[]>('SELECT profession_code FROM player_advanced_professions WHERE character_id=? FOR UPDATE',[characterId]);
  const passive=normal?.passive.code??hiddenPassiveCode(hidden!.code);
  const required=[...new Set([passive,advancedInheritanceSkillCode(option.code),...(normal?activeSkillCodesForAdvancedProfession(normal.code):hiddenSkills.filter(s=>s.profession===hidden!.code).map(s=>s.code)),...(option.code==='spirit_summoner'?spiritSummonerActiveSkillCodes:[])])];
  const [skills]=await connection.execute<RowDataPacket[]>(`SELECT id,code FROM skill_definitions WHERE code IN (${required.map(()=>'?').join(',')})`,required);
  if(skills.length!==required.length)throw new Error('该职业的技能资料尚未完整载入，请先完成游戏数据初始化。');
  // 世界树只能有一条进行中试炼；结束旧试炼入口，保留历史已完成记录和其他店铺支线。
  await connection.execute('DELETE FROM player_advanced_profession_quests WHERE character_id=? AND stage IN (1,2,3) AND profession_code<>?',[characterId,option.code]);
  if(normal) {
    await connection.execute(`INSERT INTO player_advanced_profession_quests (character_id,profession_code,stage,story_kills,proof_kills,completed_at) VALUES (?,?,4,?,?,NOW())
      ON DUPLICATE KEY UPDATE stage=4,story_kills=VALUES(story_kills),proof_kills=VALUES(proof_kills),completed_at=COALESCE(completed_at,VALUES(completed_at))`,[characterId,normal.code,normal.first.requiredKills,normal.second.requiredKills]);
  } else {
    const [quests]=await connection.execute<RowDataPacket[]>('SELECT completed_json FROM player_hidden_profession_quests WHERE character_id=? AND profession_code=? FOR UPDATE',[characterId,option.code]);
    const completed=object(quests[0]?.completed_json);
    for(let stage=1;stage<=10;stage++)completed[String(stage)]??={adminTest:true};
    await connection.execute(`INSERT INTO player_hidden_profession_quests (character_id,profession_code,stage,accepted_at,materials_paid,evidence_json,completed_json,qualified_at,revision)
      VALUES (?,?,11,NULL,0,JSON_OBJECT(),?,NOW(),1) ON DUPLICATE KEY UPDATE stage=11,accepted_at=NULL,materials_paid=0,evidence_json=JSON_OBJECT(),completed_json=VALUES(completed_json),qualified_at=COALESCE(qualified_at,VALUES(qualified_at)),revision=revision+1`,[characterId,option.code,JSON.stringify(completed)]);
  }
  const changed=current[0]?.profession_code!==option.code;
  let restoredPoints=0;
  if(changed) {
    const reset=await resetSkillPointAllocation(connection,characterId);restoredPoints=reset.restoredPoints;
    await revokeAdvancedProfessionSkills(connection,characterId);
    await connection.execute(`INSERT INTO player_advanced_professions (character_id,profession_code,mentor_code,completed_at) VALUES (?,?,?,NOW())
      ON DUPLICATE KEY UPDATE profession_code=VALUES(profession_code),mentor_code=VALUES(mentor_code),completed_at=VALUES(completed_at)`,[characterId,option.code,normal?.mentor.code??hidden!.npc]);
  }
  // 同职业重复点击只补齐缺失技能和任务，不反复洗点或发放任务物资。
  for(const skill of skills)await connection.execute('INSERT IGNORE INTO player_skills (character_id,skill_id,level,passive_linked) VALUES (?,?,1,0)',[characterId,skill.id]);
  await connection.execute('DELETE FROM player_hidden_action_drafts WHERE character_id=?',[characterId]);
  const answeredHeartQuestions=await answerTestHeartQuestions(connection,characterId);
  const equipment=changed||!await hasEpicTestSet(connection,characterId)?await equipEpicTestSet(connection,characterId,normal?baseCodes[normal.baseProfession]??base:base):[];
  if(option.code==='weapon_master') {
    const [main]=await connection.execute<RowDataPacket[]>("SELECT e.instance_id FROM player_equipment e JOIN player_item_instances ii ON ii.id=e.instance_id AND ii.character_id=e.character_id JOIN item_definitions i ON i.id=ii.item_id WHERE e.character_id=? AND e.slot='weapon' AND i.item_category='武器' AND i.required_level<=30 AND ii.market_listing_id IS NULL LIMIT 1",[characterId]);
    if(main[0])await connection.execute('INSERT INTO player_hidden_profession_loadouts (character_id,profession_code,config_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE config_json=VALUES(config_json)',[characterId,option.code,JSON.stringify({weapons:[Number(main[0].instance_id)]})]);
  }
  await recalculateCharacterStats(connection,characterId);
  return {characterId,name:String(character.name),profession:option.name,code:option.code,previousCode:String(current[0]?.profession_code??''),changed,restoredPoints,skillCount:skills.length,growth,equipment,answeredHeartQuestions};
};

export const adminTestProfession = (user: string, code: string) => withTransaction(async connection=>{
  await requireAdministrator(user,connection);
  const [rows]=await connection.execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? AND c.npc_id IS NULL AND c.npc_code IS NULL LIMIT 1 FOR UPDATE',[user]);
  if(!rows[0])throw new Error('请先创建角色。');
  const result=await applyTestProfession(connection,Number(rows[0].id),user,code);
  await recordAdminOperation(user,'测试二转',`测试转为${result.profession}｜Lv.30开化｜生长结注射${result.growth.injections}次｜问心${result.answeredHeartQuestions}道｜史诗配装${result.equipment.length}件｜对应任务已完成｜${result.changed?'已切换职业':'补齐当前职业'}｜返还技能点${result.restoredPoints}`,user,connection);
  return result;
});
