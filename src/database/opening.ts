import { forgedPrimaryStats } from '../game/constants';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { openingRouteVersions, talentDefinitions } from '../game/opening-content';
import { openingHubs, openingSpawnRegions } from '../game/opening-world.config';
import { talentSchema } from '../game/talent-data';
import { openingRouteDrawSchema } from '../game/opening-route-draw';

export const openingSchema = [
  ...talentSchema,
  openingRouteDrawSchema,
  `CREATE TABLE IF NOT EXISTS registration_scene_records (session_id CHAR(36) NOT NULL,stage VARCHAR(20) NOT NULL,goddess VARCHAR(16) NOT NULL,text TEXT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(session_id,stage),CONSTRAINT fk_registration_scene_session FOREIGN KEY(session_id) REFERENCES registration_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_opening_stories (character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,route_code VARCHAR(8) NOT NULL,story_version INT NOT NULL,state VARCHAR(20) NOT NULL DEFAULT 'armed',branch_code CHAR(1) NULL,page_index INT UNSIGNED NOT NULL DEFAULT 0,revision INT UNSIGNED NOT NULL DEFAULT 0,entry_kind VARCHAR(12) NOT NULL DEFAULT 'continue',started_epoch INT NOT NULL DEFAULT 1,flags_json JSON NOT NULL,reward_claimed TINYINT NOT NULL DEFAULT 0,destination_code VARCHAR(64) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,CONSTRAINT fk_opening_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS opening_world (id TINYINT NOT NULL PRIMARY KEY,reception_epoch INT NOT NULL DEFAULT 1,current_goddess VARCHAR(16) NOT NULL DEFAULT 'aqua',aqua_character_id BIGINT UNSIGNED NULL,aqua_location VARCHAR(64) NOT NULL DEFAULT 'world_tree',aqua_stage INT NOT NULL DEFAULT 0,leaf_route_open TINYINT NOT NULL DEFAULT 0,leaf_discoverer_id BIGINT UNSIGNED NULL,revision INT NOT NULL DEFAULT 0) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS opening_world_events (code VARCHAR(64) NOT NULL PRIMARY KEY,character_id BIGINT UNSIGNED NULL,text TEXT NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_opening_actions (character_id BIGINT UNSIGNED NOT NULL,revision INT UNSIGNED NOT NULL,action_key VARCHAR(32) NOT NULL,result_json JSON NOT NULL,PRIMARY KEY(character_id,revision),CONSTRAINT fk_opening_action_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_opening_service_actions (character_id BIGINT UNSIGNED NOT NULL,scope VARCHAR(64) NOT NULL,revision INT UNSIGNED NOT NULL,action_key VARCHAR(64) NOT NULL,result_json JSON NOT NULL,PRIMARY KEY(character_id,scope,revision),CONSTRAINT fk_opening_service_action_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_opening_keepsakes (character_id BIGINT UNSIGNED NOT NULL,code VARCHAR(64) NOT NULL,used TINYINT NOT NULL DEFAULT 0,archived TINYINT NOT NULL DEFAULT 0,record_json JSON NOT NULL,PRIMARY KEY(character_id,code),CONSTRAINT fk_opening_keepsake_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_opening_services (character_id BIGINT UNSIGNED NOT NULL,code VARCHAR(64) NOT NULL,uses INT UNSIGNED NOT NULL DEFAULT 0,PRIMARY KEY(character_id,code),CONSTRAINT fk_opening_service_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_divine_daily (character_id BIGINT UNSIGNED NOT NULL,code VARCHAR(64) NOT NULL,day_key DATE NOT NULL,used INT UNSIGNED NOT NULL DEFAULT 0,PRIMARY KEY(character_id,code,day_key),CONSTRAINT fk_divine_daily_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_opening_relations (character_id BIGINT UNSIGNED NOT NULL,npc_code VARCHAR(64) NOT NULL,affection INT NOT NULL DEFAULT 0,hatred INT NOT NULL DEFAULT 0,flags_json JSON NOT NULL,PRIMARY KEY(character_id,npc_code),CONSTRAINT fk_opening_relation_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_opening_visits (character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,building_code VARCHAR(64) NOT NULL,area VARCHAR(32) NOT NULL DEFAULT '大厅',CONSTRAINT fk_opening_visit_character FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE) ENGINE=InnoDB`
];

