import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { activeDeviceCodes, constructionRecipeByCode } from './deconstructor-catalog';
import { assertCombatLoadoutMutable } from './combat-loadout-lock.service';

export type DeviceTargetScope = 'self' | 'ally' | 'enemy' | 'all_allies' | 'all_enemies' | 'any';
export type ActiveDeviceSkill = { code: string; name: string; description: string; energyCost: number; cooldownTurns: number; targetScope: DeviceTargetScope; power?: number; effect?: string };
export type ActiveDeviceDefinition = { code: string; maxEnergy: number; skills: ActiveDeviceSkill[] };

export const activeDeviceDefinitions: ActiveDeviceDefinition[] = [
  { code: 'emergency_evasion_module', maxEnergy: 100, skills: [{ code: 'emergency_evasion', name: '紧急回避', description: '自身获得一次物理闪避。', energyCost: 30, cooldownTurns: 3, targetScope: 'self', effect: 'physical_evade_once' }] },
  { code: 'easter_egg_thrower', maxEnergy: 100, skills: [{ code: 'easter_egg_throw', name: '彩蛋投掷', description: '选定单位随机获得 5 种效果，持续 2 回合。', energyCost: 45, cooldownTurns: 0, targetScope: 'any', effect: 'easter_egg' }] },
  { code: 'simple_launcher', maxEnergy: 100, skills: [{ code: 'simple_launcher_fire', name: '散射发射', description: '对敌方全体造成 200% 物理伤害。', energyCost: 60, cooldownTurns: 0, targetScope: 'all_enemies', power: 200, effect: 'physical_all' }] },
  { code: 'precision_scope', maxEnergy: 100, skills: [{ code: 'precision_aim', name: '精准瞄准', description: '目标暴击、命中+100%，直到其下次受攻击。', energyCost: 40, cooldownTurns: 0, targetScope: 'ally', effect: 'precision_aim' }] },
  { code: 'recycling_hammer', maxEnergy: 100, skills: [{ code: 'recycling_reflux', name: '回收回流', description: '为自身其他已生效主动异械各恢复 20 点充能。', energyCost: 45, cooldownTurns: 0, targetScope: 'self', effect: 'recycling_reflux' }] },
  { code: 'weave_repair_swarm', maxEnergy: 100, skills: [{ code: 'weave_repair', name: '缝补程序', description: '友方恢复 18% 生命，并清除 1 个负面效果。', energyCost: 55, cooldownTurns: 0, targetScope: 'ally', effect: 'weave_repair' }] },
  { code: 'gravity_tether', maxEnergy: 100, skills: [{ code: 'gravity_tether_cast', name: '引力牵引', description: '敌方速度、闪避-30%，持续 2 回合。', energyCost: 45, cooldownTurns: 0, targetScope: 'enemy', effect: 'gravity_tether' }] },
  { code: 'fold_barrier_generator', maxEnergy: 100, skills: [{ code: 'fold_barrier', name: '折叠壁垒', description: '全体友方获得 15% 减伤，持续 2 回合。', energyCost: 60, cooldownTurns: 0, targetScope: 'all_allies', effect: 'fold_barrier' }] },
  { code: 'shock_pile_launcher', maxEnergy: 100, skills: [{ code: 'shock_pile', name: '震爆钉', description: '造成 120% 物理伤害，65% 概率眩晕 1 回合。', energyCost: 50, cooldownTurns: 0, targetScope: 'enemy', power: 120, effect: 'shock_pile' }] },
  { code: 'frost_pulse_interferer', maxEnergy: 100, skills: [{ code: 'frost_pulse', name: '冷凝脉冲', description: '对敌方全体造成 100% 冰魔法伤害并减速 25%，持续 2 回合。', energyCost: 55, cooldownTurns: 0, targetScope: 'all_enemies', power: 100, effect: 'frost_pulse' }] },
  { code: 'phase_decoy_pod', maxEnergy: 100, skills: [{ code: 'phase_decoy', name: '相位替身', description: '目标下次受到的直接伤害降低 80%，随后移除。', energyCost: 65, cooldownTurns: 0, targetScope: 'ally', effect: 'phase_decoy' }] },
  { code: 'counter_spider', maxEnergy: 100, skills: [{ code: 'counter_spider_cast', name: '拆解射线', description: '驱散敌方 1 个正面效果；若无可驱散效果则附加 15% 易伤 2 回合。', energyCost: 55, cooldownTurns: 0, targetScope: 'enemy', effect: 'counter_spider' }] },
  { code: 'electromagnetic_coil_cannon', maxEnergy: 120, skills: [{ code: 'electromagnetic_coil_fire', name: '电磁线圈炮', description: '对敌方全体造成 180% 雷物理伤害，并附加 25% 易伤 2 回合。', energyCost: 85, cooldownTurns: 0, targetScope: 'all_enemies', power: 180, effect: 'coil_cannon' }] },
  { code: 'autonomous_repair_arm', maxEnergy: 120, skills: [{ code: 'autonomous_repair', name: '应急重构', description: '友方恢复 30% 生命；若目标带护盾，则其异械各恢复 20 点充能。', energyCost: 70, cooldownTurns: 0, targetScope: 'ally', effect: 'autonomous_repair' }] },
  { code: 'micro_reactor_pack', maxEnergy: 150, skills: [
    { code: 'reactor_overcharge', name: '超载放流', description: '对敌方全体造成 230% 火魔法伤害；自身当前生命降低 15%，不会致死。', energyCost: 90, cooldownTurns: 0, targetScope: 'all_enemies', power: 230, effect: 'reactor_overcharge' },
    { code: 'reactor_thermal_share', name: '热能转供', description: '友方伤害提高 20%，持续 2 回合；若为解构师，其异械各恢复 10 点充能。', energyCost: 50, cooldownTurns: 0, targetScope: 'ally', effect: 'reactor_thermal_share' }
  ] }
];
export const activeDeviceDefinitionByCode = new Map(activeDeviceDefinitions.map(definition => [definition.code, definition]));
export const activeDeviceSkillByCode = new Map(activeDeviceDefinitions.flatMap(definition => definition.skills.map(skill => [skill.code, { ...skill, deviceCode: definition.code }] as const)));

