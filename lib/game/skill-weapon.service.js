const hasCompatibleSkillWeapon = async (connection, characterId, requiredWeaponType) => {
    const weaponType = String(requiredWeaponType ?? '');
    if (!weaponType)
        return true;
    const [rows] = await connection.execute(`SELECT 1 FROM player_equipment pe
    JOIN item_definitions i ON i.id=pe.item_id
    WHERE pe.character_id=? AND pe.slot IN ('weapon','offhand') AND i.weapon_type=? LIMIT 1`, [characterId, weaponType]);
    return Boolean(rows[0]);
};
const skillWeaponRequirementMessage = (skillName, requiredWeaponType) => `「${skillName}」需要装备${requiredWeaponType}类武器（主手或副手）才能生效。`;

export { hasCompatibleSkillWeapon, skillWeaponRequirementMessage };