/** Additive seeds; never arm old characters, reset world events or reopen an administrator-closed region. */
export const initializeOpening = async (pool: Pool) => {
  for (const sql of openingSchema) await pool.query(sql);
  await pool.execute('INSERT IGNORE INTO opening_world (id) VALUES (1)');
  const [columns] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM map_regions LIKE 'newbie_spawn_enabled'");
  if (!columns.length) {
    await pool.query('ALTER TABLE map_regions ADD COLUMN newbie_spawn_enabled TINYINT NOT NULL DEFAULT 0');
  }
  const spawnCodes = Object.keys(openingSpawnRegions);
  await pool.execute('UPDATE map_regions SET newbie_spawn_enabled=0 WHERE newbie_spawn_enabled<>0');
  await pool.execute(`UPDATE map_regions SET newbie_spawn_enabled=1 WHERE code IN (${spawnCodes.map(() => '?').join(',')})`, spawnCodes);
  for (const skill of talentDefinitions) await pool.execute(`INSERT INTO skill_definitions (code,name,description,category,learn_cost,upgrade_cost,max_level,power_per_level,skill_kind,range_type,passive_effect_json)
    VALUES (?,?,?,'bound',99,99,1,0,'绑定','自身',?) ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),category=VALUES(category),learn_cost=VALUES(learn_cost),upgrade_cost=VALUES(upgrade_cost),max_level=VALUES(max_level),power_per_level=VALUES(power_per_level),skill_kind=VALUES(skill_kind),range_type=VALUES(range_type),passive_effect_json=VALUES(passive_effect_json)`,
  [skill.code, skill.name, skill.description, JSON.stringify({ openingTalent: skill.number })]);
  const item = async (code: string, name: string, description: string, category: string, effect: object) => pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weight,trade_price,is_tradeable,effect_json)
    VALUES (?,?,?,'初行剧情','consumable',?,0,0,0,?) ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),effect_json=VALUES(effect_json)`, [code,name,description,category,JSON.stringify(effect)]);
  const directRewards=new Set(['F01-A','F01-B','F02-A','S03-A','S03-B']);
  for (const route of openingRouteVersions) for (const choice of route.choices) if (!choice.pack&&!choice.rewardKind&&!directRewards.has(`${route.code}-${choice.code}`)) await item(choice.rewardCode, choice.rewardName, `${choice.rewardUse}\n\n未解之事：${choice.future}`, '特殊', { openingKeepsake: choice.rewardCode, personalBound: true });
  await pool.execute("INSERT INTO item_definitions(code,name,description,obtain_source,item_type,item_category,rarity,weight,trade_price,is_tradeable,effect_json) VALUES ('talent_living_seed','活木种植包','含活木种子及一轮水肥，可在本人家园花圃种植。','百纳镇公会种植柜台','consumable','种子','普通',0.1,0,1,'{}') ON DUPLICATE KEY UPDATE description=VALUES(description)");
  await item('opening_last_ration', '面包', '女神为初次降临准备的普通面包，可以充饥，也能在旅途中救助饥饿的生命。', '食物', { openingRation: true, openingBread: true });
  await item('opening_mineral_water', '矿泉水', '女神为初次降临准备的清洁饮水。瓶口封好，可以直接饮用。', '食物', { openingWater: true });
  await item('opening_companion_feed', '灵契饲料', '用于随从的日常照料，不是野怪交涉礼物。', '特殊', { companionFeed: 10 });
  await item('opening_survey_notes', '勘路笔记', '记录来路与安全标记；持有路线兑换额度时，可在公会兑换一张已开放的普通低危地图。', '特殊', { openingService: 'map_exchange' });
  await item('opening_craft_coupon', '入门工艺凭单', '交给公会工匠，完成一次免费的榫接练习。不会授予副职业。', '特殊', { openingService: 'craft_practice' });
  await item('opening_guard_charm', '初行护符', '公会登记的个人救援凭据，下一次普通低危野外战败免救援费用，不免战败掉落。', '特殊', { openingService: 'pve_rescue' });
  await item('opening_practice_stool', '第一张小木凳', '你在公会练习时亲手拼起的小木凳。它的榫口留着反复修正的痕迹。', '特殊', { openingCraftRecord: true });
  await item('opening_f02_b', '魔界邀请函', '瑟芙菈留下的私人邀请。鉴物员登记后归还，未来可用于魔界地区的正式交接。', '特殊', { openingKeepsake: 'opening_f02_b' });
  await item('opening_eris_return', '厄里斯核验的返还单', '厄里斯核验过的接引记录，不是普通战败的复活券。', '特殊', { openingKeepsake: 'opening_eris_return' });
  await item('opening_aqua_letter', '给地上女神的未读事故函', '交给世界树女神办事桌的事故材料。', '特殊', { openingKeepsake: 'opening_aqua_letter' });
  await item('opening_aqua_receipt', '地上女神的收件回执', '女神办事桌已收下材料，凭回执可以查询答复。', '特殊', { openingKeepsake: 'opening_aqua_receipt' });
  for (const [code, hub] of Object.entries(openingHubs)) {
    if (!['world_tree','baina_town'].includes(code)) {
      await pool.execute(`INSERT INTO map_regions (code,name,description,min_x,max_x,min_y,max_y,min_z,max_z,is_spawn_enabled,danger_level) VALUES (?,?,?,?,?,?,?,?,?,0,0)
        ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description)`, [code,hub.name,hub.description,hub.x-3,hub.x+3,hub.y-3,hub.y+3,hub.z,hub.z]);
      await pool.execute(`INSERT IGNORE INTO map_region_areas (region_id,min_x,max_x,min_y,max_y,min_z,max_z) SELECT id,?,?,?,?,?,? FROM map_regions WHERE code=?`, [hub.x-3,hub.x+3,hub.y-3,hub.y+3,hub.z,hub.z,code]);
    }
    if (code !== 'baina_town') await pool.execute(`INSERT INTO map_npcs (region_id,code,name,description,interaction_kind,pos_x,pos_y,pos_z)
      SELECT id,?,?,?,'building',?,?,? FROM map_regions WHERE code=? ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description)`, [hub.guild,hub.guildName,hub.description,hub.x,hub.y,hub.z,code]);
    await item(`map_${code}`, `地图·${hub.name}`, `记有${hub.name}公会与安全接驳处的地图。`, '地图', { map: code });
  }
  // 已删除路线的专用安全区不再开放；普通练级地图仍保留给后续主线和探索。
  await pool.execute("UPDATE map_regions SET newbie_spawn_enabled=0,is_enabled=0 WHERE code IN ('snowlamp_hollow','sleepwhale_market')");
  const [forestPoints]=await pool.execute<RowDataPacket[]>(`SELECT r.id,a.min_x AS pos_x,a.min_y AS pos_y,a.min_z AS pos_z FROM map_regions r
    JOIN map_region_areas a ON a.region_id=r.id WHERE r.code='dark_forest' ORDER BY a.id LIMIT 1`);
  if(forestPoints[0]){
    const point=forestPoints[0];
    const routeCodes=openingRouteVersions.map(route=>route.code);
    await pool.execute(`UPDATE characters c JOIN player_opening_stories s ON s.character_id=c.id
      SET c.current_region_id=?,c.pos_x=?,c.pos_y=?,c.pos_z=?,c.activity_status='active'
      WHERE s.state<>'completed' AND s.route_code NOT IN (${routeCodes.map(()=>'?').join(',')})`,[point.id,point.pos_x,point.pos_y,point.pos_z,...routeCodes]);
    await pool.execute(`UPDATE player_opening_stories SET route_code='F03',story_version=3,destination_code='baina_town',state='armed',branch_code=NULL,page_index=0,reward_claimed=0,flags_json='{}',revision=revision+1
      WHERE state<>'completed' AND route_code NOT IN (${routeCodes.map(()=>'?').join(',')})`,routeCodes);
    await pool.execute("UPDATE player_opening_stories SET story_version=4,state='armed',branch_code=NULL,page_index=0,reward_claimed=0,flags_json='{}',revision=revision+1 WHERE state<>'completed' AND route_code='S03' AND story_version<>4");
  }
  // 旧版本可能已把玩家停在抵达公会后的“教学/交接”页；该阶段已取消，直接结束初行并交给注册主线。
  await pool.execute(`INSERT INTO player_story_progress (character_id,story_code,status,stage)
    SELECT character_id,'forest_guide','completed',0 FROM player_opening_stories WHERE state='lesson'
    ON DUPLICATE KEY UPDATE status='completed',stage=0`);
  await pool.execute("UPDATE player_opening_stories SET state='completed',page_index=0,revision=revision+1 WHERE state='lesson'");
  await pool.execute(`UPDATE characters c JOIN map_regions old_region ON old_region.id=c.current_region_id
    JOIN map_regions target_region ON target_region.code='world_tree'
    JOIN map_npcs target_guild ON target_guild.region_id=target_region.id AND target_guild.code='world_tree_adventurer_guild'
    SET c.current_region_id=target_region.id,c.pos_x=target_guild.pos_x,c.pos_y=target_guild.pos_y,c.pos_z=target_guild.pos_z,c.activity_status='active'
    WHERE old_region.code IN ('snowlamp_hollow','sleepwhale_market')`);
  for (const [code,name,category,weapon,effect] of [
    ['opening_staff','旅人短杖','武器','法杖',{...forgedPrimaryStats('武器','法杖',1,'普通'), physicalAttack:3,balanceVersion:3}],
    ['opening_clothes','普通旅衣','防具','布甲',{slot:'上装',...forgedPrimaryStats('防具','布甲',1,'普通','上装'),balanceVersion:3}]
  ] as const) await pool.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,trade_price,stackable,is_tradeable,effect_json)
    VALUES (?,?,'初行者的普通随身装备。','女神接引','equipment',?,?,'普通',1,0.1,0,0,0,?) ON DUPLICATE KEY UPDATE effect_json=VALUES(effect_json)`, [code,name,category,weapon,JSON.stringify(effect)]);
};
