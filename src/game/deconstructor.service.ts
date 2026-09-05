import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { materialValueMultiplierForLevel } from './monster-crafting-material.service';
import { secondaryProfessionBonus, secondaryProfessionMaxLevel, secondaryProfessionProficiencyRequired } from './secondary-profession';
import {
  constructionRecipes as catalogConstructionRecipes,
  constructionRecipeByCode as catalogConstructionRecipeByCode,
  constructionGapFor,
  constructionRefundRate,
  constructionSuccessRate,
  courseDeviceBlueprints,
  requiresConstructionBlueprint,
  affinityBlueprints,
  blueprintRecipeCode
} from './deconstructor-catalog';

const questCode = 'deconstructor_apprentice';

const characterIdFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return Number(rows[0].id);
};

export const deconstructorQuest = async (qqUserId: string) => {
  const pool = await getPool();
  const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { status: string | null; secondary_profession_code: string | null })[]>(`SELECT q.status,c.secondary_profession_code FROM characters c LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=? WHERE c.id=?`, [questCode, characterId]);
  const [items] = await pool.execute<(RowDataPacket & { quantity: number })[]>(`SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='beast_core'`, [characterId]);
  const cores = Number(items[0]?.quantity ?? 0);
  const completed = rows[0]?.status === 'accepted' && cores >= 1;
  if (completed) await pool.execute('UPDATE player_side_quests SET status=\'completed\',completed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
  // 副职业主体以 characters.secondary_profession_code 为准。测试删档时若只遗留了已领取任务，
  // 不能把它误判为已经转职，允许玩家重新接取。
  const status = completed ? 'completed' : rows[0]?.secondary_profession_code === 'deconstructor' ? 'claimed' : rows[0]?.status === 'claimed' ? 'none' : rows[0]?.status ?? 'none';
  return { status, cores } as const;
};

export const acceptDeconstructorQuest = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null; level: number })[]>('SELECT secondary_profession_code,level FROM characters WHERE id=? FOR UPDATE', [characterId]);
  if (Number(rows[0]?.level ?? 0) < 10) throw new Error('secondary_profession_level_required');
  if (rows[0]?.secondary_profession_code && rows[0].secondary_profession_code !== 'deconstructor') throw new Error('你已经拥有其他副职业，无法再选择解构师。');
  if (rows[0]?.secondary_profession_code === 'deconstructor') return;
  await connection.execute('INSERT INTO player_side_quests (character_id,quest_code) VALUES (?,?) ON DUPLICATE KEY UPDATE status=\'accepted\',completed_at=NULL,claimed_at=NULL', [characterId, questCode]);
});

export const claimDeconstructorQuest = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [quests] = await connection.execute<(RowDataPacket & { status: string })[]>('SELECT status FROM player_side_quests WHERE character_id=? AND quest_code=? FOR UPDATE', [characterId, questCode]);
  if (quests[0]?.status !== 'completed') throw new Error('任务尚未完成。');
  const [cores] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number })[]>(`SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='beast_core' FOR UPDATE`, [characterId]);
  if (!cores[0] || Number(cores[0].quantity) < 1) throw new Error('兽核已不在背包中。');
  const [gifts] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM item_definitions WHERE code=\'xiaowei_gift\' LIMIT 1', []);
  if (!gifts[0]) throw new Error('唯薇安的赠礼尚未配置，请重启机器人以初始化物品数据。');
  const [characters] = await connection.execute<(RowDataPacket & { name: string })[]>('SELECT name FROM characters WHERE id=?', [characterId]);
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, cores[0].item_id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, cores[0].item_id]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, gifts[0].id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, gifts[0].id]);
  await connection.execute('UPDATE player_side_quests SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
  await connection.execute('UPDATE characters SET secondary_profession_code=\'deconstructor\' WHERE id=?', [characterId]);
  await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'deconstructor\',1,0)', [characterId]);
  return { name: '解构师', characterName: characters[0]?.name ?? '冒险者', giftName: '唯薇安的赠礼' };
});

export const deconstructorProgress = async (qqUserId: string) => {
  const pool = await getPool();
  const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { level: number; proficiency: number })[]>('SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code=\'deconstructor\' LIMIT 1', [characterId]);
  const level = Math.min(secondaryProfessionMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
  const proficiency = level >= secondaryProfessionMaxLevel ? 0 : Number(rows[0]?.proficiency ?? 0);
  const required = secondaryProfessionProficiencyRequired(level);
  return { level, proficiency, required, bonus: secondaryProfessionBonus(level) };
};

