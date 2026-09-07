import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { dynamicNpcDisplayName, dynamicWorldRegions, generatedDynamicEncounterTemplates, type DynamicEncounterChoice, type DynamicEncounterDefinition, type DynamicEncounterNode, type WorldSiteAccess } from './world-dynamics.content';
import { dynamicNpcProfile, dynamicNpcVoiceAnchor } from './dynamic-npc-dialogue.service';
import { buildPatrolEncounter, patrolKindFor, patrolObjective, patrolPositionMatches, type PatrolContext } from './patrol-encounters';
import { pointBelongsToRegion, validWorldSitePoint, type WorldArea } from './world-site-geometry';

type Db = Pool | PoolConnection;
type WeatherPhase = 'forming' | 'steady' | 'easing';
type WeatherModifiers = { memberSpeedPct: number; targetSpeedPct: number; hint: string; elementBonuses: Record<string, number>; shelteredCharacterIds?: number[] };
export type WeatherEffectChannel = 'direct' | 'throwable' | 'spirit' | 'damage_over_time' | 'healing';
/** 统一天气继承审计：投掷、灵体与持续伤害继承元素天气；治疗不继承元素增伤。 */
export const weatherEffectAudit: Record<WeatherEffectChannel, { inheritsElement: boolean; note: string }> = {
  direct: { inheritsElement: true, note: '角色与怪物的元素直击' }, throwable: { inheritsElement: true, note: '炼金投掷物' }, spirit: { inheritsElement: true, note: '元素灵体追击' }, damage_over_time: { inheritsElement: false, note: '持续效果当前不存储元素归属，维持既有平衡' }, healing: { inheritsElement: false, note: '治疗保持既有平衡，不吃元素增伤' }
};
export const weatherElementMultiplier = (modifiers: Pick<WeatherModifiers, 'elementBonuses' | 'shelteredCharacterIds'> | null | undefined, element: string, channel: WeatherEffectChannel = 'direct', shelteredCharacterId?: number) => {
  if (!weatherEffectAudit[channel].inheritsElement) return 1;
  const protection = shelteredCharacterId && modifiers?.shelteredCharacterIds?.includes(shelteredCharacterId) ? .25 : 1;
  return 1 + Number(modifiers?.elementBonuses?.[element] ?? 0) * protection / 100;
};
type EncounterChoice = DynamicEncounterChoice;
type EncounterDefinition = DynamicEncounterDefinition;
type Encounter = { id: string; title: string; opening: string; choices: EncounterChoice[]; expiresAt: Date; weatherName: string; regionName: string; nodeCode: string; patrol?: PatrolContext; objective?: ReturnType<typeof patrolObjective> };

const profiles: Record<string, { climate: string; forecast: string[]; anomalies: string[] }> = {
  baina_town: { climate: 'urban', forecast: ['clear', 'cloudy', 'rain', 'wind'], anomalies: [] },
  world_tree: { climate: 'arboreal', forecast: ['clear', 'cloudy', 'mist', 'rain'], anomalies: ['leaflight_rain'] },
  dark_forest: { climate: 'forest', forecast: ['clear', 'cloudy', 'mist', 'rain', 'storm'], anomalies: ['spore_tide'] },
  dark_forest_deep: { climate: 'ancient_forest', forecast: ['mist', 'rain', 'storm', 'cloudy'], anomalies: ['rootglow_fog'] },
  worldtree_meadow: { climate: 'meadow', forecast: ['clear', 'cloudy', 'wind', 'rain'], anomalies: ['amber_petals'] },
  morningdew_riverbank: { climate: 'river', forecast: ['clear', 'cloudy', 'mist', 'rain'], anomalies: ['silk_rain'] },
  gravelwind_shore: { climate: 'shore', forecast: ['clear', 'cloudy', 'wind', 'rain', 'storm'], anomalies: ['glass_salt_fog'] },
  ridge_foothills: { climate: 'ridge', forecast: ['clear', 'cloudy', 'wind', 'storm'], anomalies: ['echo_wind'] },
  rediron_pass: { climate: 'volcanic', forecast: ['clear', 'cloudy', 'wind', 'ash_rain'], anomalies: ['ironflower_ash'] },
  mistalgae_marsh: { climate: 'marsh', forecast: ['mist', 'cloudy', 'rain', 'storm'], anomalies: ['glowspore_tide'] },
  fallenstar_swamp: { climate: 'star_swamp', forecast: ['mist', 'cloudy', 'rain', 'storm'], anomalies: ['star_mud_rain'] },
  frostcrown_plateau: { climate: 'frost', forecast: ['cloudy', 'wind', 'snow', 'frost_fog'], anomalies: ['mirror_snow_aurora'] },
  thundercliff: { climate: 'thunder', forecast: ['clear', 'cloudy', 'wind', 'storm'], anomalies: ['thunderthread_cloud'] },
  eclipse_ruins: { climate: 'eclipse', forecast: ['cloudy', 'mist', 'rain', 'storm'], anomalies: ['eclipse_drizzle'] }
};

const templates: { code: string; title: string; regions: string[]; weather: string[]; minExposure: number; weight: number; definition: EncounterDefinition }[] = [
  { code: 'forest_lamplighter', title: '迷雾提灯人', regions: ['dark_forest'], weather: ['mist', 'rain'], minExposure: 2, weight: 100, definition: { opening: '潮湿的树根旁，一位提灯人正反复确认被雨水冲淡的路标。他说有巡游者没有按时回营。', choices: [{ code: 'lead', label: '带路搜寻', text: '你以自己的行迹为锚，替他标出一段安全路径。', copper: 18, flag: 'forest_patrol_trust', worldline: 'forest_patrol', stage: 1 }, { code: 'observe', label: '观察灯芯', text: '你发现灯芯混入了会发光的根须粉末，记下了异常来源。', copper: 8, flag: 'rootglow_observer', worldline: 'rootglow_mystery', stage: 1 }, { code: 'leave', label: '谨慎离开', text: '你没有贸然进入浓雾，只把这个方位记在心里。', copper: 0, flag: 'cautious_wanderer', worldline: 'forest_patrol', stage: 0 }] } },
  { code: 'river_lost_crate', title: '漂来的密封木箱', regions: ['morningdew_riverbank'], weather: ['rain', 'mist', 'silk_rain'], minExposure: 2, weight: 90, definition: { opening: '河湾卡着一只刻有旧商会印记的木箱，箱盖里传来轻微的敲击声。', choices: [{ code: 'open', label: '撬开木箱', text: '箱中是一只湿透的信使鸟和一袋散钱；它飞向上游。', copper: 15, flag: 'riverbird_saved', worldline: 'river_trade', stage: 1 }, { code: 'return', label: '送往驿站', text: '你将箱子交给驿站，登记了一笔无主货运。', copper: 24, flag: 'river_trade_credit', worldline: 'river_trade', stage: 2 }, { code: 'mark', label: '记录印记', text: '你拓下了商会印记，或许能在别处对照它的归属。', copper: 6, flag: 'old_trade_mark', worldline: 'river_trade', stage: 1 }] } },
  { code: 'rediron_furnace', title: '炉监的警铃', regions: ['rediron_pass'], weather: ['ash_rain', 'wind', 'ironflower_ash'], minExposure: 3, weight: 90, definition: { opening: '赤铁隘口的废炉发出三短一长的警铃，灰雨正沿裂缝渗入炉膛。', choices: [{ code: 'seal', label: '封住裂缝', text: '你以碎石压住裂缝，警铃逐渐平息。', copper: 20, flag: 'forge_warden_favor', worldline: 'rediron_furnace', stage: 1 }, { code: 'follow', label: '循铃追查', text: '你发现铃线通向一处被掩埋的巡检道。', copper: 10, flag: 'furnace_tunnel_map', worldline: 'rediron_furnace', stage: 2 }, { code: 'withdraw', label: '撤离灰雨', text: '你没有贸然触碰不稳定炉膛。', copper: 0, flag: 'ash_rain_survivor', worldline: 'rediron_furnace', stage: 0 }] } },
  { code: 'marsh_spore_court', title: '荧孢的指向', regions: ['mistalgae_marsh'], weather: ['mist', 'rain', 'glowspore_tide'], minExposure: 3, weight: 90, definition: { opening: '荧孢在水面排成一条不自然的细线，尽头是一块半沉的石碑。', choices: [{ code: 'sample', label: '采下样本', text: '你将孢子收进密封袋，留下了可供研究的活性记录。', copper: 12, flag: 'spore_sample', worldline: 'marsh_signal', stage: 1 }, { code: 'cleanse', label: '清理水道', text: '你移开堵塞物，水流冲散了聚集的荧孢。', copper: 18, flag: 'marsh_cleanser', worldline: 'marsh_signal', stage: 1 }, { code: 'decode', label: '抄录碑文', text: '碑文提到了坠星后第一场泥雨的方向。', copper: 7, flag: 'star_swamp_riddle', worldline: 'marsh_signal', stage: 2 }] } },
  { code: 'thundercliff_kite', title: '断线的测雷鸢', regions: ['thundercliff'], weather: ['wind', 'storm', 'thunderthread_cloud'], minExposure: 2, weight: 80, definition: { opening: '一只铜骨测雷鸢卡在断崖灌木中，腹部的记录晶片仍在闪烁。', choices: [{ code: 'repair', label: '修复放飞', text: '测雷鸢重新升空，向高处的巡游队传回信号。', copper: 22, flag: 'storm_patrol_friend', worldline: 'thunder_watch', stage: 1 }, { code: 'read', label: '读取晶片', text: '晶片记录了异常云丝的移动轨迹。', copper: 10, flag: 'thunderthread_chart', worldline: 'thunder_watch', stage: 2 }, { code: 'anchor', label: '固定在崖边', text: '你留下了一个可靠的风向标记。', copper: 5, flag: 'ridge_wayfinder', worldline: 'thunder_watch', stage: 0 }] } },
  { code: 'frost_reflection', title: '雪镜里的来客', regions: ['frostcrown_plateau'], weather: ['snow', 'frost_fog', 'mirror_snow_aurora'], minExposure: 3, weight: 80, definition: { opening: '雪面映出一个比你慢半拍的身影；它举起手，像是在等待你的回答。', choices: [{ code: 'answer', label: '与倒影同步', text: '倒影向你点头，雪下露出一枚被埋藏的旧徽记。', copper: 16, flag: 'mirror_oath', worldline: 'frost_oaths', stage: 1 }, { code: 'record', label: '记录差异', text: '你发现倒影总会望向同一个方向。', copper: 9, flag: 'mirror_observer', worldline: 'frost_oaths', stage: 2 }, { code: 'break', label: '打破雪镜', text: '镜面碎成普通的霜粒，四周重新安静下来。', copper: 3, flag: 'mirror_breaker', worldline: 'frost_oaths', stage: -1 }] } },
  { code: 'meadow_petals', title: '琥珀花雨下的信', regions: ['worldtree_meadow'], weather: ['clear', 'rain', 'amber_petals'], minExposure: 2, weight: 70, definition: { opening: '带着叶脉纹的花瓣落在一封未封口的信上，信纸正逐渐吸收金色的雨光。', choices: [{ code: 'deliver', label: '替人送信', text: '你按信尾的叶脉地址将它交给巡游者。', copper: 20, flag: 'canopy_courier', worldline: 'meadow_harmony', stage: 1 }, { code: 'preserve', label: '封存雨光', text: '你保住了信纸上短暂出现的一行异界文字。', copper: 11, flag: 'leaflight_script', worldline: 'meadow_harmony', stage: 2 }, { code: 'wait', label: '等待署名', text: '雨停时，信上只留下一个模糊的根系印记。', copper: 4, flag: 'root_letter', worldline: 'meadow_harmony', stage: 0 }] } },
  ...generatedDynamicEncounterTemplates
];

const schema = [
  `CREATE TABLE IF NOT EXISTS player_patrol_encounters (character_id BIGINT UNSIGNED NOT NULL,npc_code VARCHAR(64) NOT NULL,visit_revision INT UNSIGNED NOT NULL,encounter_id CHAR(36) NOT NULL,team_key VARCHAR(80) NOT NULL,rewarded TINYINT NOT NULL,accepted_date DATE NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(character_id,npc_code,visit_revision),UNIQUE KEY uk_patrol_daily_npc(character_id,npc_code,accepted_date),KEY idx_patrol_visit(npc_code,visit_revision),KEY idx_patrol_daily(character_id,accepted_date)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS patrol_world_progress (npc_code VARCHAR(64) NOT NULL,visit_revision INT UNSIGNED NOT NULL,encounter_id CHAR(36) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(npc_code,visit_revision)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS region_weather_profiles (region_id BIGINT UNSIGNED NOT NULL, climate_code VARCHAR(32) NOT NULL, forecast_json JSON NOT NULL, anomaly_pool_json JSON NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (region_id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS region_weather_states (region_id BIGINT UNSIGNED NOT NULL, weather_code VARCHAR(32) NOT NULL, intensity TINYINT UNSIGNED NOT NULL DEFAULT 1, phase ENUM('forming','steady','easing') NOT NULL DEFAULT 'steady', anomaly_code VARCHAR(64) NULL, revision INT UNSIGNED NOT NULL DEFAULT 1, cause_code VARCHAR(48) NOT NULL DEFAULT 'initial', started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, transition_due_at DATETIME NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (region_id), KEY idx_weather_due (transition_due_at)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS weather_transition_log (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, region_id BIGINT UNSIGNED NOT NULL, from_weather_code VARCHAR(32) NULL, to_weather_code VARCHAR(32) NOT NULL, from_intensity TINYINT UNSIGNED NULL, to_intensity TINYINT UNSIGNED NOT NULL, anomaly_code VARCHAR(64) NULL, cause_code VARCHAR(48) NOT NULL, revision INT UNSIGNED NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY idx_weather_transition_region (region_id,id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS game_event_ledger (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, event_type VARCHAR(48) NOT NULL, outcome VARCHAR(32) NOT NULL, actor_character_id BIGINT UNSIGNED NULL, region_id BIGINT UNSIGNED NULL, correlation_id CHAR(36) NULL, source_key VARCHAR(64) NOT NULL, payload_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY idx_game_ledger_created (created_at,id), KEY idx_game_ledger_actor (actor_character_id,id), KEY idx_game_ledger_region (region_id,id), KEY idx_game_ledger_correlation (correlation_id), KEY idx_game_ledger_type (event_type,id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_exploration_budgets (character_id BIGINT UNSIGNED NOT NULL, window_started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, effective_exposure SMALLINT UNSIGNED NOT NULL DEFAULT 0, trigger_count SMALLINT UNSIGNED NOT NULL DEFAULT 0, last_region_id BIGINT UNSIGNED NULL, last_cell_x INT NULL, last_cell_y INT NULL, last_cell_z INT NULL, cooldown_until DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (character_id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS dynamic_encounter_templates (code VARCHAR(64) NOT NULL, title VARCHAR(96) NOT NULL, region_codes_json JSON NOT NULL, weather_codes_json JSON NOT NULL, min_exposure SMALLINT UNSIGNED NOT NULL DEFAULT 2, weight SMALLINT UNSIGNED NOT NULL DEFAULT 100, definition_json JSON NOT NULL, is_enabled TINYINT(1) NOT NULL DEFAULT 1, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (code)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_encounter_instances (id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, template_code VARCHAR(64) NOT NULL, status ENUM('active','resolved','expired','cancelled') NOT NULL DEFAULT 'active', node_code VARCHAR(48) NOT NULL DEFAULT 'opening', context_json JSON NOT NULL, opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL, resolved_at DATETIME NULL, PRIMARY KEY (id), KEY idx_player_encounter_active (character_id,status,expires_at), KEY idx_player_encounter_region (region_id,status)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_encounter_decisions (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, encounter_id CHAR(36) NOT NULL, node_code VARCHAR(48) NOT NULL, choice_code VARCHAR(48) NOT NULL, outcome_code VARCHAR(48) NOT NULL, effects_json JSON NOT NULL, decided_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id), UNIQUE KEY uk_encounter_decision_node (encounter_id,node_code)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_destiny_flags (character_id BIGINT UNSIGNED NOT NULL, flag_code VARCHAR(64) NOT NULL, value_int INT NOT NULL DEFAULT 0, context_json JSON NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (character_id,flag_code)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_encounter_rewards (character_id BIGINT UNSIGNED NOT NULL, reward_code VARCHAR(64) NOT NULL, encounter_id CHAR(36) NOT NULL, awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id,reward_code), KEY idx_encounter_reward_instance (encounter_id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS worldline_states (code VARCHAR(64) NOT NULL, stage SMALLINT NOT NULL DEFAULT 0, state_json JSON NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (code)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS world_boss_gates (worldline_code VARCHAR(64) NOT NULL, stage_required SMALLINT UNSIGNED NOT NULL, boss_code VARCHAR(64) NOT NULL, state ENUM('locked','ready','spawned','cooldown') NOT NULL DEFAULT 'locked', activated_at DATETIME NULL, last_attempt_at DATETIME NULL, PRIMARY KEY (worldline_code,boss_code), KEY idx_world_boss_gate_state (state,activated_at)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS world_dynamic_npc_states (code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL, region_id BIGINT UNSIGNED NOT NULL, status VARCHAR(32) NOT NULL, route_json JSON NOT NULL, state_json JSON NOT NULL, action_revision INT UNSIGNED NOT NULL DEFAULT 0, last_action_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, next_action_at DATETIME NOT NULL, PRIMARY KEY (code), KEY idx_dynamic_npc_due (next_action_at), KEY idx_dynamic_npc_region (region_id,status)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS world_site_states (code VARCHAR(64) NOT NULL, name VARCHAR(64) NOT NULL, region_id BIGINT UNSIGNED NOT NULL, site_type VARCHAR(32) NOT NULL, state_json JSON NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (code), KEY idx_world_site_region (region_id,site_type)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_world_site_daily (character_id BIGINT UNSIGNED NOT NULL, site_code VARCHAR(64) NOT NULL, action_code VARCHAR(32) NOT NULL, usage_date DATE NOT NULL, usage_count SMALLINT UNSIGNED NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (character_id,site_code,action_code,usage_date)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_world_site_commissions (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, character_id BIGINT UNSIGNED NOT NULL, source_site_code VARCHAR(64) NOT NULL, target_site_code VARCHAR(64) NOT NULL, title VARCHAR(128) NOT NULL, objective_text VARCHAR(255) NOT NULL, reward_copper INT UNSIGNED NOT NULL, status ENUM('accepted','completed','claimed') NOT NULL DEFAULT 'accepted', accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL, claimed_at DATETIME NULL, PRIMARY KEY (id), KEY idx_site_commission_active (character_id,status,accepted_at), KEY idx_site_commission_target (character_id,target_site_code,status)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_worldline_daily_contributions (character_id BIGINT UNSIGNED NOT NULL, worldline_code VARCHAR(64) NOT NULL, contribution_date DATE NOT NULL, commission_id BIGINT UNSIGNED NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id,worldline_code,contribution_date), UNIQUE KEY uk_worldline_contribution_commission (commission_id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS worldline_daily_commission_progress (worldline_code VARCHAR(64) NOT NULL, progress_date DATE NOT NULL, contribution_count SMALLINT UNSIGNED NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (worldline_code,progress_date)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_weather_shelters (character_id BIGINT UNSIGNED NOT NULL, region_id BIGINT UNSIGNED NOT NULL, site_code VARCHAR(64) NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (character_id), KEY idx_player_weather_shelter_expiry (expires_at)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS world_scene_instances (id CHAR(36) NOT NULL, template_code VARCHAR(64) NOT NULL, region_id BIGINT UNSIGNED NOT NULL, cell_x INT NOT NULL, cell_y INT NOT NULL, cell_z INT NOT NULL, discoverer_character_id BIGINT UNSIGNED NOT NULL, status ENUM('active','resolved','expired','cancelled') NOT NULL DEFAULT 'active', opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL, resolved_at DATETIME NULL, payload_json JSON NOT NULL, PRIMARY KEY (id), KEY idx_world_scene_nearby (region_id,status,cell_x,cell_y,cell_z,expires_at), KEY idx_world_scene_discoverer (discoverer_character_id,status)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS world_scene_participants (scene_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, role ENUM('discoverer','witness','assistant','observer') NOT NULL, joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, reward_claimed_at DATETIME NULL, PRIMARY KEY (scene_id,character_id), KEY idx_world_scene_participant_character (character_id,joined_at)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS world_scene_contributions (scene_id CHAR(36) NOT NULL, character_id BIGINT UNSIGNED NOT NULL, team_key VARCHAR(80) NOT NULL, contribution_code ENUM('escort','decode','supply') NOT NULL, payload_json JSON NOT NULL, settled_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (scene_id,character_id), UNIQUE KEY uk_scene_contribution_team (scene_id,team_key), KEY idx_scene_contribution_settlement (scene_id,settled_at)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS player_scene_contribution_cooldowns (character_id BIGINT UNSIGNED NOT NULL, contribution_code ENUM('escort','decode','supply') NOT NULL, cooldown_until DATETIME NOT NULL, PRIMARY KEY (character_id,contribution_code), KEY idx_scene_contribution_cooldown (cooldown_until)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS combat_environment_snapshots (session_id CHAR(36) NOT NULL, region_id BIGINT UNSIGNED NOT NULL, weather_code VARCHAR(32) NOT NULL, intensity TINYINT UNSIGNED NOT NULL, anomaly_code VARCHAR(64) NULL, modifiers_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (session_id)) ENGINE=InnoDB`
];

