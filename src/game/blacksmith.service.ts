import { forgeAchievementFacts } from './achievement-production';
import { achievementSecondaryLevel } from './achievement-hooks';
import { recordAchievement } from './achievement-events';
import { achievementActivity, achievementItem, achievementSecondary } from './achievement-hooks';
import { achievementCraftedWeapon } from './achievement-state';
import { fixedTalentMaterials, consumeTalentMaterial, talentMaterialPayment } from './talent-production';
import { ownedTalent, readTalentData } from './talent-data';
import { talentProficiency, talentProductionRecord } from './talent-rewards';
import { armorPieceDescription } from './armor-class';
import { currentSecondaryShop, shopProgressFor, shopProficiency } from './secondary-shop-context';
import { assertHiddenInstanceMutable } from './combat-loadout-lock.service';
import { consumeInventory } from './inventory-binding';
import { forgeMaterialValue } from './forge-material-values';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { recalculateCharacterStats } from './character.service';
import { recordSkillPointChange } from './skill-point-ledger.service';
import { forgedPrimaryStats, forgedAffixCap, forgedEquipmentBase, forgedEquipmentCaps, forgeRarityMultiplier } from './constants';
import { attributes } from './types';
import { purifiedCraftMaterialBaseCode, purifiedCraftMaterialCode, purifiedCraftMaterialDisplayName, purifiedCraftMaterialValue, purifiedMaterialForArmor } from './monster-crafting-material.service';
import { secondaryProfessionBonus, secondaryProfessionMaxLevel, secondaryProfessionProficiencyRequired } from './secondary-profession';
import { epicForgeRecipes, epicRecipeByBlueprint, type EpicForgeRecipe } from '../config/epic-forging';

type WeaponRow = RowDataPacket & { id: number; name: string; item_category: string; quality: number; rarity: string; required_level: number; fusion_count: number };
type MaterialRow = RowDataPacket & { id: number; name: string; item_category: string; quantity: number; min_gain?: number; max_gain?: number; effect_json?: unknown; description?: string };
type ForgeRequirement = { code: string; quantity: number };
type ForgeEntrySource = 'blacksmith' | 'profession';
type BlacksmithProgressRow = RowDataPacket & { level: number; proficiency: number };
const rarityBonus: Record<string, number> = { '普通': 0, '优秀': 1, '精良': 2, '稀有': 3, '传说': 4, '史诗': 5 };
export const blacksmithMaxLevel = secondaryProfessionMaxLevel;
export const armorClassEffectText = (subtype: string | null | undefined, slot?: string) => {
  const large = armorPieceDescription(subtype, slot ?? 'upper');
  return large ? '甲类影响：各甲类基础双防相同；' + (slot ? large : '上装/下装每件' + large + '；头肩/腰部/脚部每件' + armorPieceDescription(subtype, 'shoulder')) + '。按品质发挥，逐件乘算。' : '';
};