type DeconstructableItemRow = RowDataPacket & { id: number; code: string; name: string; item_category: string; item_type: string; quantity: number; effect_json?: unknown };
type DeconstructionCategory = '装备' | '道具' | '材料';
export const constructionCategories = ['基材', '构件', '异械'] as const;
export type ConstructionCategory = (typeof constructionCategories)[number];
type LegacyConstructionIngredient = { code: string; quantity: number };
type LegacyConstructionRecipe = { code: string; name: string; description: string; ingredients: LegacyConstructionIngredient[]; successRate: number; outputType: 'material' | 'equipment' | 'consumable'; itemCategory: string; constructionCategory: ConstructionCategory; blueprintCode?: string; effect?: Record<string, unknown> };

// 基材负责稳定不同元素粒子；构件由基材拼装；异械则以构件完成最终功能。
const legacyConstructionRecipes: LegacyConstructionRecipe[] = [
  { code: 'magic_gear', name: '魔力齿轮', description: '以金元素微尘为骨架、魔力微弧为驱动的基础传动基材。', ingredients: [{ code: 'metal_element_dust', quantity: 4 }, { code: 'magic_unit', quantity: 2 }, { code: 'thunder_element_dust', quantity: 3 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
  { code: 'energy_core', name: '能量中枢', description: '将余烬与水元素微粒压缩为持续供能的基础中枢。', ingredients: [{ code: 'energy_ember', quantity: 5 }, { code: 'magic_unit', quantity: 2 }, { code: 'water_element_dust', quantity: 2 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
  { code: 'flesh_atrium', name: '血肉心房', description: '模拟生物循环结构制成的活性基材。', ingredients: [{ code: 'blood_residue', quantity: 5 }, { code: 'energy_ember', quantity: 3 }, { code: 'wood_element_dust', quantity: 1 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
  { code: 'flame_matrix', name: '炽焰矩阵', description: '将火元素规整成稳定热源的基础基材。', ingredients: [{ code: 'fire_element_dust', quantity: 4 }, { code: 'metal_element_dust', quantity: 2 }, { code: 'energy_ember', quantity: 3 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
  { code: 'frost_prism', name: '凝霜棱晶', description: '可将冰与水元素折射为稳定冷却回路的基材。', ingredients: [{ code: 'ice_element_dust', quantity: 4 }, { code: 'water_element_dust', quantity: 3 }, { code: 'magic_unit', quantity: 2 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
  { code: 'shadow_filament', name: '暗影导丝', description: '由暗元素编织而成、能传递细微魔力信号的基材。', ingredients: [{ code: 'dark_element_dust', quantity: 4 }, { code: 'metal_element_dust', quantity: 3 }, { code: 'magic_unit', quantity: 2 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
  { code: 'luminous_lens', name: '光导晶片', description: '将光元素收束为清晰视界的透明基材。', ingredients: [{ code: 'light_element_dust', quantity: 4 }, { code: 'water_element_dust', quantity: 3 }, { code: 'magic_unit', quantity: 2 }], successRate: 90, outputType: 'material', itemCategory: '基材', constructionCategory: '基材' },
  { code: 'interference_shell', name: '阻扰外壳', description: '隔离外部魔力扰动、保护内部组件的异械构件。', ingredients: [{ code: 'magic_gear', quantity: 2 }, { code: 'flesh_atrium', quantity: 1 }, { code: 'shadow_filament', quantity: 2 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'low_power_standard_lens', name: '低倍标准镜', description: '提供基础视距与对焦能力的标准光学构件。', ingredients: [{ code: 'luminous_lens', quantity: 2 }, { code: 'frost_prism', quantity: 2 }, { code: 'magic_gear', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'calibration_module', name: '校准模块', description: '负责修正视线偏差与锁定轨迹的精密构件。', ingredients: [{ code: 'magic_gear', quantity: 2 }, { code: 'energy_core', quantity: 2 }, { code: 'shadow_filament', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'mana_power_source', name: '魔力源能', description: '向异械稳定输送魔力的供能构件。', ingredients: [{ code: 'energy_core', quantity: 2 }, { code: 'flame_matrix', quantity: 2 }, { code: 'flesh_atrium', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'kinetic_frame', name: '动能骨架', description: '将力量与动作稳定传导的强化构件。', ingredients: [{ code: 'magic_gear', quantity: 2 }, { code: 'flesh_atrium', quantity: 2 }, { code: 'flame_matrix', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'pulse_regulator', name: '脉冲调节器', description: '以循环脉冲校准器械响应的精密构件。', ingredients: [{ code: 'energy_core', quantity: 2 }, { code: 'frost_prism', quantity: 1 }, { code: 'luminous_lens', quantity: 2 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'palm_weave', name: '掌心织片', description: '能贴合掌心起伏、传递细微动作的柔性构件。', ingredients: [{ code: 'flesh_atrium', quantity: 2 }, { code: 'shadow_filament', quantity: 1 }, { code: 'luminous_lens', quantity: 1 }, { code: 'frost_prism', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'finger_actuator', name: '指节驱动器', description: '嵌入指节位置的微型传动构件，可让动作更迅疾地传达。', ingredients: [{ code: 'magic_gear', quantity: 2 }, { code: 'energy_core', quantity: 1 }, { code: 'flesh_atrium', quantity: 1 }, { code: 'flame_matrix', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'force_feedback_ring', name: '力反馈环', description: '回传出力变化的环形构件，用于细微调整发力节奏。', ingredients: [{ code: 'magic_gear', quantity: 1 }, { code: 'energy_core', quantity: 2 }, { code: 'frost_prism', quantity: 1 }, { code: 'luminous_lens', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'pressure_buckle', name: '压感扣具', description: '能辨识握力与接触变化的扣具，适合装配在手部异械上。', ingredients: [{ code: 'shadow_filament', quantity: 2 }, { code: 'flesh_atrium', quantity: 2 }, { code: 'luminous_lens', quantity: 1 }], successRate: 80, outputType: 'material', itemCategory: '构件', constructionCategory: '构件' },
  { code: 'auxiliary_aiming_scope', name: '辅助瞄准镜', description: '镜片会自行微调焦距，似乎能让视线与目标轨迹更容易重合。', ingredients: [{ code: 'interference_shell', quantity: 1 }, { code: 'low_power_standard_lens', quantity: 1 }, { code: 'calibration_module', quantity: 1 }, { code: 'mana_power_source', quantity: 1 }], successRate: 20, outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', blueprintCode: 'auxiliary_aiming_scope_blueprint', effect: { actualHitRatePct: 8 } },
  { code: 'muscle_pacer', name: '肌肉起搏器', description: '脉冲会刺激肌肉在出手时爆发更强力量，但过度校正也可能让动作失去细微的准度。', ingredients: [{ code: 'kinetic_frame', quantity: 1 }, { code: 'pulse_regulator', quantity: 1 }, { code: 'force_feedback_ring', quantity: 1 }, { code: 'mana_power_source', quantity: 1 }], successRate: 20, outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', blueprintCode: 'muscle_pacer_blueprint', effect: { actualHitRatePct: -6, physicalSkillDamagePct: 6 } },
  { code: 'critical_glove', name: '刻薄手套', description: '手套会强行锁定最锐利的攻击节奏，代价是每次爆发都难以维持完整的后续力道。', ingredients: [{ code: 'finger_actuator', quantity: 2 }, { code: 'palm_weave', quantity: 2 }, { code: 'force_feedback_ring', quantity: 1 }, { code: 'pressure_buckle', quantity: 1 }], successRate: 20, outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', blueprintCode: 'critical_glove_blueprint', effect: { forceCrit: true, criticalFinalDamagePct: -50 } },
  { code: 'mana_accumulator', name: '魔力积蓄仪', description: '它会将魔力压入更深的回路中，施术前的准备感变得明显，但成型后的术式也更加危险。', ingredients: [{ code: 'mana_power_source', quantity: 2 }, { code: 'pulse_regulator', quantity: 2 }, { code: 'interference_shell', quantity: 1 }], successRate: 20, outputType: 'equipment', itemCategory: '异械', constructionCategory: '异械', blueprintCode: 'mana_accumulator_blueprint', effect: { magicChantBonus: 1, magicSkillDamagePct: 60 } }
  , { code: 'demon_breaker_teleporter', name: '破魔传送器', description: '可撕开旧式结界缝隙的便携装置。它的回路十分复杂，唯有持有图纸才能稳定完成构造。', ingredients: [{ code: 'mana_power_source', quantity: 2 }, { code: 'calibration_module', quantity: 2 }, { code: 'shadow_filament', quantity: 3 }, { code: 'luminous_lens', quantity: 2 }], successRate: 20, outputType: 'consumable', itemCategory: '特殊', constructionCategory: '异械', blueprintCode: 'demon_breaker_teleporter_blueprint' }
];
const legacyConstructionRecipeByCode = new Map(legacyConstructionRecipes.map(recipe => [recipe.code, recipe]));
const legacyConstructionSuccessRate = (recipe: LegacyConstructionRecipe, level: number, blueprintOwned = false) => recipe.constructionCategory === '异械'
  ? blueprintOwned ? 100 : 20
  : Math.min(100, recipe.successRate + Math.max(0, level - 1) * 2);
// 旧配方定义保留在此版本中只为兼容迁移阅读；运行时一律使用完整图纸目录。
void legacyConstructionRecipeByCode;
void legacyConstructionSuccessRate;
const constructionRecipes = catalogConstructionRecipes;
const constructionRecipeByCode = catalogConstructionRecipeByCode;

// 普通兽材两类粒子分别独立判定：首份概率由素材决定，之后每一份的概率减半。
// 高级专属兽材首份必得，后续按 60% 衰减，最多六份；产出售价低于投入素材，避免倒卖循环。
const ordinaryProfiles: Record<string, { blood: number; ember: number }> = {
  beast_meat: { blood: 0.8, ember: 0.2 },
  beast_hide: { blood: 0.6, ember: 0.4 },
  beast_bone: { blood: 0.4, ember: 0.6 },
  beast_tendon: { blood: 0.2, ember: 0.8 }
};
const specialMaterials = new Set(['magic_wool', 'magic_tusk', 'magic_scale', 'magic_claw', 'magic_heartcore']);
type ForgeDeconstructionOutput = { code: string; decay: number; limit: number };
const forgeMaterialProfiles: Record<string, ForgeDeconstructionOutput[]> = {
  living_wood: [{ code: 'wood_element_dust', decay: 0.5, limit: 3 }],
  meteor_iron: [{ code: 'metal_element_dust', decay: 0.6, limit: 5 }],
  star_copper: [{ code: 'metal_element_dust', decay: 0.7, limit: 7 }, { code: 'water_element_dust', decay: 0.7, limit: 7 }],
  moon_silver: [{ code: 'metal_element_dust', decay: 0.8, limit: 9 }, { code: 'ice_element_dust', decay: 0.8, limit: 9 }, { code: 'dark_element_dust', decay: 0.25, limit: 3 }],
  sun_gold: [{ code: 'metal_element_dust', decay: 0.9, limit: 11 }, { code: 'fire_element_dust', decay: 0.9, limit: 11 }, { code: 'thunder_element_dust', decay: 0.9, limit: 11 }, { code: 'light_element_dust', decay: 0.3, limit: 5 }],
  root_heart: [{ code: 'wood_element_dust', decay: 0.65, limit: 5 }], river_shell: [{ code: 'water_element_dust', decay: 0.65, limit: 5 }], tide_shell: [{ code: 'water_element_dust', decay: 0.55, limit: 4 }, { code: 'metal_element_dust', decay: 0.45, limit: 3 }],
  ridge_core: [{ code: 'metal_element_dust', decay: 0.7, limit: 6 }], fire_crystal: [{ code: 'fire_element_dust', decay: 0.7, limit: 6 }], marsh_heart: [{ code: 'wood_element_dust', decay: 0.6, limit: 5 }, { code: 'water_element_dust', decay: 0.5, limit: 4 }],
  star_mud_core: [{ code: 'dark_element_dust', decay: 0.7, limit: 6 }], frost_crystal: [{ code: 'ice_element_dust', decay: 0.7, limit: 6 }], thunder_core: [{ code: 'thunder_element_dust', decay: 0.7, limit: 6 }], eclipse_core: [{ code: 'light_element_dust', decay: 0.55, limit: 5 }, { code: 'dark_element_dust', decay: 0.55, limit: 5 }]
};
const jsonRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
};
type MonsterCraftClass = 'normal' | 'large' | 'elite' | 'boss';
const monsterCraftClassFor = (item: Pick<DeconstructableItemRow, 'effect_json'>): MonsterCraftClass | null => {
  const effect = jsonRecord(item.effect_json);
  if (!['hair', 'gel_skin', 'bone', 'shell', 'scale'].includes(String(effect.monster_craft_material ?? ''))) return null;
  const monsterClass = String(effect.material_monster_class ?? 'normal');
  return ['normal', 'large', 'elite', 'boss'].includes(monsterClass) ? monsterClass as MonsterCraftClass : 'normal';
};
const monsterCraftValueMultiplierFor = (item: Pick<DeconstructableItemRow, 'effect_json'>) => {
  const level = Math.max(1, Math.floor(Number(jsonRecord(item.effect_json).material_monster_level ?? 1)));
  return materialValueMultiplierForLevel(level);
};
const constructedMaterialRecipes = new Map(constructionRecipes.filter(recipe => recipe.outputType === 'material').map(recipe => [recipe.code, recipe]));
const isDeconstructable = (item: Pick<DeconstructableItemRow, 'code' | 'effect_json'>) => Boolean(monsterCraftClassFor(item)) || deconstructableCodes.includes(item.code) || constructedMaterialRecipes.has(item.code);
const deconstructionMapMaterialGain = (item: Pick<DeconstructableItemRow, 'code' | 'effect_json'>) => {
  const monsterClass = monsterCraftClassFor(item);
  if (monsterClass) return ({ normal: 1, large: 2, elite: 3, boss: 4 } as const)[monsterClass] * monsterCraftValueMultiplierFor(item);
  const constructed = constructedMaterialRecipes.get(item.code);
  if (constructed) return constructed.constructionCategory === '构件' ? 3 : 2;
  return ({ living_wood: 1, meteor_iron: 2, star_copper: 3, moon_silver: 4, sun_gold: 5 }[item.code] ?? (specialMaterials.has(item.code) ? 2 : forgeMaterialProfiles[item.code] ? 3 : 1));
};
/**
 * 专属怪材提纯的期望价值是 20 × 60% = 12。
 * 解构基础产值按怪物阶位递增，基础期望价值为 2 / 4 / 8 / 10.5；怪物每跨 10 级按 1.2 倍累乘。
 */
const deconstructMonsterCraftMaterial = (item: Pick<DeconstructableItemRow, 'effect_json'>, bonusMultiplier: number, add: (code: string, amount: number) => void) => {
  const monsterClass = monsterCraftClassFor(item);
  if (!monsterClass) return false;
  const effect = jsonRecord(item.effect_json); const kind = String(effect.monster_craft_material);
  const particleValue = ({ normal: 1, large: 2, elite: 3, boss: 4 } as const)[monsterClass] * monsterCraftValueMultiplierFor(item) * bonusMultiplier;
  const particleCount = Math.floor(particleValue);
  const bloodBias = ['hair', 'gel_skin'].includes(kind) ? .65 : .35;
  for (let index = 0; index < particleCount; index += 1) add(Math.random() < bloodBias ? 'blood_residue' : 'energy_ember', 1);
  if (Math.random() < particleValue - particleCount) add(Math.random() < bloodBias ? 'blood_residue' : 'energy_ember', 1);
  const magicChance = ({ normal: 0, large: 0, elite: .2, boss: .25 } as const)[monsterClass] * monsterCraftValueMultiplierFor(item);
  if (Math.random() < Math.min(1, magicChance * bonusMultiplier)) add('magic_unit', 1);
  return true;
};
const constructionProficiencyGain = (category: ConstructionCategory) => ({ '基材': 5, '构件': 10, '异械': 20 }[category]);
const coloredSlimeGelDust: Record<string, string> = { red_slime_gel: 'fire_element_dust', orange_slime_gel: 'metal_element_dust', yellow_slime_gel: 'thunder_element_dust', green_slime_gel: 'wood_element_dust', cyan_slime_gel: 'water_element_dust', blue_slime_gel: 'ice_element_dust', purple_slime_gel: 'dark_element_dust', black_slime_gel: 'dark_element_dust' };
const deconstructableCodes = [...Object.keys(ordinaryProfiles), ...specialMaterials, ...Object.keys(forgeMaterialProfiles), ...Object.keys(coloredSlimeGelDust), ...constructedMaterialRecipes.keys()];
const categoryType: Record<DeconstructionCategory, string> = { 装备: 'equipment', 道具: 'consumable', 材料: 'material' };
const requiredFor = secondaryProfessionProficiencyRequired;

const deconstructorProgressFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, lock = false) => {
  const [characters] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>(`SELECT secondary_profession_code FROM characters WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  if (characters[0]?.secondary_profession_code !== 'deconstructor') throw new Error('只有解构师可以进行分解。');
  await connection.execute("INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,'deconstructor',1,0)", [characterId]);
  const [rows] = await connection.execute<(RowDataPacket & { level: number; proficiency: number })[]>(`SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code='deconstructor'${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  const level = Math.min(secondaryProfessionMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
  const proficiency = level >= secondaryProfessionMaxLevel ? 0 : Number(rows[0]?.proficiency ?? 0);
  return { level, proficiency, required: requiredFor(level), bonus: secondaryProfessionBonus(level) };
};

const addDeconstructorProficiency = async (connection: PoolConnection, characterId: number, gained = 1) => {
  const current = await deconstructorProgressFor(connection, characterId, true);
  let level = current.level;
  let proficiency = level >= secondaryProfessionMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(gained));
  while (level < secondaryProfessionMaxLevel && proficiency >= requiredFor(level)) { proficiency -= requiredFor(level); level += 1; }
  if (level >= secondaryProfessionMaxLevel) proficiency = 0;
  await connection.execute("UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=? AND profession_code='deconstructor'", [level, proficiency, characterId]);
  return { level, proficiency, required: requiredFor(level), bonus: secondaryProfessionBonus(level) };
};

const constructionItemRows = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, codes: string[], lock = false) => {
  const placeholders = codes.map(() => '?').join(',');
  const [rows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; item_category: string; codex_id: string | null; quantity: number; unlocked: number })[]>(`
    SELECT i.id,i.code,i.name,i.item_category,i.codex_id,COALESCE(pi.quantity,0) AS quantity,
      EXISTS(SELECT 1 FROM player_item_codex pic WHERE pic.character_id=? AND pic.item_id=i.id) AS unlocked
    FROM item_definitions i LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=?
    WHERE i.code IN (${placeholders})${lock ? ' FOR UPDATE' : ''}
  `, [characterId, characterId, ...codes]);
  return rows;
};

const constructionClosureFor = (recipeCode: string, result = new Set<string>(), visiting = new Set<string>()) => {
  if (visiting.has(recipeCode)) return result;
  visiting.add(recipeCode);
  const recipe = constructionRecipeByCode.get(recipeCode);
  if (!recipe) return result;
  result.add(recipe.code);
  for (const part of recipe.ingredients) if (constructionRecipeByCode.has(part.code)) constructionClosureFor(part.code, result, visiting);
  return result;
};

const grantBlueprintCodes = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, blueprintCodes: Iterable<string>) => {
  const codes = [...new Set(blueprintCodes)];
  if (!codes.length) return;
  const placeholders = codes.map(() => '?').join(',');
  const [definitions] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT id FROM item_definitions WHERE code IN (${placeholders})`, codes);
  for (const definition of definitions) {
    await connection.execute('INSERT IGNORE INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1)', [characterId, definition.id]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, definition.id]);
  }
};

const unlockedConstructionCodes = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, lock = false) => {
  // 图纸只存在于最终异械；获得一张异械图纸时，其所需的基材与构件自动可构造，不再生成冗余的材料图纸。
  const suffix = lock ? ' FOR UPDATE' : '';
  const [ownedBlueprintRows] = await connection.execute<(RowDataPacket & { code: string })[]>(`SELECT i.code FROM player_inventory pi
    JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.code REGEXP '_blueprint$'${suffix}`, [characterId]);
  const unlockedCodes = new Set<string>();
  for (const row of ownedBlueprintRows) {
    const recipeCode = blueprintRecipeCode(row.code);
    if (recipeCode) constructionClosureFor(recipeCode, unlockedCodes);
  }
  return unlockedCodes;
};

/** 在异工坊和唯薇安闲聊时补课：跨级只触发最高一节对话，但不会漏发中间任何异械图纸。 */
export const claimVivianCourseBlueprints = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [characters] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>('SELECT secondary_profession_code FROM characters WHERE id=? FOR UPDATE', [characterId]);
  if (characters[0]?.secondary_profession_code !== 'deconstructor') return { level: 0, awarded: [] as { level: number; code: string; name: string }[], highestLevel: 0, affinityAwarded: [] as string[] };
  const progress = await deconstructorProgressFor(connection, characterId, true);
  const course = courseDeviceBlueprints.filter(([requiredLevel]) => progress.level >= requiredLevel);
  const codes = course.map(([, code]) => constructionRecipeByCode.get(code)?.blueprintCode).filter((code): code is string => Boolean(code));
  const rows = codes.length ? await constructionItemRows(connection, characterId, codes, true) : [];
  const owned = new Set(rows.filter(row => Number(row.quantity) > 0).map(row => row.code));
  const awarded = course.flatMap(([requiredLevel, code]) => {
    const recipe = constructionRecipeByCode.get(code); if (!recipe || owned.has(recipe.blueprintCode)) return [];
    return [{ level: requiredLevel, code, name: recipe.name }];
  });
  await grantBlueprintCodes(connection, characterId, awarded.map(item => constructionRecipeByCode.get(item.code)!.blueprintCode));
  const [affinityRows] = await connection.execute<(RowDataPacket & { affinity: number })[]>('SELECT affinity FROM player_npc_affinity WHERE character_id=? AND npc_code=\'oddworkshop\' LIMIT 1 FOR UPDATE', [characterId]);
  const affinityAwarded: string[] = [];
  for (const unlock of affinityBlueprints) {
    const recipe = constructionRecipeByCode.get(unlock.code);
    if (recipe && progress.level >= unlock.level && Number(affinityRows[0]?.affinity ?? 0) >= unlock.affinity && !owned.has(recipe.blueprintCode)) {
      await grantBlueprintCodes(connection, characterId, [recipe.blueprintCode]); affinityAwarded.push(recipe.name);
    }
  }
  return { level: progress.level, awarded, highestLevel: awarded.length ? awarded[awarded.length - 1]!.level : 0, affinityAwarded };
});

export const constructionRecipesFor = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const progress = await deconstructorProgressFor(pool, characterId);
  const codes = [...new Set(constructionRecipes.flatMap(recipe => [recipe.code, ...recipe.ingredients.map(ingredient => ingredient.code), ...(recipe.blueprintCode ? [recipe.blueprintCode] : [])]))];
  const rows = await constructionItemRows(pool, characterId, codes);
  const items = new Map(rows.map(row => [row.code, row]));
  const unlockedCodes = await unlockedConstructionCodes(pool, characterId);
  return constructionRecipes.map(recipe => ({
    ...recipe,
    codexId: items.get(recipe.code)?.codex_id ?? null,
    unlocked: unlockedCodes.has(recipe.code),
    blueprintOwned: requiresConstructionBlueprint(recipe) ? Number(items.get(recipe.blueprintCode)?.quantity ?? 0) > 0 : true,
    blueprintName: requiresConstructionBlueprint(recipe) ? items.get(recipe.blueprintCode)?.name ?? recipe.blueprintCode : null,
    blueprintCodexId: requiresConstructionBlueprint(recipe) ? items.get(recipe.blueprintCode)?.codex_id ?? null : null,
    gap: constructionGapFor(recipe, progress.level),
    refundRate: constructionRefundRate(constructionGapFor(recipe, progress.level)),
    successRate: constructionSuccessRate(recipe.recommendedSecondaryLevel, progress.level),
    ingredients: recipe.ingredients.map(ingredient => ({ ...ingredient, name: items.get(ingredient.code)?.name ?? ingredient.code, codexId: items.get(ingredient.code)?.codex_id ?? null, owned: Number(items.get(ingredient.code)?.quantity ?? 0) }))
  }));
};

export const constructItem = async (qqUserId: string, recipeCode: string) => withTransaction(async connection => {
  const recipe = constructionRecipeByCode.get(recipeCode);
  if (!recipe) throw new Error('未找到该构造配方。');
  const characterId = await characterIdFor(connection, qqUserId, true);
  const progress = await deconstructorProgressFor(connection, characterId, true);
  const unlockedCodes = await unlockedConstructionCodes(connection, characterId, true);
  if (!unlockedCodes.has(recipe.code)) throw new Error('尚未获得能解锁该异械构造链的图纸。');
  const codes = [...recipe.ingredients.map(ingredient => ingredient.code), ...(requiresConstructionBlueprint(recipe) ? [recipe.blueprintCode] : [])];
  const rows = await constructionItemRows(connection, characterId, codes, true);
  const materials = new Map(rows.map(row => [row.code, row]));
  if (requiresConstructionBlueprint(recipe)) {
    const blueprint = materials.get(recipe.blueprintCode);
    if (!blueprint || Number(blueprint.quantity) < 1) throw new Error('缺少该异械的图纸。');
  }
  for (const ingredient of recipe.ingredients) {
    const material = materials.get(ingredient.code);
    if (!material || Number(material.quantity) < ingredient.quantity) throw new Error(`材料不足：需要【${material?.name ?? ingredient.code}】×${ingredient.quantity}。`);
  }
  for (const ingredient of recipe.ingredients) {
    const material = materials.get(ingredient.code)!;
    await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [ingredient.quantity, characterId, material.id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, material.id]);
  }
  const gap = constructionGapFor(recipe, progress.level);
  const refundRate = constructionRefundRate(gap);
  const successRate = constructionSuccessRate(recipe.recommendedSecondaryLevel, progress.level);
  const success = Math.random() * 100 < successRate;
  const proficiencyGain = constructionProficiencyGain(recipe.constructionCategory);
  const next = await addDeconstructorProficiency(connection, characterId, success ? proficiencyGain : Math.ceil(proficiencyGain * .5));
  if (!success) {
    const refunded: { name: string; quantity: number }[] = [];
    for (const ingredient of recipe.ingredients) {
      const material = materials.get(ingredient.code)!;
      let quantity = 0;
      for (let index = 0; index < ingredient.quantity; index += 1) if (Math.random() < refundRate) quantity += 1;
      if (!quantity) continue;
      await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [characterId, material.id, quantity]);
      refunded.push({ name: material.name, quantity });
    }
    return { success: false as const, recipe, successRate, refundRate, refunded, proficiencyGain: Math.ceil(proficiencyGain * .5), progress: next };
  }
  const [definitions] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=? FOR UPDATE', [recipe.code]);
  const output = definitions[0];
  if (!output) throw new Error('构造产物尚未初始化，请重启机器人后重试。');
  if (recipe.outputType === 'equipment') {
    const [instance] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,effect_json) VALUES (?,?,100,100,100,?)', [characterId, output.id, JSON.stringify(recipe.effect ?? {})]);
    await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, output.id]);
    return { success: true as const, recipe, successRate, outputName: output.name, instanceId: Number(instance.insertId), proficiencyGain, progress: next };
  }
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, output.id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, output.id]);
  if (recipe.code === 'demon_breaker_teleporter') {
    const { completeDungeonSecretPurchase } = await import('./dungeon-quest.service');
    await completeDungeonSecretPurchase(connection, characterId);
  }
  return { success: true as const, recipe, successRate, outputName: output.name, proficiencyGain, progress: next };
});

export const deconstructionItems = async (qqUserId: string, category: DeconstructionCategory = '材料') => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); await deconstructorProgressFor(pool, characterId);
  const [rows] = await pool.execute<DeconstructableItemRow[]>(`SELECT i.id,i.code,i.name,i.item_category,i.item_type,i.effect_json,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type=? AND (i.code IN (${deconstructableCodes.map(() => '?').join(',')}) OR JSON_EXTRACT(i.effect_json,'$.monster_craft_material') IS NOT NULL) ORDER BY i.item_category,i.name,i.id`, [characterId, categoryType[category], ...deconstructableCodes]);
  return rows.filter(isDeconstructable).map(row => ({ id: Number(row.id), code: row.code, name: row.name, category: row.item_category, quantity: Number(row.quantity) }));
};

const chainedYield = (firstChance: number, decay: number, limit: number) => {
  let count = 0; let chance = firstChance;
  for (let index = 0; index < limit; index += 1) {
    if (Math.random() >= chance) break;
    count += 1; chance *= decay;
  }
  return count;
};

export const deconstructItems = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => {
  if (!Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new Error('请输入 1 至 9999 的分解数量。');
  const characterId = await characterIdFor(connection, qqUserId, true); const progress = await deconstructorProgressFor(connection, characterId, true);
  const [rows] = await connection.execute<DeconstructableItemRow[]>(`SELECT i.id,i.code,i.name,i.item_category,i.item_type,i.effect_json,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? FOR UPDATE`, [characterId, itemId]);
  const item = rows[0];
  if (!item || !isDeconstructable(item)) throw new Error('该物品暂时无法分解。');
  if (Number(item.quantity) < quantity) throw new Error(`物品不足，最多可分解 ${item.quantity} 份。`);
  const outputs = new Map<string, number>(); const add = (code: string, amount: number) => outputs.set(code, (outputs.get(code) ?? 0) + amount);
  const bonusMultiplier = 1 + progress.bonus / 100;
  for (let index = 0; index < quantity; index += 1) {
    const slimeDust = coloredSlimeGelDust[item.code];
    const ordinary = ordinaryProfiles[item.code];
    if (deconstructMonsterCraftMaterial(item, bonusMultiplier, add)) {
      continue;
    } else if (slimeDust) {
      add(slimeDust, 1); if (Math.random() < .8) add('blood_residue', 1); if (Math.random() < .4) add('energy_ember', 1);
    } else if (ordinary) {
      add('blood_residue', chainedYield(Math.min(1, ordinary.blood * bonusMultiplier), 0.5, 3));
      add('energy_ember', chainedYield(Math.min(1, ordinary.ember * bonusMultiplier), 0.5, 3));
    } else if (forgeMaterialProfiles[item.code]) {
      for (const output of forgeMaterialProfiles[item.code]) add(output.code, chainedYield(1, Math.min(1, output.decay * bonusMultiplier), output.limit));
    } else if (constructedMaterialRecipes.has(item.code)) {
      const recipe = constructedMaterialRecipes.get(item.code)!;
      const recovery = recipe.constructionCategory === '构件' ? .65 : .60;
      for (const ingredient of recipe.ingredients) {
        for (let input = 0; input < ingredient.quantity; input += 1) if (Math.random() < Math.min(1, recovery * bonusMultiplier)) add(ingredient.code, 1);
      }
    } else {
      const particleCount = chainedYield(1, Math.min(1, 0.6 * bonusMultiplier), 6);
      for (let particle = 0; particle < particleCount; particle += 1) add(Math.random() < 0.5 ? 'blood_residue' : 'energy_ember', 1);
      add('magic_unit', chainedYield(Math.min(1, 0.8 * bonusMultiplier), 0.01, 2));
    }
  }
  await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, characterId, item.id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, item.id]);
  const codes = [...outputs].filter(([, amount]) => amount > 0).map(([code]) => code);
  let results: { name: string; quantity: number }[] = [];
  if (codes.length) {
    const [definitions] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string })[]>(`SELECT id,code,name FROM item_definitions WHERE code IN (${codes.map(() => '?').join(',')}) FOR UPDATE`, codes);
    for (const definition of definitions) {
      const amount = outputs.get(definition.code) ?? 0; if (amount <= 0) continue;
      await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [characterId, definition.id, amount]);
      await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, definition.id]);
      results.push({ name: definition.name, quantity: amount });
    }
  }
  const proficiencyGain = Math.round(quantity * deconstructionMapMaterialGain(item));
  const next = await addDeconstructorProficiency(connection, characterId, proficiencyGain);
  return { inputName: item.name, inputQuantity: quantity, results, proficiencyGain, progress: next };
});