const json = <T>(value: unknown, fallback: T): T => { try { return typeof value === 'string' ? JSON.parse(value) as T : (value as T ?? fallback); } catch { return fallback; } };
const hash = (text: string) => { let value = 2166136261; for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); } return value >>> 0; };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const weatherText: Record<string, { name: string; description: string }> = {
  clear: { name: '晴朗', description: '云层稀薄，远处地形清晰可见。' }, cloudy: { name: '多云', description: '云层正在堆积，天光变得柔和。' }, mist: { name: '薄雾', description: '水汽贴着地面流动，远景被缓慢抹去。' }, rain: { name: '细雨', description: '雨势平缓，地面正一点点变湿。' }, wind: { name: '劲风', description: '风向稳定而有力，行迹很快会被吹散。' }, storm: { name: '雷暴', description: '云层压低，远处不时传来沉闷雷声。' }, ash_rain: { name: '灰雨', description: '细灰随雨落下，空气里带着金属与焦土味。' }, snow: { name: '降雪', description: '新雪正慢慢覆盖旧脚印。' }, frost_fog: { name: '冻雾', description: '低温雾气凝在衣甲边缘。' },
  leaflight_rain: { name: '叶脉流光雨', description: '世界树的叶脉将细雨染成柔和的金绿光线。' }, spore_tide: { name: '荧孢雾潮', description: '会发光的孢子随雾潮起伏，像有呼吸的星群。' }, rootglow_fog: { name: '根辉迷雾', description: '古根深处的微光沿雾丝游走，方向感被轻轻扭曲。' }, amber_petals: { name: '琥珀花雨', description: '带有蜜色树脂的花瓣从高空缓缓飘落。' }, silk_rain: { name: '丝雨回澜', description: '细雨在河面拉出银丝般的回澜。' }, glass_salt_fog: { name: '玻潮盐雾', description: '海风卷来微亮盐晶，岩岸像覆上一层薄玻璃。' }, echo_wind: { name: '鸣岩回风', description: '风穿过岩缝，带回比原声更迟的回响。' }, ironflower_ash: { name: '铁花灰雨', description: '暗红火星与灰雨一同落下，岩缝里响着余热。' }, glowspore_tide: { name: '荧孢雾潮', description: '沼泽孢群在湿风中聚散，水面浮着青绿磷光。' }, star_mud_rain: { name: '坠星泥雨', description: '泥雨中偶有银蓝碎屑闪过，仿佛星体仍未冷却。' }, mirror_snow_aurora: { name: '镜雪极光', description: '雪粒如镜，天幕的极光在每一片上折出陌生倒影。' }, thunderthread_cloud: { name: '雷丝垂云', description: '细长电光垂落云底，像被谁拉住的银线。' }, eclipse_drizzle: { name: '蚀光微雨', description: '雨滴吞去部分光色，遗迹的影子显得比实体更清晰。' }
};
const anomalyModifiers: Record<string, Partial<WeatherModifiers>> = { leaflight_rain: { memberSpeedPct: 3, hint: '叶脉祝福：我方先攻 +3%' }, spore_tide: { memberSpeedPct: -5, hint: '荧孢附着：我方先攻 -5%' }, rootglow_fog: { memberSpeedPct: -8, hint: '根辉迷向：我方先攻 -8%' }, amber_petals: { memberSpeedPct: 4, hint: '花雨轻步：我方先攻 +4%' }, silk_rain: { memberSpeedPct: -3, hint: '河岸湿滑：我方先攻 -3%' }, glass_salt_fog: { memberSpeedPct: -4, hint: '盐雾刺眼：我方先攻 -4%' }, echo_wind: { targetSpeedPct: 5, hint: '回风示警：野怪先攻 +5%' }, ironflower_ash: { memberSpeedPct: -6, hint: '灰雨灼甲：我方先攻 -6%' }, glowspore_tide: { targetSpeedPct: 6, hint: '孢潮躁动：野怪先攻 +6%' }, star_mud_rain: { memberSpeedPct: -5, hint: '星泥滞足：我方先攻 -5%' }, mirror_snow_aurora: { targetSpeedPct: 7, hint: '镜雪折影：野怪先攻 +7%' }, thunderthread_cloud: { targetSpeedPct: 8, hint: '雷丝惊兽：野怪先攻 +8%' }, eclipse_drizzle: { memberSpeedPct: -7, hint: '蚀光失距：我方先攻 -7%' } };

const writeLedger = async (connection: Db, eventType: string, outcome: string, sourceKey: string, payload: unknown, actorCharacterId?: number | null, regionId?: number | null, correlationId?: string | null) => {
  await connection.execute('INSERT INTO game_event_ledger (event_type,outcome,actor_character_id,region_id,correlation_id,source_key,payload_json) VALUES (?,?,?,?,?,?,?)', [eventType, outcome, actorCharacterId ?? null, regionId ?? null, correlationId ?? null, sourceKey, JSON.stringify(payload)]);
};

type RegionBounds = { id: number; min_x: number; max_x: number; min_y: number; max_y: number; min_z: number; max_z: number };
type RoutePoint = { name: string; x: number; y: number; z: number; siteCode?: string };
const isRoutePoint = (value: unknown): value is RoutePoint => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<RoutePoint>;
  return typeof point.name === 'string' && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
};
const pointInRegion = (bounds: RegionBounds, index: number, offset = 0): RoutePoint => {
  const xRatio = [0.18, 0.51, 0.82][index % 3]!;
  const yRatio = [0.24, 0.68, 0.42][index % 3]!;
  const x = clamp(Math.round(bounds.min_x + (bounds.max_x - bounds.min_x) * xRatio) + offset, bounds.min_x, bounds.max_x);
  const y = clamp(Math.round(bounds.min_y + (bounds.max_y - bounds.min_y) * yRatio) + (offset ? (index % 2 ? -1 : 1) : 0), bounds.min_y, bounds.max_y);
  return { name: '巡游点', x, y, z: bounds.min_z };
};

// 旧版本的晨露信使已由 dw_morningdew_riverbank_npc_1 接替；保留账本，仅移除会造成重复显示的失效实体状态。
const retiredDynamicNpcCodes = ['courier_morningdew'] as const;

export const initializeDynamicWorldSystem = async (pool?: Pool) => {
  const connection = pool ?? await getPool();
  for (const statement of schema) await connection.query(statement);
  const [areas] = await connection.execute<(RowDataPacket & WorldArea)[]>('SELECT a.*,r.danger_level FROM map_region_areas a JOIN map_regions r ON r.id=a.region_id');
  for (const code of retiredDynamicNpcCodes) {
    await connection.execute("DELETE FROM map_npcs WHERE code=? AND interaction_kind='npc'", [code]);
    await connection.execute('DELETE FROM world_dynamic_npc_states WHERE code=?', [code]);
  }
  for (const [regionCode, profile] of Object.entries(profiles)) {
    await connection.execute(`INSERT INTO region_weather_profiles (region_id,climate_code,forecast_json,anomaly_pool_json)
      SELECT id,?,?,? FROM map_regions WHERE code=? ON DUPLICATE KEY UPDATE climate_code=VALUES(climate_code),forecast_json=VALUES(forecast_json),anomaly_pool_json=VALUES(anomaly_pool_json)`, [profile.climate, JSON.stringify(profile.forecast), JSON.stringify(profile.anomalies), regionCode]);
    await connection.execute(`INSERT INTO region_weather_states (region_id,weather_code,intensity,phase,cause_code,transition_due_at)
      SELECT id,?,1,'steady','initial',DATE_ADD(NOW(),INTERVAL 90 MINUTE) FROM map_regions WHERE code=?
      ON DUPLICATE KEY UPDATE weather_code=IF(cause_code='initial',VALUES(weather_code),weather_code)`, [profile.forecast[0] ?? 'clear', regionCode]);
  }
  await connection.query(`INSERT IGNORE INTO region_weather_states (region_id,weather_code,intensity,phase,cause_code,transition_due_at)
    SELECT region_id,'clear',1,'steady','initial',DATE_ADD(NOW(),INTERVAL 90 MINUTE) FROM region_weather_profiles`);
  for (const template of templates) await connection.execute(`INSERT INTO dynamic_encounter_templates (code,title,region_codes_json,weather_codes_json,min_exposure,weight,definition_json,is_enabled)
    VALUES (?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE title=VALUES(title),region_codes_json=VALUES(region_codes_json),weather_codes_json=VALUES(weather_codes_json),min_exposure=VALUES(min_exposure),weight=VALUES(weight),definition_json=VALUES(definition_json),is_enabled=1`, [template.code, template.title, JSON.stringify(template.regions), JSON.stringify(template.weather), template.minExposure, template.weight, JSON.stringify(template.definition)]);
  const legacyWorldlines = [['forest_patrol', '密林巡游'], ['river_trade', '晨露河运'], ['rediron_furnace', '赤铁炉监'], ['marsh_signal', '沼泽星讯'], ['thunder_watch', '雷崖观测'], ['eclipse_memory', '蚀界残忆'], ['canopy_whispers', '冠层低语'], ['rootglow_mystery', '根辉之谜']] as const;
  for (const [code, name] of legacyWorldlines) await connection.execute(`INSERT INTO worldline_states (code,stage,state_json) VALUES (?,0,JSON_OBJECT('name',?,'updatedByEncounter',false))
    ON DUPLICATE KEY UPDATE state_json=JSON_SET(state_json,'$.name',?)`, [code, name, name]);
  for (const region of dynamicWorldRegions) {
    await connection.execute(`INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,rarity,weight,trade_price,stack_limit,stackable,is_tradeable,effect_json)
      VALUES (?,?,?,'动态世界奇遇隐藏奖励','material','世界印记','稀有',0.01,0,1,1,0,JSON_OBJECT())
      ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),obtain_source=VALUES(obtain_source),item_type=VALUES(item_type),item_category=VALUES(item_category),rarity=VALUES(rarity),weight=VALUES(weight),trade_price=VALUES(trade_price),stack_limit=VALUES(stack_limit),stackable=VALUES(stackable),is_tradeable=VALUES(is_tradeable),effect_json=VALUES(effect_json)`, [region.relicCode, region.relicName, region.relicDescription]);
    await connection.execute(`INSERT INTO worldline_states (code,stage,state_json) VALUES (?,0,JSON_OBJECT('name',?,'regionCode',?,'updatedByEncounter',false))
      ON DUPLICATE KEY UPDATE state_json=JSON_SET(state_json,'$.name',?,'$.regionCode',?)`, [region.worldline, `${region.name}世界线`, region.code, `${region.name}世界线`, region.code]);
    const [boundsRows] = await connection.execute<(RowDataPacket & RegionBounds)[]>('SELECT id,min_x,max_x,min_y,max_y,min_z,max_z FROM map_regions WHERE code=? LIMIT 1', [region.code]);
    const bounds = boundsRows[0]; if (!bounds) continue;
    const sites = region.buildings.map((building, index) => ({ building, point: { ...validWorldSitePoint(areas, Number(bounds.id), pointInRegion(bounds, index)), name: building.name } }));
    for (const { building, point } of sites) {
      await connection.execute(`INSERT INTO map_npcs (region_id,code,name,description,interaction_kind,pos_x,pos_y,pos_z) VALUES (?,?,?,?, 'building',?,?,?)
        ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),interaction_kind='building',pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z)`, [bounds.id, building.code, building.name, building.description, point.x, point.y, point.z]);
      await connection.execute(`INSERT INTO world_site_states (code,name,region_id,site_type,state_json) VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE name=VALUES(name),site_type=VALUES(site_type),state_json=JSON_SET(state_json,'$.relatedWorldline',?,'$.buildingCode',?,'$.access',?)`, [building.code, building.name, bounds.id, building.siteType, JSON.stringify({ relatedWorldline: region.worldline, buildingCode: building.code, access: building.access, state: 'dormant' }), region.worldline, building.code, building.access]);
    }
    for (const npc of region.npcs) {
      const home = sites[npc.homeIndex]!;
      const displayName = dynamicNpcDisplayName(npc);
      const route: RoutePoint[] = [
        { ...home.point, name: home.building.name, siteCode: home.building.code },
        { ...validWorldSitePoint(areas, Number(bounds.id), pointInRegion(bounds, (npc.homeIndex + 1) % 3, npc.homeIndex % 2 ? -2 : 2)), name: '巡游路段' },
        { ...validWorldSitePoint(areas, Number(bounds.id), pointInRegion(bounds, (npc.homeIndex + 2) % 3, npc.homeIndex % 2 ? 2 : -2)), name: '观察点' }
      ];
      const [oldPositions] = await connection.execute<(RowDataPacket & { region_id: number; pos_x: number; pos_y: number; pos_z: number; route_json: unknown })[]>('SELECT n.region_id,n.pos_x,n.pos_y,n.pos_z,d.route_json FROM map_npcs n JOIN world_dynamic_npc_states d ON d.code=n.code AND d.region_id=n.region_id WHERE n.code=?', [npc.code]);
      const current = route[0]!;
      await connection.execute(`INSERT INTO world_dynamic_npc_states (code,name,region_id,status,route_json,state_json,next_action_at)
        VALUES (?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 8 MINUTE))
        ON DUPLICATE KEY UPDATE name=VALUES(name),route_json=VALUES(route_json),state_json=JSON_SET(state_json,'$.role',?,'$.homeSite',?,'$.homeRegionId',?,'$.homeStatus',?),next_action_at=IF(status IN ('patrolling','responding'),next_action_at,LEAST(next_action_at,DATE_ADD(NOW(),INTERVAL 8 MINUTE)))`, [npc.code, displayName, bounds.id, npc.status, JSON.stringify(route), JSON.stringify({ role: npc.role, homeSite: home.building.code, homeRegionId: bounds.id, homeStatus: npc.status, currentPoint: current.name }), npc.role, home.building.code, bounds.id, npc.status]);
      // 已外派的域民仍沿用原实体；唯一键是 (region_id,code)，不能向故乡再次插入分身。
      if (oldPositions.length) await connection.execute("UPDATE map_npcs SET name=?,description=? WHERE code=? AND interaction_kind='npc'", [displayName, `${npc.description}\n\n常驻地：${home.building.name}。`, npc.code]);
      else await connection.execute(`INSERT INTO map_npcs (region_id,code,name,description,interaction_kind,pos_x,pos_y,pos_z) VALUES (?,?,?,?, 'npc',?,?,?)
        ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),interaction_kind='npc'`, [bounds.id, npc.code, displayName, `${npc.description}\n\n常驻地：${home.building.name}。`, current.x, current.y, current.z]);
      const old = oldPositions[0];
      const oldHome = old ? json<RoutePoint[]>(old.route_json, [])[0] : undefined;
      if (old && (oldHome && Number(old.region_id) === Number(bounds.id) && Number(old.pos_x) === oldHome.x && Number(old.pos_y) === oldHome.y && Number(old.pos_z) === oldHome.z || !pointBelongsToRegion(areas, Number(old.region_id), { x: Number(old.pos_x), y: Number(old.pos_y), z: Number(old.pos_z) }))) {
        await connection.execute("UPDATE map_npcs SET region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE code=? AND interaction_kind='npc'", [bounds.id, current.x, current.y, current.z, npc.code]);
        await connection.execute("UPDATE world_dynamic_npc_states SET region_id=?,status=?,state_json=JSON_SET(state_json,'$.routeIndex',0,'$.currentPoint',?,'$.specialSceneId',NULL) WHERE code=?", [bounds.id, npc.status === 'patrolling' ? 'stationed' : npc.status, current.name, npc.code]);
        if (Number(old.pos_x) !== current.x || Number(old.pos_y) !== current.y || Number(old.region_id) !== Number(bounds.id)) await writeLedger(connection, 'npc.presence', 'returned', npc.code, { reason: '修复建筑与巡查坐标归属', before: old, position: current }, null, Number(bounds.id));
      }
    }
    if (region.bossCode) await connection.execute(`INSERT INTO world_boss_gates (worldline_code,stage_required,boss_code,state) VALUES (?,24,?,'locked')
      ON DUPLICATE KEY UPDATE stage_required=VALUES(stage_required)`, [region.worldline, region.bossCode]);
  }
};