/** 手续费按固定配方材料价值的 2.5% 收取，装备成本越高，手续费也越高。 */
export const forgeFee = (requirements: ReadonlyArray<{ code: string; quantity: number }>) => Math.max(1, Math.ceil(requirements.reduce((sum, requirement) => sum + (forgeMaterialValue[requirement.code] ?? purifiedCraftMaterialValue(requirement.code)) * requirement.quantity, 0) * .025));
const jsonRecord = (value: unknown): Record<string, unknown> => { if (!value) return {}; if (typeof value !== 'string') return value as Record<string, unknown>; try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } };
const fusionLimit = (weapon: Pick<WeaponRow, 'rarity' | 'required_level'>) => Math.floor(Math.max(0, Number(weapon.required_level)) / 10) + (rarityBonus[weapon.rarity] ?? 0);
const characterIdFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return Number(rows[0].id);
};
const proficiencyRequired = secondaryProfessionProficiencyRequired;
const blacksmithBonus = secondaryProfessionBonus;
const blacksmithProgressFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, lock = false) => {
  const shop=await shopProgressFor(connection,characterId,'blacksmith');if(shop)return {...shop,isBlacksmith:false};
  const [characters] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>(`SELECT secondary_profession_code FROM characters WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  if (characters[0]?.secondary_profession_code !== 'blacksmith') throw new Error('请从锻造师副职业或铁匠铺服务入口进行操作。');
  await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'blacksmith\',1,0)', [characterId]);
  const [rows] = await connection.execute<BlacksmithProgressRow[]>(`SELECT level,proficiency FROM player_secondary_professions WHERE character_id=? AND profession_code='blacksmith'${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  const level = Math.min(blacksmithMaxLevel, Math.max(1, Number(rows[0]?.level ?? 1)));
  const proficiency = Number(rows[0]?.proficiency ?? 0);
  return { isBlacksmith: true, level, proficiency, required: proficiencyRequired(level), bonus: blacksmithBonus(level) };
};
const addBlacksmithProficiency = async (connection: PoolConnection, characterId: number, gained = 1) => {
  const current = await blacksmithProgressFor(connection, characterId, true);
  if (!current.isBlacksmith) return current;
  let level = current.level;
  gained=await talentProficiency(connection,characterId,gained,{profession:'blacksmith'});
  let proficiency = level >= blacksmithMaxLevel ? 0 : current.proficiency + Math.max(0, Math.round(gained));
  while (level < blacksmithMaxLevel && proficiency >= proficiencyRequired(level)) {
    proficiency -= proficiencyRequired(level);
    level += 1;
  }
  if (level >= blacksmithMaxLevel) proficiency = 0;
  await connection.execute("UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=? AND profession_code='blacksmith'", [level, proficiency, characterId]);
  achievementSecondaryLevel(connection,Number(characterId),level);
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
  if (row.profession === 'alchemist') return { profession: '炼金师', level, percent, kind: 'potion' as const, text: `[炼金师Lv.${level}]你的药品期望品质与产量总收益提升${percent}%（品质达上限后折为额外产量）` };
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
export const fusionMaterials = async (qqUserId: string, equipmentCategory = '武器') => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(MaterialRow & { code: string; trade_price: number })[]>(`SELECT i.id,i.code,i.name,i.item_category,i.trade_price,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category<>'货币' ORDER BY i.item_category,i.name`, [characterId]);
  return rows.flatMap(row => {
    const profile = fusionProfileFor(row); if (!profile) return [];
    const keys = profileKeys(profile).filter(key => !key.startsWith('element') || (equipmentCategory === '武器' ? key.startsWith('elementMastery_') : key.startsWith('elementResistance_')));
    const description = profile.kind === 'combatPercent' ? '倾向：全战斗属性（必定）'
      : profile.kind === 'corePercent' ? '倾向：六维属性（必定）'
        : profile.kind === 'finalDamage' ? '倾向：造成伤害（必定）'
          : '';
    return [{ id: Number(row.id), name: row.name, category: row.item_category, quantity: Number(row.quantity), tendencyKeys: keys, fixedTendency: Boolean(profile.kind), description }];
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
  await assertHiddenInstanceMutable(connection, characterId, instanceId);
  const profession = await blacksmithProgressFor(connection, characterId, true);
  const [weapons] = await connection.execute<(WeaponRow & { item_id: number })[]>(`SELECT ii.id,ii.item_id,i.name,ii.quality,i.rarity,i.required_level,0 AS fusion_count FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND i.rarity<>'神器' FOR UPDATE`, [instanceId, characterId]);
  const weapon = weapons[0]; if (!weapon) throw new Error('请选择自己背包中的可精炼装备。');
  if (Number(weapon.quality) >= 100) throw new Error('该装备品质已达到 100%。');
  const [materials] = await connection.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity,rm.min_gain,rm.max_gain FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id JOIN blacksmith_refinement_materials rm ON rm.item_id=i.id WHERE pi.character_id=? AND i.id=? FOR UPDATE`, [characterId, materialId]);
  const material = materials[0]; if (!material || Number(material.quantity) < 1) throw new Error('没有可用的精炼材料。');
  if (material.code !== refinementMaterialCode(Number(weapon.required_level))) throw new Error(`该装备只能使用【${forgeMaterialName(refinementMaterialCode(Number(weapon.required_level)))}】精炼。`);
  const binding=await consumeInventory(connection,characterId,materialId,1);
  const quality = Number(weapon.quality); const failed = quality >= 90 && Math.random() >= Math.max(.35, .8 - (quality - 90) * .045);
  if (failed) {
    const progress = await addBlacksmithProficiency(connection, characterId);
    return { name: weapon.name, material: material.name, oldQuality: quality, newQuality: quality, gain: 0, failed: true, great: false, progress };
  }
  const great = Math.random() < Math.min(1, .03 + profession.bonus / 100); const gain = Math.min(100 - quality, refinementGain(Number(material.min_gain), Number(material.max_gain), quality) * (great ? 2 : 1)); const newQuality = Math.round((quality + gain) * 100) / 100;
  await connection.execute("UPDATE player_item_instances SET quality=?,bound_kind=IF(?,'personal',bound_kind),bound_at=IF(?,COALESCE(bound_at,NOW()),bound_at) WHERE id=?",[newQuality,binding.personal>0,binding.personal>0,instanceId]);
  await recalculateCharacterStats(connection, characterId);
  const progress = await addBlacksmithProficiency(connection, characterId);
  if(gain>0&&!currentSecondaryShop())recordAchievement(connection,characterId,['ACH_I16']);
  return { name: weapon.name, material: material.name, oldQuality: quality, newQuality, gain, failed: false, great, progress };
});
export const fuseWeapon = async (qqUserId: string, instanceId: number, materialId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  await assertHiddenInstanceMutable(connection, characterId, instanceId);
  const profession = await blacksmithProgressFor(connection, characterId, true);
  const [weapons] = await connection.execute<(WeaponRow & { effect_json: unknown; base_effect_json: unknown; item_id: number; weapon_type: string })[]>(`SELECT ii.id,ii.item_id,i.name,i.item_category,i.weapon_type,ii.quality,i.rarity,i.required_level,i.effect_json AS effect_json,i.effect_json AS base_effect_json,(SELECT COUNT(*) FROM equipment_fusions ef WHERE ef.instance_id=ii.id) AS fusion_count FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND i.rarity<>'神器' FOR UPDATE`, [instanceId, characterId]);
  const weapon = weapons[0]; if (!weapon) throw new Error('请选择自己背包中的装备。');
  const limit = fusionLimit(weapon); if (Number(weapon.fusion_count) >= limit) throw new Error(`该武器的熔铸次数已用尽（${weapon.fusion_count}/${limit}）。`);
  const [materials] = await connection.execute<(MaterialRow & { code: string; trade_price: number })[]>(`SELECT i.id,i.code,i.name,i.item_category,i.trade_price,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? AND i.item_type='material' AND i.item_category<>'货币' FOR UPDATE`, [characterId, materialId]);
  const material = materials[0]; if (!material || Number(material.quantity) < 1) throw new Error('请选择背包中的熔铸材料。');
  const profile = fusionProfileFor(material);
  if (!profile) throw new Error('熔铸只接受炼金提纯的通用材料、粒子、锻材、稀有或区域锻材，以及天空粉尘。');
  const primaryKeys = forgePrimaryKeys(weapon.item_category, weapon.weapon_type);
  const current = jsonRecord(weapon.effect_json);
  const level = Number(weapon.required_level);
  const caps = forgeEquipmentCapsFor(weapon.item_category, weapon.weapon_type, level, weapon.rarity, primaryKeys);
  const hasRemainingCap = (key: string) => isFusionPercentKey(key) || Number(current[key] ?? 0) < Number(caps[key] ?? 0);
  const preferredKeys = usableMaterialKeys(profile, weapon.item_category, weapon.weapon_type, primaryKeys, level, weapon.rarity).filter(hasRemainingCap);
  // 特殊材料是一整组独立的百分比属性：不能再沿用普通材料的武器类型过滤，
  // 否则全战斗属性会漏掉与当前武器主属性相反的一项，后续写入和显示也随之不完整。
  const usableKeys = profile.kind
    ? profileKeys(profile)
    : selectOrdinaryFusionKey(preferredKeys, weapon.item_category, weapon.weapon_type, level, weapon.rarity, current, caps);
  if (!usableKeys.length) throw new Error(`熔铸材料【${material.name}】不能用于${weapon.item_category}。`);
  const success = Math.min(100, 70 + profession.bonus);
  if (Math.random() * 100 >= success) {
    await consumeInventory(connection,characterId,materialId,1);
    const progress = await addBlacksmithProficiency(connection, characterId);
    return { name: weapon.name, material: material.name, effect: {}, count: Number(weapon.fusion_count), limit, failed: true, success, progress };
  }
  const original = jsonRecord(weapon.base_effect_json);
  // 实例效果中同时保存数值属性和神器标识、布尔触发器等语义效果。
  // 旧写法把全部字段 Number 化，导致 artifact 等字符串被写成 null、布尔效果变为 1，熔铸后便像是“顶替”了原有效果。
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(original)) if (typeof value !== 'number') merged[key] = value;
  const materialValue = forgeMaterialValue[material.code] ?? purifiedCraftMaterialValue(material.code) ?? Number(material.trade_price);
  const requested = Object.fromEntries(usableKeys.map(key => [key, fusionGain(profile, key, weapon.item_category, weapon.weapon_type, level, weapon.rarity, materialValue)]));
  const before = Object.fromEntries(usableKeys.map(key => [key, Number(merged[key] ?? 0)]));
  for (const [key, value] of Object.entries(requested)) merged[key] = Math.round((Number(merged[key] ?? 0) + Number(value)) * 10000) / 10000;
  capAdditionalEquipmentEffect(merged, weapon.item_category, weapon.weapon_type, Number(weapon.required_level), weapon.rarity);
  const added = Object.fromEntries(usableKeys.map(key => [key, Math.round((Number(merged[key] ?? 0) - Number(before[key] ?? 0)) * 10000) / 10000]).filter(([, value]) => Number(value) > 0));
  if (!Object.keys(added).length) throw new Error('目标词条已达当前上限，无法继续熔铸。');
  const binding=await consumeInventory(connection,characterId,materialId,1);
  await connection.execute("UPDATE player_item_instances SET effect_json=?,bound_kind=IF(?,'personal',bound_kind),bound_at=IF(?,COALESCE(bound_at,NOW()),bound_at) WHERE id=?",[JSON.stringify(merged),binding.personal>0,binding.personal>0,instanceId]);
  const [fusion] = await connection.execute<any>('INSERT INTO equipment_fusions (instance_id,material_item_id,effect_json) VALUES (?,?,?)', [instanceId, materialId, JSON.stringify(added)]);
  for (const [key, value] of Object.entries(added)) await connection.execute('INSERT INTO equipment_fusion_effects (fusion_id,effect_key,effect_value) VALUES (?,?,?)', [fusion.insertId, key, value]);
  await recalculateCharacterStats(connection, characterId);
  const progress = await addBlacksmithProficiency(connection, characterId);
  if(!currentSecondaryShop())recordAchievement(connection,characterId,['ACH_I17']);
  return { name: weapon.name, material: material.name, effect: added, count: Number(weapon.fusion_count) + 1, limit, failed: false, success, progress };
});

const forgeContribution = (code: string) => ({ living_wood: 15, meteor_iron: 25, star_copper: 35, moon_silver: 45, sun_gold: 60, beast_meat: 3, beast_bone: 7, beast_hide: 7, beast_tendon: 8, beast_core: 20, magic_wool: 15, magic_tusk: 18, magic_scale: 18, magic_claw: 18, magic_heartcore: 20, magic_blood: 16, magic_eye: 16, magic_horn: 16, refined_beast_bone: 32, refined_beast_hide: 32, refined_beast_tendon: 34, refined_beast_core: 52, refined_magic_wool: 46, refined_magic_tusk: 48, refined_magic_scale: 48, refined_magic_claw: 50, refined_magic_heartcore: 52, wood_element_dust: 12, metal_element_dust: 12, water_element_dust: 12, ice_element_dust: 12, dark_element_dust: 12, fire_element_dust: 12, thunder_element_dust: 12, light_element_dust: 12, riot_aura: 30, goblin_scrap_iron: 32, goblin_whetstone: 42, goblin_bowstring: 38, goblin_blast_core: 48, goblin_drumhide: 40, goblin_shadowcloth: 46, goblin_totem_shard: 52, goblin_earth_crystal: 54, goblin_command_seal: 78, goblin_colonel_insignia: 120 }[code] ?? 5);
/** Lv.25 起的主材按装备构造分配到四个 Lv.30 地图的区域锻材。 */
const tierForgeMaterial = (category: string, subtype: string | null | undefined, level: number) => {
  if (level <= 20) return 'living_wood';
  if (category === '武器') {
    if (subtype === '匕首') return 'duskvein_crystal';
    if (subtype === '法杖' || subtype === '法书' || subtype === '法球') return 'marsh_heart';
    if (subtype === '拳刃') return 'fire_crystal';
    return 'ridge_core'; // 长剑、盾牌
  }
  if (subtype === '布甲') return 'marsh_heart';
  if (subtype === '皮甲') return 'duskvein_crystal';
  if (subtype === '重甲') return 'fire_crystal';
  return 'ridge_core'; // 轻甲、板甲
};
const weaponCraftMaterial = (subtype: string | null | undefined, equipmentLevel: number) => subtype === '匕首' ? purifiedCraftMaterialCode('gel_skin', equipmentLevel) : subtype === '法杖' || subtype === '法书' || subtype === '法球' ? purifiedCraftMaterialCode('hair', equipmentLevel) : subtype === '盾牌' ? purifiedCraftMaterialCode('shell', equipmentLevel) : purifiedCraftMaterialCode('bone', equipmentLevel);
/** 同一 20 级循环使用同一套材料；循环内每提升 5 级，需求数量增加 20%。 */
const normalForgeQuantity = (baseQuantity: number, level: number) => Math.ceil(baseQuantity * (1 + (((level - 5) % 20 + 20) % 20) / 5 * .2));
const forgeRequirements = (category: string, subtype: string | null | undefined, level: number): ForgeRequirement[] => {
  const base = tierForgeMaterial(category, subtype, level);
  if (![5, 10, 15, 20, 25, 30].includes(level)) throw new Error('当前仅开放每 5 级一档、至 Lv.30 的常规打造。');
  if (category === '武器') {
    return [{ code: base, quantity: normalForgeQuantity(10, level) }, { code: weaponCraftMaterial(subtype, level), quantity: normalForgeQuantity(3, level) }];
  }
  const armorType = ['轻甲', '皮甲', '重甲', '布甲', '板甲'].includes(subtype ?? '') ? subtype! : '轻甲';
  const weights: Record<string, [number, number]> = {
    '头肩': [4, 1], '上装': [7, 2], '腰部': [4, 1], '下装': [6, 2], '脚部': [4, 1]
  };
  const [mainQuantity, craftQuantity] = weights[category] ?? [0, 0];
  if (!mainQuantity || !craftQuantity) throw new Error('该装备部位暂不支持常规打造。');
  return [{ code: base, quantity: normalForgeQuantity(mainQuantity, level) }, { code: purifiedMaterialForArmor(armorType, level), quantity: normalForgeQuantity(craftQuantity, level) }];
};
const refinementMaterialCode = (level: number) => level <= 20 ? 'living_wood' : level <= 30 ? 'ridge_core' : 'sun_gold';
const forgeMaterialNames: Record<string, string> = { living_wood: '活纹木胚', ridge_core: '岩脊核心', fire_crystal: '炉心赤晶', marsh_heart: '雾沼心', duskvein_crystal: '幽纹黑晶', meteor_iron: '陨铁锻锭', star_copper: '星铜锻锭', moon_silver: '月银锻锭', sun_gold: '曜金合锭', beast_core: '兽核', beast_bone: '兽骨', beast_hide: '兽皮', beast_tendon: '兽筋', magic_wool: '魔力绒毛', magic_scale: '魔力鳞片' };
const forgeMaterialName = (code: string) => forgeMaterialNames[code] ?? purifiedCraftMaterialDisplayName(code) ?? code;
const forgeCategories = new Set(['武器', '头肩', '上装', '腰部', '下装', '脚部']);
const weaponTypes = new Set(['长剑', '法杖', '法书', '法球', '匕首', '拳刃', '盾牌']); const armorTypes = new Set(['布甲', '皮甲', '轻甲', '重甲', '板甲']);
export const forgeRarityWeights = (blacksmithLevel: number): Array<[string, number]> => {
  const level = Math.max(1, Math.floor(blacksmithLevel));
  const chances: Record<number, [number, number, number, number, number]> = {
    1: [60, 30, 10, 0, 0], 2: [50, 37, 12, 1, 0], 3: [40, 43, 15, 2, 0], 4: [30, 48, 19, 3, 0], 5: [18, 52, 24, 5, 1],
    6: [0, 60, 30, 8, 2], 7: [0, 50, 36, 11, 3], 8: [0, 36, 44, 15, 5], 9: [0, 20, 54, 19, 7], 10: [0, 0, 65, 25, 10]
  };
  const values = chances[level] ?? [0, 0, 50, 35, 15];
  return ['普通', '优秀', '精良', '稀有', '传说'].map((rarity, index) => [rarity, values[index]!] as [string, number]);
};
const forgeRarity = (blacksmithLevel: number) => {
  const weights = forgeRarityWeights(blacksmithLevel);
  let roll = Math.random() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  return weights.find(([, weight]) => (roll -= weight) <= 0)?.[0] ?? '普通';
};
/** 打造装备的主属性由装备类型决定。 */
export const forgePrimaryKeys = (category: string, subtype: string | null | undefined): string[] => {
  if (category === '武器' || category === '副手') {
    if (subtype === '盾牌') return ['physicalDefense', 'magicDefense'];
    if (subtype === '长剑') return ['physicalAttack'];
    if (subtype === '法杖' || subtype === '法书' || subtype === '法球') return ['magicAttack'];
    if (subtype === '匕首') return ['physicalAttack', 'magicAttack'];
    return ['physicalAttack'];
  }
  // 五种甲的双防均为主属性且基准相同，甲类差异由附带属性和套装提供。
  return ['physicalDefense', 'magicDefense'];
};
const baseForgeEffect = forgedPrimaryStats;
type ForgeMaterialProfile = { key: string; secondaryKey?: string; additionalKeys?: string[]; min: number; max: number; tier: 'small' | 'exclusive'; fixedValue?: number; kind?: 'ordinary' | 'combatPercent' | 'corePercent' | 'finalDamage' };
const profileKeys = (profile: ForgeMaterialProfile) => [...new Set([profile.key, ...(profile.secondaryKey ? [profile.secondaryKey] : []), ...(profile.additionalKeys ?? [])])];
const combatPercentKeys = ['hpPct','mpPct','physicalAttackPct','magicAttackPct','physicalDefensePct','magicDefensePct','accuracyPct','evasionPct','critRatePct','critDamagePct','critResistPct','critDamageReductionPct','tenacityPct','tenacityPiercePct','speedPct'];
const corePercentKeys = attributes.map(attribute => `${attribute}Pct`);
const isFusionPercentKey = (key: string) => combatPercentKeys.includes(key) || corePercentKeys.includes(key) || key === 'damageBonusPct';
/** 普通材料有 60% 概率命中其倾向词条；其余 40% 在可用的其他常规辅词条中等权抽取。 */
const selectOrdinaryFusionKey = (preferredKeys: string[], category: string, subtype: string | null | undefined, level: number, rarity: string, current: Record<string, unknown>, caps: Record<string, number>) => {
  const preferred = preferredKeys.filter(key => Number(current[key] ?? 0) < Number(caps[key] ?? 0));
  const alternatives = randomSecondaryAffixPool(category, subtype ?? '', level, rarity)
    .map(entry => entry.key)
    .filter(key => !preferredKeys.includes(key) && Number(current[key] ?? 0) < Number(caps[key] ?? 0));
  const pool = !preferred.length ? alternatives : !alternatives.length || Math.random() < .6 ? preferred : alternatives;
  if (!pool.length) return [];
  return [pool[Math.floor(Math.random() * pool.length)]!];
};
const usableMaterialKeys = (profile: ForgeMaterialProfile, category: string, subtype: string | null | undefined, primaryKeys: readonly string[], level: number, rarity: string) => profileKeys(profile).filter(key => {
  const offTypeWeaponAttack = category === '武器' && (key === 'physicalAttack' || key === 'magicAttack') && !primaryKeys.includes(key);
  const coreAttribute = attributes.includes(key as (typeof attributes)[number]);
  return !offTypeWeaponAttack && (isFusionPercentKey(key) || coreAttribute || primaryKeys.includes(key) || forgedAffixCap(equipmentKind(category, subtype), key, level, rarity) > 0);
});
const forgeMaterialProfiles: Record<string, ForgeMaterialProfile> = {
  // 当前炼金提纯出的五种通用甲材，按材质倾向落入各自的常规装备词条。
  spellcloth_bolt: { key: 'magicDefense', min: 1, max: 2, tier: 'exclusive' }, tanned_spirit_leather: { key: 'evasion', min: 2, max: 4, tier: 'exclusive' }, bone_steel_plate: { key: 'critResistBp', min: 2, max: 4, tier: 'exclusive' }, cast_shell_plate: { key: 'physicalDefense', min: 1, max: 2, tier: 'exclusive' }, laminated_scale_plate: { key: 'tenacity', min: 2, max: 4, tier: 'exclusive' },
  // 三类基础粒子同样可熔铸；元素粒子在下方按元素分别配置。
  blood_residue: { key: 'hpMax', min: 2, max: 4, tier: 'small' }, energy_ember: { key: 'speed', min: 2, max: 4, tier: 'small' }, magic_unit: { key: 'magicAttack', min: 1, max: 2, tier: 'small' },
  beast_meat: { key: 'hpMax', min: 2, max: 4, tier: 'small' }, beast_bone: { key: 'physicalDefense', min: 1, max: 2, tier: 'small' }, beast_hide: { key: 'magicDefense', min: 1, max: 2, tier: 'small' }, beast_tendon: { key: 'speed', min: 2, max: 4, tier: 'small' }, beast_core: { key: 'physicalAttack', secondaryKey: 'magicAttack', min: 1, max: 2, tier: 'small' },
  magic_wool: { key: 'evasion', min: 2, max: 4, tier: 'exclusive' }, magic_tusk: { key: 'accuracy', min: 2, max: 4, tier: 'exclusive' }, magic_scale: { key: 'critResistBp', min: 2, max: 4, tier: 'exclusive' }, magic_claw: { key: 'critRateBp', min: 2, max: 4, tier: 'exclusive' }, magic_heartcore: { key: 'critDamageBp', min: 2, max: 4, tier: 'exclusive' }, magic_blood: { key: 'mpMax', min: 2, max: 4, tier: 'exclusive' }, magic_eye: { key: 'critDamageReductionBp', min: 2, max: 4, tier: 'exclusive' }, magic_horn: { key: 'tenacity', min: 2, max: 4, tier: 'exclusive' },
  refined_beast_bone: { key: 'physicalDefense', min: 1, max: 2, tier: 'exclusive' }, refined_beast_hide: { key: 'magicDefense', min: 1, max: 2, tier: 'exclusive' }, refined_beast_tendon: { key: 'speed', min: 2, max: 4, tier: 'exclusive' }, refined_beast_core: { key: 'physicalAttack', secondaryKey: 'magicAttack', min: 1, max: 2, tier: 'exclusive' },
  refined_magic_wool: { key: 'evasion', min: 2, max: 4, tier: 'exclusive' }, refined_magic_tusk: { key: 'accuracy', min: 2, max: 4, tier: 'exclusive' }, refined_magic_scale: { key: 'critResistBp', min: 2, max: 4, tier: 'exclusive' }, refined_magic_claw: { key: 'critRateBp', min: 2, max: 4, tier: 'exclusive' }, refined_magic_heartcore: { key: 'critDamageBp', min: 2, max: 4, tier: 'exclusive' },
  living_wood: { key: 'hpMax', min: 2, max: 4, tier: 'small' }, meteor_iron: { key: 'physicalDefense', min: 1, max: 2, tier: 'small' }, star_copper: { key: 'accuracy', min: 2, max: 4, tier: 'small' }, moon_silver: { key: 'mpMax', min: 2, max: 4, tier: 'small' }, sun_gold: { key: 'physicalAttack', min: 1, max: 2, tier: 'small' },
  root_heart: { key: 'hpMax', min: 5, max: 8, tier: 'small' }, river_shell: { key: 'elementMastery_水', secondaryKey: 'elementResistance_水', min: 3, max: 5, tier: 'small' }, tide_shell: { key: 'physicalDefense', min: 4, max: 6, tier: 'small' }, ridge_core: { key: 'elementMastery_土', secondaryKey: 'elementResistance_土', min: 4, max: 6, tier: 'exclusive' }, fire_crystal: { key: 'elementMastery_火', secondaryKey: 'elementResistance_火', min: 4, max: 6, tier: 'exclusive' }, marsh_heart: { key: 'magicDefense', min: 4, max: 7, tier: 'exclusive' }, star_mud_core: { key: 'elementMastery_暗', secondaryKey: 'elementResistance_暗', min: 5, max: 7, tier: 'exclusive' }, frost_crystal: { key: 'elementMastery_冰', secondaryKey: 'elementResistance_冰', min: 5, max: 7, tier: 'exclusive' }, thunder_core: { key: 'elementMastery_雷', secondaryKey: 'elementResistance_雷', min: 5, max: 7, tier: 'exclusive' }, eclipse_core: { key: 'elementMastery_光', secondaryKey: 'elementResistance_光', min: 6, max: 8, tier: 'exclusive' },
  magic_branch: { key: 'elementMastery_木', secondaryKey: 'elementResistance_木', min: 3, max: 5, tier: 'small' },
  wood_element_dust: { key: 'elementMastery_木', secondaryKey: 'elementResistance_木', min: 3, max: 5, tier: 'small' },
  goblin_scrap_iron: { key: 'physicalDefense', min: 3, max: 3, tier: 'exclusive', fixedValue: 3 },
  goblin_whetstone: { key: 'physicalAttack', min: 16, max: 16, tier: 'exclusive', fixedValue: 16 },
  goblin_bowstring: { key: 'accuracy', min: 14, max: 14, tier: 'exclusive', fixedValue: 14 },
  goblin_blast_core: { key: 'critDamageBp', min: 10, max: 10, tier: 'exclusive', fixedValue: 10 },
  goblin_drumhide: { key: 'speed', min: 12, max: 12, tier: 'exclusive', fixedValue: 12 },
  goblin_shadowcloth: { key: 'evasion', min: 12, max: 12, tier: 'exclusive', fixedValue: 12 },
  goblin_totem_shard: { key: 'magicAttack', min: 18, max: 18, tier: 'exclusive', fixedValue: 18 },
  goblin_earth_crystal: { key: 'physicalDefense', min: 16, max: 16, tier: 'exclusive', fixedValue: 16 },
  goblin_command_seal: { key: 'physicalDefense', secondaryKey: 'magicDefense', min: 8, max: 8, tier: 'exclusive', fixedValue: 8 },
  goblin_colonel_insignia: { key: 'constitution', additionalKeys: ['spirit','strength','intelligence','agility','perception'], min: 6, max: 6, tier: 'exclusive', fixedValue: 6 },
  duskvein_crystal: { key: 'elementMastery_暗', secondaryKey: 'elementResistance_暗', min: 5, max: 7, tier: 'exclusive' },
  metal_element_dust: { key: 'elementMastery_土', secondaryKey: 'elementResistance_土', min: 3, max: 5, tier: 'small' },
  water_element_dust: { key: 'elementMastery_水', secondaryKey: 'elementResistance_水', min: 3, max: 5, tier: 'small' },
  ice_element_dust: { key: 'elementMastery_冰', secondaryKey: 'elementResistance_冰', min: 3, max: 5, tier: 'small' },
  dark_element_dust: { key: 'elementMastery_暗', secondaryKey: 'elementResistance_暗', min: 3, max: 5, tier: 'small' },
  fire_element_dust: { key: 'elementMastery_火', secondaryKey: 'elementResistance_火', min: 3, max: 5, tier: 'small' },
  thunder_element_dust: { key: 'elementMastery_雷', secondaryKey: 'elementResistance_雷', min: 3, max: 5, tier: 'small' },
  light_element_dust: { key: 'elementMastery_光', secondaryKey: 'elementResistance_光', min: 3, max: 5, tier: 'small' },
};
const specialFusionProfiles: Record<string, ForgeMaterialProfile> = {
  meteor_iron: { key: combatPercentKeys[0]!, additionalKeys: combatPercentKeys.slice(1), min: .1, max: .5, tier: 'exclusive', kind: 'combatPercent' },
  star_copper: { key: combatPercentKeys[0]!, additionalKeys: combatPercentKeys.slice(1), min: .3, max: .8, tier: 'exclusive', kind: 'combatPercent' },
  moon_silver: { key: combatPercentKeys[0]!, additionalKeys: combatPercentKeys.slice(1), min: .6, max: 1.4, tier: 'exclusive', kind: 'combatPercent' },
  sun_gold: { key: combatPercentKeys[0]!, additionalKeys: combatPercentKeys.slice(1), min: 1, max: 2, tier: 'exclusive', kind: 'combatPercent' },
  riot_aura: { key: 'damageBonusPct', min: .1, max: 1, tier: 'exclusive', kind: 'finalDamage' },
  sky_dust: { key: corePercentKeys[0]!, additionalKeys: corePercentKeys.slice(1), min: .1, max: 1, tier: 'exclusive', kind: 'corePercent' }
};
const fusionMaterialCategories = new Set(['粒子', '锻材', '稀有锻材', '区域锻材']);
const fusionProfileFor = (material: { code: string; item_category: string; trade_price?: number }) => {
  const special = specialFusionProfiles[material.code]; if (special) return special;
  const purified = material.code.startsWith('refined_') || Boolean(purifiedCraftMaterialDisplayName(material.code));
  if (!purified && !fusionMaterialCategories.has(material.item_category)) return undefined;
  return forgeMaterialProfiles[purifiedCraftMaterialBaseCode(material.code) ?? material.code];
};
/** 基础价值 20 时约为词条上限的 20%；价值提升五倍时，增量恰为两倍。 */
const fusionValueRatio = (value: number) => Math.min(.6, .2 * Math.pow(Math.max(1, value) / 20, Math.log(2) / Math.log(5)));
const fusionGain = (profile: ForgeMaterialProfile, key: string, category: string, subtype: string | null | undefined, level: number, rarity: string, value: number) => {
  if (profile.kind === 'combatPercent' || profile.kind === 'corePercent' || profile.kind === 'finalDamage') return Math.round((profile.min + Math.random() * (profile.max - profile.min)) * 10000) / 10000;
  const cap = forgedAffixCap(equipmentKind(category, subtype), key, level, rarity);
  return Math.round(cap * fusionValueRatio(value || 20) * (.75 + Math.random() * .5) * 10000) / 10000;
};
/** 每份辅材独立使用截断正态分布结算，随后才按装备词条上限截断。 */
const normalForgeBaseFactor = () => {
  const left = Math.max(Number.EPSILON, Math.random()); const right = Math.max(Number.EPSILON, Math.random());
  const standard = Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
  return .62 + standard * .16;
};
const normalForgeFactor = () => Math.max(.08, Math.min(1, normalForgeBaseFactor()));
const forgeProficiencyGain = (category: string, level: number, rarity: string) => {
  const rarityBonusPct: Record<string, number> = { '普通': 0, '优秀': 10, '精良': 20, '稀有': 35, '传说': 50, '史诗': 75, '神器': 100 };
  const base = Math.max(1, level) * (category === '武器' ? 2 : 1);
  return Math.round(base * (1 + (rarityBonusPct[rarity] ?? 0) / 100));
};
const equipmentKind = (category: string, subtype?: string | null): '武器' | '防具' => (category === '武器' || category === '副手') && subtype !== '盾牌' ? '武器' : '防具';
const randomAffixKeys = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'critRateBp', 'critDamageBp', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'tenacityPierce', 'speed'];
type WeightedAffix = { key: string; weight: number };
const randomSecondaryAffixWeight = (key: string) => {
  if (!key.startsWith('elementMastery_') && !key.startsWith('elementResistance_')) return 1;
  const element = key.split('_')[1];
  return element === '光' || element === '暗' ? .25 : .5;
};
const randomSecondaryAffixPool = (category: string, subtype: string, level: number, rarity: string) => {
  const kind = equipmentKind(category, subtype); const primary = new Set(forgePrimaryKeys(category, subtype));
  const keys = [...randomAffixKeys, ...['水', '火', '土', '木', '风', '冰', '雷', '光', '暗'].map(element => `${kind === '武器' ? 'elementMastery' : 'elementResistance'}_${element}`)];
  return keys.filter(key => {
    const incompatibleAttack = category === '武器' && (key === 'physicalAttack' || key === 'magicAttack') && !primary.has(key);
    return !primary.has(key) && !incompatibleAttack && forgedAffixCap(kind, key, level, rarity) > 0;
  }).map(key => ({ key, weight: randomSecondaryAffixWeight(key) }));
};
const pickRandomSecondaryAffix = (pool: WeightedAffix[]) => {
  let roll = Math.random() * pool.reduce((total, entry) => total + entry.weight, 0);
  const index = pool.findIndex(entry => (roll -= entry.weight) < 0);
  return pool.splice(index < 0 ? pool.length - 1 : index, 1)[0]!.key;
};
const randomForgeValue = (upper: number) => Math.round(Math.max(.01, upper * normalForgeFactor()) * 100) / 100;
const randomWeaponPrimary = (value: number) => Math.round(value * (.9 + Math.random() * .2) * 100) / 100;
// 品质与词条数值、稀有度均独立；每件装备在 0%～100% 间均匀随机，可通过精炼逐步提升。
const randomForgeQuality = () => Math.round(Math.random() * 1000) / 10;
/** 史诗图纸保证稀有度，但锻造品质仍受火候影响：以约 62% 为中心截断正态分布。 */
const randomEpicForgeQuality = () => Math.round(Math.max(0, Math.min(100, normalForgeBaseFactor() * 100)) * 10) / 10;
// Lv.5 起每 5 级提升 1%，Lv.50 封顶 10%。
const specialAffixChance = (level: number) => Math.max(.01, Math.min(.1, Math.floor(Math.max(1, Number(level)) / 5) / 100));
/** 主人测试装备也走正式锻造的副词条池、上限与正态分布规则。 */
export const legendaryTestForgeDraft = (category: string, subtype: string, level: number) => {
  const rarity = '传说'; const kind = equipmentKind(category, subtype); const primaryKeys = forgePrimaryKeys(category, subtype);
  const effect = Object.fromEntries(Object.entries(baseForgeEffect(category, subtype, level, rarity)).map(([key, value]) => [key, category === '武器' && subtype !== '盾牌' ? randomWeaponPrimary(Number(value)) : Number(value)])) as Record<string, number>;
  const pool = randomSecondaryAffixPool(category, subtype, level, rarity);
  for (let index = 0; index < secondaryAffixCount(rarity) && pool.length; index++) {
    const picked = pickRandomSecondaryAffix(pool);
    effect[picked] = randomForgeValue(forgedAffixCap(kind, picked, level, rarity));
  }
  if (category === '武器' && subtype !== '盾牌' && Math.random() < specialAffixChance(level)) effect.damageBonusPct = Math.round(randomForgeValue(5) * 10) / 10;
  if ((category !== '武器' || subtype === '盾牌') && Math.random() < specialAffixChance(level)) effect.damageReductionPct = Math.round(randomForgeValue(5) * 10) / 10;
  capForgeEffect(effect, category, subtype, level, rarity);
  return { rarity, name: forgeName(subtype, level, effect), effect, primaryKeys };
};
export const forgeEquipmentCapsFor = (category: string, subtype: string | null | undefined, level: number, rarity: string, primaryKeys: readonly string[]) => {
  const caps = forgedEquipmentCaps(equipmentKind(category, subtype), level, rarity, primaryKeys, category);
  if ((category === '武器' || category === '副手') && subtype === '盾牌') {
    const base = forgedEquipmentBase(level, '武器') * (forgeRarityMultiplier[rarity] ?? 1);
    caps.physicalDefense = base;
    caps.magicDefense = base * .5;
  } else if (category === '武器' || category === '副手') {
    const upper = forgedEquipmentBase(level, '武器') * (forgeRarityMultiplier[rarity] ?? 1);
    for (const key of primaryKeys) caps[key] = Math.max(Number(caps[key] ?? 0), upper);
  }
  return caps;
};
const capForgeEffect = (effect: Record<string, number>, category: string, subtype: string, level: number, rarity: string) => {
  const caps = forgeEquipmentCapsFor(category, subtype, level, rarity, forgePrimaryKeys(category, subtype));
  for (const [key, cap] of Object.entries(caps)) if (key in effect) effect[key] = Math.round(Math.max(0, Math.min(cap, Number(effect[key] ?? 0))) * 100) / 100;
  effect.balanceVersion = 3;
  return effect;
};
/** 熔铸只受每条词条的独立上限约束，不再使用跨属性总容量。 */
const capAdditionalEquipmentEffect = (effect: Record<string, unknown>, category: string, subtype: string, level: number, rarity: string) => {
  const caps = forgeEquipmentCapsFor(category, subtype, level, rarity, forgePrimaryKeys(category, subtype));
  for (const [key, cap] of Object.entries(caps)) if (key in effect) effect[key] = Math.round(Math.max(0, Math.min(cap, Number(effect[key] ?? 0))) * 100) / 100;
  return effect;
};
const secondaryAffixCount = (rarity: string) => ({ '普通': 0, '优秀': 1, '精良': 2, '稀有': 3, '传说': 4, '史诗': 4 }[rarity] ?? 0);
/** 常规成品名称明确保留主锻材系谱，避免 Lv.25/30 仍沿用旧的泛等级名。 */
const forgeMaterialTitle = (materialCode: string | undefined, level: number) => materialCode === 'living_wood' ? '活纹'
  : materialCode === 'ridge_core' ? '岩脊'
    : materialCode === 'fire_crystal' ? '赤晶'
      : materialCode === 'marsh_heart' ? '雾沼'
        : materialCode === 'duskvein_crystal' ? '幽纹'
          : level <= 10 ? '灵木' : level <= 20 ? '玄铁' : level <= 30 ? '陨星' : level <= 40 ? '皓月' : '日曜';
const forgeName = (subtype: string, level: number, effect: Record<string, number>, materialCode?: string) => {
  const affixes: Array<[string, string]> = [['physicalAttack', '锋利'], ['magicAttack', '灵辉'], ['physicalDefense', '坚固'], ['magicDefense', '秘护'], ['hpMax', '生机'], ['mpMax', '澄明'], ['accuracy', '精准'], ['evasion', '轻盈'], ['tenacityPierce', '破势'], ['speed', '迅捷'], ['critRateBp', '致命']];
  const affix = [...affixes].sort(([left], [right]) => Number(effect[right] ?? 0) - Number(effect[left] ?? 0))[0]?.[1] ?? '匠制';
  const tier = forgeMaterialTitle(materialCode, level);
  return `${affix}·${tier}${subtype}`;
};
export const forgeState = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const progress = await blacksmithProgressFor(pool, characterId);
  const [sessions] = await pool.execute<(RowDataPacket & { equipment_category: string | null; subtype: string | null; target_level: number | null; entry_source: ForgeEntrySource })[]>('SELECT equipment_category,subtype,target_level,entry_source FROM player_forge_sessions WHERE character_id=?', [characterId]);
  const [materials] = await pool.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity,COALESCE(fm.quantity,0) AS selected_quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id LEFT JOIN player_forge_materials fm ON fm.character_id=pi.character_id AND fm.item_id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category<>'货币' ORDER BY i.item_category,i.name`, [characterId]);
  const level = sessions[0]?.target_level === null || !sessions[0] ? null : Number(sessions[0].target_level);
  const requirements = (level && sessions[0]?.equipment_category ? forgeRequirements(sessions[0].equipment_category, sessions[0]?.subtype, level) : []).map(requirement => ({ ...requirement, name: forgeMaterialName(requirement.code) }));
  const requiredCodes = new Set(requirements.map(item => item.code));
  const selected = materials.filter(item => !requiredCodes.has(item.code) && Number((item as any).selected_quantity) > 0).map(item => ({ id: Number(item.id), name: item.name, quantity: Number((item as any).selected_quantity), contribution: forgeContribution(item.code) }));
  return { category: sessions[0]?.equipment_category ?? null, subtype: sessions[0]?.subtype ?? null, level, source: sessions[0]?.entry_source ?? 'blacksmith' as ForgeEntrySource, materials: materials.map(item => ({ id: Number(item.id), name: item.name, code: item.code, category: item.item_category, quantity: Number(item.quantity), selected: requiredCodes.has(item.code) ? 0 : Number((item as any).selected_quantity ?? 0), contribution: forgeContribution(item.code), supported: requiredCodes.has(item.code) || Boolean(forgeMaterialProfiles[item.code]) })), selected, requirements, minimumAuxiliary: 0, success: 100, progress };
};
export const resetForgeSession = async (qqUserId: string, source: ForgeEntrySource = 'blacksmith') => withTransaction(async connection => { source=currentSecondaryShop()?'blacksmith':'profession'; const characterId = await characterIdFor(connection, qqUserId, true); await blacksmithProgressFor(connection,characterId,true); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [characterId]); await connection.execute('DELETE FROM player_forge_sessions WHERE character_id=?', [characterId]); await connection.execute('INSERT INTO player_forge_sessions (character_id,entry_source) VALUES (?,?)', [characterId, source]); });
export const selectForgeCategory = async (qqUserId: string, category: string) => withTransaction(async connection => { if (!forgeCategories.has(category)) throw new Error('该装备部位暂不支持打造。'); const characterId = await characterIdFor(connection, qqUserId, true); await connection.execute('INSERT INTO player_forge_sessions (character_id,equipment_category,subtype,target_level) VALUES (?,?,NULL,NULL) ON DUPLICATE KEY UPDATE equipment_category=VALUES(equipment_category),subtype=NULL,target_level=NULL', [characterId, category]); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [characterId]); return category; });
export const selectForgeSubtype = async (qqUserId: string, subtype: string) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); const [rows] = await connection.execute<(RowDataPacket & { equipment_category: string | null })[]>('SELECT equipment_category FROM player_forge_sessions WHERE character_id=? FOR UPDATE', [characterId]); const category = rows[0]?.equipment_category; if (!category) throw new Error('请先选择打造部位。'); if (category === '武器' ? !weaponTypes.has(subtype) : !armorTypes.has(subtype)) throw new Error('该装备类型不可用。'); await connection.execute('UPDATE player_forge_sessions SET subtype=?,target_level=NULL WHERE character_id=?', [subtype, characterId]); return subtype; });
export const selectForgeLevel = async (qqUserId: string, level: number) => withTransaction(async connection => { if (![5, 10, 15, 20, 25, 30].includes(level)) throw new Error('当前仅开放 Lv.5–30、每 5 级一档的常规打造。'); const characterId = await characterIdFor(connection, qqUserId, true); const [rows] = await connection.execute<(RowDataPacket & { subtype: string | null })[]>('SELECT subtype FROM player_forge_sessions WHERE character_id=? FOR UPDATE', [characterId]); if (!rows[0]?.subtype) throw new Error('请先选择装备类型。'); await connection.execute('UPDATE player_forge_sessions SET target_level=? WHERE character_id=?', [level, characterId]); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [characterId]); return level; });
export const addForgeMaterial = async (qqUserId: string, itemId: number, quantity = 1) => withTransaction(async connection => { if (!Number.isInteger(quantity) || quantity < 1) throw new Error('放入数量必须是正整数。'); const characterId = await characterIdFor(connection, qqUserId, true); const [items] = await connection.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category<>'货币' FOR UPDATE`, [characterId, itemId]); const item = items[0]; if (!item) throw new Error('请选择背包中的材料。'); if (!forgeMaterialProfiles[item.code]) throw new Error(`材料【${item.name}】尚未配置锻造倾向，不能作为辅材。`); const [selected] = await connection.execute<(RowDataPacket & { quantity: number })[]>('SELECT quantity FROM player_forge_materials WHERE character_id=? AND item_id=? FOR UPDATE', [characterId, itemId]); if (Number(selected[0]?.quantity ?? 0) + quantity > Number(item.quantity)) throw new Error(`材料数量不足，最多还能放入 ${Math.max(0, Number(item.quantity) - Number(selected[0]?.quantity ?? 0))} 份。`); await connection.execute('INSERT INTO player_forge_materials (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [characterId, itemId, quantity]); return { name: item.name, quantity }; });
export const removeForgeMaterial = async (qqUserId: string, itemId: number) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); const [rows] = await connection.execute<(RowDataPacket & { quantity: number })[]>('SELECT quantity FROM player_forge_materials WHERE character_id=? AND item_id=? FOR UPDATE', [characterId, itemId]); if (!rows[0] || Number(rows[0].quantity) < 1) throw new Error('该材料尚未放入。'); await connection.execute('UPDATE player_forge_materials SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, itemId]); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, itemId]); });
export const setForgeMaterial = async (qqUserId: string, itemId: number, quantity: number) => withTransaction(async connection => { if (!Number.isInteger(quantity) || quantity < 0) throw new Error('材料数量必须是非负整数。'); const characterId = await characterIdFor(connection, qqUserId, true); const [items] = await connection.execute<(MaterialRow & { code: string })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? AND pi.quantity>0 AND i.item_type='material' AND i.item_category<>'货币' FOR UPDATE`, [characterId, itemId]); const item = items[0]; if (!item) throw new Error('请选择背包中的材料。'); if (!quantity) { await connection.execute('DELETE FROM player_forge_materials WHERE character_id=? AND item_id=?', [characterId, itemId]); return; } if (!forgeMaterialProfiles[item.code]) throw new Error(`材料【${item.name}】尚未配置锻造倾向，不能作为辅材。`); if (quantity > Number(item.quantity)) throw new Error(`材料数量不足，最多可放入 ${item.quantity} 份。`); await connection.execute('INSERT INTO player_forge_materials (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)', [characterId, itemId, quantity]); });
export const clearForgeMaterial = async (qqUserId: string, itemId: number) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); await blacksmithProgressFor(connection,characterId,true); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=? AND item_id=?', [characterId, itemId]); });
export const craftForgeEquipment = async (qqUserId: string, _confirmed = false) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); const profession = await blacksmithProgressFor(connection, characterId, true); const [sessions] = await connection.execute<(RowDataPacket & { equipment_category: string; subtype: string; target_level: number; entry_source: ForgeEntrySource })[]>('SELECT equipment_category,subtype,target_level,entry_source FROM player_forge_sessions WHERE character_id=? FOR UPDATE', [characterId]); const session = sessions[0]; if(session?.entry_source!==(currentSecondaryShop()?'blacksmith':'profession'))throw new Error('打造来源已改变，请从当前面板重新选择打造。'); if (!session?.equipment_category || !session.subtype || !session.target_level) throw new Error('请完成打造目标选择。');
  const requirements = forgeRequirements(session.equipment_category, session.subtype, Number(session.target_level));
  const materials=await fixedTalentMaterials(connection,characterId,requirements,requirements.slice(1).map(r=>r.code),!currentSecondaryShop());
  const talent=await ownedTalent(connection,characterId),talentData=await readTalentData(connection,characterId);
  const risk=!currentSecondaryShop()&&talent?.number==='H09'&&talentData.settings.riskCraft===true;
  if(risk&&materials.some(m=>m.item.rarity!=='普通'))throw new Error('孤注制作不能用于含稀有主材的配方。');
  const success = risk?70:100;
  const primaryKeys = forgePrimaryKeys(session.equipment_category, session.subtype);
  const fee = forgeFee(requirements); const [coins] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [characterId]); if (Number(coins[0]?.copper_coins ?? 0) < fee) throw new Error(`铜币不足，打造手续费需要 ${fee} 铜币。`);
  let personalInput=false;for (const material of materials){const {binding}=await consumeTalentMaterial(connection,characterId,Number(material.item.id),material.quantity,'craft',!currentSecondaryShop());personalInput ||= binding.personal>0;} await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]); await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [fee, characterId]); await connection.execute('DELETE FROM player_forge_materials WHERE character_id=?', [characterId]);
  if(risk&&Math.random()*100>=success){await connection.execute('DELETE FROM player_forge_sessions WHERE character_id=?',[characterId]);return {needsConfirm:false as const,failed:true as const,name:'孤注制作失败',rarity:'普通',quality:0,effect:{},primaryKeys,instanceId:0,success,proficiencyGain:0,progress:profession};}
  const rarity = forgeRarity(profession.level);
  const level = Number(session.target_level); const kind = equipmentKind(session.equipment_category, session.subtype);
  const effect = Object.fromEntries(Object.entries(baseForgeEffect(session.equipment_category, session.subtype, level, rarity)).map(([key, value]) => [key, session.equipment_category === '武器' && session.subtype !== '盾牌' ? randomWeaponPrimary(Number(value)) : Number(value)])) as Record<string, number>;
  const pool = randomSecondaryAffixPool(session.equipment_category, session.subtype, level, rarity);
  for (let index = 0; index < secondaryAffixCount(rarity) && pool.length; index++) {
    const picked = pickRandomSecondaryAffix(pool);
    effect[picked] = randomForgeValue(forgedAffixCap(kind, picked, level, rarity));
  }
  // 独立稀有词条：不占副词条位，且不受稀有度、品质或精炼影响。
  if (session.equipment_category === '武器' && session.subtype !== '盾牌' && Math.random() < specialAffixChance(level)) effect.damageBonusPct = Math.round(randomForgeValue(5) * 10) / 10;
  if ((session.equipment_category !== '武器' || session.subtype === '盾牌') && Math.random() < specialAffixChance(level)) effect.damageReductionPct = Math.round(randomForgeValue(5) * 10) / 10;
  capForgeEffect(effect, session.equipment_category, session.subtype, level, rarity);
  const mainMaterial = tierForgeMaterial(session.equipment_category, session.subtype, level); const name = forgeName(session.subtype, level, effect, mainMaterial); const code = `crafted_${characterId}_${Date.now()}_${Math.floor(Math.random() * 100000)}`; const quality = randomForgeQuality();
  const armorText = armorClassEffectText(session.subtype, session.equipment_category); const description = `由铁匠铺以${forgeMaterialName(mainMaterial)}为主体、按固定配方打造的 Lv.${level}${session.subtype}。随机词条的原始数值即为精炼至 100% 时的上限。${armorText}`;
  const [definition] = await connection.execute<any>('INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,effect_json) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)', [code, name, description, '百纳镇铁匠铺打造', 'equipment', session.equipment_category, session.subtype, rarity, session.target_level, 2, JSON.stringify(effect)]); const [instance] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,effect_json,forge_primary_json) VALUES (?,?,?,100,100,?,?)', [characterId, definition.insertId, quality, JSON.stringify(effect), JSON.stringify(primaryKeys)]); await connection.execute('DELETE FROM player_forge_sessions WHERE character_id=?', [characterId]);
  if(personalInput)await connection.execute("UPDATE player_item_instances SET bound_kind='personal' WHERE id=?",[instance.insertId]);
  const craftedInstances=[Number(instance.insertId)];
  if(risk&&rarity==='普通')for(let extra=0;extra<3;extra++){const [extraInstance]=await connection.execute<any>('INSERT INTO player_item_instances(character_id,item_id,quality,durability,durability_max,effect_json,forge_primary_json,bound_kind) VALUES (?,?,?,100,100,?,?,?)',[characterId,definition.insertId,quality,JSON.stringify(effect),JSON.stringify(primaryKeys),personalInput?'personal':'none']);craftedInstances.push(Number(extraInstance.insertId));}
  if(session.equipment_category==='武器')for(const craftedInstance of craftedInstances)await achievementCraftedWeapon(connection,characterId,craftedInstance);
  const proficiencyGain = shopProficiency(forgeProficiencyGain(session.equipment_category, level, rarity));
  if(!currentSecondaryShop())await talentProductionRecord(connection,characterId,`forge:${session.subtype}:${level}`,proficiencyGain,false,rarity==='普通');
  const progress = await addBlacksmithProficiency(connection, characterId, proficiencyGain);
  if(!currentSecondaryShop()){recordAchievement(connection,characterId,forgeAchievementFacts(`forge:${session.equipment_category}:${session.subtype}:${level}`,materials.map(m=>({code:m.item.code,category:m.item.item_category,quantity:m.quantity}))), 'forge:'+instance.insertId);achievementActivity(connection,characterId);await achievementSecondary(connection,characterId);await achievementItem(connection,characterId,Number(definition.insertId));}
  return { needsConfirm: false as const, failed: false as const, name, rarity, quality, effect, primaryKeys, instanceId: Number(instance.insertId), success, proficiencyGain, progress };
});
type ReforgeRow = RowDataPacket & { id: number; item_id: number; name: string; item_category: string; weapon_type: string; required_level: number; equipped: number };
const reforgeDiscount = (instanceId: number) => .6 + (Math.abs(instanceId * 17) % 21) / 100;
const reforgeQuoteFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, instanceId: number, lock = false) => {
  const [rows] = await connection.execute<ReforgeRow[]>(`SELECT ii.id,ii.item_id,i.name,i.item_category,i.weapon_type,i.required_level,EXISTS(SELECT 1 FROM player_equipment pe WHERE pe.character_id=ii.character_id AND pe.instance_id=ii.id) AS equipped FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.id=? AND ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND i.rarity<>'神器'${lock ? ' FOR UPDATE' : ''}`, [instanceId, characterId]);
  const source = rows[0]; if (!source) throw new Error('未找到可重铸的成品装备。'); if (source.equipped) throw new Error('请先卸下要重铸的装备。');
  const oldLevel = Number(source.required_level), targetLevel = oldLevel + 5;
  if (![5,10,15,20,25].includes(oldLevel) || targetLevel > 30) throw new Error('重铸仅支持 Lv.5–25 的常规成品装备。');
  const oldRequirements = forgeRequirements(source.item_category, source.weapon_type, oldLevel), targetRequirements = forgeRequirements(source.item_category, source.weapon_type, targetLevel);
  const oldValue = oldRequirements.reduce((sum, item) => sum + (forgeMaterialValue[item.code] ?? purifiedCraftMaterialValue(item.code)) * item.quantity, 0);
  const targetValue = targetRequirements.reduce((sum, item) => sum + (forgeMaterialValue[item.code] ?? purifiedCraftMaterialValue(item.code)) * item.quantity, 0);
  const discount = reforgeDiscount(instanceId), ratio = Math.max(0, Math.min(1, (targetValue - oldValue * discount) / targetValue));
  return { source, targetLevel, discount, requirements: targetRequirements.map(item => ({ ...item, quantity: Math.ceil(item.quantity * ratio) })), ratio };
};
export const reforgeEquipmentList = async (qqUserId: string) => { const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); const [rows] = await pool.execute<ReforgeRow[]>(`SELECT ii.id,ii.item_id,i.name,i.item_category,i.weapon_type,i.required_level,EXISTS(SELECT 1 FROM player_equipment pe WHERE pe.character_id=ii.character_id AND pe.instance_id=ii.id) AS equipped FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND i.item_type='equipment' AND i.item_category<>'异械' AND i.rarity<>'神器' ORDER BY ii.acquired_at DESC`, [characterId]); return rows.filter(row => !row.equipped && [5,10,15,20,25].includes(Number(row.required_level))).map(row => ({ id:Number(row.id),name:row.name,category:row.item_category,subtype:row.weapon_type,level:Number(row.required_level) })); };
export const reforgePreview = async (qqUserId: string, instanceId: number) => { const pool=await getPool(); const characterId=await characterIdFor(pool,qqUserId); const quote=await reforgeQuoteFor(pool,characterId,instanceId); const codes=quote.requirements.map(item=>item.code); const [rows]=codes.length?await pool.execute<(RowDataPacket&{code:string;name:string;quantity:number})[]>(`SELECT i.code,i.name,COALESCE(pi.quantity,0) AS quantity FROM item_definitions i LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=? WHERE i.code IN (${codes.map(()=>'?').join(',')})`,[characterId,...codes]):[[]]; return {...quote,materials:quote.requirements.map(item=>({...item,name:rows.find(row=>row.code===item.code)?.name??forgeMaterialName(item.code),owned:Number(rows.find(row=>row.code===item.code)?.quantity??0)})),fee:forgeFee(quote.requirements)}; };
export const reforgeEquipment = async (qqUserId: string, instanceId: number) => withTransaction(async connection => { const characterId=await characterIdFor(connection,qqUserId,true); const profession=await blacksmithProgressFor(connection,characterId,true); const quote=await reforgeQuoteFor(connection,characterId,instanceId,true); const materials=await fixedTalentMaterials(connection,characterId,quote.requirements,quote.requirements.slice(1).map(item=>item.code),!currentSecondaryShop()); const fee=forgeFee(quote.requirements); const [coins]=await connection.execute<(RowDataPacket&{copper_coins:number})[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE',[characterId]); if(Number(coins[0]?.copper_coins??0)<fee)throw new Error(`铜币不足，重铸手续费需要 ${fee} 铜币。`); for(const material of materials)await consumeTalentMaterial(connection,characterId,Number(material.item.id),material.quantity,'craft',!currentSecondaryShop()); await connection.execute('DELETE FROM player_item_instances WHERE id=? AND character_id=?',[instanceId,characterId]); await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?',[fee,characterId]); const rarity=forgeRarity(profession.level), level=quote.targetLevel, category=quote.source.item_category, subtype=quote.source.weapon_type, primaryKeys=forgePrimaryKeys(category,subtype), kind=equipmentKind(category,subtype); const effect=Object.fromEntries(Object.entries(baseForgeEffect(category,subtype,level,rarity)).map(([key,value])=>[key,category==='武器'&&subtype!=='盾牌'?randomWeaponPrimary(Number(value)):Number(value)])) as Record<string,number>; const pool=randomSecondaryAffixPool(category,subtype,level,rarity); for(let index=0;index<secondaryAffixCount(rarity)&&pool.length;index++){const key=pickRandomSecondaryAffix(pool);effect[key]=randomForgeValue(forgedAffixCap(kind,key,level,rarity));} capForgeEffect(effect,category,subtype,level,rarity); const main=tierForgeMaterial(category,subtype,level),name=forgeName(subtype,level,effect,main),code=`reforged_${characterId}_${Date.now()}_${Math.floor(Math.random()*100000)}`; const [definition]=await connection.execute<any>('INSERT INTO item_definitions (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,effect_json) VALUES (?,?,?,?,?,?,?,?,?,?,0,?)',[code,name,`由【${quote.source.name}】重铸而成的 Lv.${level}${subtype}。`, '铁匠重铸','equipment',category,subtype,rarity,level,2,JSON.stringify(effect)]); const [instance]=await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,effect_json,forge_primary_json) VALUES (?,?,?,100,100,?,?)',[characterId,definition.insertId,randomForgeQuality(),JSON.stringify(effect),JSON.stringify(primaryKeys)]); await recalculateCharacterStats(connection,characterId); return {name,instanceId:Number(instance.insertId),rarity,level,discount:quote.discount,fee,effect,primaryKeys}; });

type EpicRecipeMaterialView = { category:string; itemId: number; recipeQuantity: number; code: string; name: string; required: number; owned: number };
const epicRecipeRequirementCodes = (recipe: EpicForgeRecipe) => [recipe.blueprintCode, ...recipe.materials.map(material => material.code)];
const loadEpicRecipeMaterials = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, recipe: EpicForgeRecipe, lock = false): Promise<EpicRecipeMaterialView[]> => {
  const codes = epicRecipeRequirementCodes(recipe);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; item_category:string; quantity: number | null })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM item_definitions i
    LEFT JOIN player_inventory pi ON pi.item_id=i.id AND pi.character_id=?
    WHERE i.code IN (${codes.map(() => '?').join(',')})${lock ? ' FOR UPDATE' : ''}`, [characterId, ...codes]);
  const inventory = new Map(rows.map(row => [row.code, { category:row.item_category,itemId: Number(row.id), name: row.name, quantity: Number(row.quantity ?? 0) }]));
  const result = [{ category:inventory.get(recipe.blueprintCode)?.category??'',itemId: inventory.get(recipe.blueprintCode)?.itemId ?? 0, recipeQuantity: 1, code: recipe.blueprintCode, name: inventory.get(recipe.blueprintCode)?.name ?? `${recipe.name}图纸`, required: 1, owned: inventory.get(recipe.blueprintCode)?.quantity ?? 0 }, ...recipe.materials.map(material => ({ category:inventory.get(material.code)?.category??'',itemId: inventory.get(material.code)?.itemId ?? 0, recipeQuantity: material.quantity, code: material.code, name: inventory.get(material.code)?.name ?? forgeMaterialName(material.code), required: material.quantity, owned: inventory.get(material.code)?.quantity ?? 0 }))];
  for(const material of result.slice(1))if(material.itemId)material.required=await talentMaterialPayment(connection as PoolConnection,characterId,material.itemId,material.recipeQuantity,'craft',!currentSecondaryShop());
  return result;
};

/** 只枚举背包中实际拥有的图纸，避免用固定配方面板提前泄露所有装备。 */
export const epicForgeBlueprints = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const codes = epicForgeRecipes.map(recipe => recipe.blueprintCode);
  const [rows] = await pool.execute<(RowDataPacket & { code: string; quantity: number })[]>(`SELECT i.code,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND pi.quantity>0 AND i.code IN (${codes.map(() => '?').join(',')}) ORDER BY i.name`, [characterId, ...codes]);
  return rows.flatMap(row => {
    const recipe = epicRecipeByBlueprint(row.code); return recipe ? [{ recipe, blueprintQuantity: Number(row.quantity) }] : [];
  });
};

export const epicForgePreview = async (qqUserId: string, blueprintCode: string) => {
  const recipe = epicRecipeByBlueprint(blueprintCode); if (!recipe) throw new Error('未找到该史诗图纸。');
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const materials = await loadEpicRecipeMaterials(pool, characterId, recipe);
  if (!materials[0]?.owned) throw new Error('背包中没有这张图纸。');
  return { recipe, materials, ready: materials.every(material => material.owned >= material.required), fee: forgeFee(recipe.materials) };
};

/** 史诗打造固定为史诗稀有度与专属效果；品质与四条副词条仍由本次锻造决定。 */
export const craftEpicForgeEquipment = async (qqUserId: string, blueprintCode: string) => withTransaction(async connection => {
  const recipe = epicRecipeByBlueprint(blueprintCode); if (!recipe) throw new Error('未找到该史诗图纸。');
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [characters] = await connection.execute<(RowDataPacket & { level: number; copper_coins: number })[]>('SELECT level,copper_coins FROM characters WHERE id=? FOR UPDATE', [characterId]);
  const character = characters[0]; if (!character || Number(character.level) < 30) throw new Error('史诗装备需要角色达到 Lv.30 才能打造。');
  const materials = await loadEpicRecipeMaterials(connection, characterId, recipe, true);
  const shortage = materials.find(material => material.owned < material.required);
  if (shortage) throw new Error(`材料不足：${shortage.name} 还需要 ${shortage.required - shortage.owned} 个。`);
  const fee = forgeFee(recipe.materials); if (Number(character.copper_coins) < fee) throw new Error(`铜币不足，图纸打造手续费需要 ${fee} 铜币。`);
  let personalInput=false;
  for (const material of materials) {
    const binding=material.code===recipe.blueprintCode?await consumeInventory(connection,characterId,material.itemId,1):(await consumeTalentMaterial(connection,characterId,material.itemId,material.recipeQuantity,'craft',!currentSecondaryShop())).binding;
    personalInput ||= binding.personal>0;
  }
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]);
  await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [fee, characterId]);
  const rarity = '史诗'; const level = 30; const primaryKeys = forgePrimaryKeys(recipe.category, recipe.subtype);
  const effect: Record<string, unknown> = { ...baseForgeEffect(recipe.category, recipe.subtype, level, rarity) };
  const pool = randomSecondaryAffixPool(recipe.category, recipe.subtype, level, rarity);
  for (let index = 0; index < secondaryAffixCount(rarity) && pool.length; index++) {
    const picked = pickRandomSecondaryAffix(pool);
    effect[picked] = randomForgeValue(forgedAffixCap(equipmentKind(recipe.category, recipe.subtype), picked, level, rarity));
  }
  capForgeEffect(effect as Record<string, number>, recipe.category, recipe.subtype, level, rarity);
  effect.epicEquipmentCode = recipe.code;
  if (recipe.setCode) effect.epicSetCode = recipe.setCode;
  if (recipe.weaponEffect) effect.epicWeaponEffect = recipe.code;
  const quality = randomEpicForgeQuality();
  const code = `epic_${characterId}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const [definition] = await connection.execute<any>(`INSERT INTO item_definitions
    (code,name,description,obtain_source,item_type,item_category,weapon_type,rarity,required_level,weight,stackable,is_tradeable,effect_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?)`, [code, recipe.name, recipe.description, `${recipe.bossName}图纸打造`, 'equipment', recipe.category, recipe.subtype, '史诗', 30, 2, JSON.stringify(effect)]);
  const [instance] = await connection.execute<any>('INSERT INTO player_item_instances (character_id,item_id,quality,durability,durability_max,effect_json,forge_primary_json) VALUES (?,?,?,100,100,?,?)', [characterId, definition.insertId, quality, JSON.stringify(effect), JSON.stringify(primaryKeys)]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, definition.insertId]);
  await recalculateCharacterStats(connection, characterId);
  if(personalInput)await connection.execute("UPDATE player_item_instances SET bound_kind='personal' WHERE id=?",[instance.insertId]);
  if(recipe.category==='武器')await achievementCraftedWeapon(connection,characterId,Number(instance.insertId));
  if(!currentSecondaryShop())await talentProductionRecord(connection,characterId,`forge:${recipe.subtype}:30`,forgeProficiencyGain(recipe.category,30,'史诗'),false,false);
  const progress = await addBlacksmithProficiency(connection, characterId, forgeProficiencyGain(recipe.category, 30, '史诗'));
  if(!currentSecondaryShop()){recordAchievement(connection,characterId,forgeAchievementFacts('epic:'+recipe.code,materials.map(m=>({code:m.code,category:m.category,quantity:m.required}))),'forge:'+instance.insertId);await achievementItem(connection,characterId,Number(definition.insertId));achievementActivity(connection,characterId);}
  return { name: recipe.name, quality, effect, primaryKeys, instanceId: Number(instance.insertId), fee, progress, setCode: recipe.setCode ?? null, weaponEffect: recipe.weaponEffect ?? null };
});
export const blacksmithQuest = async (qqUserId: string) => { const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); const [rows] = await pool.execute<(RowDataPacket & { status: string; secondary_profession_code: string | null })[]>('SELECT q.status,c.secondary_profession_code FROM characters c LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=\'blacksmith_apprentice\' WHERE c.id=?', [characterId]); const row = rows[0]; const [items] = await pool.execute<(RowDataPacket & { code: string; quantity: number })[]>('SELECT i.code,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code IN (\'living_wood\',\'beast_core\')', [characterId]); const owned = new Map(items.map(item => [item.code, Number(item.quantity)])); const completed = row?.status === 'accepted' && (owned.get('living_wood') ?? 0) >= 1 && (owned.get('beast_core') ?? 0) >= 1; if (completed) await pool.execute('UPDATE player_side_quests SET status=\'completed\',completed_at=NOW() WHERE character_id=? AND quest_code=\'blacksmith_apprentice\'', [characterId]); const status = completed ? 'completed' : row?.secondary_profession_code === 'blacksmith' ? 'claimed' : row?.status === 'claimed' ? 'none' : row?.status ?? 'none'; return { status, wood: owned.get('living_wood') ?? 0, core: owned.get('beast_core') ?? 0 }; };
export const acceptBlacksmithQuest = async (qqUserId: string) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); const [professionRows] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null; level: number })[]>('SELECT secondary_profession_code,level FROM characters WHERE id=? FOR UPDATE', [characterId]); if (Number(professionRows[0]?.level ?? 0) < 10) throw new Error('secondary_profession_level_required'); if (professionRows[0]?.secondary_profession_code && professionRows[0].secondary_profession_code !== 'blacksmith') throw new Error('你已经拥有其他副职业，无法再选择锻造师。'); if (professionRows[0]?.secondary_profession_code === 'blacksmith') return true; await connection.execute('INSERT INTO player_side_quests (character_id,quest_code) VALUES (?,\'blacksmith_apprentice\') ON DUPLICATE KEY UPDATE status=\'accepted\',completed_at=NULL,claimed_at=NULL', [characterId]); return true; });
export const claimBlacksmithQuest = async (qqUserId: string) => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); const status = await blacksmithQuest(qqUserId); if (status.status !== 'completed') throw new Error('任务尚未完成。'); const [wood] = await connection.execute<(RowDataPacket & { item_id: number })[]>('SELECT pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=\'living_wood\' FOR UPDATE', [characterId]); const [core] = await connection.execute<(RowDataPacket & { item_id: number })[]>('SELECT pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=\'beast_core\' FOR UPDATE', [characterId]); if (!wood[0] || !core[0]) throw new Error('任务材料已不在背包中。'); const [gift] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM item_definitions WHERE code=\'xiaobei_gift\' LIMIT 1', []); if (!gift[0]) throw new Error('小北的赠礼尚未配置，请重启机器人以初始化物品数据。'); const [character] = await connection.execute<(RowDataPacket & { name: string })[]>('SELECT name FROM characters WHERE id=?', [characterId]); await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id IN (?,?)', [characterId, wood[0].item_id, core[0].item_id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]); await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, gift[0].id]); await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, gift[0].id]); await connection.execute('UPDATE player_side_quests SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND quest_code=\'blacksmith_apprentice\'', [characterId]); await connection.execute('UPDATE characters SET secondary_profession_code=\'blacksmith\' WHERE id=?', [characterId]); await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'blacksmith\',1,0)', [characterId]); recordAchievement(connection,characterId,['ACH_A05']);
  return { name: '锻造师', characterName: character[0]?.name ?? '冒险者', giftName: '小北的赠礼' }; });
