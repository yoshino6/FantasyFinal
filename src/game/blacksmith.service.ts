import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { recalculateCharacterStats } from './character.service';
import { recordSkillPointChange } from './skill-point-ledger.service';
import { forgedAffixCap, forgedEquipmentBase, forgedEquipmentCaps, forgeRarityMultiplier } from './constants';

type WeaponRow = RowDataPacket & { id: number; name: string; item_category: string; quality: number; rarity: string; required_level: number; fusion_count: number };
type MaterialRow = RowDataPacket & { id: number; name: string; item_category: string; quantity: number; min_gain?: number; max_gain?: number; effect_json?: unknown; description?: string };
type ForgeEntrySource = 'blacksmith' | 'profession';
type BlacksmithProgressRow = RowDataPacket & { level: number; proficiency: number };
const rarityBonus: Record<string, number> = { '普通': 0, '优秀': 1, '精良': 2, '稀有': 3, '传说': 4, '史诗': 5 };
const jsonRecord = (value: unknown): Record<string, unknown> => { if (!value) return {}; if (typeof value !== 'string') return value as Record<string, unknown>; try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } };
const fusionLimit = (weapon: Pick<WeaponRow, 'rarity' | 'required_level'>) => Math.floor(Math.max(0, Number(weapon.required_level)) / 10) + (rarityBonus[weapon.rarity] ?? 0);
const characterIdFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return Number(rows[0].id);
};
const proficiencyRequired = (level: number) => level === 1 ? 10 : level === 2 ? 50 : level === 3 ? 200 : level === 4 ? 1000 : 1000 * Math.pow(5, level - 4);
const blacksmithBonus = (level: number) => Math.max(0, (level - 1) * 5);
const blacksmithProgressFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, lock = false) => {
  const [characters] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>(`SELECT secondary_profession_code FROM characters WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  if (characters[0]?.secondary_profession_code !== 'blacksmith') return { isBlacksmith: false, level: 1, proficiency: 0, required: proficiencyRequired(1), bonus: 0 };
  await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'blacksmith\',1,0)', [characterId]);
  const [rows] = await connection.execute<BlacksmithProgressRow[]>(`SELECT level,proficiency FROM player_secondary_professions WHERE character_id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  const level = Number(rows[0]?.level ?? 1);
  const proficiency = Number(rows[0]?.proficiency ?? 0);
  return { isBlacksmith: true, level, proficiency, required: proficiencyRequired(level), bonus: blacksmithBonus(level) };
};
const addBlacksmithProficiency = async (connection: PoolConnection, characterId: number) => {
  const current = await blacksmithProgressFor(connection, characterId, true);
  if (!current.isBlacksmith) return current;
  let level = current.level;
  let proficiency = current.proficiency + 1;
  while (proficiency >= proficiencyRequired(level)) {
    proficiency -= proficiencyRequired(level);
    level += 1;
  }
  await connection.execute('UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=?', [level, proficiency, characterId]);
  return { isBlacksmith: true, level, proficiency, required: proficiencyRequired(level), bonus: blacksmithBonus(level) };
};
const weaponsFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number) => {
  const [rows] = await connection.execute<WeaponRow[]>(`SELECT ii.id,i.name,i.item_category,ii.quality,i.rarity,i.required_level,COUNT(ef.id) AS fusion_count FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id LEFT JOIN equipment_fusions ef ON ef.instance_id=ii.id WHERE ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND i.rarity<>'神器' GROUP BY ii.id,i.name,i.item_category,ii.quality,i.rarity,i.required_level ORDER BY i.item_category,ii.acquired_at DESC,ii.id DESC`, [characterId]);
  return rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quality: Number(row.quality), rarity: row.rarity, requiredLevel: Number(row.required_level), fusionCount: Number(row.fusion_count), fusionLimit: fusionLimit(row) }));
};
export const blacksmithWeapons = async (qqUserId: string) => weaponsFor(await getPool(), await characterIdFor(await getPool(), qqUserId));
const fusionEquipmentFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number) => {
  const [rows] = await connection.execute<WeaponRow[]>(`SELECT ii.id,i.name,i.item_category,ii.quality,i.rarity,i.required_level,COUNT(ef.id) AS fusion_count FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id LEFT JOIN equipment_fusions ef ON ef.instance_id=ii.id WHERE ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND i.rarity<>'神器' GROUP BY ii.id,i.name,i.item_category,ii.quality,i.rarity,i.required_level ORDER BY i.item_category,ii.acquired_at DESC,ii.id DESC`, [characterId]);
  return rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quality: Number(row.quality), rarity: row.rarity, requiredLevel: Number(row.required_level), fusionCount: Number(row.fusion_count), fusionLimit: fusionLimit(row) }));
};
export const blacksmithFusionEquipment = async (qqUserId: string) => { const pool = await getPool(); return fusionEquipmentFor(pool, await characterIdFor(pool, qqUserId)); };
export const blacksmithProgress = async (qqUserId: string) => { const pool = await getPool(); return blacksmithProgressFor(pool, await characterIdFor(pool, qqUserId)); };
export const craftsmanshipEffect = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { profession: string | null; level: number | null; learned: number })[]>(`SELECT c.secondary_profession_code AS profession,sp.level,
    EXISTS(SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=c.id AND s.code='craftsmanship' AND s.category='bound') AS learned
    FROM characters c LEFT JOIN player_secondary_professions sp ON sp.character_id=c.id AND sp.profession_code=c.secondary_profession_code
    WHERE c.id=? LIMIT 1`, [characterId]);
  const row = rows[0];
  if (!row || !Boolean(row.learned)) return null;
  const level = Math.min(5, Math.max(1, Number(row.level ?? 1)));
  const percent = level * 10;
  if (row.profession === 'blacksmith') return { profession: '锻造师', level, percent, kind: 'durability' as const, text: `[锻造师Lv.${level}]你打造的装备耐久度损耗降低${percent}%` };
  if (row.profession === 'alchemist') return { profession: '炼金师', level, percent, kind: 'potion' as const, text: `[炼金师Lv.${level}]你产出的药品实际效果提升${percent}%` };
  return { profession: null, level: 0, percent: 0, kind: 'inactive' as const, text: '尚未拥有可令【匠心】生效的副职业。' };
};
/** 药剂制作完成时使用此系数；炼金功能开放后可直接复用。 */
export const craftsmanshipPotionMultiplier = (effect: Awaited<ReturnType<typeof craftsmanshipEffect>>) => effect?.kind === 'potion' ? 1 + effect.percent / 100 : 1;
/** 装备耐久结算时使用此系数；最低保留 0 损耗，避免出现负耐久。 */
export const craftsmanshipDurabilityLoss = (loss: number, effect: Awaited<ReturnType<typeof craftsmanshipEffect>>) => Math.max(0, Math.ceil(Math.max(0, loss) * (effect?.kind === 'durability' ? 1 - effect.percent / 100 : 1)));
export const xiaobeiCraftsmanshipStatus = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { affinity: number; learned: number })[]>(`SELECT COALESCE(a.affinity,0) AS affinity,EXISTS(SELECT 1 FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND s.code='craftsmanship') AS learned FROM characters c LEFT JOIN player_npc_affinity a ON a.character_id=c.id AND a.npc_code='blacksmith' WHERE c.id=?`, [characterId, characterId]);
  return { affinity: Number(rows[0]?.affinity ?? 0), learned: Boolean(rows[0]?.learned) };
};
export const learnXiaobeiCraftsmanship = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [characters] = await connection.execute<(RowDataPacket & { skill_points: number; affinity: number })[]>(`SELECT c.skill_points,COALESCE(a.affinity,0) AS affinity FROM characters c LEFT JOIN player_npc_affinity a ON a.character_id=c.id AND a.npc_code='blacksmith' WHERE c.id=? FOR UPDATE`, [characterId]);
  const character = characters[0]; if (!character || Number(character.affinity) < 200) throw new Error('与小北的好感尚未达到「意气相投」。');
  const [skills] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM skill_definitions WHERE code=\'craftsmanship\' LIMIT 1 FOR UPDATE');
  const skill = skills[0]; if (!skill) throw new Error('技能「匠心」尚未初始化，请重启机器人后重试。');
  const [known] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_skills WHERE character_id=? AND skill_id=? FOR UPDATE', [characterId, skill.id]);
  if (known[0]) throw new Error('你已经学会技能「匠心」。');
  if (Number(character.skill_points) < 5) throw new Error('技能点不足，学习「匠心」需要 5 点。');
  await connection.execute('UPDATE characters SET skill_points=skill_points-5 WHERE id=?', [characterId]);
  await recordSkillPointChange(connection, characterId, -5, 'learn_skill', Number(skill.id), '学习技能「匠心」');
  await connection.execute('INSERT INTO player_skills (character_id,skill_id) VALUES (?,?)', [characterId, skill.id]);
  return { name: skill.name, cost: 5 };
});
export const refinementMaterials = async (qqUserId: string, level?: number) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<MaterialRow[]>(`SELECT i.id,i.name,i.item_category,pi.quantity,rm.min_gain,rm.max_gain FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id JOIN blacksmith_refinement_materials rm ON rm.item_id=i.id WHERE pi.character_id=? AND pi.quantity>0${level ? ' AND i.code=?' : ''} ORDER BY i.id`, level ? [characterId, refinementMaterialCode(level)] : [characterId]);
  return rows.map(row => ({ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), minGain: Number(row.min_gain), maxGain: Number(row.max_gain) }));
};
export const fusionMaterials = async (qqUserId: string, _equipmentCategory = '武器') => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity,fe.effect_json,fe.description FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN blacksmith_fusion_material_effects fe ON fe.item_id=i.id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category<>'货币' ORDER BY i.item_category,i.name`, [characterId]);
  return rows.flatMap(row => {
    const profile = forgeMaterialProfiles[row.code]; if (!profile) return [];
    const upper = profile.max * 2 * (profile.tier === 'exclusive' ? 5 : 1);
    return [{ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), effect: { [profile.key]: upper }, description: `本次增量上限 +${upper}，实际值按正态分布抽取。` }];
  });
};
const refinementGain = (minimum: number, maximum: number, quality: number) => {
  const min = Math.max(1, Math.ceil(minimum)); const max = Math.max(min, Math.floor(maximum));
  const candidates = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const weights = candidates.map(value => Math.pow(max - value + 1, 1 + quality / 45));
  if (quality >= 80) weights[weights.length - 1] *= 0.03;
  let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  return candidates[weights.findIndex(weight => (roll -= weight) <= 0)] ?? min;
};
export const refineWeapon = async (qqUserId: string, instanceId: number, materialId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const profession = await blacksmithProgressFor(connection, characterId, true);
  const [weapons] = await connection.execute<(WeaponRow & { item_id: number })[]>(`SELECT ii.id,ii.item_id,i.name,ii.quality,i.rarity,i.required_level,0 AS fusion_count FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND i.rarity<>'神器' FOR UPDATE`, [instanceId, characterId]);
  const weapon = weapons[0]; if (!weapon) throw new Error('请选择自己背包中的可精炼装备。');
  if (Number(weapon.quality) >= 100) throw new Error('该装备品质已达到 100%。');
  const [materials] = await connection.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity,rm.min_gain,rm.max_gain FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id JOIN blacksmith_refinement_materials rm ON rm.item_id=i.id WHERE pi.character_id=? AND i.id=? FOR UPDATE`, [characterId, materialId]);
  const material = materials[0]; if (!material || Number(material.quantity) < 1) throw new Error('没有可用的精炼材料。');
  if (material.code !== refinementMaterialCode(Number(weapon.required_level))) throw new Error(`该装备只能使用【${forgeMaterialNames[refinementMaterialCode(Number(weapon.required_level))] ?? '对应主材'}】精炼。`);
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, materialId]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, materialId]);
  const quality = Number(weapon.quality); const failed = quality >= 90 && Math.random() >= Math.max(.35, .8 - (quality - 90) * .045);
  if (failed) {
    const progress = await addBlacksmithProficiency(connection, characterId);
    return { name: weapon.name, material: material.name, oldQuality: quality, newQuality: quality, gain: 0, failed: true, great: false, progress };
  }
  const great = Math.random() < Math.min(1, .03 + profession.bonus / 100); const gain = Math.min(100 - quality, refinementGain(Number(material.min_gain), Number(material.max_gain), quality) * (great ? 2 : 1)); const newQuality = Math.round((quality + gain) * 100) / 100;
  await connection.execute('UPDATE player_item_instances SET quality=? WHERE id=?', [newQuality, instanceId]);
  await recalculateCharacterStats(connection, characterId);
  const progress = await addBlacksmithProficiency(connection, characterId);
  return { name: weapon.name, material: material.name, oldQuality: quality, newQuality, gain, failed: false, great, progress };
});
export const fuseWeapon = async (qqUserId: string, instanceId: number, materialId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const profession = await blacksmithProgressFor(connection, characterId, true);
  const [weapons] = await connection.execute<(WeaponRow & { effect_json: unknown; base_effect_json: unknown; item_id: number; weapon_type: string })[]>(`SELECT ii.id,ii.item_id,i.name,i.item_category,i.weapon_type,ii.quality,i.rarity,i.required_level,i.effect_json AS effect_json,i.effect_json AS base_effect_json,(SELECT COUNT(*) FROM equipment_fusions ef WHERE ef.instance_id=ii.id) AS fusion_count FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND i.rarity<>'神器' FOR UPDATE`, [instanceId, characterId]);
  const weapon = weapons[0]; if (!weapon) throw new Error('请选择自己背包中的装备。');
  const limit = fusionLimit(weapon); if (Number(weapon.fusion_count) >= limit) throw new Error(`该武器的熔铸次数已用尽（${weapon.fusion_count}/${limit}）。`);
  const [materials] = await connection.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity,fe.effect_json,fe.description FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN blacksmith_fusion_material_effects fe ON fe.item_id=i.id WHERE pi.character_id=? AND i.id=? AND i.item_type='material' AND i.item_category<>'货币' FOR UPDATE`, [characterId, materialId]);
  const material = materials[0]; if (!material || Number(material.quantity) < 1) throw new Error('请选择背包中的熔铸材料。');
  const profile = forgeMaterialProfiles[material.code];
  if (!profile) throw new Error(`熔铸材料【${material.name}】尚未配置锻造倾向。`);
  const primaryKeys = forgePrimaryKeys(weapon.item_category, weapon.weapon_type);
  const offTypeWeaponAttack = weapon.item_category === '武器' && (profile.key === 'physicalAttack' || profile.key === 'magicAttack') && !primaryKeys.includes(profile.key);
  if (offTypeWeaponAttack || (!primaryKeys.includes(profile.key) && forgedAffixCap(equipmentKind(weapon.item_category), profile.key, Number(weapon.required_level), weapon.rarity) <= 0)) throw new Error(`熔铸材料【${material.name}】不能用于${weapon.item_category}。`);
  const success = Math.min(100, 70 + profession.bonus);
  const added = { [profile.key]: materialGain(profile) };
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, materialId]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, materialId]);
  if (Math.random() * 100 >= success) {
    const progress = await addBlacksmithProficiency(connection, characterId);
    return { name: weapon.name, material: material.name, effect: {}, count: Number(weapon.fusion_count), limit, failed: true, success, progress };
  }
  const current = jsonRecord(weapon.effect_json); const original = jsonRecord(weapon.base_effect_json);
  // 实例效果中同时保存数值属性和神器标识、布尔触发器等语义效果。
  // 旧写法把全部字段 Number 化，导致 artifact 等字符串被写成 null、布尔效果变为 1，熔铸后便像是“顶替”了原有效果。
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(original)) if (typeof value !== 'number') merged[key] = value;
  for (const [key, value] of Object.entries(added)) merged[key] = Math.round((Number(merged[key] ?? 0) + Number(value)) * 100) / 100;
  capAdditionalEquipmentEffect(merged, weapon.item_category, weapon.weapon_type, Number(weapon.required_level), weapon.rarity);
  await connection.execute('UPDATE player_item_instances SET effect_json=? WHERE id=?', [JSON.stringify(merged), instanceId]);
  await connection.execute('INSERT INTO equipment_fusions (instance_id,material_item_id,effect_json) VALUES (?,?,?)', [instanceId, materialId, JSON.stringify(added)]);
  await recalculateCharacterStats(connection, characterId);
  const progress = await addBlacksmithProficiency(connection, characterId);
  return { name: weapon.name, material: material.name, effect: added, count: Number(weapon.fusion_count) + 1, limit, failed: false, success, progress };
});

const forgeContribution = (code: string) => ({ living_wood: 15, meteor_iron: 25, star_copper: 35, moon_silver: 45, sun_gold: 60, beast_meat: 3, beast_bone: 7, beast_hide: 7, beast_tendon: 8, beast_core: 12, magic_wool: 15, magic_tusk: 18, magic_scale: 18, magic_claw: 18, magic_heartcore: 20, refined_beast_bone: 32, refined_beast_hide: 32, refined_beast_tendon: 34, refined_beast_core: 38, refined_magic_wool: 46, refined_magic_tusk: 48, refined_magic_scale: 48, refined_magic_claw: 50, refined_magic_heartcore: 52, riot_aura: 30 }[code] ?? 5);
const forgeRequirements = (category: string, level: number) => {
  if (category !== '武器') return [{ code: level <= 10 ? 'living_wood' : level <= 20 ? 'meteor_iron' : level <= 30 ? 'star_copper' : level <= 40 ? 'moon_silver' : 'sun_gold', quantity: level }];
  return ({
    5: [{ code: 'living_wood', quantity: 5 }], 10: [{ code: 'living_wood', quantity: 10 }],
    15: [{ code: 'meteor_iron', quantity: 5 }], 20: [{ code: 'meteor_iron', quantity: 10 }],
    25: [{ code: 'star_copper', quantity: 5 }, { code: 'meteor_iron', quantity: 10 }], 30: [{ code: 'star_copper', quantity: 10 }, { code: 'meteor_iron', quantity: 20 }],
    35: [{ code: 'moon_silver', quantity: 5 }, { code: 'star_copper', quantity: 10 }], 40: [{ code: 'moon_silver', quantity: 10 }, { code: 'star_copper', quantity: 20 }],
    45: [{ code: 'sun_gold', quantity: 5 }, { code: 'moon_silver', quantity: 10 }, { code: 'star_copper', quantity: 25 }], 50: [{ code: 'sun_gold', quantity: 10 }, { code: 'moon_silver', quantity: 25 }, { code: 'star_copper', quantity: 50 }]
  } as Record<number, { code: string; quantity: number }[]>)[level] ?? [];
};
const refinementMaterialCode = (level: number) => level <= 10 ? 'living_wood' : level <= 20 ? 'meteor_iron' : level <= 30 ? 'star_copper' : level <= 40 ? 'moon_silver' : 'sun_gold';
const forgeMaterialNames: Record<string, string> = { living_wood: '活木', meteor_iron: '陨铁', star_copper: '星铜', moon_silver: '月银', sun_gold: '曜金' };
const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const forgeCategories = new Set(['武器', '头肩', '上装', '腰部', '下装', '脚部']);
const weaponTypes = new Set(['长剑', '法杖', '法书', '法球', '匕首', '拳刃', '盾牌']); const armorTypes = new Set(['布甲', '皮甲', '轻甲', '重甲', '板甲']);
const forgeRarity = (blacksmithLevel: number) => {
  const level = Math.max(1, Math.floor(blacksmithLevel));
  const rare = level === 2 ? 1 : level === 3 ? 3 : level === 4 ? 6 : level === 5 ? 10 : 15;
  const legendary = level < 4 ? 0 : level === 4 ? 1 : level === 5 ? 3 : 5;
  const weights: Array<[string, number]> = [['普通', 60 - rare - legendary], ['优秀', 30], ['精良', 10], ['稀有', rare], ['传说', legendary]];
  let roll = Math.random() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  return weights.find(([, weight]) => (roll -= weight) <= 0)?.[0] ?? '普通';
};
/** 打造装备的主属性由装备类型决定；同类辅材只会作为副属性参与词条抽取。 */
export const forgePrimaryKeys = (category: string, subtype: string | null | undefined): string[] => {
  if (category === '武器') {
    if (subtype === '长剑') return ['physicalAttack'];
    if (subtype === '法杖' || subtype === '法书' || subtype === '法球') return ['magicAttack'];
    if (subtype === '匕首' || subtype === '拳刃') return ['physicalAttack', 'magicAttack'];
    return ['physicalAttack'];
  }
  // 五种甲的物防、魔防均为主属性，防御倾向由基础数值区分。
  return ['physicalDefense', 'magicDefense'];
};
const baseForgeEffect = (category: string, subtype: string, level: number): Record<string, number> => {
  const weaponBase = forgedEquipmentBase(level, '武器');
  const armorBase = forgedEquipmentBase(level, '防具');
  if (category === '武器') {
    if (subtype === '法杖' || subtype === '法书' || subtype === '法球') return { magicAttack: weaponBase };
    if (subtype === '匕首' || subtype === '拳刃') return { physicalAttack: weaponBase * .5, magicAttack: weaponBase * .5 };
    return { physicalAttack: weaponBase };
  }
  return { physicalDefense: armorBase, magicDefense: armorBase };
};
type ForgeMaterialProfile = { key: string; min: number; max: number; tier: 'small' | 'exclusive' };
const forgeMaterialProfiles: Record<string, ForgeMaterialProfile> = {
  beast_meat: { key: 'hpMax', min: 2, max: 4, tier: 'small' }, beast_bone: { key: 'physicalAttack', min: 1, max: 2, tier: 'small' }, beast_hide: { key: 'physicalDefense', min: 1, max: 2, tier: 'small' }, beast_tendon: { key: 'speed', min: 2, max: 4, tier: 'small' }, beast_core: { key: 'magicAttack', min: 1, max: 2, tier: 'small' },
  magic_wool: { key: 'evasion', min: 2, max: 4, tier: 'exclusive' }, magic_tusk: { key: 'physicalAttack', min: 1, max: 2, tier: 'exclusive' }, magic_scale: { key: 'magicDefense', min: 1, max: 2, tier: 'exclusive' }, magic_claw: { key: 'critRateBp', min: 2, max: 4, tier: 'exclusive' }, magic_heartcore: { key: 'accuracy', min: 2, max: 4, tier: 'exclusive' },
  refined_beast_bone: { key: 'physicalAttack', min: 1, max: 2, tier: 'exclusive' }, refined_beast_hide: { key: 'physicalDefense', min: 1, max: 2, tier: 'exclusive' }, refined_beast_tendon: { key: 'speed', min: 2, max: 4, tier: 'exclusive' }, refined_beast_core: { key: 'magicAttack', min: 1, max: 2, tier: 'exclusive' },
  refined_magic_wool: { key: 'evasion', min: 2, max: 4, tier: 'exclusive' }, refined_magic_tusk: { key: 'physicalAttack', min: 1, max: 2, tier: 'exclusive' }, refined_magic_scale: { key: 'magicDefense', min: 1, max: 2, tier: 'exclusive' }, refined_magic_claw: { key: 'critRateBp', min: 2, max: 4, tier: 'exclusive' }, refined_magic_heartcore: { key: 'accuracy', min: 2, max: 4, tier: 'exclusive' },
  living_wood: { key: 'hpMax', min: 2, max: 4, tier: 'small' }, meteor_iron: { key: 'physicalDefense', min: 1, max: 2, tier: 'small' }, star_copper: { key: 'accuracy', min: 2, max: 4, tier: 'small' }, moon_silver: { key: 'mpMax', min: 2, max: 4, tier: 'small' }, sun_gold: { key: 'physicalAttack', min: 1, max: 2, tier: 'small' }
};
const materialGain = (profile: ForgeMaterialProfile) => {
  const upper = random(profile.min, profile.max) * 2 * (profile.tier === 'exclusive' ? 5 : 1);
  return Math.round(upper * normalForgeFactor() * 100) / 100;
};
type ForgePropertyEntry = { key: string; profile: ForgeMaterialProfile; weight: number };
/** 每份辅材独立使用截断正态分布结算，随后才按装备词条上限截断。 */
const normalForgeFactor = () => {
  const left = Math.max(Number.EPSILON, Math.random()); const right = Math.max(Number.EPSILON, Math.random());
  const standard = Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
  return Math.max(.08, Math.min(1, .62 + standard * .16));
};
const equipmentKind = (category: string): '武器' | '防具' => category === '武器' ? '武器' : '防具';
const capForgeEffect = (effect: Record<string, number>, category: string, subtype: string, level: number, rarity: string) => {
  const caps = forgedEquipmentCaps(equipmentKind(category), level, rarity, forgePrimaryKeys(category, subtype));
  for (const [key, cap] of Object.entries(caps)) if (key in effect) effect[key] = Math.round(Math.max(0, Math.min(cap, Number(effect[key] ?? 0))) * 100) / 100;
  return effect;
};
/** 熔铸只受每条词条的独立上限约束，不再使用跨属性总容量。 */
const capAdditionalEquipmentEffect = (effect: Record<string, unknown>, category: string, subtype: string, level: number, rarity: string) => {
  const caps = forgedEquipmentCaps(equipmentKind(category), level, rarity, forgePrimaryKeys(category, subtype));
  for (const [key, cap] of Object.entries(caps)) if (key in effect) effect[key] = Math.round(Math.max(0, Math.min(cap, Number(effect[key] ?? 0))) * 100) / 100;
  return effect;
};
const primaryForgeProperties = (category: string, subtype: string) => new Set(forgePrimaryKeys(category, subtype));
const secondaryAffixCount = (rarity: string) => ({ '普通': 1, '优秀': 2, '精良': 3, '稀有': 4, '传说': 5, '史诗': 5, '神器': 5 }[rarity] ?? 1);
/** 辅材混杂时，主属性始终保留；其余属性按投入权重无放回抽取，数量由最终品质决定。 */
const chooseForgeProperties = (category: string, subtype: string, rarity: string, entries: ForgePropertyEntry[]) => {
  const primary = primaryForgeProperties(category, subtype);
  const weighted = new Map<string, number>();
  for (const entry of entries) if (!primary.has(entry.key)) weighted.set(entry.key, Number(weighted.get(entry.key) ?? 0) + entry.weight);
  const selected = new Set(primary);
  while (selected.size - primary.size < secondaryAffixCount(rarity) && weighted.size) {
    const total = [...weighted.values()].reduce((sum, value) => sum + value, 0);
    let roll = Math.random() * total;
    let picked = [...weighted.keys()][0];
    for (const [key, weight] of weighted) { roll -= weight; if (roll <= 0) { picked = key; break; } }
    selected.add(picked);
    weighted.delete(picked);
  }
  return selected;
};
const forgeName = (subtype: string, level: number, effect: Record<string, number>) => {
  const affixes: Array<[string, string]> = [['physicalAttack', '锋利'], ['magicAttack', '灵辉'], ['physicalDefense', '坚固'], ['magicDefense', '秘护'], ['hpMax', '生机'], ['mpMax', '澄明'], ['accuracy', '精准'], ['evasion', '轻盈'], ['speed', '迅捷'], ['critRateBp', '致命']];
  const affix = [...affixes].sort(([left], [right]) => Number(effect[right] ?? 0) - Number(effect[left] ?? 0))[0]?.[1] ?? '匠制';
  const tier = level <= 10 ? '灵木' : level <= 20 ? '玄铁' : level <= 30 ? '陨星' : level <= 40 ? '皓月' : '日曜';
  return `${affix}·${tier}${subtype}`;
};
export const forgeState = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const progress = await blacksmithProgressFor(pool, characterId);
  const [sessions] = await pool.execute<(RowDataPacket & { equipment_category: string | null; subtype: string | null; target_level: number | null; entry_source: ForgeEntrySource })[]>('SELECT equipment_category,subtype,target_level,entry_source FROM player_forge_sessions WHERE character_id=?', [characterId]);
  const [materials] = await pool.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity,COALESCE(fm.quantity,0) AS selected_quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN player_forge_materials fm ON fm.character_id=pi.character_id AND fm.item_id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category<>'货币' ORDER BY i.item_category,i.name`, [characterId]);
  const level = sessions[0]?.target_level === null || !sessions[0] ? null : Number(sessions[0].target_level);
  const requirements = level && sessions[0]?.equipment_category ? forgeRequirements(sessions[0].equipment_category, level) : [];
  const requiredCodes = new Set(requirements.map(item => item.code));
  const selected = materials.filter(item => !requiredCodes.has(item.code) && Number((item as any).selected_quantity) > 0).map(item => ({ id: Number(item.id), name: item.name, quantity: Number((item as any).selected_quantity), contribution: forgeContribution(item.code) }));
  return { category: sessions[0]?.equipment_category ?? null, subtype: sessions[0]?.subtype ?? null, level, source: sessions[0]?.entry_source ?? 'blacksmith' as ForgeEntrySource, materials: materials.map(item => ({ id: Number(item.id), name: item.name, code: item.code, category: item.item_category, quantity: Number(item.quantity), selected: requiredCodes.has(item.code) ? 0 : Number((item as any).selected_quantity ?? 0), contribution: forgeContribution(item.code), supported: requiredCodes.has(item.code) || Boolean(forgeMaterialProfiles[item.code]) })), selected, requirements, minimumAuxiliary: 0, success: 100, progress };
};
export const resetForgeSession = async (qqUserId: string, source: ForgeEntrySource = 'blacksmith') => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [characterId]); await connection.execute('DELETE FROM player_forge_sessions WHERE character_id=?', [characterId]); await connection.execute('INSERT INTO player_forge_sessions (character_id,entry_source) VALUES (?,?)', [characterId, source]); });
export const selectForgeCategory = async (qqUserId: string, category: string) => withTransaction(async connection => { if (!forgeCategories.has(category)) throw new Error('该装备部位暂不支持打造。'); const characterId = await characterIdFor(connection, qqUserId, true); await connection.execute('INSERT INTO player_forge_sessions (character_id,equipment_category,subtype,target_level) VALUES (?,?,NULL,NULL) ON DUPLICATE KEY UPDATE equipment_category=VALUES(equipment_category),subtype=NULL,target_level=NULL', [characterId, category]); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [characterId]); return category; });
export const selectForgeSubtype = async (qqUserId: string, subtype: string) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); const [rows] = await connection.execute<(RowDataPacket & { equipment_category: string | null })[]>('SELECT equipment_category FROM player_forge_sessions WHERE character_id=? FOR UPDATE', [characterId]); const category = rows[0]?.equipment_category; if (!category) throw new Error('请先选择打造部位。'); if (category === '武器' ? !weaponTypes.has(subtype) : !armorTypes.has(subtype)) throw new Error('该装备类型不可用。'); await connection.execute('UPDATE player_forge_sessions SET subtype=?,target_level=NULL WHERE character_id=?', [subtype, characterId]); return subtype; });
export const selectForgeLevel = async (qqUserId: string, level: number) => withTransaction(async connection => { if (level < 5 || level > 50 || level % 5) throw new Error('装备等级只能选择 5～50 级之间的 5 的倍数。'); const characterId = await characterIdFor(connection, qqUserId, true); const [rows] = await connection.execute<(RowDataPacket & { subtype: string | null })[]>('SELECT subtype FROM player_forge_sessions WHERE character_id=? FOR UPDATE', [characterId]); if (!rows[0]?.subtype) throw new Error('请先选择装备类型。'); await connection.execute('UPDATE player_forge_sessions SET target_level=? WHERE character_id=?', [level, characterId]); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [characterId]); return level; });
export const addForgeMaterial = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => { if (!Number.isInteger(quantity) || quantity < 1) throw new Error('放入数量必须是正整数。'); const characterId = await characterIdFor(connection, qqUserId, true); const [items] = await connection.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category<>'货币' FOR UPDATE`, [characterId, itemId]); const item = items[0]; if (!item) throw new Error('请选择背包中的材料。'); if (!forgeMaterialProfiles[item.code]) throw new Error(`材料【${item.name}】尚未配置锻造倾向，不能作为辅材。`); const [selected] = await connection.execute<(RowDataPacket & { quantity: number })[]>('SELECT quantity FROM player_forge_materials WHERE character_id=? AND item_id=? FOR UPDATE', [characterId, itemId]); if (Number(selected[0]?.quantity ?? 0) + quantity > Number(item.quantity)) throw new Error(`材料数量不足，最多还能放入 ${Math.max(0, Number(item.quantity) - Number(selected[0]?.quantity ?? 0))} 份。`); await connection.execute('INSERT INTO player_forge_materials (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [characterId, itemId, quantity]); return { name: item.name, quantity }; });
export const removeForgeMaterial = async (qqUserId: string, itemId: number) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); const [rows] = await connection.execute<(RowDataPacket & { quantity: number })[]>('SELECT quantity FROM player_forge_materials WHERE character_id=? AND item_id=? FOR UPDATE', [characterId, itemId]); if (!rows[0] || Number(rows[0].quantity) < 1) throw new Error('该材料尚未放入。'); await connection.execute('UPDATE player_forge_materials SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, itemId]); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, itemId]); });
export const setForgeMaterial = async (qqUserId: string, itemId: number, quantity: number) => withTransaction(async connection => { if (!Number.isInteger(quantity) || quantity < 0) throw new Error('材料数量必须是非负整数。'); const characterId = await characterIdFor(connection, qqUserId, true); const [items] = await connection.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category<>'货币' FOR UPDATE`, [characterId, itemId]); const item = items[0]; if (!item) throw new Error('请选择背包中的材料。'); if (!quantity) { await connection.execute('DELETE FROM player_forge_materials WHERE character_id=? AND item_id=?', [characterId, itemId]); return; } if (!forgeMaterialProfiles[item.code]) throw new Error(`材料【${item.name}】尚未配置锻造倾向，不能作为辅材。`); if (quantity > Number(item.quantity)) throw new Error(`材料数量不足，最多可放入 ${item.quantity} 份。`); await connection.execute('INSERT INTO player_forge_materials (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)', [characterId, itemId, quantity]); });
export const clearForgeMaterial = async (qqUserId: string, itemId: number) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=? AND item_id=?', [characterId, itemId]); });
export const craftForgeEquipment = async (qqUserId: string, _confirmed = false) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); const profession = await blacksmithProgressFor(connection, characterId, true); const [sessions] = await connection.execute<(RowDataPacket & { equipment_category: string; subtype: string; target_level: number })[]>('SELECT equipment_category,subtype,target_level FROM player_forge_sessions WHERE character_id=? FOR UPDATE', [characterId]); const session = sessions[0]; if (!session?.equipment_category || !session.subtype || !session.target_level) throw new Error('请完成打造目标选择。');
  const requirements = forgeRequirements(session.equipment_category, Number(session.target_level)); const requiredCodes = requirements.map(item => item.code);
  const [auxiliary] = await connection.execute<(MaterialRow & { code: string; selected_quantity: number })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity,fm.quantity AS selected_quantity FROM player_forge_materials fm JOIN player_inventory pi ON pi.character_id=fm.character_id AND pi.item_id=fm.item_id JOIN item_definitions i ON i.id=fm.item_id WHERE fm.character_id=?${requiredCodes.length ? ` AND i.code NOT IN (${requiredCodes.map(() => '?').join(',')})` : ''} FOR UPDATE`, [characterId, ...requiredCodes]);
  const [requiredInventory] = await connection.execute<(MaterialRow & { code: string; selected_quantity: number })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=?${requiredCodes.length ? ` AND i.code IN (${requiredCodes.map(() => '?').join(',')})` : ''} FOR UPDATE`, [characterId, ...requiredCodes]);
  const requiredByCode = new Map(requiredInventory.map(item => [item.code, item]));
  const missingRequirement = requirements.find(item => Number(requiredByCode.get(item.code)?.quantity ?? 0) < item.quantity); if (missingRequirement) throw new Error(`必备材料不足：${forgeMaterialNames[missingRequirement.code] ?? missingRequirement.code} 还需要 ${missingRequirement.quantity - Number(requiredByCode.get(missingRequirement.code)?.quantity ?? 0)} 份。`);
  const materials = [...auxiliary, ...requirements.map(requirement => ({ ...requiredByCode.get(requirement.code)!, selected_quantity: requirement.quantity }))]; const shortage = materials.find(item => Number(item.quantity) < Number(item.selected_quantity)); if (shortage) throw new Error(`材料不足：${shortage.name}。`);
  const score = auxiliary.reduce((sum, item) => sum + forgeContribution(item.code) * Number(item.selected_quantity), 0); const success = 100;
  const primaryKeys = forgePrimaryKeys(session.equipment_category, session.subtype);
  const propertyEntries: ForgePropertyEntry[] = [];
  for (const material of auxiliary) {
    const profile = forgeMaterialProfiles[material.code];
    if (!profile) throw new Error(`辅材【${material.name}】尚未配置锻造倾向，不能放入打造。`);
    const offTypeWeaponAttack = session.equipment_category === '武器' && (profile.key === 'physicalAttack' || profile.key === 'magicAttack') && !primaryKeys.includes(profile.key);
    if (offTypeWeaponAttack || (!primaryKeys.includes(profile.key) && forgedAffixCap(equipmentKind(session.equipment_category), profile.key, Number(session.target_level), '普通') <= 0)) throw new Error(`辅材【${material.name}】不能用于${session.equipment_category}。`);
    const materialWeight = Math.max(1, forgeContribution(material.code));
    for (let index = 0; index < Number(material.selected_quantity); index++) propertyEntries.push({ key: profile.key, profile, weight: materialWeight });
  }
  const [coins] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [characterId]); if (Number(coins[0]?.copper_coins ?? 0) < 60) throw new Error('铜币不足，打造手续费需要 60 铜币。');
  for (const material of materials) await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [material.selected_quantity, characterId, material.id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]); await connection.execute('UPDATE characters SET copper_coins=copper_coins-60 WHERE id=?', [characterId]); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [characterId]);
  const rarity = forgeRarity(profession.level);
  const rarityMultiplier = forgeRarityMultiplier[rarity] ?? 1;
  const effect = Object.fromEntries(Object.entries(baseForgeEffect(session.equipment_category, session.subtype, Number(session.target_level))).map(([key, value]) => [key, Number(value) * rarityMultiplier])) as Record<string, number>;
  const allowedProperties = chooseForgeProperties(session.equipment_category, session.subtype, rarity, propertyEntries);
  for (const entry of propertyEntries) if (allowedProperties.has(entry.key)) effect[entry.key] = Number(effect[entry.key] ?? 0) + materialGain(entry.profile);
  capForgeEffect(effect, session.equipment_category, session.subtype, Number(session.target_level), rarity);
  const name = forgeName(session.subtype, Number(session.target_level), effect); const code = `crafted_${characterId}_${Date.now()}_${Math.floor(Math.random() * 100000)}`; const quality = Math.min(100, Math.max(0, Math.round((15 + score * .35 + random(-8, 8)) * 100) / 100));
  const [definition] = await connection.execute<any>('INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,effect_json) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)', [code, name, `由铁匠铺打造的 Lv.${session.target_level}${session.subtype}。`, '百纳镇铁匠铺打造', 'equipment', session.equipment_category, session.subtype, rarity, session.target_level, 2, JSON.stringify(effect)]); const [instance] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,effect_json,forge_primary_json) VALUES (?,?,?,100,100,?,?)', [characterId, definition.insertId, quality, JSON.stringify(effect), JSON.stringify(primaryKeys)]); await connection.execute('DELETE FROM player_forge_sessions WHERE character_id=?', [characterId]);
  const progress = await addBlacksmithProficiency(connection, characterId);
  return { needsConfirm: false as const, failed: false as const, name, rarity, quality, effect, instanceId: Number(instance.insertId), success, progress };
});
export const blacksmithQuest = async (qqUserId: string) => { const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); const [rows] = await pool.execute<(RowDataPacket & { status: string; secondary_profession_code: string | null })[]>('SELECT q.status,c.secondary_profession_code FROM characters c LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=\'blacksmith_apprentice\' WHERE c.id=?', [characterId]); const row = rows[0]; const [items] = await pool.execute<(RowDataPacket & { code: string; quantity: number })[]>('SELECT i.code,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code IN (\'living_wood\',\'beast_core\')', [characterId]); const owned = new Map(items.map(item => [item.code, Number(item.quantity)])); const completed = row?.status === 'accepted' && (owned.get('living_wood') ?? 0) >= 1 && (owned.get('beast_core') ?? 0) >= 1; if (completed) await pool.execute('UPDATE player_side_quests SET status=\'completed\',completed_at=NOW() WHERE character_id=? AND quest_code=\'blacksmith_apprentice\'', [characterId]); const status = completed ? 'completed' : row?.secondary_profession_code === 'blacksmith' ? 'claimed' : row?.status === 'claimed' ? 'none' : row?.status ?? 'none'; return { status, wood: owned.get('living_wood') ?? 0, core: owned.get('beast_core') ?? 0 }; };
export const acceptBlacksmithQuest = async (qqUserId: string) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); const [professionRows] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null; level: number })[]>('SELECT secondary_profession_code,level FROM characters WHERE id=? FOR UPDATE', [characterId]); if (Number(professionRows[0]?.level ?? 0) < 10) throw new Error('secondary_profession_level_required'); if (professionRows[0]?.secondary_profession_code && professionRows[0].secondary_profession_code !== 'blacksmith') throw new Error('你已经拥有其他副职业，无法再选择锻造师。'); if (professionRows[0]?.secondary_profession_code === 'blacksmith') return true; await connection.execute('INSERT INTO player_side_quests (character_id,quest_code) VALUES (?,\'blacksmith_apprentice\') ON DUPLICATE KEY UPDATE status=\'accepted\',completed_at=NULL,claimed_at=NULL', [characterId]); return true; });
export const claimBlacksmithQuest = async (qqUserId: string) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); const status = await blacksmithQuest(qqUserId); if (status.status !== 'completed') throw new Error('任务尚未完成。'); const [wood] = await connection.execute<(RowDataPacket & { item_id: number })[]>('SELECT pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=\'living_wood\' FOR UPDATE', [characterId]); const [core] = await connection.execute<(RowDataPacket & { item_id: number })[]>('SELECT pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=\'beast_core\' FOR UPDATE', [characterId]); if (!wood[0] || !core[0]) throw new Error('任务材料已不在背包中。'); const [gift] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM item_definitions WHERE code=\'xiaobei_gift\' LIMIT 1', []); if (!gift[0]) throw new Error('小北的赠礼尚未配置，请重启机器人以初始化物品数据。'); const [character] = await connection.execute<(RowDataPacket & { name: string })[]>('SELECT name FROM characters WHERE id=?', [characterId]); await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id IN (?,?)', [characterId, wood[0].item_id, core[0].item_id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]); await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, gift[0].id]); await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, gift[0].id]); await connection.execute('UPDATE player_side_quests SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND quest_code=\'blacksmith_apprentice\'', [characterId]); await connection.execute('UPDATE characters SET secondary_profession_code=\'blacksmith\' WHERE id=?', [characterId]); await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'blacksmith\',1,0)', [characterId]); return { name: '锻造师', characterName: character[0]?.name ?? '冒险者', giftName: '小北的赠礼' }; });