const nextWeather = (current: string, forecast: string[], roll: number, abrupt: boolean) => {
  if (!forecast.length) return 'clear'; if (abrupt) return forecast[roll % forecast.length]!;
  const index = Math.max(0, forecast.indexOf(current)); return forecast[clamp(index + [-1, 0, 1][roll % 3]!, 0, forecast.length - 1)]!;
};
const weatherModifiersFor = (weatherCode: string, anomalyCode: string | null, intensity: number): WeatherModifiers => {
  const base: WeatherModifiers = { memberSpeedPct: 0, targetSpeedPct: 0, hint: '天气平稳：无额外先攻修正', elementBonuses: {} };
  if (weatherCode === 'mist' || weatherCode === 'frost_fog') { base.memberSpeedPct = -3 * intensity; base.hint = `能见度受限：我方先攻 ${base.memberSpeedPct}%`; }
  if (weatherCode === 'rain') { base.memberSpeedPct = -2 * intensity; base.hint = `地面湿滑：我方先攻 ${base.memberSpeedPct}%`; base.elementBonuses = { 水: 8, 火: -6 }; }
  if (weatherCode === 'wind') { base.targetSpeedPct = 2 * intensity; base.hint = `风势扰动：野怪先攻 +${base.targetSpeedPct}%`; }
  if (weatherCode === 'storm') { base.memberSpeedPct = -4 * intensity; base.targetSpeedPct = 2 * intensity; base.hint = `雷暴压境：我方先攻 ${base.memberSpeedPct}%｜野怪先攻 +${base.targetSpeedPct}%`; base.elementBonuses = { 雷: 10, 风: 4 }; }
  if (weatherCode === 'snow' || weatherCode === 'ash_rain') { base.memberSpeedPct = -3 * intensity; base.hint = `地表阻滞：我方先攻 ${base.memberSpeedPct}%`; }
  if (anomalyCode) Object.assign(base, anomalyModifiers[anomalyCode] ?? {}); return base;
};

const playerContext = async (connection: Db, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; region_id: number; region_code: string; region_name: string; pos_x: number; pos_y: number; pos_z: number })[]>(`SELECT c.id,c.current_region_id AS region_id,r.code AS region_code,r.name AS region_name,c.pos_x,c.pos_y,c.pos_z
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? AND c.npc_code IS NULL LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先完成冒险者登记。'); return rows[0];
};

type WeatherRow = RowDataPacket & { climate_code: string; forecast_json: unknown; anomaly_pool_json: unknown; weather_code: string; intensity: number; phase: WeatherPhase; anomaly_code: string | null; revision: number; transition_due_at: Date; cause_code: string };
const weatherStateForRegion = async (connection: PoolConnection, regionId: number) => {
  const [regions] = await connection.execute<(RowDataPacket & { code: string; name: string })[]>('SELECT code,name FROM map_regions WHERE id=? LIMIT 1', [regionId]); const region = regions[0]; if (!region) throw new Error('区域天气数据异常：找不到地图。');
  const fallback = profiles[region.code] ?? { climate: 'wild', forecast: ['clear', 'cloudy', 'rain'], anomalies: [] };
  await connection.execute(`INSERT INTO region_weather_profiles (region_id,climate_code,forecast_json,anomaly_pool_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE climate_code=climate_code`, [regionId, fallback.climate, JSON.stringify(fallback.forecast), JSON.stringify(fallback.anomalies)]);
  await connection.execute(`INSERT IGNORE INTO region_weather_states (region_id,weather_code,intensity,phase,cause_code,transition_due_at) VALUES (?,'clear',1,'steady','initial',DATE_ADD(NOW(),INTERVAL 90 MINUTE))`, [regionId]);
  const [rows] = await connection.execute<WeatherRow[]>(`SELECT p.climate_code,p.forecast_json,p.anomaly_pool_json,s.weather_code,s.intensity,s.phase,s.anomaly_code,s.revision,s.transition_due_at,s.cause_code
    FROM region_weather_states s JOIN region_weather_profiles p ON p.region_id=s.region_id WHERE s.region_id=? FOR UPDATE`, [regionId]);
  let row = rows[0]!;
  if (new Date(row.transition_due_at).getTime() <= Date.now()) {
    const forecast = json<string[]>(row.forecast_json, fallback.forecast); const anomalies = json<string[]>(row.anomaly_pool_json, fallback.anomalies); const seed = hash(`${regionId}:${row.revision}:${row.weather_code}`); const abrupt = seed % 1000 < 12;
    const next = nextWeather(row.weather_code, forecast, seed >>> 4, abrupt); const anomaly = anomalies.length && seed % 100 < 7 ? anomalies[(seed >>> 9) % anomalies.length]! : null; const intensity = clamp(Number(row.intensity) + ((seed >>> 15) % 3 - 1), 1, 3); const phase: WeatherPhase = abrupt ? 'forming' : next === row.weather_code ? 'steady' : intensity > Number(row.intensity) ? 'forming' : 'easing'; const revision = Number(row.revision) + 1; const cause = abrupt ? 'rare_abrupt_front' : anomaly ? 'regional_anomaly' : 'gradual_front'; const minutes = 70 + seed % 51;
    await connection.execute('UPDATE region_weather_states SET weather_code=?,intensity=?,phase=?,anomaly_code=?,revision=?,cause_code=?,started_at=NOW(),transition_due_at=DATE_ADD(NOW(),INTERVAL ? MINUTE) WHERE region_id=?', [next, intensity, phase, anomaly, revision, cause, minutes, regionId]);
    await connection.execute('INSERT INTO weather_transition_log (region_id,from_weather_code,to_weather_code,from_intensity,to_intensity,anomaly_code,cause_code,revision) VALUES (?,?,?,?,?,?,?,?)', [regionId, row.weather_code, next, row.intensity, intensity, anomaly, cause, revision]);
    await writeLedger(connection, 'weather.transition', cause, 'regional_weather', { from: row.weather_code, to: next, intensity, anomaly, phase, abrupt }, null, regionId);
    row = { ...row, weather_code: next, intensity, phase, anomaly_code: anomaly, revision, cause_code: cause, transition_due_at: new Date(Date.now() + minutes * 60000) };
  }
  return { regionId, regionCode: region.code, regionName: region.name, climateCode: row.climate_code, weatherCode: row.weather_code, intensity: Number(row.intensity), phase: row.phase, anomalyCode: row.anomaly_code, revision: Number(row.revision), transitionDueAt: new Date(row.transition_due_at), causeCode: row.cause_code };
};

export const weatherForPlayer = async (qqUserId: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const weather = await weatherStateForRegion(connection, Number(player.region_id)); const detail = weatherText[weather.anomalyCode ?? weather.weatherCode] ?? weatherText[weather.weatherCode] ?? weatherText.clear;
  return { ...weather, name: detail.name, description: detail.description, modifiers: weatherModifiersFor(weather.weatherCode, weather.anomalyCode, weather.intensity) };
});

type WorldSiteAction = 'commission' | 'forecast' | 'exchange' | 'clues' | 'shelter';
type WorldSiteCapability = WorldSiteAction;
const siteCapabilityFor = (siteType: string): WorldSiteCapability => {
  if (['courier_post', 'ferry', 'rest_stop', 'wayfinder', 'civic_hall'].includes(siteType)) return 'commission';
  if (['observatory', 'lighthouse', 'watchpost'].includes(siteType)) return 'forecast';
  if (['workshop', 'mining_station', 'industrial', 'laboratory', 'garden'].includes(siteType)) return 'exchange';
  if (['shelter', 'inn', 'ranch'].includes(siteType)) return 'shelter';
  return 'clues';
};
const siteActionLabel: Record<WorldSiteAction, string> = { commission: '询问区域委托', forecast: '查看天气预警', exchange: '交换区域材料', clues: '回看已发现线索', shelter: '获得天气庇护' };
const siteDailyLimit: Record<WorldSiteAction, number> = { commission: 1, forecast: 3, exchange: 2, clues: 4, shelter: 1 };
const weatherPhaseLabel: Record<WeatherPhase, string> = { forming: '天气渐强', steady: '天气平稳', easing: '天气渐缓' };
const regionMaterialCode: Record<string, string> = { world_tree: 'root_heart', dark_forest: 'living_wood', dark_forest_deep: 'living_wood', worldtree_meadow: 'root_heart', morningdew_riverbank: 'river_shell', gravelwind_shore: 'tide_shell', ridge_foothills: 'ridge_core', rediron_pass: 'fire_crystal', mistalgae_marsh: 'marsh_heart', fallenstar_swamp: 'star_mud_core', frostcrown_plateau: 'frost_crystal', thundercliff: 'thunder_core', eclipse_ruins: 'eclipse_core' };
type SiteRow = RowDataPacket & { code: string; name: string; description: string; site_type: string; state_json: unknown; region_name: string; worldline_code: string | null; worldline_stage: number | null; region_danger: number };
const currentWorldSite = async (connection: PoolConnection, player: Awaited<ReturnType<typeof playerContext>>, siteCode: string, lock = false) => {
  const [rows] = await connection.execute<SiteRow[]>(`SELECT s.code,s.name,n.description,s.site_type,s.state_json,r.name AS region_name,JSON_UNQUOTE(JSON_EXTRACT(s.state_json,'$.relatedWorldline')) AS worldline_code,w.stage AS worldline_stage,r.danger_level AS region_danger
    FROM world_site_states s JOIN map_regions r ON r.id=s.region_id JOIN map_npcs n ON n.code=s.code AND n.region_id=s.region_id AND n.interaction_kind='building'
    LEFT JOIN worldline_states w ON w.code=JSON_UNQUOTE(JSON_EXTRACT(s.state_json,'$.relatedWorldline'))
    WHERE s.code=? AND s.region_id=? AND n.pos_x=? AND n.pos_y=? AND n.pos_z=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [siteCode, player.region_id, player.pos_x, player.pos_y, player.pos_z]);
  if (!rows[0]) throw new Error('请先来到该特色建筑门前。');
  return rows[0];
};
const consumeSiteDailyUse = async (connection: PoolConnection, characterId: number, siteCode: string, action: WorldSiteAction) => {
  const [rows] = await connection.execute<(RowDataPacket & { usage_count: number })[]>('SELECT usage_count FROM player_world_site_daily WHERE character_id=? AND site_code=? AND action_code=? AND usage_date=CURDATE() FOR UPDATE', [characterId, siteCode, action]);
  const used = Number(rows[0]?.usage_count ?? 0); const limit = siteDailyLimit[action];
  if (used >= limit) throw new Error(`该站点的「${siteActionLabel[action]}」今日已达 ${limit} 次上限。`);
  await connection.execute(`INSERT INTO player_world_site_daily (character_id,site_code,action_code,usage_date,usage_count) VALUES (?,?,?,CURDATE(),1)
    ON DUPLICATE KEY UPDATE usage_count=usage_count+1`, [characterId, siteCode, action]);
  return { used: used + 1, remaining: limit - used - 1 };
};
type SiteAttendantRow = RowDataPacket & { code: string; name: string };
const siteAttendantAtFrontDesk = async (connection: PoolConnection, player: Awaited<ReturnType<typeof playerContext>>, siteCode: string) => {
  const [rows] = await connection.execute<SiteAttendantRow[]>(`SELECT d.code,d.name FROM world_dynamic_npc_states d
    JOIN map_npcs n ON n.code=d.code AND n.region_id=d.region_id AND n.interaction_kind='npc'
    WHERE JSON_UNQUOTE(JSON_EXTRACT(d.state_json,'$.homeSite'))=? AND d.region_id=? AND n.pos_x=? AND n.pos_y=? AND n.pos_z=? LIMIT 1`, [siteCode, player.region_id, player.pos_x, player.pos_y, player.pos_z]);
  return rows[0] ?? null;
};

export const worldSiteView = async (qqUserId: string, siteCode: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const site = await currentWorldSite(connection, player, siteCode, true);
  const capability = siteCapabilityFor(site.site_type);
  const attendantRow = await siteAttendantAtFrontDesk(connection, player, site.code);
  const attendantProfile = attendantRow ? dynamicNpcProfile(attendantRow.code) : null;
  const state = json<{ access?: WorldSiteAccess }>(site.state_json, {});
  const access: WorldSiteAccess = state.access === 'private' ? 'private' : 'public';
  const attendant = attendantRow ? { ...attendantRow, role: attendantProfile?.role ?? '常驻域民', description: attendantProfile?.description ?? '正在整理前台的物件。' } : null;
  return { code: site.code, name: site.name, regionName: site.region_name, description: site.description, access, capability, actionLabel: siteActionLabel[capability], dailyLimit: siteDailyLimit[capability], attendant };
});
export const worldSiteKnock = async (qqUserId: string, siteCode: string) => {
  const site = await worldSiteView(qqUserId, siteCode);
  if (site.access === 'public' || site.attendant) return { answered: true as const, site };
  return { answered: false as const, site, text: `你轻叩${site.name}的门。门后没有回应，常驻域民似乎外出未归。` };
};
export const worldSiteForAttendant = async (qqUserId: string, npcCode: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true);
  const [rows] = await connection.execute<(SiteAttendantRow & { site_code: string; site_type: string })[]>(`SELECT d.code,d.name,s.code AS site_code,s.site_type FROM world_dynamic_npc_states d
    JOIN world_site_states s ON s.code=JSON_UNQUOTE(JSON_EXTRACT(d.state_json,'$.homeSite')) AND s.region_id=d.region_id
    JOIN map_npcs n ON n.code=d.code AND n.region_id=d.region_id AND n.interaction_kind='npc'
    JOIN map_npcs b ON b.code=s.code AND b.region_id=s.region_id AND b.interaction_kind='building'
    WHERE d.code=? AND d.region_id=? AND n.pos_x=? AND n.pos_y=? AND n.pos_z=? AND b.pos_x=? AND b.pos_y=? AND b.pos_z=? LIMIT 1`, [npcCode, player.region_id, player.pos_x, player.pos_y, player.pos_z, player.pos_x, player.pos_y, player.pos_z]);
  const row = rows[0]; if (!row) return null;
  return { siteCode: row.site_code, attendantName: row.name, capability: siteCapabilityFor(row.site_type) };
});
export const commissionSiteForAttendant = async (qqUserId: string, npcCode: string) => {
  const site = await worldSiteForAttendant(qqUserId, npcCode);
  return site?.capability === 'commission' ? site : null;
};
export const acceptWorldSiteCommissionFromAttendant = async (qqUserId: string, siteCode: string, npcCode: string) => {
  const attendant = await commissionSiteForAttendant(qqUserId, npcCode);
  if (!attendant || attendant.siteCode !== siteCode) throw new Error('请先在该站点前台与常驻域民交谈。');
  return useWorldSite(qqUserId, siteCode, 'commission');
};

type CommissionTargetRow = RowDataPacket & { code: string; name: string; pos_x: number; pos_y: number; pos_z: number };
type SiteCommissionRow = RowDataPacket & { id: number; source_site_code: string; target_site_code: string; title: string; objective_text: string; reward_copper: number; status: 'accepted' | 'completed' | 'claimed'; target_name: string; region_name: string; pos_x: number; pos_y: number; pos_z: number };
type CommissionContext = { issuerName: string; sourceName: string; targetName: string; regionName: string; regionCode: string };
type CommissionPlan = { type: string; title: string; reason: string; handoff: string; rewardBonus: number };
type CommissionBriefing = { issuerName: string; title: string; briefing: string; objective: string; targetName: string; reward: number };

/**
 * 站点委托采用内容池而不是统一的“跑到另一站”文案。目标仍是交接站，
 * 但每一种委托都交代了谁为何急需这次交接，让同一张地图也能呈现不同的人情与风险。
 */
