const offhandAttributeMultiplier = (focus = 1) => (5 + Math.min(6, Math.max(1, Math.floor(Number(focus) || 1))) - 1) / 10;
const masteryCodes = ['longsword_mastery', 'shield_mastery', 'staff_mastery', 'spellbook_mastery', 'orb_mastery', 'dagger_mastery', 'fistblade_mastery'];
const masteryLabels = { physicalAttackPct: '物攻', magicAttackPct: '魔攻', physicalDefensePct: '物防', magicDefensePct: '魔防', accuracyPct: '命中', critRatePct: '暴击', critDamagePct: '暴伤', critResistPct: '暴免', critDamageReductionPct: '暴抗', mpPct: '魔力上限', chantSpeedPct: '吟唱速度' };
const masteryKeys = Object.keys(masteryLabels);
const jsonRecord = (value) => {
    if (!value)
        return {};
    if (typeof value !== 'string')
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return {};
    }
};
const formatPercent = (value) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const weaponMasteryBonusesFor = async (connection, characterId) => {
    const [equipmentRows] = await connection.execute(`SELECT i.weapon_type,pe.slot
    FROM player_equipment pe JOIN item_definitions i ON i.id=pe.item_id WHERE pe.character_id=?`, [characterId]);
    const [skillRows] = await connection.execute(`SELECT s.name,s.passive_effect_json,
      COALESCE((SELECT MAX(pss.level) FROM player_skill_specializations pss WHERE pss.character_id=ps.character_id AND pss.skill_id=ps.skill_id AND pss.specialization='overcharge'),1) AS proficiency,
      COALESCE((SELECT MAX(pss.level) FROM player_skill_specializations pss WHERE pss.character_id=ps.character_id AND pss.skill_id=ps.skill_id AND pss.specialization='instant'),1) AS focus
    FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id
    WHERE ps.character_id=? AND s.code IN (${masteryCodes.map(() => '?').join(',')})
    `, [characterId, ...masteryCodes]);
    const offhand = equipmentRows.find(item => item.slot === 'offhand');
    const offhandMastery = offhand?.weapon_type ? skillRows.find(skill => jsonRecord(skill.passive_effect_json).weaponType === offhand.weapon_type) : undefined;
    const bonuses = { physicalAttackPct: 0, magicAttackPct: 0, physicalDefensePct: 0, magicDefensePct: 0, accuracyPct: 0, critRatePct: 0, critDamagePct: 0, critResistPct: 0, critDamageReductionPct: 0, mpPct: 0, chantSpeedPct: 0, details: [], offhandAttributeMultiplier: offhandAttributeMultiplier(offhandMastery?.focus) };
    for (const skill of skillRows) {
        const effect = jsonRecord(skill.passive_effect_json);
        const weaponType = String(effect.weaponType ?? '');
        const matched = equipmentRows.find(item => item.slot === 'weapon' && item.weapon_type === weaponType) ?? equipmentRows.find(item => item.weapon_type === weaponType);
        if (!matched)
            continue;
        const proficiency = Math.min(5, Math.max(1, Number(skill.proficiency)));
        const focus = Math.min(6, Math.max(1, Number(skill.focus)));
        const scale = matched.slot === 'offhand' ? offhandAttributeMultiplier(focus) : 1;
        const step = Number(effect.masteryStepPct ?? 0);
        const active = masteryKeys.filter(key => Number(effect[key] ?? 0) !== 0).map(key => [key, (Number(effect[key] ?? 0) + step * (proficiency - 1)) * scale]);
        if (!active.length)
            continue;
        for (const [key, value] of active)
            bonuses[key] += value;
        if (active.length)
            bonuses.details.push(`【${skill.name}】${matched.slot === 'offhand' ? '副手' : '主手'}${weaponType}：${active.map(([key, value]) => `${masteryLabels[key]}+${formatPercent(value)}%`).join('、')}`);
    }
    return bonuses;
};
const applyWeaponMasteryStats = (stats, bonuses) => {
    const increase = (value, percent) => Math.max(0, Math.floor(value * (1 + percent / 100)));
    return { ...stats,
        mpMax: increase(stats.mpMax, bonuses.mpPct), physicalAttack: increase(stats.physicalAttack, bonuses.physicalAttackPct), magicAttack: increase(stats.magicAttack, bonuses.magicAttackPct),
        physicalDefense: increase(stats.physicalDefense, bonuses.physicalDefensePct), magicDefense: increase(stats.magicDefense, bonuses.magicDefensePct), accuracy: increase(stats.accuracy, bonuses.accuracyPct),
        critRateBp: increase(stats.critRateBp, bonuses.critRatePct), critDamageBp: increase(stats.critDamageBp, bonuses.critDamagePct),
        critResistBp: increase(stats.critResistBp, bonuses.critResistPct), critDamageReductionBp: increase(stats.critDamageReductionBp, bonuses.critDamageReductionPct)
    };
};

export { applyWeaponMasteryStats, offhandAttributeMultiplier, weaponMasteryBonusesFor };
