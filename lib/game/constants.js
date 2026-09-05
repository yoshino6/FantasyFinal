const SESSION_TTL_MINUTES = 30;
const realmNames = ['初心', '窥尘', '开化', '明道', '破晓', '通灵', '造化', '掌控', '主宰', '通玄'];
const realmNameForStage = (stage) => realmNames[Math.max(0, Math.min(realmNames.length - 1, Math.floor(stage) - 1))];
const realmLevelCap = (stage) => Math.min(100, Math.max(1, Math.floor(stage)) * 10);
const realmEnergyDissipationText = '精纯的能量冲入你的体壳，然后向外四溢，消散在了空中。。。';
const staminaMaxForRealm = (stage) => 120 + Math.max(0, Math.floor(stage) - 1) * 30;
const STAMINA_RECOVERY_MS = 5 * 60 * 1000;
const levelExperienceRequirements = [
    0,
    25, 50, 100, 200, 300, 450, 600, 800, 1000,
    5200, 5600, 6000, 6400, 6800, 7200, 7600, 8000, 8400, 8800,
    18000, 20500, 23100, 25700, 28300, 30900, 33500, 36100, 38700, 41200,
    46693, 52187, 57876, 64154, 71021, 78476, 86716, 95937, 106139, 117714,
    121638, 127524, 133410, 141257, 149105, 156952, 164800, 172648, 184419, 202076
];
const experienceRequiredForLevel = (level) => levelExperienceRequirements[Math.max(1, Math.min(50, Math.floor(level)))] ?? 51500;
const attributeNames = {
    constitution: '体质', spirit: '精神', strength: '力量',
    intelligence: '智力', agility: '敏捷', perception: '感知'
};
const attributeAliases = {
    体质: 'constitution', 精神: 'spirit', 力量: 'strength',
    智力: 'intelligence', 敏捷: 'agility', 感知: 'perception'
};
const calculateDerivedStats = (value) => ({
    hpMax: 120 + value.constitution * 19.9 + value.spirit * 3.9 + value.strength * 4.9 + value.intelligence * 1.9 + value.agility * 1.9 + value.perception * 1.9,
    mpMax: 60 + value.constitution * 2.2 + value.spirit * 17.8 + value.strength * 1.1 + value.intelligence * 8.9 + value.agility * 1.1 + value.perception * 3.3,
    physicalAttack: 8 + value.constitution * .5 + value.spirit * .2 + value.strength * 2 + value.intelligence * .2 + value.agility + value.perception * .4,
    magicAttack: 8 + value.constitution * .2 + value.spirit + value.strength * .2 + value.intelligence * 2 + value.agility * .4 + value.perception * .5,
    physicalDefense: 8 + value.constitution * 2 + value.spirit * .25 + value.strength + value.intelligence * .25 + value.agility * .5 + value.perception * .3,
    magicDefense: 8 + value.constitution * .2 + value.spirit * 2 + value.strength * .2 + value.intelligence + value.agility * .4 + value.perception * .5,
    accuracy: 20 + value.constitution * .7 + value.spirit * .7 + value.strength * .7 + value.intelligence * 1.1 + value.agility * 4.4 + value.perception,
    evasion: 20 + value.constitution * .7 + value.spirit * .7 + value.strength * .7 + value.intelligence * 1.1 + value.agility * 4.4 + value.perception,
    critRateBp: 20 + value.constitution * .5 + value.spirit * .5 + value.strength * .5 + value.intelligence * .9 + value.agility * 1.8 + value.perception * 4.4,
    critDamageBp: 20 + value.constitution * .5 + value.spirit * .5 + value.strength * 1.8 + value.intelligence * .9 + value.agility * .5 + value.perception * 4.4,
    critResistBp: 20 + value.constitution * 4.4 + value.spirit * .9 + value.strength * .5 + value.intelligence * .5 + value.agility * .5 + value.perception * 1.8,
    critDamageReductionBp: 20 + value.constitution * .9 + value.spirit * 4.4 + value.strength * .5 + value.intelligence * .5 + value.agility * .5 + value.perception * 1.8,
    tenacity: value.constitution * 4.3 + value.spirit * 3.2 + value.perception * 1.1,
    tenacityPierce: Math.floor(value.perception * 2.5 + value.strength * .9 + value.intelligence * .9),
    speed: 100 + value.agility * 8.6
});
const forgeRarityMultiplier = {
    '普通': 1,
    '优秀': 1.15,
    '精良': 1.3,
    '稀有': 1.5,
    '传说': 1.7,
    '史诗': 2
};
const equipmentQualityMultiplier = (quality) => .6 + Math.max(0, Math.min(100, Number(quality))) / 250;
const forgedEquipmentBase = (level, category) => {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    const equalAttribute = 100 / 6 + 10 / 6 * (normalizedLevel - 1);
    const levelMultiplier = Math.pow(1.2, Math.floor(normalizedLevel / 10));
    const physicalAttack = 8 + equalAttribute * 4.3;
    const physicalDefense = 8 + equalAttribute * 4.3;
    const magicDefense = 8 + equalAttribute * 4.3;
    return (category === '武器'
        ? (physicalAttack + physicalAttack) / 2
        : (physicalDefense + magicDefense) / 4) * levelMultiplier;
};
const affixCapMultiplier = {
    physicalAttack: .5,
    magicAttack: .5,
    physicalDefense: .5,
    magicDefense: .5,
    tenacityPierce: .5,
    accuracy: 1,
    evasion: 1,
    critRateBp: 1,
    critDamageBp: 1,
    critResistBp: 1,
    critDamageReductionBp: 1,
    tenacity: 1,
    speed: 1,
    hpMax: 4,
    mpMax: 4
};
const standardAffixes = ['hpMax', 'mpMax', 'physicalAttack', 'magicAttack', 'physicalDefense', 'magicDefense', 'accuracy', 'evasion', 'critRateBp', 'critDamageBp', 'critResistBp', 'critDamageReductionBp', 'tenacity', 'tenacityPierce', 'speed'];
const elementNames = ['水', '火', '土', '木', '风', '冰', '雷', '光', '暗'];
const elementalAffixes = elementNames.flatMap(element => [`elementMastery_${element}`, `elementResistance_${element}`]);
const elementalAffixCap = (level) => Math.max(0, Math.floor(Math.max(0, Number(level)) / 10) * 11);
const forgedAffixCap = (category, key, level, rarity) => {
    if (key.startsWith('elementMastery_') || key.startsWith('elementResistance_')) {
        const matchingKind = category === '武器' ? key.startsWith('elementMastery_') : key.startsWith('elementResistance_');
        return matchingKind ? elementalAffixCap(level) * (forgeRarityMultiplier[rarity] ?? 1) : 0;
    }
    const base = forgedEquipmentBase(level, category) * (forgeRarityMultiplier[rarity] ?? 1);
    if (category === '武器') {
        if (key === 'physicalDefense' || key === 'magicDefense')
            return 0;
        if (key === 'hpMax' || key === 'tenacity')
            return 0;
        return base * (affixCapMultiplier[key] ?? 0);
    }
    if (key === 'physicalAttack' || key === 'magicAttack' || key === 'mpMax' || key === 'tenacityPierce')
        return 0;
    return base * (affixCapMultiplier[key] ?? 0);
};
const forgedEquipmentCaps = (category, level, rarity, primaryKeys) => {
    const base = forgedEquipmentBase(level, category) * (forgeRarityMultiplier[rarity] ?? 1);
    return Object.fromEntries([...standardAffixes, ...elementalAffixes].map(key => {
        const offTypeWeaponAttack = category === '武器' && (key === 'physicalAttack' || key === 'magicAttack') && !primaryKeys.includes(key);
        return [key, (offTypeWeaponAttack ? 0 : forgedAffixCap(category, key, level, rarity)) + (primaryKeys.includes(key) ? base : 0)];
    }));
};
const virtualEquipmentLoadouts = {
    normal: { rarity: '普通', quality: 0, secondaryAffixes: 0 },
    large: { rarity: '普通', quality: 100, secondaryAffixes: 0 },
    elite: { rarity: '优秀', quality: 100, secondaryAffixes: 1 },
    boss: { rarity: '精良', quality: 100, secondaryAffixes: 2 }
};
const virtualSecondaryExpectation = .62;
const virtualElementalAffixWeight = 4;
const emptyDerivedStats = () => ({ hpMax: 0, mpMax: 0, physicalAttack: 0, magicAttack: 0, physicalDefense: 0, magicDefense: 0, accuracy: 0, evasion: 0, critRateBp: 0, critDamageBp: 0, critResistBp: 0, critDamageReductionBp: 0, tenacity: 0, tenacityPierce: 0, speed: 0 });
const virtualSecondaryStats = (category, primaryKeys, level, loadout) => {
    if (!loadout.secondaryAffixes)
        return emptyDerivedStats();
    const keys = standardAffixes.filter(key => {
        if (primaryKeys.includes(key))
            return false;
        if (category === '武器' && (key === 'physicalAttack' || key === 'magicAttack'))
            return false;
        return forgedAffixCap(category, key, level, loadout.rarity) > 0;
    });
    const denominator = keys.length + virtualElementalAffixWeight;
    const scale = virtualSecondaryExpectation * equipmentQualityMultiplier(loadout.quality) * loadout.secondaryAffixes / denominator;
    const bonus = emptyDerivedStats();
    for (const key of keys)
        bonus[key] = forgedAffixCap(category, key, level, loadout.rarity) * scale;
    return bonus;
};
const addDerivedStats = (target, source, multiplier = 1) => {
    for (const key of Object.keys(target))
        target[key] += source[key] * multiplier;
    return target;
};
const virtualEquipmentStats = (level, tier, physicalAttack, magicAttack, customLoadout) => {
    const loadout = customLoadout ?? virtualEquipmentLoadouts[tier];
    const primaryMultiplier = (forgeRarityMultiplier[loadout.rarity] ?? 1) * equipmentQualityMultiplier(loadout.quality);
    const weapon = forgedEquipmentBase(level, '武器') * primaryMultiplier;
    const armor = forgedEquipmentBase(level, '防具') * primaryMultiplier;
    const bonus = emptyDerivedStats();
    if (physicalAttack >= magicAttack)
        bonus.physicalAttack = weapon;
    else
        bonus.magicAttack = weapon;
    bonus.physicalDefense = armor * 5;
    bonus.magicDefense = armor * 5;
    const weaponSecondary = virtualSecondaryStats('武器', [physicalAttack >= magicAttack ? 'physicalAttack' : 'magicAttack'], level, loadout);
    const armorSecondary = virtualSecondaryStats('防具', ['physicalDefense', 'magicDefense'], level, loadout);
    addDerivedStats(bonus, weaponSecondary);
    addDerivedStats(bonus, armorSecondary, 5);
    for (const key of Object.keys(bonus))
        bonus[key] = Math.floor(bonus[key]);
    return bonus;
};
const gifts = {
    holy_sword_shirulu: { name: '圣剑·希尔露', category: 'artifact', summary: '由星辉铸成的圣洁长剑。' },
    demon_sword_aphia: { name: '魔剑·阿菲娅', category: 'artifact', summary: '寄宿深渊意志的漆黑魔剑。' },
    saint_staff_istaria: { name: '圣杖·伊斯塔利亚', category: 'artifact', summary: '以晨星为芯的祝圣法杖，令光属性术式更为耀眼。' },
    death_dagger_azra: { name: '死刺·阿兹拉', category: 'artifact', summary: '短刃所向之处，连濒死的命运也会被割开。' },
    godfist_chronos: { name: '天刃·克罗诺斯', category: 'artifact', summary: '铭刻古神战纹的拳刃，令双攻恒取更高的一方。' },
    oracle_grimoire_sophia: { name: '神谕·索芙拉', category: 'artifact', summary: '书页自行翻动，低声诵读尚未发生的咒文。' },
    prayer_orb_lumia: { name: '祈祷法球·露弥娅', category: 'artifact', summary: '凝固的祈愿之光，会将施术者的意志推向远方。' },
    immortal_shield_auges: { name: '不灭圣盾·奥格斯', category: 'artifact', summary: '历经无数冲击仍无裂痕的古老圣盾。' },
    star_crown_selene: { name: '星冠·塞勒涅', category: 'artifact', summary: '繁星垂落于冠冕，守望佩戴者的每一次远行。' },
    sky_robe_asteia: { name: '天穹法衣·阿斯忒雅', category: 'artifact', summary: '如天空般轻盈的法衣，织入了守护的法则。' },
    wind_girdle_hermes: { name: '风行腰封·赫尔墨斯', category: 'artifact', summary: '流风被束进细密的纹路，步伐与咒文都变得轻快。' },
    time_greaves_chronos: { name: '时隙护腿·克罗诺斯', category: 'artifact', summary: '行走时仿佛踩在时间的缝隙之间。' },
    gale_boots_sif: { name: '逐风战靴·西芙', category: 'artifact', summary: '靴底从不沾尘，疾风会替佩戴者踏出下一步。' },
    oath_necklace_norn: { name: '守誓项链·诺恩', category: 'artifact', summary: '承诺会化为温热的光，护住仍愿前行的人。' },
    fate_bracelet_clotho: { name: '命运手镯·克洛托', category: 'artifact', summary: '银线缠绕腕间，仿佛能将断裂的命运重新缝合。' },
    eternal_ring_aurora: { name: '永恒戒指·奥罗拉', category: 'artifact', summary: '黎明色的微光永不熄灭，指向每一场可能的胜利。' },
    growth_blessing: { name: '成长祝福', category: 'ability', summary: '【绑定】所有获得的经验值翻倍。' },
    mana_affinity: { name: '魔力亲和', category: 'ability', summary: '【绑定】技能魔力消耗降低 30%。' },
    lucky_favor: { name: '幸运眷顾', category: 'ability', summary: '【绑定】战利品掉落概率提高 20%。' },
    war_god_favor: { name: '战神眷顾', category: 'ability', summary: '【绑定】造成的最终伤害提高 16%。' },
    arcane_revelation: { name: '奥术启示', category: 'ability', summary: '【绑定】魔法伤害提高 16%。' },
    crimson_recovery: { name: '猩红复苏', category: 'ability', summary: '【绑定】普攻与刺击伤害的 16% 转化为生命。' },
    seer_instinct: { name: '先知直觉', category: 'ability', summary: '【绑定】命中与暴击属性在战斗中提高 16%。' },
    hunter_blessing: { name: '猎人恩典', category: 'ability', summary: '【绑定】战利品掉落概率提高 35%。' }
};
const artifactGiftSlots = {
    holy_sword_shirulu: 'weapon', demon_sword_aphia: 'weapon', saint_staff_istaria: 'weapon', death_dagger_azra: 'weapon', godfist_chronos: 'weapon', oracle_grimoire_sophia: 'weapon', prayer_orb_lumia: 'weapon',
    immortal_shield_auges: 'offhand', star_crown_selene: 'shoulder', sky_robe_asteia: 'upper', wind_girdle_hermes: 'waist', time_greaves_chronos: 'lower', gale_boots_sif: 'feet', oath_necklace_norn: 'necklace', fate_bracelet_clotho: 'bracelet', eternal_ring_aurora: 'ring'
};
const isGiftCode = (value) => value in gifts;

export { SESSION_TTL_MINUTES, STAMINA_RECOVERY_MS, artifactGiftSlots, attributeAliases, attributeNames, calculateDerivedStats, equipmentQualityMultiplier, experienceRequiredForLevel, forgeRarityMultiplier, forgedAffixCap, forgedEquipmentBase, forgedEquipmentCaps, gifts, isGiftCode, realmEnergyDissipationText, realmLevelCap, realmNameForStage, realmNames, staminaMaxForRealm, virtualEquipmentStats };