const commissionPlans: ((context: CommissionContext) => CommissionPlan)[] = [
  c => ({ type: '封签递送', title: '根蜡封签的去向', reason: `${c.issuerName}刚收下的封签被雨气浸得发软，若不尽快送到${c.targetName}复核，里面的求援印记就会失效。`, handoff: '将封签交给值守人，等对方以印泥回押。', rewardBonus: 2 }),
  c => ({ type: '回执核验', title: '迟到的回执', reason: `${c.sourceName}的一批补给在账册上已经抵达，${c.issuerName}却始终没等到回执；他担心有人把缺口藏进了路程里。`, handoff: `前往${c.targetName}核对箱号与签名，带回无误的交接确认。`, rewardBonus: 1 }),
  c => ({ type: '引灯巡线', title: '未熄的路灯', reason: `${c.issuerName}发现旧路灯比约定多亮了一盏。夜里常有迷路人追着错误的灯火走，得有人去确认线路是否被改动。`, handoff: `抵达${c.targetName}，与当地值守人一同核验灯号。`, rewardBonus: 3 }),
  c => ({ type: '路标复勘', title: '被挪动的路标', reason: `${c.sourceName}门前的木牌被人转了半圈，${c.issuerName}不愿让后来者在岔路上白走一日。`, handoff: `到${c.targetName}对照旧图，确认下一块路标该指向哪里。`, rewardBonus: 2 }),
  c => ({ type: '药匣急送', title: '温匣里的药草', reason: `${c.issuerName}用温苔包好一匣止血草；附近巡游人脚踝受伤，药性却撑不过下一次换班。`, handoff: `将温匣送抵${c.targetName}，交给正在等药的人。`, rewardBonus: 4 }),
  c => ({ type: '样本转运', title: '会呼吸的样本', reason: `${c.sourceName}收集到一份仍在缓慢发亮的样本，${c.issuerName}怕它在柜台里继续生长，污染别的记录。`, handoff: `把密封样本送至${c.targetName}，请对方登记保存。`, rewardBonus: 4 }),
  c => ({ type: '失物寻主', title: '无名的旧坠', reason: `${c.issuerName}在门槛下捡到一枚刻着半截姓氏的旧坠；没人敢私留，但失主或许正焦急地等着消息。`, handoff: `前往${c.targetName}询问登记簿，为旧坠找到该去的柜台。`, rewardBonus: 2 }),
  c => ({ type: '修缮借件', title: '缺了一枚铆钉', reason: `${c.sourceName}的栏杆裂开了一处，${c.issuerName}说只差一枚合尺寸的铆钉，却不能让行人踩着破口等货。`, handoff: `向${c.targetName}借取修缮件，并完成交接登记。`, rewardBonus: 3 }),
  c => ({ type: '水位测读', title: '水尺的第二道刻痕', reason: `${c.issuerName}今早在水尺上看见陌生刻痕；它不是洪水预警的标准颜色，反而像有人留下的暗号。`, handoff: `到${c.targetName}比对旧日水文簿，确认这道刻痕的来历。`, rewardBonus: 3 }),
  c => ({ type: '护符复位', title: '偏离的护符', reason: `${c.sourceName}的镇路护符朝错误方向转了一整夜，${c.issuerName}不愿擅自拨正，怕压住真正的异动。`, handoff: `抵达${c.targetName}，请熟悉当地脉络的人一同复位护符。`, rewardBonus: 4 }),
  c => ({ type: '巡游接引', title: '迟归的巡游者', reason: `${c.issuerName}收到一段断续的哨音：一名巡游者已经改道，却没来得及告诉下一处歇脚点。`, handoff: `赶往${c.targetName}递交改道消息，免得接应队扑空。`, rewardBonus: 3 }),
  c => ({ type: '货单验收', title: '多出一页货单', reason: `${c.issuerName}翻货单时发现末页多了一行没有落款的物资；它可能是好心人垫付，也可能是有人想借名领走。`, handoff: `在${c.targetName}当面验收货单，核清这页该归谁。`, rewardBonus: 2 }),
  c => ({ type: '遗迹拓片', title: '褪色的边角', reason: `${c.sourceName}送来一张只拓下半行字的石刻纸，${c.issuerName}认出其中一个笔画，却缺少能对照的残页。`, handoff: `前往${c.targetName}借阅对照页，补全这段文字的出处。`, rewardBonus: 4 }),
  c => ({ type: '余烬封存', title: '尚温的灰烬', reason: `${c.issuerName}用陶瓶收起一撮未冷的灰烬；它落在普通路边，却带着不该有的金属甜味。`, handoff: `将陶瓶送至${c.targetName}，由专人封存并写下来源。`, rewardBonus: 4 }),
  c => ({ type: '绕行告示', title: '给旅人的绕行纸', reason: `${c.issuerName}听见前路有野群迁徙，草拟了绕行告示；若晚一步贴出，商队和野兽都可能被逼进窄口。`, handoff: `到${c.targetName}张贴告示，并确认值守人已收到替代路线。`, rewardBonus: 3 }),
  c => ({ type: '换哨交接', title: '夜班前的钥匙', reason: `${c.sourceName}的夜班人手临时少了一位，${c.issuerName}把钥匙与巡查簿包在同一只布袋里，不敢交给不认识的过路者。`, handoff: `将布袋送往${c.targetName}，完成换哨前的签收。`, rewardBonus: 3 }),
  c => ({ type: '风向采录', title: '逆风的纸条', reason: `${c.issuerName}夹在窗缝里的纸条被风吹回了原处三次；上头记录的方向，与当地惯常风路恰好相反。`, handoff: `抵达${c.targetName}，请对方补记一份风向采录。`, rewardBonus: 2 }),
  c => ({ type: '欠账清点', title: '一笔没写完的欠账', reason: `${c.issuerName}在旧账本里发现一笔“已还”的欠账，却没有收款人的指印。他不愿让无辜的人背着陌生的名字。`, handoff: `前往${c.targetName}查验旧账页，确认该笔款项是否真的结清。`, rewardBonus: 2 }),
  c => ({ type: '祭仪补位', title: '少了一盏灯的仪式', reason: `${c.sourceName}的例行仪式少了一盏引灯，${c.issuerName}说仪式不求神迹，只求让每个人知道今晚的路仍有人看着。`, handoff: `到${c.targetName}送达引灯与时刻，补上缺失的一位见证。`, rewardBonus: 3 }),
  c => ({ type: '工匠验工', title: '没响的第二声', reason: `${c.issuerName}说新修的机关应该有两声脆响，今天却只听见一声。他宁愿多跑一趟，也不想让故障留到有人经过时。`, handoff: `抵达${c.targetName}，请当地工匠共同验收并记录声响。`, rewardBonus: 4 }),
  c => ({ type: '传闻溯源', title: '被折过三次的传闻', reason: `${c.issuerName}收到同一句传闻的三个版本，每一版都添了一点惊吓。他想找的不是热闹，而是最初说话的人。`, handoff: `前往${c.targetName}核对最早的口述记录，标明可信来源。`, rewardBonus: 2 }),
  c => ({ type: '燃料递补', title: '只够半夜的燃料', reason: `${c.sourceName}的炉火还能撑半夜，${c.issuerName}却知道下一班巡行人会在天亮前抵达，不能只留下一屋冷水。`, handoff: `将补充燃料送到${c.targetName}，登记给下一班的份额。`, rewardBonus: 3 }),
  c => ({ type: '回收旧信', title: '无人认领的回信', reason: `${c.issuerName}保管着一封退回三次的回信，纸角已经卷起；信里的人未必还在原地，但信不该永远躺在抽屉底。`, handoff: `把回信送往${c.targetName}，请其查阅旧住址簿。`, rewardBonus: 2 }),
  c => ({ type: '避险引导', title: '给新人的安全路线', reason: `${c.issuerName}要带一批刚到此地的人熟悉路线，却发现最后一段引导页被水打湿，关键岔口看不清了。`, handoff: `到${c.targetName}补领清晰图页，交还给引导队。`, rewardBonus: 3 }),
  c => ({ type: '密钥轮换', title: '过期的门钥', reason: `${c.sourceName}的备用钥匙按规矩该换了，${c.issuerName}却在钥齿上看见新鲜磨痕，担心旧钥已经被人试过。`, handoff: `前往${c.targetName}交还旧钥并领取封存回执。`, rewardBonus: 4 }),
  c => ({ type: '行装寻回', title: '留在长椅上的行装', reason: `${c.issuerName}发现一只旅行包被规规矩矩放在长椅下，包带上缝着手工补丁，主人显然会回来找它。`, handoff: `将行装的描述带到${c.targetName}核验，避免错交给冒领者。`, rewardBonus: 2 }),
  c => ({ type: '苗圃借水', title: '干到发白的幼苗', reason: `${c.issuerName}说苗圃不是怕渴，而是怕被错误的水浇坏；附近只有${c.targetName}留着一份未被污染的净水记录。`, handoff: `前往${c.targetName}取回净水凭证，完成一次谨慎的借水交接。`, rewardBonus: 3 }),
  c => ({ type: '清点失联', title: '空着的一格名册', reason: `${c.issuerName}点名时发现名册空了一格，没有人知道那是漏写还是有人未归。比起猜测，他更想先把消息送出去。`, handoff: `到${c.targetName}核对来访名册，确认失联者最后的登记。`, rewardBonus: 4 }),
  c => ({ type: '讯号复核', title: '三短一长的讯号', reason: `${c.issuerName}听见远处传来三短一长的讯号，却与本地约定不合。他担心有人误把求援当成例行提醒。`, handoff: `抵达${c.targetName}复核讯号本，确认该如何回应。`, rewardBonus: 4 }),
  c => ({ type: '应急布告', title: '还没盖章的布告', reason: `${c.issuerName}写好了一份应急布告，却少了目标站的确认印；没有那枚印，没人敢替它承担后果。`, handoff: `前往${c.targetName}盖下确认印，让布告可以正式生效。`, rewardBonus: 3 }),
  c => ({ type: '旧物归档', title: '没有编号的木匣', reason: `${c.sourceName}收到一只没有编号的木匣，${c.issuerName}只从缝隙里闻到陈年纸张味。他想把它归档，而不是把它当作战利品。`, handoff: `把木匣送至${c.targetName}，核对归档处与保管人。`, rewardBonus: 2 }),
  c => ({ type: '舟楫借还', title: '借走却没归来的桨', reason: `${c.issuerName}在借用簿上看到一副桨逾期两日。东西不贵，但失了它，下一位渡口值守人就少一次把人送回岸边的机会。`, handoff: `到${c.targetName}核对借用人留下的去向与归还时刻。`, rewardBonus: 3 }),
  c => ({ type: '种匣护送', title: '不该晒到日头的种子', reason: `${c.sourceName}收到一匣怕光的种子，${c.issuerName}用湿布盖了三层，仍担心它们在柜台前失去最后一点活性。`, handoff: `将种匣送到${c.targetName}的阴凉处，交由对方记录培育。`, rewardBonus: 4 }),
  c => ({ type: '旗语转译', title: '旗角里的陌生手势', reason: `${c.issuerName}看见远处旗语连打两遍，却不是本地常用的意思。他不想因为一个误读，让本该靠岸的人继续等风。`, handoff: `前往${c.targetName}对照旗语册，写下准确的转译。`, rewardBonus: 3 }),
  c => ({ type: '夜路报时', title: '提前响起的报时铃', reason: `${c.issuerName}说报时铃比平日早了一刻，赶夜路的人会拿它判断是否该停下。没人知道是钟快了，还是天色被什么拖慢了。`, handoff: `抵达${c.targetName}比对报时记录，确认今晚应以哪一声为准。`, rewardBonus: 3 }),
  c => ({ type: '灰痕辨认', title: '门槛上的灰色鞋印', reason: `${c.issuerName}在门槛发现一串灰色鞋印，鞋跟磨损得很特别，却在登记簿上找不到对应的来访者。`, handoff: `到${c.targetName}查对出入记录，为这串脚印补上来处。`, rewardBonus: 2 }),
  c => ({ type: '绳桥查扣', title: '多打的一个绳结', reason: `${c.sourceName}的过桥绳被人多打了一个结。${c.issuerName}担心它不是好心加固，而是有人留下的拉扯痕迹。`, handoff: `前往${c.targetName}检查另一端扣环，确认绳桥仍可通行。`, rewardBonus: 4 }),
  c => ({ type: '静默交割', title: '不愿写下名字的委托人', reason: `${c.issuerName}受一位蒙面来客所托，只收下一份不愿署名的交割物。对方没有要求保密，只说“别让它落到错的人手里”。`, handoff: `将封好的交割物交给${c.targetName}核验封蜡，不拆封、不追问。`, rewardBonus: 4 }),
  c => ({ type: '备用印模', title: '裂开的确认印', reason: `${c.issuerName}按下确认印时，印模边缘裂出细纹；再用一次，整日的交接凭据都可能变成无法辨认的墨团。`, handoff: `到${c.targetName}借取备用印模，并完成印记比对。`, rewardBonus: 3 }),
  c => ({ type: '迷途留言', title: '写给后来者的折页', reason: `${c.issuerName}捡到一张折得很小的留言，上面只有“别走旧路”四个字。他不愿把它当成玩笑，尤其当旧路刚好通往人烟稀薄处。`, handoff: `把折页送到${c.targetName}，核验旧路是否需要临时封闭。`, rewardBonus: 3 })
];

const commissionPlanFor = (seed: number, context: CommissionContext) => commissionPlans[seed % commissionPlans.length]!(context);
const worldlineCommissionDailyLimit = 6;
const commissionBackdropFor = (regionCode: string, regionName: string) => ({
  baina_town: '雨棚下的行商正在交换消息，任何一份交接都可能影响下一趟车队。',
  world_tree: '根桥上新落的叶脉流光尚未褪去，来往的人都绕开正在生长的细根。',
  dark_forest: '林雾会吞掉脚印，路牌与回执比平日更值得被反复确认。',
  dark_forest_deep: '根辉雾正沿旧石门游走，每一次交接都得留下能回头的记号。',
  worldtree_meadow: '草坡上的迁徙铃声此起彼伏，补给与引导必须抢在兽群改道前送到。',
  morningdew_riverbank: '河雾压着浮桥，潮湿的纸张和绳结都经不起拖延。',
  gravelwind_shore: '盐雾正把礁石涂成假门，航线与货单需要比平时多核一道。',
  ridge_foothills: '山口的回风会把短音折回，任何一条讯息都要确认来处。',
  rediron_pass: '隘口的余热尚未散尽，门外的灰痕与警铃都不能被当作寻常动静。',
  mistalgae_marsh: '湿地浮草不断移位，熟路与昨日的样子已经不同。',
  fallenstar_swamp: '星泥还在浅水边闪烁，旧刻度与旧承诺都得重新量过。',
  frostcrown_plateau: '风口的新雪正在覆盖旧痕，能留下的确认比口头承诺可靠。',
  thundercliff: '断崖的缆索偶尔带着余震，远处的讯号必须有人亲自复核。',
  eclipse_ruins: '遗迹里的光影正在错位，纸上的一笔与现实的一步未必总能重合。'
}[regionCode] ?? `${regionName}的路况与人流仍在变化，站点之间的交接不能只靠猜测。`);
const commissionRewardFor = (dangerLevel: number, worldlineStage: number, plan: CommissionPlan) => 16 + Math.max(0, dangerLevel) * 4 + Math.min(8, Math.max(0, worldlineStage)) * 2 + plan.rewardBonus;
const npcAffinityFor = async (connection: PoolConnection, characterId: number, npcCode: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { affinity: number })[]>('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=? LIMIT 1', [characterId, npcCode]);
  return Number(rows[0]?.affinity ?? 0);
};
const speakerReason = (reason: string, issuerName: string) => reason.replaceAll(issuerName, '我')
  .replaceAll('；他', '；我').replaceAll('；她', '；我').replaceAll('。他', '。我').replaceAll('。她', '。我');