const passiveDeviceActualEffects: Record<string, string[]> = {
  auxiliary_aiming_scope: ['实际命中率 +8%。'],
  muscle_pacer: ['物理攻击实际命中率 -6%。', '物理技能威力 +6%。'],
  critical_glove: ['物理攻击必定暴击。', '物理攻击暴击时，最终伤害 -50%。'],
  mana_accumulator: ['魔法技能吟唱 +1。', '魔法技能伤害 +60%。'],
  rocket_propeller: ['每回合开始时速度 +10%，最多叠加至 +100%。'],
  inverse_buffer: ['每场战斗首次生命降至 30%及以下时，获得 20%减伤，持续 2 回合。'],
  rail_stabilizer: ['异械直接伤害 +12%。'],
  precision_scope: ['异械直接伤害命中 +10%。'],
  fold_barrier_generator: ['自身施放的【折叠壁垒】减伤持续时间 +1 回合。'],
  electromagnetic_coil_cannon: ['雷属性异械直接伤害 +12%。'],
  micro_reactor_pack: ['所有主动异械最大充能 +20。']
};

const characterIdFor = async (connection: Pool | PoolConnection, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return Number(rows[0].id);
};

export const activeDeviceList = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { id: number; code: string; name: string; active: number; quick_slot: number | null })[]>(`
    SELECT ii.id,i.code,i.name,IF(ad.instance_id IS NULL,0,1) AS active,pdqs.quick_slot
    FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    LEFT JOIN player_active_devices ad ON ad.character_id=ii.character_id AND ad.instance_id=ii.id
    LEFT JOIN player_device_quick_slots pdqs ON pdqs.character_id=ii.character_id AND pdqs.instance_id=ii.id
    WHERE ii.character_id=? AND i.item_type='device'
    ORDER BY ii.acquired_at DESC,ii.id DESC
  `, [characterId]);
  return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, description: constructionRecipeByCode.get(row.code)?.description ?? '尚未记录该异械的完整说明。', actualEffects: passiveDeviceActualEffects[row.code] ?? [], active: Boolean(row.active), quickSlot: row.quick_slot == null ? null : Number(row.quick_slot), activeDefinition: activeDeviceDefinitionByCode.get(row.code) ?? null }));
};

