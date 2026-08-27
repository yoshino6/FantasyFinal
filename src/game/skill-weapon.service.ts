import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

/** 主手或副手持有对应类型时，主动技能才可施放。 */
export const hasCompatibleSkillWeapon = async (connection: PoolConnection, characterId: number, requiredWeaponType: string | null | undefined) => {
  const weaponType = String(requiredWeaponType ?? '');
  if (!weaponType) return true;
  const [rows] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    WHERE pe.character_id=? AND pe.slot IN ('weapon','offhand') AND i.weapon_type=? LIMIT 1`, [characterId, weaponType]);
  return Boolean(rows[0]);
};

export const skillWeaponRequirementMessage = (skillName: string, requiredWeaponType: string) => `「${skillName}」需要装备${requiredWeaponType}类武器（主手或副手）才能生效。`;