const conciseCommissionObjective = (targetName: string, handoff: string) => {
  const trimmed = handoff.replaceAll(`前往${targetName}`, '').replaceAll(`抵达${targetName}`, '').replaceAll(`到${targetName}`, '').replaceAll(`在${targetName}`, '').replace(/^[，,、\s]+/, '');
  return `前往${targetName}，${trimmed}`;
};
const commissionBriefingFor = (args: {
  npcCode: string; affinity: number; variant: number; issuerName: string; title: string; plan: CommissionPlan; targetName: string; backdrop: string; dangerLevel: number; worldlineStage: number; reward: number;
}): CommissionBriefing => {
  const voice = dynamicNpcVoiceAnchor(args.npcCode, args.affinity, args.variant);
  const urgency = args.dangerLevel >= 8 || args.worldlineStage >= 6 || args.plan.rewardBonus >= 4
    ? '这件事拖久了只会更难收拾，路上以稳为先，别为了赶快把自己搭进去。'
    : '不必拿命赶路，但别让这份交接在柜台上再搁太久。';
  const familiarity = voice?.relation === 'confidant' || voice?.relation === 'close_friend' ? `我知道你会把它交到对的人手里。${voice.trust}。`
    : voice?.relation === 'friend' ? `你办事有始有终，这一趟我愿意托给你。${voice.warmth}。`
      : voice?.relation === 'acquaintance' ? `你上回把事情的来处说得很清楚，所以这次我先想到你。${voice.warmth}。`
        : `${voice?.caution ?? '事情的来处要记清楚'}。规矩我已写明，接不接由你决定。`;
  const opening = voice ? `${voice.gesture}。` : `${args.issuerName}把手边的交接物理好，才抬眼看向你。`;
  const briefing = `${opening}\n“${speakerReason(args.plan.reason, args.issuerName)}眼下${args.backdrop}${args.plan.handoff}${urgency}${familiarity}”`;
  return { issuerName: args.issuerName, title: args.title, briefing, objective: conciseCommissionObjective(args.targetName, args.plan.handoff), targetName: args.targetName, reward: args.reward };
};
const commissionTargetFor = async (connection: PoolConnection, regionId: number, sourceSiteCode: string, seed: number) => {
  const [rows] = await connection.execute<CommissionTargetRow[]>(`SELECT s.code,s.name,n.pos_x,n.pos_y,n.pos_z FROM world_site_states s JOIN map_npcs n ON n.code=s.code AND n.region_id=s.region_id AND n.interaction_kind='building'
    WHERE s.region_id=? AND s.code<>? ORDER BY s.code`, [regionId, sourceSiteCode]);
  if (!rows[0]) throw new Error('该区域暂时没有可安排的巡检站点。');
  return rows[seed % rows.length]!;
};
export const playerWorldSiteCommissions = async (qqUserId: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId);
  const [rows] = await connection.execute<SiteCommissionRow[]>(`SELECT c.id,c.source_site_code,c.target_site_code,c.title,c.objective_text,c.reward_copper,c.status,t.name AS target_name,r.name AS region_name,n.pos_x,n.pos_y,n.pos_z
    FROM player_world_site_commissions c JOIN world_site_states t ON t.code=c.target_site_code JOIN map_regions r ON r.id=t.region_id JOIN map_npcs n ON n.code=t.code AND n.region_id=t.region_id AND n.interaction_kind='building'
    WHERE c.character_id=? AND c.status IN ('accepted','completed') ORDER BY c.accepted_at DESC`, [player.id]);
  return rows.map(row => ({ id: Number(row.id), title: row.title, objectiveText: row.objective_text, rewardCopper: Number(row.reward_copper), status: row.status, targetName: row.target_name, location: { regionName: row.region_name, x: Number(row.pos_x), y: Number(row.pos_y), z: Number(row.pos_z) } }));
});
export const completeWorldSiteCommissionsAtSite = async (qqUserId: string, siteCode: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true);
  const site = await currentWorldSite(connection, player, siteCode, true);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; title: string; worldline_code: string | null })[]>(`SELECT c.id,c.title,JSON_UNQUOTE(JSON_EXTRACT(s.state_json,'$.relatedWorldline')) AS worldline_code
    FROM player_world_site_commissions c JOIN world_site_states s ON s.code=c.source_site_code
    WHERE c.character_id=? AND c.target_site_code=? AND c.status='accepted' FOR UPDATE`, [player.id, siteCode]);
  if (!rows.length) return [] as string[];
  if (!await siteAttendantAtFrontDesk(connection, player, site.code)) return ['前台域民暂时外出。请在任务栏选择“提交交接”留下回站通知，待其回来后再次提交或进入建筑即可交接。'];
  await connection.execute('UPDATE player_world_site_commissions SET status=\'completed\',completed_at=NOW() WHERE character_id=? AND target_site_code=? AND status=\'accepted\'', [player.id, siteCode]);
  const notices: string[] = [];
  for (const row of rows) {
    let contributed = false; let regionalDailyLimitReached = false;
    if (row.worldline_code) {
      const [daily] = await connection.execute<ResultSetHeader>(`INSERT IGNORE INTO player_worldline_daily_contributions (character_id,worldline_code,contribution_date,commission_id)
        VALUES (?,?,CURDATE(),?)`, [player.id, row.worldline_code, row.id]);
      if (Number(daily.affectedRows)) {
        await connection.execute(`INSERT IGNORE INTO worldline_daily_commission_progress (worldline_code,progress_date,contribution_count) VALUES (?,CURDATE(),0)`, [row.worldline_code]);
        const [progressRows] = await connection.execute<(RowDataPacket & { contribution_count: number })[]>('SELECT contribution_count FROM worldline_daily_commission_progress WHERE worldline_code=? AND progress_date=CURDATE() FOR UPDATE', [row.worldline_code]);
        if (Number(progressRows[0]?.contribution_count ?? 0) < worldlineCommissionDailyLimit) {
          await connection.execute('UPDATE worldline_daily_commission_progress SET contribution_count=contribution_count+1 WHERE worldline_code=? AND progress_date=CURDATE()', [row.worldline_code]);
          await connection.execute(`UPDATE worldline_states SET stage=LEAST(24,stage+1),state_json=JSON_SET(state_json,'$.lastCommissionId',?,'$.lastCommissionActor',?,'$.updatedByCommission',true) WHERE code=?`, [row.id, player.id, row.worldline_code]);
          await applyWorldlineEffects(connection, row.worldline_code, Number(player.id), Number(player.region_id), randomUUID());
          contributed = true;
        } else regionalDailyLimitReached = true;
      }
    }
    await writeLedger(connection, 'site.commission', 'completed', siteCode, { commissionId: Number(row.id), regionalContribution: contributed, regionalDailyLimitReached }, Number(player.id), Number(player.region_id));
    const contributionNotice = contributed ? '你的交接已记入本区域的公共进展。' : regionalDailyLimitReached ? '本区域今日的公共进展已足额登记，委托报酬不受影响。' : '你今日已为本区域登记过公共进展，委托报酬不受影响。';
    notices.push(`「${row.title}」已完成；${contributionNotice}可在任务栏领取报酬。`);
  }
  return notices;
});
export const claimWorldSiteCommission = async (qqUserId: string, commissionId: number) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { title: string; reward_copper: number; status: string })[]>('SELECT title,reward_copper,status FROM player_world_site_commissions WHERE id=? AND character_id=? FOR UPDATE', [commissionId, player.id]);
  const commission = rows[0]; if (!commission) throw new Error('未找到这份站点委托。'); if (commission.status !== 'completed') throw new Error('请先抵达委托指定的站点完成巡检。');
  await connection.execute('UPDATE player_world_site_commissions SET status=\'claimed\',claimed_at=NOW() WHERE id=?', [commissionId]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [commission.reward_copper, player.id]);
  await writeLedger(connection, 'site.commission', 'claimed', 'task_panel', { commissionId, reward: Number(commission.reward_copper) }, Number(player.id), Number(player.region_id));
  return { title: commission.title, copper: Number(commission.reward_copper) };
});
export const submitWorldSiteCommission = async (qqUserId: string, commissionId: number) => {
  const ready = await withTransaction(async connection => {
    const player = await playerContext(connection, qqUserId, true);
    const [rows] = await connection.execute<(RowDataPacket & { target_site_code: string; status: string })[]>('SELECT target_site_code,status FROM player_world_site_commissions WHERE id=? AND character_id=? FOR UPDATE', [commissionId, player.id]);
    const row = rows[0]; if (!row) throw new Error('未找到你的这份委托。');
    if (row.status !== 'accepted') return { code: row.target_site_code, ready: false, text: row.status === 'completed' ? '交接已经完成，请在任务栏领取报酬。' : '这份委托已经结清。' };
    const site = await currentWorldSite(connection, player, row.target_site_code, true);
    if (await siteAttendantAtFrontDesk(connection, player, site.code)) return { code: site.code, ready: true, text: '' };
    await connection.execute("UPDATE world_dynamic_npc_states SET state_json=JSON_SET(state_json,'$.serviceUntil',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 30 MINUTE),'%Y-%m-%d %H:%i:%s')),next_action_at=LEAST(next_action_at,NOW()) WHERE JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.homeSite'))=?", [site.code]);
    await writeLedger(connection, 'site.commission', 'waiting', site.code, { commissionId, reason: '收件域民外出，请求回站交接' }, Number(player.id), Number(player.region_id));
    return { code: site.code, ready: false, text: '你在门前留下交接通知。域民会在下一次巡游调度时优先回站（通常十分钟内；公共现场事务结束后返回）。回来后再次提交即可，委托和报酬会保留。' };
  });
  return ready.ready ? (await completeWorldSiteCommissionsAtSite(qqUserId, ready.code)).join('\n') : ready.text;
};

export const useWorldSite = async (qqUserId: string, siteCode: string, action: WorldSiteAction) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const site = await currentWorldSite(connection, player, siteCode, true); const capability = siteCapabilityFor(site.site_type);
  if (capability !== action) throw new Error(`此站点提供「${siteActionLabel[capability]}」，不能执行该操作。`);
  const attendant = await siteAttendantAtFrontDesk(connection, player, site.code);
  if (!attendant) throw new Error('前台域民暂时外出，待其归来后才能办理这项事务。');
  const usage = await consumeSiteDailyUse(connection, Number(player.id), site.code, action); const weather = await weatherStateForRegion(connection, Number(player.region_id));
  let text = ''; let reward = 0; let materialName = ''; let clues: string[] = []; let shelterUntil: Date | null = null; let commission: CommissionBriefing | null = null;
  if (action === 'commission') {
    const dayKey = new Date().toISOString().slice(0, 10); const seed = hash(`${player.id}:${site.code}:${dayKey}`);
    const target = await commissionTargetFor(connection, Number(player.region_id), site.code, seed);
    const plan = commissionPlanFor(seed, { issuerName: attendant.name, sourceName: site.name, targetName: target.name, regionName: player.region_name, regionCode: player.region_code });
    reward = commissionRewardFor(Number(site.region_danger), Number(site.worldline_stage ?? 0), plan);
    const title = `【${plan.type}】${plan.title}`;
    const objective = conciseCommissionObjective(target.name, plan.handoff);
    const [insert] = await connection.execute<ResultSetHeader>('INSERT INTO player_world_site_commissions (character_id,source_site_code,target_site_code,title,objective_text,reward_copper) VALUES (?,?,?,?,?,?)', [player.id, site.code, target.code, title, objective, reward]);
    await connection.execute("UPDATE world_dynamic_npc_states SET state_json=JSON_SET(state_json,'$.serviceUntil',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 30 MINUTE),'%Y-%m-%d %H:%i:%s')),next_action_at=LEAST(next_action_at,NOW()) WHERE JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.homeSite'))=?", [target.code]);
    const affinity = await npcAffinityFor(connection, Number(player.id), attendant.code);
    commission = commissionBriefingFor({ npcCode: attendant.code, affinity, variant: seed, issuerName: attendant.name, title, plan, targetName: target.name, backdrop: commissionBackdropFor(player.region_code, player.region_name), dangerLevel: Number(site.region_danger), worldlineStage: Number(site.worldline_stage ?? 0), reward });
    text = `已接受「${title}」。前往${target.name}完成交接后，可在任务栏领取报酬。`;
    await writeLedger(connection, 'site.commission', 'accepted', site.code, { commissionId: Number(insert.insertId), type: plan.type, title, reason: plan.reason, handoff: plan.handoff, targetSite: target.code, reward, affinityAtAcceptance: affinity }, Number(player.id), Number(player.region_id));
  } else if (action === 'forecast') {
    const detail = weatherText[weather.anomalyCode ?? weather.weatherCode] ?? weatherText.clear;
    text = `${detail.name}｜强度 ${weather.intensity}/3｜${weatherPhaseLabel[weather.phase]}。${detail.description} ${weatherModifiersFor(weather.weatherCode, weather.anomalyCode, weather.intensity).hint}；自然演变预计在 ${weather.transitionDueAt.toLocaleString('zh-CN', { hour12: false })} 附近发生。`;
  } else if (action === 'exchange') {
    const materialCode = regionMaterialCode[player.region_code]; if (!materialCode) throw new Error('这个地区暂未登记可供交换的区域材料。');
    const [items] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=? LIMIT 1', [materialCode]); const item = items[0]; if (!item) throw new Error('区域材料定义缺失。');
    const [inventoryRows] = await connection.execute<(RowDataPacket & { quantity: number })[]>('SELECT quantity FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE', [player.id, item.id]);
    if (Number(inventoryRows[0]?.quantity ?? 0) < 3) throw new Error(`交换需要 3 个${item.name}。`);
    await connection.execute('UPDATE player_inventory SET quantity=quantity-3 WHERE character_id=? AND item_id=?', [player.id, item.id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [player.id, item.id]);
    reward = 30 + Math.min(20, Number(site.worldline_stage ?? 0)); materialName = item.name; await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [reward, player.id]); text = `你交付了区域材料，站点按当日行情结算铜币 ×${reward}。`;
  } else if (action === 'clues') {
    const [rows] = await connection.execute<(RowDataPacket & { flag_code: string; value_int: number })[]>('SELECT flag_code,value_int FROM player_destiny_flags WHERE character_id=? AND (flag_code LIKE ? OR flag_code LIKE ?) ORDER BY updated_at DESC LIMIT 8', [player.id, `${player.region_code}_%`, `${site.worldline_code ?? ''}%`]);
    clues = rows.map((row, index) => `区域线索 ${index + 1}（已记录 ${Number(row.value_int)} 次）`); text = clues.length ? `档案阁为你调出已发现线索：${clues.join('、')}。` : '档案阁暂未找到你在本区域留下的可回看线索；完成奇遇后再来试试。';
  } else {
    await connection.execute(`INSERT INTO player_weather_shelters (character_id,region_id,site_code,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 35 MINUTE))
      ON DUPLICATE KEY UPDATE region_id=VALUES(region_id),site_code=VALUES(site_code),expires_at=VALUES(expires_at)`, [player.id, player.region_id, site.code]);
    shelterUntil = new Date(Date.now() + 35 * 60_000); text = '你在站点补充了防护物资。接下来 35 分钟内，于本区域开启的战斗会获得天气庇护。';
  }
  await writeLedger(connection, 'site.action', action, site.code, { siteType: site.site_type, usage, reward, materialName, clues, shelterUntil: shelterUntil?.toISOString() ?? null }, Number(player.id), Number(player.region_id));
  return { siteName: site.name, action, usage, text, reward, materialName, clues, shelterUntil, commission };
});

export const snapshotCombatEnvironment = async (connection: PoolConnection, sessionId: string, regionId: number, characterIds: number[] = []) => {
  const [existing] = await connection.execute<(RowDataPacket & { region_id: number; weather_code: string; intensity: number; anomaly_code: string | null; modifiers_json: unknown })[]>('SELECT region_id,weather_code,intensity,anomaly_code,modifiers_json FROM combat_environment_snapshots WHERE session_id=? LIMIT 1', [sessionId]);
  if (existing[0]) return { regionId: Number(existing[0].region_id), weatherCode: existing[0].weather_code, intensity: Number(existing[0].intensity), anomalyCode: existing[0].anomaly_code, modifiers: json<WeatherModifiers>(existing[0].modifiers_json, weatherModifiersFor(existing[0].weather_code, existing[0].anomaly_code, Number(existing[0].intensity))) };
  const weather = await weatherStateForRegion(connection, regionId); const modifiers = weatherModifiersFor(weather.weatherCode, weather.anomalyCode, weather.intensity);
  if (characterIds.length) {
    const placeholders = characterIds.map(() => '?').join(',');
    const [shelters] = await connection.execute<(RowDataPacket & { character_id: number })[]>(`SELECT character_id FROM player_weather_shelters WHERE region_id=? AND expires_at>NOW() AND character_id IN (${placeholders})`, [regionId, ...characterIds]);
    if (shelters.length) modifiers.shelteredCharacterIds = shelters.map(row => Number(row.character_id));
  }
  await connection.execute('INSERT INTO combat_environment_snapshots (session_id,region_id,weather_code,intensity,anomaly_code,modifiers_json) VALUES (?,?,?,?,?,?)', [sessionId, regionId, weather.weatherCode, weather.intensity, weather.anomalyCode, JSON.stringify(modifiers)]);
  return { regionId, weatherCode: weather.weatherCode, intensity: weather.intensity, anomalyCode: weather.anomalyCode, modifiers };
};

export const combatEnvironmentFor = async (connection: Db, sessionId: string) => {
  const [rows] = await connection.execute<(RowDataPacket & { region_id: number; weather_code: string; intensity: number; anomaly_code: string | null; modifiers_json: unknown })[]>('SELECT region_id,weather_code,intensity,anomaly_code,modifiers_json FROM combat_environment_snapshots WHERE session_id=? LIMIT 1', [sessionId]); const row = rows[0]; if (!row) return null;
  const modifiers = json<WeatherModifiers>(row.modifiers_json, weatherModifiersFor(row.weather_code, row.anomaly_code, Number(row.intensity)));
  return { regionId: Number(row.region_id), weatherCode: row.weather_code, intensity: Number(row.intensity), anomalyCode: row.anomaly_code, name: (weatherText[row.anomaly_code ?? row.weather_code] ?? weatherText.clear).name, hint: modifiers.hint, modifiers };
};

export const recordExplorationMovement = async (qqUserId: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const cellX = Math.floor(Number(player.pos_x) / 8); const cellY = Math.floor(Number(player.pos_y) / 8); const cellZ = Number(player.pos_z);
  const [rows] = await connection.execute<(RowDataPacket & { window_started_at: Date; effective_exposure: number; last_region_id: number | null; last_cell_x: number | null; last_cell_y: number | null; last_cell_z: number | null })[]>('SELECT window_started_at,effective_exposure,last_region_id,last_cell_x,last_cell_y,last_cell_z FROM player_exploration_budgets WHERE character_id=? FOR UPDATE', [player.id]);
  const row = rows[0]; const expired = !row || Date.now() - new Date(row.window_started_at).getTime() >= 10 * 60_000; const changed = expired || !row || Number(row.last_region_id) !== Number(player.region_id) || Number(row.last_cell_x) !== cellX || Number(row.last_cell_y) !== cellY || Number(row.last_cell_z) !== cellZ; const exposure = changed ? Math.min(12, (expired ? 0 : Number(row?.effective_exposure ?? 0)) + 1) : Number(row?.effective_exposure ?? 0);
  if (!row) await connection.execute('INSERT INTO player_exploration_budgets (character_id,effective_exposure,last_region_id,last_cell_x,last_cell_y,last_cell_z) VALUES (?,?,?,?,?,?)', [player.id, exposure, player.region_id, cellX, cellY, cellZ]);
  else if (changed) await connection.execute('UPDATE player_exploration_budgets SET window_started_at=IF(?,NOW(),window_started_at),effective_exposure=?,last_region_id=?,last_cell_x=?,last_cell_y=?,last_cell_z=? WHERE character_id=?', [expired ? 1 : 0, exposure, player.region_id, cellX, cellY, cellZ, player.id]);
  if (changed) await writeLedger(connection, 'exploration.exposure', 'recorded', 'grid_crossing', { cellX, cellY, cellZ, exposure }, Number(player.id), Number(player.region_id)); return { exposure, changed };
});