export const deviceDetail = async (qqUserId: string, instanceId: number) => {
  const device = (await activeDeviceList(qqUserId)).find(item => item.id === instanceId);
  if (!device) throw new Error('未找到该异械。');
  return device;
};

export const deviceSkillDetail = async (qqUserId: string, instanceId: number, skillCode: string) => {
  const device = await deviceDetail(qqUserId, instanceId);
  const skill = device.activeDefinition?.skills.find(item => item.code === skillCode);
  if (!skill) throw new Error('该异械不具备此主动技。');
  return { device, skill, maxEnergy: device.activeDefinition!.maxEnergy };
};

export const activateDevice = async (qqUserId: string, instanceId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  await assertCombatLoadoutMutable(connection, characterId);
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>(`
    SELECT ii.id,i.name FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
    WHERE ii.id=? AND ii.character_id=? AND i.item_type='device' FOR UPDATE
  `, [instanceId, characterId]);
  const device = rows[0]; if (!device) throw new Error('未找到该异械。');
  await connection.execute(`DELETE pe FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id=? AND pe.instance_id=? AND i.item_category='异械'`, [characterId, instanceId]);
  await connection.execute('INSERT IGNORE INTO player_active_devices (character_id,instance_id) VALUES (?,?)', [characterId, instanceId]);
  return device.name;
});

export const deactivateDevice = async (qqUserId: string, instanceId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  await assertCombatLoadoutMutable(connection, characterId);
  const [rows] = await connection.execute<(RowDataPacket & { name: string })[]>(`
    SELECT i.name FROM player_active_devices ad JOIN player_item_instances ii ON ii.id=ad.instance_id
    JOIN item_definitions i ON i.id=ii.item_id WHERE ad.character_id=? AND ad.instance_id=? AND i.item_type='device' FOR UPDATE
  `, [characterId, instanceId]);
  if (!rows[0]) throw new Error('该异械尚未生效。');
  await connection.execute('DELETE FROM player_device_quick_slots WHERE character_id=? AND instance_id=?', [characterId, instanceId]);
  await connection.execute('DELETE FROM player_active_devices WHERE character_id=? AND instance_id=?', [characterId, instanceId]);
  return rows[0].name;
});

export const deviceQuickConfig = async (qqUserId: string) => {
  const devices = await activeDeviceList(qqUserId);
  const shownCodes = new Set<string>();
  return {
    slots: devices.filter(device => device.quickSlot != null).sort((left, right) => Number(left.quickSlot) - Number(right.quickSlot)),
    candidates: devices.filter(device => device.active && activeDeviceCodes.has(device.code) && !shownCodes.has(device.code) && (shownCodes.add(device.code) || true))
  };
};

