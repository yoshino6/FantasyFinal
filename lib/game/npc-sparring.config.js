import { calculateDerivedStats, virtualEquipmentStats } from './constants.js';
import { applyEvolutionBaseStats } from './evolution.service.js';
import { advancedProfessionByMentor, cachedAdvancedPassiveEffectFor, advancedProfessionByCode } from './advanced-profession.config.js';
import { dynamicNpcProfile } from './dynamic-npc-dialogue.service.js';
import { attributes } from './types.js';
import { residentSkills } from './resident-skill.config.js';

const sparBuildingPersonas = { guild_counter: '莫妮卡', guild_merchant: '赫伯特', saint_church: '修女·伊芙琳', blacksmith: '漠北', alchemy_sweetshop: '晴儿', oddworkshop: '唯薇安', hunter_lodge: '雷恩·霍尔特', bookshop: '洛文·赫斯特', evolution_lab: '噶' };
const canonicalSparNpc = (code) => code === 'ga_library' ? 'evolution_lab' : dynamicNpcProfile(code)?.code ?? code;
const canSparNpc = (code, kind = 'npc') => kind === 'npc' || Boolean(sparBuildingPersonas[code]);
const hash = (text) => [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
const sparRegionBands = {
    baina_town: [3, 10], world_tree: [6, 14], worldtree_meadow: [1, 6], dark_forest: [3, 9], dark_forest_depths: [10, 18],
    morningdew_riverbank: [4, 10], gravelwind_shore: [7, 14], ridge_foothills: [20, 28], rediron_pass: [22, 30], mistalgae_marsh: [24, 32],
    fallenstar_swamp: [36, 40], frostcrown_plateau: [40, 45], thundercliff: [45, 50], eclipse_ruins: [45, 50]
};
const identities = {
    pear_guide: { band: [6, 10], profession: 'rogue' }, tree_keeper: { band: [22, 28], profession: 'warrior' },
    guild_counter: { band: [10, 16], profession: 'warrior' }, saint_church: { band: [18, 26], profession: 'priest' },
    guild_merchant: { band: [26, 34], profession: 'warrior' },
    blacksmith: { band: [8, 14], profession: 'warrior' }, alchemy_sweetshop: { band: [16, 24], profession: 'mage' },
    oddworkshop: { band: [30, 38], profession: 'rogue', advanced: 'trickster_ranger' }, hunter_lodge: { band: [32, 40], profession: 'rogue', advanced: 'trickster_ranger' },
    bookshop: { band: [42, 50], profession: 'mage', advanced: 'elementalist' }, evolution_lab: { band: [35, 45], profession: 'mage', advanced: 'spellblade' }
};
const weights = { warrior: [25, 12, 25, 8, 14, 16], mage: [12, 25, 8, 27, 12, 16], rogue: [13, 10, 20, 10, 25, 22], priest: [22, 27, 8, 21, 10, 12] };
const professionGrowth = { warrior: ['constitution', 'strength'], mage: ['spirit', 'intelligence'], rogue: ['agility', 'perception'], priest: ['constitution', 'spirit'] };
const familiesFor = (role) => /锻|匠|修|检|工坊|机关/.test(role) ? ['K', 'F', 'G'] : /猎|斥|哨/.test(role) ? ['B', 'I', 'L'] : /药|牧|修女|培育|炼金/.test(role) ? ['A', 'D', 'E', 'K'] : /守|卫|巡|庇护/.test(role) ? ['F', 'B', 'H'] : /学|书|观|记|测|校|档/.test(role) ? ['L', 'D', 'E'] : /矿|运|炉/.test(role) ? ['G', 'H', 'F'] : ['C', 'J', 'H'];
const buildNpcSparProfile = (npc, playerLevel, worldStage) => {
    const code = canonicalSparNpc(npc.code);
    const seed = hash(code);
    const identity = identities[code];
    const dynamic = dynamicNpcProfile(code);
    const mentor = advancedProfessionByMentor(code);
    const band = mentor ? [30, 50] : identity?.band ?? sparRegionBands[npc.region_code] ?? [10, 18];
    const progression = Math.min(4, Math.floor(Math.max(0, worldStage) / 6));
    const anchor = Math.round(band[0] + (band[1] - band[0]) * (seed % 5) / 4);
    const level = Math.max(band[0], Math.min(band[1], Math.round((anchor * 3 + Math.max(band[0], Math.min(band[1], playerLevel))) / 4) + progression));
    const role = `${npc.name}${dynamic?.role ?? ''}${npc.description}`;
    const baseNameToCode = { 战士: 'warrior', 法师: 'mage', 盗贼: 'rogue', 牧师: 'priest' };
    const profession = level < 10 ? '' : mentor ? baseNameToCode[mentor.baseProfession] : identity?.profession ?? (/药|牧|祈/.test(role) ? 'priest' : /学|观|书|测/.test(role) ? 'mage' : /猎|哨|引|信/.test(role) ? 'rogue' : 'warrior');
    const archetype = profession || 'warrior';
    const advancedCode = level >= 30 ? mentor?.code ?? identity?.advanced ?? (seed % 3 === 0 ? ({ warrior: 'bulwark_guard', mage: 'elementalist', rogue: 'trickster_ranger', priest: 'saint_healer' }[archetype]) : undefined) : undefined;
    const trained = Object.fromEntries(attributes.map((key, index) => {
        const weight = weights[archetype][index] / 100;
        return [key, weight * 100 + (weight * 10 + (professionGrowth[profession]?.includes(key) ? 1.2 : 0)) * (level - 1)];
    }));
    const injections = level <= 20 ? 0 : Math.min(9, level - 20);
    const evolution = injections ? archetype === 'warrior' || archetype === 'priest'
        ? { hpPct: injections * 2, mpPct: injections * 2, physicalDefensePct: injections * 2, magicDefensePct: injections * 2 }
        : { [archetype === 'rogue' ? 'physicalAttackPct' : 'magicAttackPct']: injections * 2.5, critRatePct: injections, speedPct: injections } : {};
    let stats = applyEvolutionBaseStats(calculateDerivedStats(trained), evolution);
    const rarities = level < 15 ? ['普通'] : level < 30 ? ['普通', '优秀', '精良'] : ['普通', '优秀', '精良', '稀有'];
    const rarity = mentor ? '稀有' : rarities[seed % rarities.length];
    const equipment = { rarity, quality: level < 10 ? 30 : level < 20 ? 60 : 80, secondaryAffixes: rarity === '普通' ? 0 : rarity === '优秀' ? 1 : rarity === '精良' ? 2 : 3 };
    const equipmentLevel = Math.max(1, level - (seed % 4));
    const gear = virtualEquipmentStats(equipmentLevel, 'normal', stats.physicalAttack, stats.magicAttack, equipment);
    for (const key of Object.keys(stats))
        stats[key] += gear[key];
    stats = applyEvolutionBaseStats(stats, cachedAdvancedPassiveEffectFor(advancedCode));
    const families = familiesFor(role);
    if (mentor)
        families.push('M');
    const allowed = residentSkills.filter(skill => families.includes(skill.id[0]) && (skill.tier !== '中位' || level >= 25) && (skill.tier !== '下位' || level >= 6));
    const active = allowed.filter(skill => skill.category !== 'passive');
    const offense = active.filter(skill => skill.category !== 'utility');
    const support = active.filter(skill => skill.category === 'utility');
    const rotation = [...new Set([...(offense.length ? [offense[seed % offense.length].code] : []), ...(support.length ? [support[seed % support.length].code] : []), ...(level >= 15 && offense.length > 1 ? [offense[(seed + 1) % offense.length].code] : []), ...(level >= 30 && support.length > 1 ? [support[(seed + 1) % support.length].code] : [])])];
    const passives = allowed.filter(skill => skill.category === 'passive');
    const firstPassive = passives[seed % Math.max(1, passives.length)];
    const otherPassives = passives.filter(skill => skill.id[0] !== firstPassive?.id[0]);
    const linked = firstPassive ? [firstPassive.code, ...(level >= 30 && otherPassives.length ? [otherPassives[seed % otherPassives.length].code] : [])] : [];
    return { code, name: mentor?.mentor.name ?? sparBuildingPersonas[code] ?? dynamic?.displayName ?? npc.name, level, band, worldStage,
        profession, advancedCode, advancedName: advancedProfessionByCode(advancedCode ?? '')?.name ?? '', advancedEffect: advancedProfessionByCode(advancedCode ?? '')?.passive.effect ?? {},
        trainedAttributes: trained, stats, equipment: { ...equipment, level: equipmentLevel, pieces: 6 }, evolution, injections,
        rotation, passives: linked, pool: [...rotation, ...linked] };
};
const carriedSparSkills = (profile) => [...new Set([...profile.rotation, ...profile.passives])].filter(code => Boolean(residentSkills.find(skill => skill.code === code)));

export { buildNpcSparProfile, canSparNpc, canonicalSparNpc, carriedSparSkills, sparBuildingPersonas, sparRegionBands };