const activeEncounterFor = async (connection: PoolConnection, characterId: number, lock = false) => {
  const [expired] = await connection.execute<(RowDataPacket & { id: string; region_id: number; template_code: string; node_code: string })[]>("SELECT id,region_id,template_code,node_code FROM player_encounter_instances WHERE character_id=? AND status='active' AND expires_at<=NOW() FOR UPDATE", [characterId]);
  await connection.execute("UPDATE player_encounter_instances SET status='expired' WHERE character_id=? AND status='active' AND expires_at<=NOW()", [characterId]);
  for (const row of expired) await writeLedger(connection, 'encounter.expired', 'expired', row.template_code, { node: row.node_code }, characterId, Number(row.region_id), row.id);
  const [rows] = await connection.execute<(RowDataPacket & { id: string; region_id: number; template_code: string; node_code: string; context_json: unknown; expires_at: Date; title: string; definition_json: unknown })[]>(`SELECT i.id,i.region_id,i.template_code,i.node_code,i.context_json,i.expires_at,t.title,t.definition_json FROM player_encounter_instances i JOIN dynamic_encounter_templates t ON t.code=i.template_code WHERE i.character_id=? AND i.status='active' ORDER BY i.opened_at DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  return rows[0] ?? null;
};
/** 已创建的实例永远读取自己的定义快照；后台调整内容只影响后续新奇遇。 */
const definitionForInstance = (row: { definition_json: unknown; context_json: unknown }) => {
  const context = json<{ definitionSnapshot?: EncounterDefinition }>(row.context_json, {});
  return context.definitionSnapshot ?? json<EncounterDefinition>(row.definition_json, { opening: '一段未能辨明的奇遇正在消散。', choices: [] });
};
const renderEncounter = (row: NonNullable<Awaited<ReturnType<typeof activeEncounterFor>>>, regionName: string): Encounter => {
  const definition = definitionForInstance(row); const context = json<{ weatherName?: string; titleSnapshot?: string; regionName?: string; patrol?: PatrolContext }>(row.context_json, {});
  const node: DynamicEncounterNode = definition.nodes?.[row.node_code] ?? { text: definition.opening ?? '一段未能辨明的奇遇正在消散。', choices: definition.choices ?? [] };
  return { id: row.id, title: context.titleSnapshot ?? row.title, opening: node.text, choices: node.choices, expiresAt: new Date(row.expires_at), weatherName: context.weatherName ?? '未知天气', regionName: context.regionName ?? regionName, nodeCode: row.node_code, patrol: context.patrol, objective: context.patrol ? patrolObjective(context.patrol, row.node_code) : undefined };
};
const recordBudgetProbe = async (connection: PoolConnection, player: Awaited<ReturnType<typeof playerContext>>) => {
  const cellX = Math.floor(Number(player.pos_x) / 8); const cellY = Math.floor(Number(player.pos_y) / 8); const cellZ = Number(player.pos_z);
  const [rows] = await connection.execute<(RowDataPacket & { last_region_id: number | null; last_cell_x: number | null; last_cell_y: number | null; last_cell_z: number | null })[]>('SELECT last_region_id,last_cell_x,last_cell_y,last_cell_z FROM player_exploration_budgets WHERE character_id=? FOR UPDATE', [player.id]); const row = rows[0];
  const sameCell = row && Number(row.last_region_id) === Number(player.region_id) && Number(row.last_cell_x) === cellX && Number(row.last_cell_y) === cellY && Number(row.last_cell_z) === cellZ;
  if (!row) await connection.execute('INSERT INTO player_exploration_budgets (character_id,effective_exposure,last_region_id,last_cell_x,last_cell_y,last_cell_z) VALUES (?,?,?,?,?,?)', [player.id, 1, player.region_id, cellX, cellY, cellZ]);
  else if (!sameCell) await connection.execute('UPDATE player_exploration_budgets SET effective_exposure=LEAST(12,effective_exposure+1),last_region_id=?,last_cell_x=?,last_cell_y=?,last_cell_z=? WHERE character_id=?', [player.region_id, cellX, cellY, cellZ, player.id]);
};

export const currentDynamicEncounter = async (qqUserId: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const active = await activeEncounterFor(connection, Number(player.id), true); return active ? renderEncounter(active, player.region_name) : null;
});
const patrolAtPlayer = async (connection: PoolConnection, player: Awaited<ReturnType<typeof playerContext>>) => {
  const [rows] = await connection.execute<(RowDataPacket & { code: string; action_revision: number; status: string; state_json: unknown; next_action_at: Date; danger_level: number })[]>(`SELECT d.code,d.action_revision,d.status,d.state_json,d.next_action_at,r.danger_level
    FROM world_dynamic_npc_states d JOIN map_npcs n ON n.code=d.code AND n.region_id=d.region_id AND n.interaction_kind='npc'
    JOIN map_regions r ON r.id=d.region_id
    WHERE d.region_id=? AND n.pos_x=? AND n.pos_y=? AND n.pos_z=? AND d.status IN ('patrolling','responding')
    AND NOT EXISTS (SELECT 1 FROM map_npcs b WHERE b.code=JSON_UNQUOTE(JSON_EXTRACT(d.state_json,'$.homeSite')) AND b.region_id=n.region_id AND b.pos_x=n.pos_x AND b.pos_y=n.pos_y AND b.pos_z=n.pos_z)
    ORDER BY d.code FOR UPDATE`, [player.region_id, player.pos_x, player.pos_y, player.pos_z]);
  return rows;
};
export const patrolEncounterPreview = async (qqUserId: string, npcCode: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true);
  const npc = (await patrolAtPlayer(connection, player)).find(row => row.code === npcCode);
  const profile = dynamicNpcProfile(npcCode);
  if (!npc || !profile) return null;
  if (npc.status === 'responding') return { revision: Number(npc.action_revision), text: `${profile.displayName}正在处理附近的公共奇遇。你可以查看现场，再决定如何协助。`, responding: true };
  const state = json<{ routeIndex?: number }>(npc.state_json, {});
  const kind = patrolKindFor(Number(state.routeIndex ?? 1), Number(npc.action_revision), profile.homeIndex);
  const affinity = await npcAffinityFor(connection, Number(player.id), npcCode);
  const content = buildPatrolEncounter(npcCode, kind, '附近的公共站点', affinity);
  return { revision: Number(npc.action_revision), text: content.opening, responding: false };
});

export const startPatrolEncounter = async (qqUserId: string, npcCode: string, revision: number) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true);
  const active = await activeEncounterFor(connection, Number(player.id), true);
  if (active) {
    const patrol = json<{ patrol?: PatrolContext }>(active.context_json, {}).patrol;
    if (patrol?.npcCode === npcCode && patrol.revision === revision) return renderEncounter(active, player.region_name);
    throw new Error('请先完成当前奇遇；可在“/奇遇”查看进展。');
  }
  const npc = (await patrolAtPlayer(connection, player)).find(row => row.code === npcCode);
  const profile = dynamicNpcProfile(npcCode);
  if (!npc || !profile || npc.status !== 'patrolling' || Number(npc.action_revision) !== revision) throw new Error('这段巡查已经改变，请到域民身边重新询问行程。');
  const [previous] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_patrol_encounters WHERE character_id=? AND npc_code=? AND (visit_revision=? OR accepted_date=CURDATE()) LIMIT 1', [player.id, npcCode, revision]);
  if (previous.length) throw new Error('你已经参与过这位域民今日的巡查，明日再来听新的见闻吧。');
  const [daily] = await connection.execute<(RowDataPacket & { total: number; recent: number })[]>('SELECT COUNT(*) AS total,COALESCE(SUM(created_at>DATE_SUB(NOW(),INTERVAL 20 MINUTE)),0) AS recent FROM player_patrol_encounters WHERE character_id=? AND (accepted_date=CURDATE() OR created_at>DATE_SUB(NOW(),INTERVAL 20 MINUTE))', [player.id]);
  if (Number(daily[0]?.total) >= 3) throw new Error('你今日已经接手三次巡查，先消化这些见闻吧。');
  if (Number(daily[0]?.recent)) throw new Error('刚接手的巡查还需要整理，距上次参与满二十分钟后再来。');
  const [targets] = await connection.execute<(RowDataPacket & { name: string; x: number; y: number; z: number })[]>(`SELECT s.name,n.pos_x AS x,n.pos_y AS y,n.pos_z AS z FROM world_site_states s JOIN map_npcs n ON n.code=s.code AND n.region_id=s.region_id AND n.interaction_kind='building'
    WHERE s.region_id=? AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.state_json,'$.access')),'public')='public' AND NOT(n.pos_x=? AND n.pos_y=? AND n.pos_z=?) ORDER BY ABS(n.pos_x-?)+ABS(n.pos_y-?),s.code LIMIT 1`, [player.region_id, player.pos_x, player.pos_y, player.pos_z, player.pos_x, player.pos_y]);
  const target = targets[0]; if (!target) throw new Error('附近暂时没有适合交接的公共落脚处。');
  const [parties] = await connection.execute<(RowDataPacket & { party_id: number })[]>('SELECT party_id FROM party_members WHERE character_id=? LIMIT 1', [player.id]);
  const teamKey = parties[0] ? `party:${parties[0].party_id}` : `solo:${player.id}`;
  // 同一个 NPC 的调度行已加锁；结伴与临时换队仍受现场最多三份资源报酬的硬上限约束。
  const [claims] = await connection.execute<(RowDataPacket & { total: number; team_count: number })[]>('SELECT COALESCE(SUM(rewarded),0) AS total,COALESCE(SUM(rewarded=1 AND team_key=?),0) AS team_count FROM player_patrol_encounters WHERE npc_code=? AND visit_revision=?', [teamKey, npcCode, revision]);
  const rewarded = Number(claims[0]?.total) < 3 && Number(claims[0]?.team_count) === 0;
  const state = json<{ routeIndex?: number }>(npc.state_json, {});
  const kind = patrolKindFor(Number(state.routeIndex ?? 1), revision, profile.homeIndex);
  const region = dynamicWorldRegions.find(row => row.npcs.some(npc => npc.code === npcCode))!;
  const [worldlines] = await connection.execute<(RowDataPacket & { stage: number })[]>('SELECT stage FROM worldline_states WHERE code=?', [region.worldline]);
  const weather = await weatherStateForRegion(connection, Number(player.region_id));
  const content = buildPatrolEncounter(npcCode, kind, target.name, await npcAffinityFor(connection, Number(player.id), npcCode), Number(worldlines[0]?.stage ?? 0), revision, rewarded ? 12 + Math.min(20, Math.max(0, Number(npc.danger_level)) * 2) : 0);
  const patrol: PatrolContext = { npcCode, revision, kind, rewarded, origin: { regionId: Number(player.region_id), name: `${profile.name}的巡查现场`, x: Number(player.pos_x), y: Number(player.pos_y), z: Number(player.pos_z) }, target: { regionId: Number(player.region_id), name: target.name, x: Number(target.x), y: Number(target.y), z: Number(target.z) } };
  const templateCode = `patrol_${npcCode}_${kind}`; const id = randomUUID();
  // 巡游模板不进入随机探索池；实例快照保存本次情境及奖励资格。
  await connection.execute(`INSERT IGNORE INTO dynamic_encounter_templates (code,title,region_codes_json,weather_codes_json,min_exposure,weight,definition_json,is_enabled) VALUES (?,?,?, ?,0,0,?,0)`, [templateCode, content.title, JSON.stringify([region.code]), JSON.stringify(region.weather), JSON.stringify(content.definition)]);
  await connection.execute(`INSERT INTO player_encounter_instances (id,character_id,region_id,template_code,context_json,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))`, [id, player.id, player.region_id, templateCode, JSON.stringify({ patrol, regionName: player.region_name, titleSnapshot: content.title, weatherName: (weatherText[weather.anomalyCode ?? weather.weatherCode] ?? weatherText.clear).name, weatherRevision: weather.revision, definitionSnapshot: content.definition })]);
  await connection.execute('INSERT INTO player_patrol_encounters (character_id,npc_code,visit_revision,encounter_id,team_key,rewarded,accepted_date) VALUES (?,?,?,?,?,?,CURDATE())', [player.id, npcCode, revision, id, teamKey, rewarded ? 1 : 0]);
  await writeLedger(connection, 'patrol.opened', 'accepted', npcCode, { patrol, teamKey, reason: content.reason, weatherRevision: weather.revision }, Number(player.id), Number(player.region_id), id);
  return renderEncounter({ id, region_id: Number(player.region_id), template_code: templateCode, node_code: 'opening', context_json: { patrol, regionName: player.region_name, titleSnapshot: content.title, definitionSnapshot: content.definition }, expires_at: new Date(Date.now() + 30 * 60_000), title: content.title, definition_json: content.definition } as NonNullable<Awaited<ReturnType<typeof activeEncounterFor>>>, player.region_name);
});
export const offerDynamicEncounter = async (qqUserId: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const active = await activeEncounterFor(connection, Number(player.id), true); if (active) return renderEncounter(active, player.region_name);
  await recordBudgetProbe(connection, player); const [budgetRows] = await connection.execute<(RowDataPacket & { effective_exposure: number; trigger_count: number; cooldown_until: Date | null })[]>('SELECT effective_exposure,trigger_count,cooldown_until FROM player_exploration_budgets WHERE character_id=? FOR UPDATE', [player.id]); const budget = budgetRows[0]!;
  if (budget.cooldown_until && new Date(budget.cooldown_until).getTime() > Date.now()) return null;
  const weather = await weatherStateForRegion(connection, Number(player.region_id)); const visibleWeather = weather.anomalyCode ?? weather.weatherCode;
  const [templateRows] = await connection.execute<(RowDataPacket & { code: string; title: string; region_codes_json: unknown; weather_codes_json: unknown; min_exposure: number; weight: number; definition_json: unknown })[]>('SELECT code,title,region_codes_json,weather_codes_json,min_exposure,weight,definition_json FROM dynamic_encounter_templates WHERE is_enabled=1');
  const candidates = templateRows.map(row => ({ code: row.code, title: row.title, regions: json<string[]>(row.region_codes_json, []), weather: json<string[]>(row.weather_codes_json, []), minExposure: Number(row.min_exposure), weight: Math.max(1, Number(row.weight)), definition: json<EncounterDefinition>(row.definition_json, { choices: [] }) }))
    .filter(template => !template.code.startsWith('patrol_') && template.regions.includes(player.region_code) && template.weather.includes(visibleWeather) && Number(budget.effective_exposure) >= template.minExposure);
  if (!candidates.length || hash(`${player.id}:${budget.trigger_count}:${weather.revision}`) % 100 >= 38) return null;
  let pick = hash(`${player.id}:${budget.trigger_count}:template`) % candidates.reduce((sum, template) => sum + template.weight, 0);
  const template = candidates.find(item => (pick -= item.weight) < 0) ?? candidates[candidates.length - 1]!; const id = randomUUID(); const weatherName = (weatherText[visibleWeather] ?? weatherText.clear).name;
  const definition = template.definition; const cellX = Math.floor(Number(player.pos_x) / 8); const cellY = Math.floor(Number(player.pos_y) / 8); const cellZ = Number(player.pos_z);
  let sceneId: string | undefined;
  if (definition.publicScene) {
    await connection.execute("UPDATE world_scene_instances SET status='expired' WHERE status='active' AND expires_at<=NOW()");
    const [scenes] = await connection.execute<(RowDataPacket & { id: string })[]>(`SELECT id FROM world_scene_instances WHERE template_code=? AND region_id=? AND cell_x=? AND cell_y=? AND cell_z=? AND status='active' AND expires_at>NOW() LIMIT 1 FOR UPDATE`, [template.code, player.region_id, cellX, cellY, cellZ]);
    sceneId = scenes[0]?.id ?? randomUUID();
    if (!scenes[0]) {
      await connection.execute(`INSERT INTO world_scene_instances (id,template_code,region_id,cell_x,cell_y,cell_z,discoverer_character_id,expires_at,payload_json)
        VALUES (?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 15 MINUTE),?)`, [sceneId, template.code, player.region_id, cellX, cellY, cellZ, player.id, JSON.stringify({ weatherName, weatherRevision: weather.revision, definitionSnapshot: definition })]);
      await connection.execute(`INSERT INTO world_scene_participants (scene_id,character_id,role) VALUES (?,?,'discoverer')`, [sceneId, player.id]);
      for (const npcCode of definition.relatedNpcCodes ?? []) await connection.execute('UPDATE world_dynamic_npc_states SET next_action_at=NOW() WHERE code=?', [npcCode]);
      await writeLedger(connection, 'scene.opened', 'active', template.code, { cellX, cellY, cellZ }, Number(player.id), Number(player.region_id), sceneId);
    }
  }
  await connection.execute('INSERT INTO player_encounter_instances (id,character_id,region_id,template_code,context_json,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 15 MINUTE))', [id, player.id, player.region_id, template.code, JSON.stringify({ weatherCode: weather.weatherCode, anomalyCode: weather.anomalyCode, weatherName, weatherRevision: weather.revision, sceneId, titleSnapshot: template.title, definitionSnapshot: definition, relatedSiteCodes: definition.relatedSiteCodes ?? [], relatedNpcCodes: definition.relatedNpcCodes ?? [] })]);
  await connection.execute('UPDATE player_exploration_budgets SET effective_exposure=0,trigger_count=trigger_count+1,cooldown_until=DATE_ADD(NOW(),INTERVAL 5 MINUTE) WHERE character_id=?', [player.id]);
  await writeLedger(connection, 'encounter.opened', 'active', template.code, { weather: weather.weatherCode, anomaly: weather.anomalyCode, weatherRevision: weather.revision, relatedSiteCodes: definition.relatedSiteCodes ?? [], relatedNpcCodes: definition.relatedNpcCodes ?? [] }, Number(player.id), Number(player.region_id), id);
  const [created] = await connection.execute<(RowDataPacket & { id: string; region_id: number; template_code: string; node_code: string; context_json: unknown; expires_at: Date; title: string; definition_json: unknown })[]>('SELECT i.id,i.region_id,i.template_code,i.node_code,i.context_json,i.expires_at,t.title,t.definition_json FROM player_encounter_instances i JOIN dynamic_encounter_templates t ON t.code=i.template_code WHERE i.id=? LIMIT 1', [id]);
  return renderEncounter(created[0]!, player.region_name);
});

const applyWorldlineEffects = async (connection: PoolConnection, worldline: string, actorCharacterId: number, regionId: number, encounterId: string) => {
  const [worldlines] = await connection.execute<(RowDataPacket & { stage: number })[]>('SELECT stage FROM worldline_states WHERE code=? FOR UPDATE', [worldline]); const stage = Number(worldlines[0]?.stage ?? 0);
  const siteState = stage >= 12 ? 'active' : stage >= 5 ? 'stirring' : 'dormant';
  const [sites] = await connection.execute<any>(`UPDATE world_site_states SET state_json=JSON_SET(state_json,'$.state',?,'$.worldlineStage',?)
    WHERE JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.relatedWorldline'))=?`, [siteState, stage, worldline]);
  const [gates] = await connection.execute<any>(`UPDATE world_boss_gates SET state='ready',activated_at=COALESCE(activated_at,NOW())
    WHERE worldline_code=? AND state='locked' AND stage_required<=?`, [worldline, stage]);
  if (Number(sites.affectedRows) || Number(gates.affectedRows)) await writeLedger(connection, 'worldline.updated', Number(gates.affectedRows) ? 'boss_ready' : 'site_updated', worldline, { stage, siteState, sites: Number(sites.affectedRows), bossGates: Number(gates.affectedRows) }, actorCharacterId, regionId, encounterId);
  return { stage, siteState, bossReady: Number(gates.affectedRows) > 0 };
};