export const setDeviceQuickSlot = async (qqUserId: string, slot: number, instanceId: number) => withTransaction(async connection => {
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new Error('异械栏位仅限 ① 至 ④。');
  const characterId = await characterIdFor(connection, qqUserId, true);
  await assertCombatLoadoutMutable(connection, characterId);
  const [rows] = await connection.execute<(RowDataPacket & { name: string; code: string })[]>(`SELECT i.name,i.code FROM player_active_devices ad
    JOIN player_item_instances ii ON ii.id=ad.instance_id JOIN item_definitions i ON i.id=ii.item_id
    WHERE ad.character_id=? AND ad.instance_id=? AND i.item_type='device' FOR UPDATE`, [characterId, instanceId]);
  const device = rows[0]; if (!device || !activeDeviceDefinitionByCode.has(device.code)) throw new Error('只能配置已生效的主动异械。');
  const [sameTypeRows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_device_quick_slots qs JOIN player_item_instances ii ON ii.id=qs.instance_id
    JOIN item_definitions i ON i.id=ii.item_id WHERE qs.character_id=? AND i.code=? AND qs.instance_id<>? LIMIT 1 FOR UPDATE`, [characterId, device.code, instanceId]);
  if (sameTypeRows[0]) throw new Error('同型号主动异械只提供一组技能，请先取消其原有快捷配置。');
  await connection.execute('DELETE FROM player_device_quick_slots WHERE character_id=? AND (quick_slot=? OR instance_id=?)', [characterId, slot, instanceId]);
  await connection.execute('INSERT INTO player_device_quick_slots (character_id,quick_slot,instance_id) VALUES (?,?,?)', [characterId, slot, instanceId]);
  return device.name;
});

export const clearDeviceQuickSlot = async (qqUserId: string, slot: number) => withTransaction(async connection => {
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new Error('异械栏位仅限 ① 至 ④。');
  const characterId = await characterIdFor(connection, qqUserId, true);
  await assertCombatLoadoutMutable(connection, characterId);
  await connection.execute('DELETE FROM player_device_quick_slots WHERE character_id=? AND quick_slot=?', [characterId, slot]);
});

type DeviceDb = Pool | PoolConnection;
export type DeviceBattleKind = 'pve' | 'pvp';
export const initializeCombatDeviceEnergy = async (connection: PoolConnection, sessionId: string, characterId: number, battleKind: DeviceBattleKind = 'pve') => {
  const [rows] = await connection.execute<(RowDataPacket & { instance_id: number; code: string; max_energy_bonus: number })[]>(`SELECT ad.instance_id,i.code,
    MAX(CASE WHEN i2.code='micro_reactor_pack' THEN 20 ELSE 0 END) AS max_energy_bonus
    FROM player_active_devices ad JOIN player_item_instances ii ON ii.id=ad.instance_id JOIN item_definitions i ON i.id=ii.item_id
    LEFT JOIN player_active_devices ad2 ON ad2.character_id=ad.character_id LEFT JOIN player_item_instances ii2 ON ii2.id=ad2.instance_id LEFT JOIN item_definitions i2 ON i2.id=ii2.item_id AND i2.item_type='device'
    WHERE ad.character_id=? AND i.item_type='device' GROUP BY ad.instance_id,i.code`, [characterId]);
  for (const row of rows) {
    const definition = activeDeviceDefinitionByCode.get(row.code); if (!definition) continue;
    const maximum = definition.maxEnergy + Number(row.max_energy_bonus ?? 0);
    await connection.execute('INSERT INTO combat_device_energy (battle_kind,session_id,character_id,instance_id,current_energy,max_energy) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE current_energy=VALUES(current_energy),max_energy=VALUES(max_energy)', [battleKind, sessionId, characterId, row.instance_id, maximum, maximum]);
  }
};

export const combatDeviceSlotsFor = async (connection: DeviceDb, sessionId: string, characterId: number, lock = false, battleKind: DeviceBattleKind = 'pve') => {
  const [rows] = await connection.execute<(RowDataPacket & { quick_slot: number; instance_id: number; code: string; name: string; current_energy: number; max_energy: number })[]>(`SELECT qs.quick_slot,qs.instance_id,i.code,i.name,energy.current_energy,energy.max_energy
    FROM player_device_quick_slots qs JOIN player_active_devices ad ON ad.character_id=qs.character_id AND ad.instance_id=qs.instance_id
    JOIN player_item_instances ii ON ii.id=qs.instance_id JOIN item_definitions i ON i.id=ii.item_id
    JOIN combat_device_energy energy ON energy.battle_kind=? AND energy.session_id=? AND energy.character_id=qs.character_id AND energy.instance_id=qs.instance_id
    WHERE qs.character_id=? AND i.item_type='device' ORDER BY qs.quick_slot${lock ? ' FOR UPDATE' : ''}`, [battleKind, sessionId, characterId]);
  return rows.flatMap(row => {
    const definition = activeDeviceDefinitionByCode.get(row.code); if (!definition) return [];
    return [{ slot: Number(row.quick_slot), instanceId: Number(row.instance_id), deviceCode: row.code, deviceName: row.name, currentEnergy: Number(row.current_energy), maxEnergy: Number(row.max_energy), skills: definition.skills }];
  });
};

export const restoreCombatDeviceEnergy = async (connection: PoolConnection, sessionId: string, characterId: number, amount: number, exceptInstanceId?: number, battleKind: DeviceBattleKind = 'pve') => {
  const params: (string | number)[] = [amount, battleKind, sessionId, characterId];
  let query = 'UPDATE combat_device_energy SET current_energy=LEAST(max_energy,current_energy+?) WHERE battle_kind=? AND session_id=? AND character_id=?';
  if (exceptInstanceId != null) { query += ' AND instance_id<>?'; params.push(exceptInstanceId); }
  const [result] = await connection.execute<any>(query, params);
  return Number(result.affectedRows ?? 0);
};