const grantHiddenReward = async (connection: PoolConnection, characterId: number, encounterId: string, choice: EncounterChoice) => {
  if (!choice.rewardCode || !choice.rewardChance || hash(`${encounterId}:${choice.code}:reward`) % 10_000 >= Math.floor(choice.rewardChance * 10_000)) return null;
  const [inserted] = await connection.execute<any>('INSERT IGNORE INTO player_encounter_rewards (character_id,reward_code,encounter_id) VALUES (?,?,?)', [characterId, choice.rewardCode, encounterId]);
  const [items] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=? LIMIT 1', [choice.rewardCode]); const item = items[0]; if (!item) return null;
  if (!Number(inserted.affectedRows)) return { name: item.name, duplicate: true };
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1,acquired_at=NOW()', [characterId, item.id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, item.id]);
  return { name: item.name, duplicate: false };
};

const settleSceneWitnesses = async (connection: PoolConnection, sceneId: string, copper: number, regionId: number, templateCode: string) => {
  const [sceneRows] = await connection.execute<(RowDataPacket & { discoverer_character_id: number; status: string })[]>('SELECT discoverer_character_id,status FROM world_scene_instances WHERE id=? FOR UPDATE', [sceneId]); const scene = sceneRows[0];
  if (!scene || scene.status !== 'active') return 0;
  await connection.execute("UPDATE world_scene_instances SET status='resolved',resolved_at=NOW() WHERE id=?", [sceneId]);
  const [participants] = await connection.execute<(RowDataPacket & { character_id: number; role: string; contribution_code: string | null })[]>("SELECT p.character_id,p.role,c.contribution_code FROM world_scene_participants p LEFT JOIN world_scene_contributions c ON c.scene_id=p.scene_id AND c.character_id=p.character_id WHERE p.scene_id=? AND p.reward_claimed_at IS NULL AND p.role IN ('witness','assistant') FOR UPDATE", [sceneId]);
  const witnessCopper = Math.max(1, Math.floor(copper * .25));
  for (const participant of participants) {
    const contributionCopper = participant.role === 'assistant' && participant.contribution_code ? Math.max(witnessCopper, Math.floor(copper * .4)) : witnessCopper;
    await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [contributionCopper, participant.character_id]);
    await connection.execute('UPDATE world_scene_participants SET reward_claimed_at=NOW() WHERE scene_id=? AND character_id=?', [sceneId, participant.character_id]);
    if (participant.contribution_code) await connection.execute('UPDATE world_scene_contributions SET settled_at=NOW() WHERE scene_id=? AND character_id=? AND settled_at IS NULL', [sceneId, participant.character_id]);
  }
  await writeLedger(connection, 'scene.resolved', 'shared_reward', templateCode, { witnesses: participants.length, baseCopperEach: witnessCopper, contributors: participants.filter(item => item.contribution_code).length }, Number(scene.discoverer_character_id), regionId, sceneId);
  return participants.length;
};

export const nearbyDynamicScenes = async (qqUserId: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const cellX = Math.floor(Number(player.pos_x) / 8); const cellY = Math.floor(Number(player.pos_y) / 8); const cellZ = Number(player.pos_z);
  await connection.execute("UPDATE world_scene_instances SET status='expired' WHERE status='active' AND expires_at<=NOW()");
  const [rows] = await connection.execute<(RowDataPacket & { id: string; title: string; discoverer_name: string; expires_at: Date; participant_count: number; cell_x: number; cell_y: number; cell_z: number })[]>(`SELECT s.id,t.title,c.name AS discoverer_name,s.expires_at,COUNT(p.character_id) AS participant_count,s.cell_x,s.cell_y,s.cell_z
    FROM world_scene_instances s JOIN dynamic_encounter_templates t ON t.code=s.template_code JOIN characters c ON c.id=s.discoverer_character_id LEFT JOIN world_scene_participants p ON p.scene_id=s.id
    WHERE s.region_id=? AND s.status='active' AND s.expires_at>NOW() AND ABS(s.cell_x-?)<=1 AND ABS(s.cell_y-?)<=1 AND s.cell_z=?
    GROUP BY s.id,t.title,c.name,s.expires_at,s.cell_x,s.cell_y,s.cell_z ORDER BY s.expires_at LIMIT 8`, [player.region_id, cellX, cellY, cellZ]);
  return rows.map(row => ({ id: row.id, title: row.title, discovererName: row.discoverer_name, expiresAt: new Date(row.expires_at), participantCount: Number(row.participant_count), distance: Math.abs(Number(row.cell_x) - cellX) + Math.abs(Number(row.cell_y) - cellY) }));
});

export const joinDynamicScene = async (qqUserId: string, sceneId: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const cellX = Math.floor(Number(player.pos_x) / 8); const cellY = Math.floor(Number(player.pos_y) / 8); const cellZ = Number(player.pos_z);
  await connection.execute("UPDATE world_scene_instances SET status='expired' WHERE id=? AND status='active' AND expires_at<=NOW()", [sceneId]);
  const [scenes] = await connection.execute<(RowDataPacket & { template_code: string; region_id: number; cell_x: number; cell_y: number; cell_z: number; status: string; expires_at: Date })[]>('SELECT template_code,region_id,cell_x,cell_y,cell_z,status,expires_at FROM world_scene_instances WHERE id=? FOR UPDATE', [sceneId]); const scene = scenes[0];
  if (!scene || scene.status !== 'active' || new Date(scene.expires_at).getTime() <= Date.now()) throw new Error('这个公共奇遇已经结束。');
  if (Number(scene.region_id) !== Number(player.region_id) || Math.abs(Number(scene.cell_x) - cellX) > 1 || Math.abs(Number(scene.cell_y) - cellY) > 1 || Number(scene.cell_z) !== cellZ) throw new Error('请先移动到奇遇附近一格以内，再参与。');
  const [existing] = await connection.execute<(RowDataPacket & { role: string })[]>('SELECT role FROM world_scene_participants WHERE scene_id=? AND character_id=? LIMIT 1 FOR UPDATE', [sceneId, player.id]);
  if (existing[0]) return { role: existing[0].role, alreadyJoined: true };
  const [countRows] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM world_scene_participants WHERE scene_id=? FOR UPDATE', [sceneId]);
  const [partyRows] = await connection.execute<(RowDataPacket & { party_id: number })[]>('SELECT party_id FROM party_members WHERE character_id=? LIMIT 1', [player.id]); const partyId = partyRows[0]?.party_id;
  const [partyWitnesses] = partyId ? await connection.execute<RowDataPacket[]>(`SELECT 1 FROM world_scene_participants p JOIN party_members pm ON pm.character_id=p.character_id WHERE p.scene_id=? AND pm.party_id=? AND p.role IN ('discoverer','witness','assistant') LIMIT 1`, [sceneId, partyId]) : [[] as RowDataPacket[]];
  const role = Number(countRows[0]?.total ?? 0) >= 6 || partyWitnesses[0] ? 'observer' : 'witness';
  await connection.execute('INSERT INTO world_scene_participants (scene_id,character_id,role) VALUES (?,?,?)', [sceneId, player.id, role]);
  await writeLedger(connection, 'scene.joined', role === 'observer' ? 'observer' : 'witness', scene.template_code, { antiCollusion: Boolean(partyWitnesses[0]), participantCount: Number(countRows[0]?.total ?? 0) + 1 }, Number(player.id), Number(player.region_id), sceneId);
  return { role, alreadyJoined: false };
});

type SceneContribution = 'escort' | 'decode' | 'supply';
const contributionText: Record<SceneContribution, string> = { escort: '护送', decode: '破译', supply: '物资支援' };
export const contributeDynamicScene = async (qqUserId: string, sceneId: string, contribution: SceneContribution) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const cellX = Math.floor(Number(player.pos_x) / 8); const cellY = Math.floor(Number(player.pos_y) / 8); const cellZ = Number(player.pos_z);
  await connection.execute("UPDATE world_scene_instances SET status='expired' WHERE id=? AND status='active' AND expires_at<=NOW()", [sceneId]);
  const [scenes] = await connection.execute<(RowDataPacket & { template_code: string; region_id: number; cell_x: number; cell_y: number; cell_z: number; status: string })[]>('SELECT template_code,region_id,cell_x,cell_y,cell_z,status FROM world_scene_instances WHERE id=? FOR UPDATE', [sceneId]); const scene = scenes[0];
  if (!scene || scene.status !== 'active' || Number(scene.region_id) !== Number(player.region_id) || Math.abs(Number(scene.cell_x) - cellX) > 1 || Math.abs(Number(scene.cell_y) - cellY) > 1 || Number(scene.cell_z) !== cellZ) throw new Error('请作为现场参与者，在公共奇遇一格范围内提供协作。');
  const [participants] = await connection.execute<(RowDataPacket & { role: string })[]>('SELECT role FROM world_scene_participants WHERE scene_id=? AND character_id=? FOR UPDATE', [sceneId, player.id]); const participant = participants[0];
  if (!participant || participant.role === 'observer') throw new Error('请先以见证者身份加入现场；旁观者不能贡献或领取协作奖励。');
  const [own] = await connection.execute<(RowDataPacket & { contribution_code: string })[]>('SELECT contribution_code FROM world_scene_contributions WHERE scene_id=? AND character_id=? FOR UPDATE', [sceneId, player.id]);
  if (own[0]) return { contribution: own[0].contribution_code as SceneContribution, alreadyContributed: true, text: `你已完成${contributionText[own[0].contribution_code as SceneContribution]}贡献，结算会保持幂等。` };
  const [cooldowns] = await connection.execute<(RowDataPacket & { cooldown_until: Date })[]>('SELECT cooldown_until FROM player_scene_contribution_cooldowns WHERE character_id=? AND contribution_code=? FOR UPDATE', [player.id, contribution]);
  if (cooldowns[0] && new Date(cooldowns[0].cooldown_until).getTime() > Date.now()) throw new Error(`「${contributionText[contribution]}」仍在角色冷却中，不能连续堆叠贡献。`);
  const [parties] = await connection.execute<(RowDataPacket & { party_id: string })[]>('SELECT party_id FROM party_members WHERE character_id=? LIMIT 1', [player.id]); const teamKey = parties[0] ? `party:${parties[0].party_id}` : `solo:${player.id}`;
  const [teamRows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM world_scene_contributions WHERE scene_id=? AND team_key=? LIMIT 1 FOR UPDATE', [sceneId, teamKey]);
  if (teamRows[0]) throw new Error('同一队伍在同一公共现场只能登记一份协作贡献。');
  let cost = 0; if (contribution === 'supply') { cost = 8; const [coins] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [player.id]); if (Number(coins[0]?.copper_coins ?? 0) < cost) throw new Error('物资支援需要 8 铜币。'); await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [cost, player.id]); }
  await connection.execute('INSERT INTO world_scene_contributions (scene_id,character_id,team_key,contribution_code,payload_json) VALUES (?,?,?,?,?)', [sceneId, player.id, teamKey, contribution, JSON.stringify({ distance: Math.abs(Number(scene.cell_x) - cellX) + Math.abs(Number(scene.cell_y) - cellY), cost })]);
  if (participant.role === 'witness') await connection.execute("UPDATE world_scene_participants SET role='assistant' WHERE scene_id=? AND character_id=?", [sceneId, player.id]);
  await connection.execute(`INSERT INTO player_scene_contribution_cooldowns (character_id,contribution_code,cooldown_until) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 20 MINUTE))
    ON DUPLICATE KEY UPDATE cooldown_until=VALUES(cooldown_until)`, [player.id, contribution]);
  await writeLedger(connection, 'scene.contribution', 'accepted', scene.template_code, { contribution, teamKey, cost }, Number(player.id), Number(player.region_id), sceneId);
  return { contribution, alreadyContributed: false, text: `已登记${contributionText[contribution]}。终局结算时将获得高于见证奖励的协作报酬。` };
});

export const resolveDynamicEncounter = async (qqUserId: string, choiceCode: string, requestedId?: string) => withTransaction(async connection => {
  const player = await playerContext(connection, qqUserId, true); const active = await activeEncounterFor(connection, Number(player.id), true); if (!active) throw new Error('当前没有可选择的奇遇。'); if (requestedId && requestedId !== active.id) throw new Error('这不是你当前有效的奇遇实例。');
  const definition = definitionForInstance(active); const node = definition.nodes?.[active.node_code] ?? { text: definition.opening ?? '', choices: definition.choices ?? [] }; const selected = node.choices.find(item => item.code === choiceCode); if (!selected) throw new Error('无效的奇遇选项。');
  const choice = { ...selected };
  const patrol = json<{ patrol?: PatrolContext }>(active.context_json, {}).patrol;
  if (patrol) {
    const objective = patrolObjective(patrol, active.node_code);
    if (choice.code !== 'leave' && !patrolPositionMatches(player, objective.location)) throw new Error(`请先抵达${objective.location.name}（${objective.location.x}, ${objective.location.y}, ${objective.location.z}），再完成这一步。`);
    if (!choice.nextNode && Number(choice.stage) > 0 && choice.worldline) {
      const [progress] = await connection.execute<ResultSetHeader>('INSERT IGNORE INTO patrol_world_progress (npc_code,visit_revision,encounter_id) VALUES (?,?,?)', [patrol.npcCode, patrol.revision, active.id]);
      choice.stage = 0;
      if (progress.affectedRows) {
        await connection.execute('INSERT IGNORE INTO worldline_daily_commission_progress (worldline_code,progress_date,contribution_count) VALUES (?,CURDATE(),0)', [choice.worldline]);
        const [quota] = await connection.execute<ResultSetHeader>('UPDATE worldline_daily_commission_progress SET contribution_count=contribution_count+1 WHERE worldline_code=? AND progress_date=CURDATE() AND contribution_count<?', [choice.worldline, worldlineCommissionDailyLimit]);
        choice.stage = quota.affectedRows ? 1 : 0;
      }
    }
  }
  await connection.execute('INSERT INTO player_encounter_decisions (encounter_id,node_code,choice_code,outcome_code,effects_json) VALUES (?,?,?,?,?)', [active.id, active.node_code, choice.code, choice.nextNode ? 'continued' : 'resolved', JSON.stringify({ copper: choice.copper ?? 0, flag: choice.flag, worldline: choice.worldline, stage: choice.stage ?? 0, nextNode: choice.nextNode })]);
  if (choice.nextNode) {
    const nextNode = definition.nodes?.[choice.nextNode]; if (!nextNode) throw new Error('奇遇分支配置缺失，已记录异常。');
    await connection.execute("UPDATE player_encounter_instances SET node_code=? WHERE id=? AND status='active'", [choice.nextNode, active.id]);
    await writeLedger(connection, 'encounter.resolved', 'continued', active.template_code, { node: active.node_code, choice: choice.code, nextNode: choice.nextNode }, Number(player.id), Number(player.region_id), active.id);
    return { ...renderEncounter({ ...active, node_code: choice.nextNode }, player.region_name), choice, worldline: '', completed: false, reward: null, sharedWitnesses: 0, worldlineResult: null };
  }
  const copper = Math.max(0, Number(choice.copper ?? 0)); const stage = Number(choice.stage ?? 0); const worldline = choice.worldline ?? ''; const flag = choice.flag ?? `${active.template_code}_${choice.code}`;
  await connection.execute("UPDATE player_encounter_instances SET status='resolved',resolved_at=NOW() WHERE id=? AND status='active'", [active.id]); if (copper > 0) await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [copper, player.id]);
  await connection.execute(`INSERT INTO player_destiny_flags (character_id,flag_code,value_int,context_json) VALUES (?,?,1,?) ON DUPLICATE KEY UPDATE value_int=value_int+1,context_json=VALUES(context_json)`, [player.id, flag, JSON.stringify({ encounterId: active.id, choice: choice.code })]);
  let worldlineResult: { stage: number; siteState: string; bossReady: boolean } | null = null;
  if (worldline && (!patrol || stage !== 0)) { await connection.execute(`UPDATE worldline_states SET stage=stage+?,state_json=JSON_SET(state_json,'$.lastDecision',?,'$.lastActor',?,'$.updatedByEncounter',true) WHERE code=?`, [stage, choice.code, player.id, worldline]); worldlineResult = await applyWorldlineEffects(connection, worldline, Number(player.id), Number(player.region_id), active.id); }
  const reward = await grantHiddenReward(connection, Number(player.id), active.id, choice); const context = json<{ sceneId?: string }>(active.context_json, {}); const sharedWitnesses = context.sceneId ? await settleSceneWitnesses(connection, context.sceneId, copper, Number(player.region_id), active.template_code) : 0;
  await writeLedger(connection, 'encounter.resolved', 'resolved', active.template_code, { choice: choice.code, copper, flag, worldline, stage, reward: reward?.name ?? null, sharedWitnesses }, Number(player.id), Number(player.region_id), active.id);
  if (patrol) await writeLedger(connection, 'patrol.resolved', 'completed', patrol.npcCode, { patrol, choice: choice.code, copper, stage, position: { x: player.pos_x, y: player.pos_y, z: player.pos_z } }, Number(player.id), Number(player.region_id), active.id);
  return { ...renderEncounter(active, player.region_name), choice: { ...choice, copper, flag, worldline, stage }, worldline, completed: true, reward, sharedWitnesses, worldlineResult };
});

export const advanceDynamicNpcs = async () => withTransaction(async connection => {
  await connection.execute("UPDATE world_scene_instances SET status='expired' WHERE status='active' AND expires_at<=NOW()");
  const [sceneRows] = await connection.execute<(RowDataPacket & { id: string; region_id: number; cell_x: number; cell_y: number; cell_z: number; payload_json: unknown; definition_json: unknown })[]>(`SELECT s.id,s.region_id,s.cell_x,s.cell_y,s.cell_z,s.payload_json,t.definition_json
    FROM world_scene_instances s JOIN dynamic_encounter_templates t ON t.code=s.template_code WHERE s.status='active' AND s.expires_at>NOW()`);
  const deployments = new Map<string, { sceneId: string; regionId: number; x: number; y: number; z: number }>();
  for (const scene of sceneRows) {
    const snapshot = json<{ definitionSnapshot?: EncounterDefinition }>(scene.payload_json, {}).definitionSnapshot ?? json<EncounterDefinition>(scene.definition_json, {});
    for (const npcCode of snapshot.relatedNpcCodes ?? []) deployments.set(npcCode, { sceneId: scene.id, regionId: Number(scene.region_id), x: Number(scene.cell_x) * 8 + 4, y: Number(scene.cell_y) * 8 + 4, z: Number(scene.cell_z) });
  }
  const [rows] = await connection.execute<(RowDataPacket & { code: string; name: string; region_id: number; status: string; route_json: unknown; state_json: unknown; action_revision: number })[]>('SELECT code,name,region_id,status,route_json,state_json,action_revision FROM world_dynamic_npc_states WHERE next_action_at<=NOW() FOR UPDATE');
  for (const npc of rows) {
    const route = json<RoutePoint[]>(npc.route_json, []); const home = route[0]; const previous = json<Record<string, unknown>>(npc.state_json, {}); const deployment = deployments.get(npc.code); const revision = Number(npc.action_revision) + 1;
    const homeRegionId = Number(previous.homeRegionId ?? npc.region_id); const homeStatus = String(previous.homeStatus ?? npc.status) === 'patrolling' ? 'stationed' : String(previous.homeStatus ?? npc.status); const homeDestination = isRoutePoint(home) ? { regionId: homeRegionId, x: home.x, y: home.y, z: home.z } : null;
    if (!deployment && !homeDestination) {
      await connection.execute('UPDATE world_dynamic_npc_states SET next_action_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE code=?', [npc.code]);
      continue;
    }
    const storedRouteIndex = Number(previous.routeIndex ?? 0);
    const routeIndex = Number.isFinite(storedRouteIndex) ? clamp(Math.trunc(storedRouteIndex), 0, Math.max(0, route.length - 1)) : 0;
    const patrolRoll = hash(`${npc.code}:patrol:${revision}`) % 100;
    const patrolRoute = route.slice(1).filter(isRoutePoint);
    let destination: { regionId: number; x: number; y: number; z: number };
    let nextStatus: string;
    let nextRouteIndex: number;
    let nextMinutes: number;
    let outcome: string;
    let currentPoint: string;
    let sceneId: string | null = null;
    if (deployment) {
      destination = deployment; nextStatus = 'responding'; nextRouteIndex = routeIndex; nextMinutes = 5; outcome = 'deployed'; currentPoint = '公共奇遇现场'; sceneId = deployment.sceneId;
    } else if (previous.specialSceneId || previous.serviceUntil && new Date(String(previous.serviceUntil)).getTime() > Date.now()) {
      destination = homeDestination!; nextStatus = homeStatus; nextRouteIndex = 0; nextMinutes = 8; outcome = 'returned'; currentPoint = home?.name ?? '常驻点';
    // 让常驻域民多数时间能被世界遇见：离站概率 72%，巡游途中续行概率 58%。
    } else if (patrolRoute.length && (npc.status === 'patrolling' ? patrolRoll < 58 : patrolRoll < 72)) {
      const currentPatrolOffset = Math.max(0, routeIndex - 1);
      const nextPatrolOffset = npc.status === 'patrolling'
        ? (currentPatrolOffset + 1) % patrolRoute.length
        : hash(`${npc.code}:route:${revision}`) % patrolRoute.length;
      const patrolPoint = patrolRoute[nextPatrolOffset]!;
      destination = { regionId: homeRegionId, x: patrolPoint.x, y: patrolPoint.y, z: patrolPoint.z };
      nextStatus = 'patrolling'; nextRouteIndex = nextPatrolOffset + 1; nextMinutes = 12; outcome = 'patrolling'; currentPoint = patrolPoint.name;
    } else {
      destination = homeDestination!; nextStatus = homeStatus; nextRouteIndex = 0; nextMinutes = 8; outcome = npc.status === 'patrolling' ? 'returned' : 'stationed'; currentPoint = home?.name ?? '常驻点';
    }
    const state = { ...previous, currentPoint, routeIndex: nextRouteIndex, specialSceneId: sceneId, deployedAt: deployment ? new Date().toISOString() : null };
    await connection.execute('UPDATE world_dynamic_npc_states SET region_id=?,status=?,state_json=?,action_revision=?,last_action_at=NOW(),next_action_at=DATE_ADD(NOW(),INTERVAL ? MINUTE) WHERE code=?', [destination.regionId, nextStatus, JSON.stringify(state), revision, nextMinutes, npc.code]);
    await connection.execute("UPDATE map_npcs SET region_id=?,pos_x=?,pos_y=?,pos_z=? WHERE code=? AND interaction_kind='npc'", [destination.regionId, destination.x, destination.y, destination.z, npc.code]);
    if (outcome !== 'stationed' || Number(npc.region_id) !== destination.regionId) await writeLedger(connection, 'npc.presence', outcome, npc.code, { name: npc.name, sceneId, position: { x: destination.x, y: destination.y, z: destination.z }, homeRegionId, currentPoint }, null, destination.regionId, sceneId);
  }
  return rows.length;
});

/** 已满足阈值的门只通过战斗服务的“自然激活”入口生成，绝不复用管理员强制刷新。 */
const activateReadyWorldlineBosses = async () => {
  const pool = await getPool(); const [gates] = await pool.execute<(RowDataPacket & { worldline_code: string; boss_code: string; state: string })[]>(`SELECT worldline_code,boss_code,state FROM world_boss_gates
    WHERE state='ready' OR (state='cooldown' AND (last_attempt_at IS NULL OR last_attempt_at<=DATE_SUB(NOW(),INTERVAL 30 MINUTE)))`);
  let activated = 0;
  for (const gate of gates) {
    try {
      const result = await (await import('./adventure.service')).activateWorldlineBoss(gate.boss_code);
      const nextState = result.state === 'spawned' || result.state === 'active' ? 'spawned' : result.state === 'cooldown' ? 'cooldown' : 'locked';
      await pool.execute('UPDATE world_boss_gates SET state=?,last_attempt_at=NOW() WHERE worldline_code=? AND boss_code=?', [nextState, gate.worldline_code, gate.boss_code]);
      await writeLedger(pool, 'worldline.boss_activation', result.state, gate.worldline_code, { bossCode: gate.boss_code }, null, null, null);
      if (nextState === 'spawned') activated += 1;
    } catch (error) {
      await pool.execute("UPDATE world_boss_gates SET state='cooldown',last_attempt_at=NOW() WHERE worldline_code=? AND boss_code=?", [gate.worldline_code, gate.boss_code]);
      await writeLedger(pool, 'worldline.boss_activation', 'failed', gate.worldline_code, { bossCode: gate.boss_code, error: error instanceof Error ? error.message : 'unknown' });
    }
  }
  return activated;
};

export const worldAdminSnapshot = async () => {
  const pool = await getPool(); await advanceDynamicNpcs();
  const [weather] = await pool.execute<(RowDataPacket & { region_code: string; region_name: string; weather_code: string; intensity: number; anomaly_code: string | null; transition_due_at: Date })[]>('SELECT r.code AS region_code,r.name AS region_name,s.weather_code,s.intensity,s.anomaly_code,s.transition_due_at FROM region_weather_states s JOIN map_regions r ON r.id=s.region_id ORDER BY r.danger_level,r.id');
  const [worldlines] = await pool.execute<(RowDataPacket & { code: string; stage: number; state_json: unknown })[]>('SELECT code,stage,state_json FROM worldline_states ORDER BY code');
  const [npcs] = await pool.execute<(RowDataPacket & { code: string; name: string; region_name: string; status: string; state_json: unknown; action_revision: number; x: number; y: number; z: number })[]>('SELECT n.code,n.name,r.name AS region_name,n.status,n.state_json,n.action_revision,m.pos_x AS x,m.pos_y AS y,m.pos_z AS z FROM world_dynamic_npc_states n JOIN map_regions r ON r.id=n.region_id JOIN map_npcs m ON m.code=n.code AND m.interaction_kind=\'npc\' ORDER BY r.name,n.code');
  const [sites] = await pool.execute<(RowDataPacket & { code: string; name: string; region_name: string; site_type: string; state_json: unknown })[]>('SELECT s.code,s.name,r.name AS region_name,s.site_type,s.state_json FROM world_site_states s JOIN map_regions r ON r.id=s.region_id ORDER BY r.name,s.code');
  const [gates] = await pool.execute<(RowDataPacket & { worldline_code: string; boss_code: string; boss_name: string | null; state: string; stage_required: number })[]>('SELECT g.worldline_code,g.boss_code,b.name AS boss_name,g.state,g.stage_required FROM world_boss_gates g LEFT JOIN monster_templates b ON b.code=g.boss_code ORDER BY g.worldline_code,g.boss_code');
  const [counts] = await pool.execute<(RowDataPacket & { active_encounters: number; active_scenes: number; template_count: number; ledger_today: number })[]>(`SELECT (SELECT COUNT(*) FROM player_encounter_instances WHERE status='active' AND expires_at>NOW()) AS active_encounters, (SELECT COUNT(*) FROM world_scene_instances WHERE status='active' AND expires_at>NOW()) AS active_scenes, (SELECT COUNT(*) FROM dynamic_encounter_templates WHERE is_enabled=1) AS template_count, (SELECT COUNT(*) FROM game_event_ledger WHERE created_at>=CURDATE()) AS ledger_today`);
  return { weather: weather.map(row => ({ regionCode: row.region_code, regionName: row.region_name, name: (weatherText[row.anomaly_code ?? row.weather_code] ?? weatherText.clear).name, intensity: Number(row.intensity), transitionDueAt: new Date(row.transition_due_at) })), worldlines: worldlines.map(row => ({ code: row.code, stage: Number(row.stage), state: json<Record<string, unknown>>(row.state_json, {}) })), npcs: npcs.map(row => ({ code: row.code, name: row.name, regionName: row.region_name, status: row.status, revision: Number(row.action_revision), position: { x: Number(row.x), y: Number(row.y), z: Number(row.z) }, state: json<Record<string, unknown>>(row.state_json, {}) })), sites: sites.map(row => ({ code: row.code, name: row.name, regionName: row.region_name, siteType: row.site_type, state: json<Record<string, unknown>>(row.state_json, {}) })), bossGates: gates.map(row => ({ worldline: row.worldline_code, bossCode: row.boss_code, bossName: row.boss_name ?? '未命名首领', state: row.state, stageRequired: Number(row.stage_required) })), activeEncounters: Number(counts[0]?.active_encounters ?? 0), activeScenes: Number(counts[0]?.active_scenes ?? 0), templateCount: Number(counts[0]?.template_count ?? 0), ledgerToday: Number(counts[0]?.ledger_today ?? 0) };
};

type ContentTemplateRow = RowDataPacket & { code: string; title: string; region_codes_json: unknown; weather_codes_json: unknown; min_exposure: number; weight: number; definition_json: unknown; is_enabled: number };
const validateContentTemplate = async (connection: PoolConnection, row: ContentTemplateRow) => {
  const errors: string[] = []; const definition = json<EncounterDefinition>(row.definition_json, {});
  if (!/^[a-z0-9_]{3,64}$/.test(row.code)) errors.push('模板代号格式无效');
  if (!row.title.trim() || row.title.length > 96) errors.push('标题不能为空且不得超过 96 字');
  const regions = json<string[]>(row.region_codes_json, []); const weathers = json<string[]>(row.weather_codes_json, []);
  if (!regions.length || !weathers.length) errors.push('至少配置一个区域与一种天气');
  const nodes = definition.nodes ?? {}; const nodeCodes = Object.keys(nodes); const openingCode = nodes.opening ? 'opening' : null;
  if (definition.nodes && !openingCode) errors.push('分支模板必须包含 opening 节点');
  if (!definition.nodes && !(definition.opening && definition.choices?.length)) errors.push('模板必须包含开场和至少一个选择');
  const reachable = new Set<string>(); const terminalNodes = new Set<string>();
  const examineChoices = (nodeCode: string, choices: EncounterChoice[]) => {
    if (!choices.length) errors.push(`节点 ${nodeCode} 没有选择`);
    const seen = new Set<string>();
    for (const choice of choices) {
      if (!/^[a-z0-9_]{1,48}$/.test(choice.code) || seen.has(choice.code)) errors.push(`节点 ${nodeCode} 的选项代号重复或无效`); seen.add(choice.code);
      if (!choice.label?.trim() || choice.label.length > 30 || !choice.text?.trim() || choice.text.length > 500) errors.push(`节点 ${nodeCode} 的选项文案长度无效`);
      if (choice.nextNode) { if (!nodes[choice.nextNode]) errors.push(`节点 ${nodeCode} 指向不存在的 ${choice.nextNode}`); }
      else terminalNodes.add(nodeCode);
    }
  };
  if (definition.nodes) for (const [code, node] of Object.entries(nodes)) { if (!node.text?.trim() || node.text.length > 800) errors.push(`节点 ${code} 文案长度无效`); examineChoices(code, node.choices ?? []); }
  else examineChoices('opening', definition.choices ?? []);
  if (definition.nodes && openingCode) { const queue = [openingCode]; while (queue.length) { const code = queue.shift()!; if (reachable.has(code)) continue; reachable.add(code); for (const choice of nodes[code]?.choices ?? []) if (choice.nextNode) queue.push(choice.nextNode); } for (const code of nodeCodes) if (!reachable.has(code)) errors.push(`节点 ${code} 不可达`); }
  if (!terminalNodes.size) errors.push('未找到终局选择');
  const rewardCodes = new Set<string>(); const worldlineCodes = new Set<string>();
  for (const choices of definition.nodes ? Object.values(nodes).map(node => node.choices) : [definition.choices ?? []]) for (const choice of choices) { if (choice.rewardCode) rewardCodes.add(choice.rewardCode); if (choice.worldline) worldlineCodes.add(choice.worldline); }
  const exists = async (table: string, field: string, code: string) => { const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM ${table} WHERE ${field}=? LIMIT 1`, [code]); return Boolean(rows[0]); };
  for (const code of rewardCodes) if (!await exists('item_definitions', 'code', code)) errors.push(`奖励物品不存在：${code}`);
  for (const code of worldlineCodes) if (!await exists('worldline_states', 'code', code)) errors.push(`世界线不存在：${code}`);
  for (const code of definition.relatedSiteCodes ?? []) if (!await exists('world_site_states', 'code', code)) errors.push(`站点不存在：${code}`);
  for (const code of definition.relatedNpcCodes ?? []) if (!await exists('world_dynamic_npc_states', 'code', code)) errors.push(`NPC 不存在：${code}`);
  return { errors, definition };
};

export const worldContentPreview = async (code?: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<ContentTemplateRow[]>(code ? 'SELECT code,title,region_codes_json,weather_codes_json,min_exposure,weight,definition_json,is_enabled FROM dynamic_encounter_templates WHERE code=?' : 'SELECT code,title,region_codes_json,weather_codes_json,min_exposure,weight,definition_json,is_enabled FROM dynamic_encounter_templates ORDER BY code LIMIT 80', code ? [code] : []);
  if (code && !rows[0]) throw new Error('未找到该内容模板。');
  const results: Array<{ code: string; title: string; enabled: boolean; weight: number; regions: string[]; weather: string[]; errors: string[]; valid: boolean }> = []; for (const row of rows) { const validation = await validateContentTemplate(connection, row); results.push({ code: row.code, title: row.title, enabled: Boolean(row.is_enabled), weight: Number(row.weight), regions: json<string[]>(row.region_codes_json, []), weather: json<string[]>(row.weather_codes_json, []), errors: validation.errors, valid: !validation.errors.length }); }
  return results;
});

const updateWorldContent = async (code: string, updater: (connection: PoolConnection, row: ContentTemplateRow) => Promise<void>) => withTransaction(async connection => {
  const [rows] = await connection.execute<ContentTemplateRow[]>('SELECT code,title,region_codes_json,weather_codes_json,min_exposure,weight,definition_json,is_enabled FROM dynamic_encounter_templates WHERE code=? FOR UPDATE', [code]); const row = rows[0]; if (!row) throw new Error('未找到该内容模板。');
  const validation = await validateContentTemplate(connection, row); if (validation.errors.length) throw new Error(`模板未通过校验：${validation.errors.join('；')}`);
  await updater(connection, row); await writeLedger(connection, 'content.control', 'updated', code, { historicalInstancesUntouched: true });
});
export const setWorldContentEnabled = async (code: string, enabled: boolean) => updateWorldContent(code, async connection => { await connection.execute('UPDATE dynamic_encounter_templates SET is_enabled=? WHERE code=?', [enabled ? 1 : 0, code]); });
export const setWorldContentWeight = async (code: string, weight: number) => { if (!Number.isInteger(weight) || weight < 1 || weight > 1000) throw new Error('权重必须是 1 到 1000 的整数。'); return updateWorldContent(code, async connection => { await connection.execute('UPDATE dynamic_encounter_templates SET weight=? WHERE code=?', [weight, code]); }); };

export const worldLedger = async (limit = 20) => {
  const pool = await getPool(); const [rows] = await pool.execute<(RowDataPacket & { id: number; event_type: string; outcome: string; source_key: string; actor_name: string | null; region_name: string | null; payload_json: unknown; created_at: Date })[]>(`SELECT l.id,l.event_type,l.outcome,l.source_key,c.name AS actor_name,r.name AS region_name,l.payload_json,l.created_at FROM game_event_ledger l LEFT JOIN characters c ON c.id=l.actor_character_id LEFT JOIN map_regions r ON r.id=l.region_id ORDER BY l.id DESC LIMIT ?`, [clamp(limit, 1, 100)]);
  return rows.map(row => ({ id: Number(row.id), eventType: row.event_type, outcome: row.outcome, sourceKey: row.source_key, actorName: row.actor_name, regionName: row.region_name, payload: json<Record<string, unknown>>(row.payload_json, {}), createdAt: new Date(row.created_at) }));
};

/** 由后台时钟驱动，使天气前沿与巡游者不依赖玩家打开面板。 */
export const settleDynamicWorld = async () => {
  const pool = await getPool();
  const [regions] = await pool.execute<(RowDataPacket & { region_id: number })[]>('SELECT region_id FROM region_weather_states WHERE transition_due_at<=NOW()');
  let transitions = 0;
  for (const region of regions) await withTransaction(async connection => { const before = await connection.execute<(RowDataPacket & { revision: number })[]>('SELECT revision FROM region_weather_states WHERE region_id=? FOR UPDATE', [region.region_id]); const previous = Number(before[0][0]?.revision ?? 0); const current = await weatherStateForRegion(connection, Number(region.region_id)); if (current.revision !== previous) transitions += 1; });
  const patrols = await advanceDynamicNpcs();
  const bossActivations = await activateReadyWorldlineBosses();
  return { transitions, patrols, bossActivations };
};
