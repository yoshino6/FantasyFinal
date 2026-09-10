import { achievementLevel } from './achievement-hooks.js';
import { getPool, withTransaction } from '../database/pool.js';
import { experienceRequiredForLevel } from './constants.js';
import { recordSkillPointChange } from './skill-point-ledger.service.js';

const bodyPartNames = { eye: '眼部', nerve: '神经', skin: '表皮', chest: '胸腔', bone: '骨骼', organ: '脏器' };
const bodyParts = Object.keys(bodyPartNames);
const injectionNames = { conservative: '保守针剂', aggressive: '激进针剂', harmonic: '调和针剂', perception: '感知针剂', symbiosis: '共生针剂', metamorphosis: '蜕变针剂', shaping: '定型针剂' };
const symbiosisTraits = {
    shared_guard: { name: '共护膜', partyText: '队伍减伤 +2%', soloText: '自身减伤 +4%', partyBonus: { damageReductionPct: 2 }, soloBonus: { damageReductionPct: 4 } },
    mana_circulation: { name: '并联回路', partyText: '队伍回魔 +1%', soloText: '自身回魔 +2%', partyBonus: { mpRegenPct: 1 }, soloBonus: { mpRegenPct: 2 } },
    healing_resonance: { name: '复苏共鸣', partyText: '队伍受疗 +3%', soloText: '自身受疗 +6%', partyBonus: { healingReceivedPct: 3 }, soloBonus: { healingReceivedPct: 6 } }
};
const symbiosisTraitCodes = Object.keys(symbiosisTraits);
const symbiosisTraitName = (code) => code && code in symbiosisTraits ? symbiosisTraits[code].name : '尚未选择';
const injectionItemCodes = {
    conservative: 'evolution_injection_conservative', aggressive: 'evolution_injection_aggressive', harmonic: 'evolution_injection_harmonic',
    perception: 'evolution_injection_perception', symbiosis: 'evolution_injection_symbiosis', metamorphosis: 'evolution_injection_metamorphosis', shaping: 'evolution_injection_shaping'
};
const evolutionItemNames = {
    evolution_active_sample: '活性样本', evolution_stable_medium: '稳定介质', evolution_catalyst: '演化催化剂',
    evolution_injection_conservative: '保守针剂', evolution_injection_aggressive: '激进针剂', evolution_injection_harmonic: '调和针剂',
    evolution_injection_perception: '感知针剂', evolution_injection_symbiosis: '共生针剂', evolution_injection_metamorphosis: '蜕变针剂', evolution_injection_shaping: '定型针剂'
};
const evolutionItemName = (code) => evolutionItemNames[code] ?? '所需物品';
const jsonObject = (value) => {
    if (!value)
        return {};
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, Number(item) || 0])) : {};
    }
    catch {
        return {};
    }
};
const jsonStringObject = (value) => jsonObject(value);
const jsonNumberList = (value) => {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? [...new Set(parsed.map(Number).filter(value => Number.isInteger(value) && value > 0))] : [];
    }
    catch {
        return [];
    }
};
const mergeBonus = (...bonuses) => bonuses.reduce((result, bonus) => {
    for (const [key, value] of Object.entries(bonus))
        result[key] = Number(result[key] ?? 0) + Number(value ?? 0);
    return result;
}, {});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const makeBlueprints = (part, state, names, effects) => names.map((name, index) => ({
    code: `mutation_${part}_${state}_${index + 1}`,
    name,
    part,
    state,
    description: state === 'deviation' ? `${name}会改变你的行动习惯；它的收益与代价均可在进化面板中暂停或观察。` : state === 'rare' ? `${name}记录了一种罕见的演化表型，偏向世界交互而非纯数值。` : `${name}是一项稳定的${bodyPartNames[part]}演化结果。`,
    effect: effects[index % effects.length]
}));
const partBlueprints = (part, stable, deviation, rare, stableEffects, deviationEffects, rareEffects) => [
    ...makeBlueprints(part, 'stable', stable, stableEffects), ...makeBlueprints(part, 'deviation', deviation, deviationEffects), ...makeBlueprints(part, 'rare', rare, rareEffects)
];
const mutationCatalog = [
    ...partBlueprints('eye', ['叶脉瞳', '棱镜虹膜', '暗适瞳', '深焦晶体', '追迹瞳', '风纹角膜', '矿脉视', '静水晶体', '星屑瞳孔', '余晖反射', '微光腺', '双焦瞳', '灵压视', '雾透膜', '记忆虹膜'], ['余像症', '畏光', '色温错位', '焦距迟滞', '强迫标记', '盲点游移', '视觉过饱和', '断片视界', '梦视'], ['世界树瞳', '月蚀瞳', '命线之眼', '海渊瞳', '碎镜复眼', '闭环瞳'], [{ accuracyPct: 3 }, { evasionPct: 3 }, { critRatePct: 2 }, { critDamagePct: 2 }, { accuracyPct: 2, critRatePct: 1 }], [{ accuracyPct: -3, physicalAttackPct: 4 }, { evasionPct: -3, critRatePct: 3 }, { accuracyPct: -2, magicAttackPct: 4 }], [{ accuracyPct: 4 }, { critRatePct: 3 }, { evasionPct: 4 }]),
    ...partBlueprints('nerve', ['并列突触', '低延迟髓鞘', '反射弧', '节律突触', '静默神经', '手势记忆', '预判神经', '痛觉阈门', '分流神经', '余震回路', '呼吸同步', '触觉雷达', '绝缘髓鞘', '迟滞过滤', '梦行回路'], ['过载反射', '假启动', '痛觉放大', '耳鸣', '梦语', '动作强迫', '神经拒斥', '颤抖', '迟发疼痛'], ['时隙突触', '群落神经', '雷痕神经', '梦境触须', '静脑回路', '回声中枢'], [{ speedPct: 3 }, { tenacityPct: 5 }, { mpPct: 3 }, { critResistPct: 2 }, { accuracyPct: 2, speedPct: 1 }], [{ mpPct: -3, speedPct: 5 }, { accuracyPct: -3, critDamagePct: 5 }, { hpPct: -2, tenacityPct: 6 }], [{ speedPct: 4 }, { tenacityPct: 6 }, { mpPct: 4 }]),
    ...partBlueprints('skin', ['鳞质膜', '苔藓表皮', '厚角质', '银纹皮层', '变温表皮', '微孔呼吸', '树脂涂层', '静电绒毛', '砂砾皮', '露珠膜', '镜面角片', '风干皮膜', '矿纹真皮', '霜壳', '伪装斑纹'], ['蜕皮期', '裂纹皮', '过敏斑', '渗水', '硬壳僵化', '灼痕', '瘙痒感', '褪色', '异鳞'], ['叶脉皮', '潮汐鳞', '星砂肤', '岩壳胎衣', '镜湖皮', '云纹皮'], [{ physicalDefensePct: 3 }, { magicDefensePct: 3 }, { hpPct: 2 }, { critDamageReductionPct: 3 }, { evasionPct: 2 }], [{ physicalDefensePct: -3, physicalAttackPct: 4 }, { speedPct: -3, critDamageReductionPct: 5 }, { magicDefensePct: -2, magicAttackPct: 4 }], [{ physicalDefensePct: 4 }, { magicDefensePct: 4 }, { hpPct: 3 }]),
    ...partBlueprints('chest', ['双律心室', '静脉护环', '深呼吸囊', '潮鸣肺叶', '绒膜肺', '热核心房', '缓搏心律', '共鸣胸骨', '储氧腔', '净血微囊', '回春腺', '光合胸腔', '静压肺泡', '脉冲心室', '护巢反应'], ['逆搏', '心律失序', '喘鸣', '血潮', '空腔感', '胸闷', '灼肺', '漏压', '共感痛'], ['潮汐心室', '树心共鸣', '恒星肺', '冬眠胸腔', '回声心', '空鸣腔'], [{ hpPct: 3 }, { mpPct: 3 }, { hpPct: 2, mpPct: 2 }, { critDamageReductionPct: 2 }, { tenacityPct: 3 }], [{ hpPct: -3, damageReductionPct: 5 }, { mpPct: -3, hpPct: 2 }, { magicDefensePct: -2, magicAttackPct: 4 }], [{ hpPct: 4 }, { mpPct: 4 }, { hpPct: 2, damageReductionPct: 2 }]),
    ...partBlueprints('bone', ['空髓骨架', '致密骨板', '灵导骨', '弹簧踝', '攀附指骨', '稳握腕骨', '悬韧脊柱', '静骨节', '轻鸣肋骨', '锚定髋骨', '石髓骨', '弓弦锁骨', '扭转腰椎', '踏风趾骨', '护臂骨刺'], ['共振骨鸣', '脆节', '骨刺外翻', '关节错位', '石化感', '空洞骨', '骨髓躁动', '钙化', '断续痛'], ['岩王脊', '月弓锁骨', '云阶足骨', '根锚盆骨', '雷鸣指骨', '古兽髓'], [{ physicalAttackPct: 3 }, { physicalDefensePct: 3 }, { speedPct: 2 }, { accuracyPct: 2 }, { hpPct: 2 }], [{ physicalDefensePct: -3, physicalAttackPct: 5 }, { speedPct: -3, critDamageReductionPct: 6 }, { hpPct: -3, evasionPct: 5 }], [{ physicalAttackPct: 4 }, { physicalDefensePct: 4 }, { speedPct: 3 }]),
    ...partBlueprints('organ', ['菌群胃囊', '节律肝叶', '净化肾囊', '储蜜腺', '余温胃', '滤毒胆囊', '共生腔', '回流肠道', '硬化脾', '星盐腺', '灵酶胃', '潮汐肾', '养分回收', '安眠腺', '代谢阀门'], ['饥渴代谢', '反酸', '菌群争鸣', '代谢过速', '排异反应', '盐渍化', '共生饥饿', '胆汁逆流', '梦食'], ['根须胃', '潮汐囊', '星尘肝', '晶核脾', '群居肠', '逆熵腺'], [{ hpPct: 2 }, { mpPct: 3 }, { tenacityPct: 3 }, { hpPct: 1, mpPct: 2 }, { damageReductionPct: 1 }], [{ hpPct: -2, mpPct: 3 }, { mpPct: -3, hpPct: 3 }, { speedPct: 3, hpPct: -2 }], [{ hpPct: 3 }, { mpPct: 4 }, { tenacityPct: 4 }])
];
const mutationsFor = (part, state) => mutationCatalog.filter(item => item.part === part && item.state === state);
const injectionRules = {
    conservative: { unlockLevel: 20, parts: ['skin', 'chest', 'bone'], chance: .15, stableChance: 1, pressure: -1, stability: 20 },
    aggressive: { unlockLevel: 20, parts: ['bone', 'nerve', 'skin'], chance: .45, stableChance: .70, pressure: 2, stability: -4 },
    harmonic: { unlockLevel: 20, parts: ['chest', 'organ'], chance: .25, stableChance: .80, pressure: -1, stability: 10 },
    perception: { unlockLevel: 23, parts: ['eye', 'nerve'], chance: .35, stableChance: .75, pressure: 1, stability: 0 },
    symbiosis: { unlockLevel: 23, parts: ['organ', 'skin'], chance: .35, stableChance: .75, pressure: 0, stability: 0 },
    metamorphosis: { unlockLevel: 26, parts: bodyParts, chance: .60, stableChance: .85, pressure: 1, stability: 0 },
    shaping: { unlockLevel: 29, parts: [], chance: 0, stableChance: 1, pressure: 0, stability: 0, cost: 5 }
};
const profileFor = async (connection, characterId, lock = false) => {
    const [rows] = await connection.execute(`SELECT * FROM player_evolution_profiles WHERE character_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    return rows[0] ?? null;
};
const characterFor = async (connection, qqUserId, lock = false) => {
    const [rows] = await connection.execute(`SELECT c.id,c.name,c.level,c.experience,c.realm_stage,c.profession_code,
    COALESCE((SELECT q.stage FROM player_main_quest_progress q WHERE q.character_id=c.id AND q.quest_code='evolution_barrier' LIMIT 1),0) AS evolution_stage
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return rows[0];
};
const createProfile = (connection, characterId) => connection.execute(`INSERT IGNORE INTO player_evolution_profiles
  (character_id,unlocked_level,injection_count,evolution_scale,adaptation_pressure,stability,fixed_bonus_json,lineage_marks_json,final_traits_json)
  VALUES (?,20,0,0,0,50,JSON_OBJECT(),JSON_OBJECT(),JSON_ARRAY())`, [characterId]);
const activateEvolutionProfile = (connection, characterId) => createProfile(connection, characterId);
const ensureEvolutionProfile = async (connection, character, lock = false) => {
    let profile = await profileFor(connection, Number(character.id), lock);
    if (!profile && (Number(character.realm_stage) === 3 || Number(character.evolution_stage) >= 8)) {
        await createProfile(connection, Number(character.id));
        profile = await profileFor(connection, Number(character.id), lock);
    }
    return profile;
};
const repairEvolutionProgress = async (connection, characterId) => {
    const [rows] = await connection.execute(`SELECT c.id,c.name,c.level,c.experience,c.realm_stage,c.profession_code,
    COALESCE((SELECT q.stage FROM player_main_quest_progress q WHERE q.character_id=c.id AND q.quest_code='evolution_barrier' LIMIT 1),0) AS evolution_stage
    FROM characters c WHERE c.id=? LIMIT 1 FOR UPDATE`, [characterId]);
    const character = rows[0];
    if (!character)
        return { corrected: false, level: 0, profile: null };
    const profile = await ensureEvolutionProfile(connection, character, true);
    const legalLevel = profile ? clamp(Number(profile.unlocked_level), 20, 30) : Number(character.realm_stage) < 3 ? 20 : Number(character.level);
    if (profile && Number(profile.unlocked_level) !== legalLevel)
        await connection.execute('UPDATE player_evolution_profiles SET unlocked_level=?,updated_at=NOW() WHERE character_id=?', [legalLevel, character.id]);
    if (Number(character.level) <= legalLevel)
        return { corrected: false, level: Number(character.level), profile };
    await connection.execute('UPDATE characters SET level=?,experience=0 WHERE id=?', [legalLevel, character.id]);
    return { corrected: true, level: legalLevel, profile };
};
const materialsForLevel = (level, shaping = false) => ({ active: shaping ? 8 : 3 + Math.max(0, Math.floor((level - 21) / 3)), medium: shaping ? 5 : 2 + Math.max(0, Math.floor((level - 21) / 4)), catalyst: shaping ? 5 : level <= 23 ? 1 : level <= 26 ? 2 : 3 });
const evolutionInjectionMaterials = (level, code) => materialsForLevel(level, code === 'shaping');
const injectionAvailable = (code, level) => code === 'shaping' ? level === 29 : level >= injectionRules[code].unlockLevel && level < 29;
const consumeItems = async (connection, characterId, costs) => {
    const codes = Object.keys(costs);
    const placeholders = codes.map(() => '?').join(',');
    const [rows] = await connection.execute(`SELECT i.code,pi.quantity,pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND i.code IN (${placeholders}) FOR UPDATE`, [characterId, ...codes]);
    const inventory = new Map(rows.map(row => [row.code, row]));
    for (const [code, quantity] of Object.entries(costs))
        if (Number(inventory.get(code)?.quantity ?? 0) < quantity)
            throw new Error(`缺少材料：【${evolutionItemName(code)}】`);
    for (const [code, quantity] of Object.entries(costs)) {
        const row = inventory.get(code);
        if (Number(row.quantity) === quantity)
            await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=?', [characterId, row.item_id]);
        else
            await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, characterId, row.item_id]);
    }
};
const addItem = (connection, characterId, code, quantity) => connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity)
  SELECT ?,id,? FROM item_definitions WHERE code=? ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()`, [characterId, quantity, code]);
const itemQuantity = async (connection, characterId, code, lock = false) => {
    const [rows] = await connection.execute(`SELECT pi.quantity,pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id
    WHERE pi.character_id=? AND i.code=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId, code]);
    return rows[0] ?? null;
};
const consumeItem = async (connection, characterId, code) => {
    const row = await itemQuantity(connection, characterId, code, true);
    if (!row?.quantity)
        throw new Error(`背包中没有【${evolutionItemName(code)}】。`);
    if (Number(row.quantity) <= 1)
        await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=?', [characterId, row.item_id]);
    else
        await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [characterId, row.item_id]);
};
const evolutionStatBonuses = async (connection, characterId) => {
    const profile = await profileFor(connection, characterId);
    if (!profile)
        return {};
    const [rows] = await connection.execute(`SELECT effect_json,tier FROM player_mutations
    WHERE character_id=? AND mutation_state IN ('stable','deviation','rare')`, [characterId]);
    return mergeBonus(jsonObject(profile.fixed_bonus_json), ...rows.map(row => {
        const multiplier = Number(row.tier) >= 2 ? 1.5 : 1;
        return Object.fromEntries(Object.entries(jsonObject(row.effect_json)).map(([key, value]) => [key, value * multiplier]));
    }));
};
const applyEvolutionBaseStats = (stats, bonus) => {
    const pct = [
        ['hpMax', 'hpPct'], ['mpMax', 'mpPct'], ['physicalAttack', 'physicalAttackPct'], ['magicAttack', 'magicAttackPct'], ['physicalDefense', 'physicalDefensePct'], ['magicDefense', 'magicDefensePct'],
        ['accuracy', 'accuracyPct'], ['evasion', 'evasionPct'], ['critRateBp', 'critRatePct'], ['critDamageBp', 'critDamagePct'], ['critResistBp', 'critResistPct'], ['critDamageReductionBp', 'critDamageReductionPct'],
        ['tenacity', 'tenacityPct'], ['tenacityPierce', 'tenacityPiercePct'], ['speed', 'speedPct']
    ];
    const result = { ...stats };
    for (const [key, percent] of pct)
        result[key] = Math.max(0, Math.floor(Number(result[key]) * (1 + Number(bonus[percent] ?? 0) / 100)));
    return result;
};
const fixedBonusFor = (code, character) => {
    if (code === 'conservative')
        return { hpPct: 2, mpPct: 2, physicalDefensePct: 2, magicDefensePct: 2 };
    if (code === 'aggressive')
        return ['warrior', 'rogue'].includes(String(character.profession_code)) ? { physicalAttackPct: 2.5, critRatePct: 1, speedPct: 1 } : { magicAttackPct: 2.5, critRatePct: 1, speedPct: 1 };
    if (code === 'harmonic')
        return { hpPct: 4, healingBonusPct: 5, healingReceivedPct: 5 };
    if (code === 'perception')
        return { accuracyPct: 3, evasionPct: 3, critRatePct: 1 };
    if (code === 'symbiosis')
        return {};
    return {};
};
const lineageForPart = { eye: 'night', nerve: 'night', skin: 'root', chest: 'tide', bone: 'rock', organ: 'root' };
const drawMutation = async (connection, characterId, code, part, stableChance) => {
    const roll = Math.random();
    const state = roll < stableChance ? (Math.random() < .15 ? 'rare' : 'stable') : 'deviation';
    const blueprint = randomItem(mutationsFor(part, state));
    const [existing] = await connection.execute(`SELECT * FROM player_mutations WHERE character_id=? AND body_part=? AND mutation_state IN ('stable','rare','deviation')
    ORDER BY FIELD(mutation_state,'stable','rare','deviation'),id FOR UPDATE`, [characterId, part]);
    const occupied = existing.find(row => (state === 'deviation') === (row.mutation_state === 'deviation'));
    if (occupied) {
        if (occupied.mutation_code === blueprint.code && Number(occupied.tier) < 2) {
            await connection.execute('UPDATE player_mutations SET tier=2,updated_at=NOW() WHERE id=?', [occupied.id]);
            return { ...blueprint, outcome: '强化为 II 阶' };
        }
        await connection.execute(`INSERT IGNORE INTO player_mutations (character_id,body_part,mutation_code,mutation_name,mutation_state,tier,source_injection,effect_json,description)
      VALUES (?,?,?,?, 'archived',1,?,?,?)`, [characterId, part, blueprint.code, blueprint.name, code, JSON.stringify(blueprint.effect), blueprint.description]);
        return { ...blueprint, outcome: '已封存为观察样本' };
    }
    await connection.execute(`INSERT INTO player_mutations (character_id,body_part,mutation_code,mutation_name,mutation_state,tier,source_injection,effect_json,description)
    VALUES (?,?,?,?,?,1,?,?,?)`, [characterId, part, blueprint.code, blueprint.name, state, code, JSON.stringify(blueprint.effect), blueprint.description]);
    return { ...blueprint, outcome: state === 'deviation' ? '形成偏差' : state === 'rare' ? '形成稀有观测' : '形成稳定变异' };
};
const injectEvolution = async (qqUserId, code, requestedPart, requestedSymbiosisTrait) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('进化之种尚未回应你。');
    const currentCap = Number(profile.unlocked_level);
    const rule = injectionRules[code];
    if (!injectionAvailable(code, currentCap))
        throw new Error('这支针剂不能用于当前生长结。');
    if (Number(character.level) !== currentCap || Number(character.experience) < experienceRequiredForLevel(currentCap))
        throw new Error(`先让 Lv.${currentCap} 的经验达到满值，才能注射针剂。`);
    const symbiosisTrait = code === 'symbiosis' ? profile.symbiosis_trait_code ?? requestedSymbiosisTrait ?? null : null;
    if (code === 'symbiosis' && (!symbiosisTrait || !symbiosisTraitCodes.includes(symbiosisTrait)))
        throw new Error('请先选择一项共生微被动。');
    let finalTraits = [];
    if (code === 'shaping') {
        const candidates = await selectableFinalTraits(connection, Number(character.id), true);
        const required = Math.min(3, candidates.length);
        const selectedIds = jsonNumberList(profile.final_traits_json).filter(id => candidates.some(trait => Number(trait.id) === id));
        if (selectedIds.length !== required)
            throw new Error(required ? `请先在自我定义中选择 ${required} 项定型特征。` : '尚无稳定观测可供定型；可直接完成最后一次注射。');
        finalTraits = candidates.filter(trait => selectedIds.includes(Number(trait.id)));
    }
    if (Number(profile.injection_count) > 0) {
        if (Number((await itemQuantity(connection, Number(character.id), injectionItemCodes[code], true))?.quantity ?? 0) > 0)
            await consumeItem(connection, Number(character.id), injectionItemCodes[code]);
        else {
            const materials = materialsForLevel(currentCap, code === 'shaping');
            await consumeItems(connection, Number(character.id), { evolution_active_sample: materials.active, evolution_stable_medium: materials.medium, evolution_catalyst: materials.catalyst });
        }
    }
    const chosenPart = requestedPart && rule.parts.includes(requestedPart) ? requestedPart : rule.parts.length ? randomItem(rule.parts) : null;
    if (code === 'harmonic')
        await connection.execute(`UPDATE player_mutations SET mutation_state='archived',updated_at=NOW() WHERE character_id=? AND mutation_state='deviation' ORDER BY id LIMIT 1`, [character.id]);
    const mutation = chosenPart && Math.random() < rule.chance ? await drawMutation(connection, Number(character.id), code, chosenPart, rule.stableChance) : null;
    const fixed = mergeBonus(jsonObject(profile.fixed_bonus_json), fixedBonusFor(code, character));
    const marks = jsonStringObject(profile.lineage_marks_json);
    if (mutation && mutation.state !== 'deviation')
        marks[lineageForPart[chosenPart]] = Number(marks[lineageForPart[chosenPart]] ?? 0) + 1;
    if (code === 'metamorphosis' && chosenPart)
        marks[lineageForPart[chosenPart]] = Number(marks[lineageForPart[chosenPart]] ?? 0) + 1;
    const nextLevel = currentCap + 1;
    await connection.execute(`UPDATE player_evolution_profiles SET unlocked_level=?,injection_count=injection_count+1,evolution_scale=evolution_scale+1,
    adaptation_pressure=?,stability=?,fixed_bonus_json=?,lineage_marks_json=?,symbiosis_trait_code=COALESCE(symbiosis_trait_code,?),updated_at=NOW() WHERE character_id=?`, [
        nextLevel, clamp(Number(profile.adaptation_pressure) + rule.pressure, 0, 8), clamp(Number(profile.stability) + rule.stability, 0, 100), JSON.stringify(fixed), JSON.stringify(marks), symbiosisTrait, character.id
    ]);
    await connection.execute('UPDATE characters SET level=?,experience=0,skill_points=skill_points+1 WHERE id=?', [nextLevel, character.id]);
    achievementLevel(connection, Number(character.id), nextLevel);
    await recordSkillPointChange(connection, Number(character.id), 1, 'level_up', null, `进化注射后升至 Lv.${nextLevel}`);
    await connection.execute(`INSERT INTO player_events (player_id,event_type,payload)
    SELECT player_id,'evolution.injected',? FROM characters WHERE id=?`, [JSON.stringify({ code, level: currentCap, mutation: mutation?.code ?? null, finalTraits: finalTraits.map(trait => trait.mutation_code), symbiosisTrait }), character.id]);
    return { characterId: Number(character.id), name: character.name, code, injectionName: injectionNames[code], fromLevel: currentCap, toLevel: nextLevel, gainedSkillPoints: 1, mutation, finalTraits: finalTraits.map(trait => trait.mutation_name), symbiosisTrait: symbiosisTrait ? symbiosisTraits[symbiosisTrait] : null, pressure: clamp(Number(profile.adaptation_pressure) + rule.pressure, 0, 8), stability: clamp(Number(profile.stability) + rule.stability, 0, 100) };
});
const businessDate = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};
const observationDefinitions = {
    behavior: { name: '行为观察', objective: '击败 2 个精英或首领目标', target: 2, items: { evolution_active_sample: 3, evolution_catalyst: 1 } },
    sample: { name: '样本采集', objective: '完成 3 次资源开采', target: 3, items: { evolution_stable_medium: 5 } },
    adaptation: { name: '适应试验', objective: '取得 3 场战斗胜利', target: 3, items: { evolution_active_sample: 5 } },
    resonance: { name: '共鸣记录', objective: '与其他玩家共同取得 1 场胜利；独行时累计取得 3 场胜利', target: 3, items: { evolution_active_sample: 3, evolution_catalyst: 1 } },
    containment: { name: '失控处理', objective: '击败 1 个精英或首领目标', target: 1, items: { evolution_stable_medium: 3, evolution_catalyst: 1 } }
};
const observationTypes = Object.keys(observationDefinitions);
const observationType = (value) => observationTypes.includes(value);
const observationRewardsText = (items) => Object.entries(items).map(([code, quantity]) => `${evolutionItemName(code)}×${quantity}`).join('、');
const evolutionObservationDashboard = async (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    const key = businessDate();
    const claimed = String(profile.daily_key ?? '') === key ? Number(profile.daily_claims) : 0;
    const [rows] = await connection.execute('SELECT * FROM player_evolution_observations WHERE character_id=? AND business_date=? ORDER BY id DESC FOR UPDATE', [character.id, key]);
    const active = rows.find(row => row.status === 'accepted' || row.status === 'completed') ?? null;
    const usedTypes = new Set(rows.map(row => row.observation_type));
    return {
        claimed, remaining: Math.max(0, 2 - claimed), active: active && { ...active, definition: observationDefinitions[active.observation_type], rewards: observationRewardsText(jsonObject(active.reward_json)) },
        available: claimed >= 2 || active ? [] : observationTypes.filter(type => !usedTypes.has(type)).map(type => ({ type, ...observationDefinitions[type], rewards: observationRewardsText(observationDefinitions[type].items) }))
    };
});
const acceptEvolutionObservation = async (qqUserId, type) => withTransaction(async (connection) => {
    if (!observationType(type))
        throw new Error('未知的观察类型。');
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    const key = businessDate();
    const claimed = String(profile.daily_key ?? '') === key ? Number(profile.daily_claims) : 0;
    if (claimed >= 2)
        throw new Error('今天的主观察与补充观察都已整理完毕。');
    const [activeRows] = await connection.execute("SELECT * FROM player_evolution_observations WHERE character_id=? AND business_date=? AND status IN ('accepted','completed') LIMIT 1 FOR UPDATE", [character.id, key]);
    if (activeRows[0])
        throw new Error(activeRows[0].status === 'completed' ? '观察已经完成，请先向噶提交记录。' : '你正在进行一项观察，请先完成它。');
    const [existingRows] = await connection.execute('SELECT * FROM player_evolution_observations WHERE character_id=? AND business_date=? AND observation_type=? LIMIT 1 FOR UPDATE', [character.id, key, type]);
    if (existingRows[0])
        throw new Error('这份观察今天已经整理过了，请选择另一项。');
    const definition = observationDefinitions[type];
    await connection.execute(`INSERT INTO player_evolution_observations
    (character_id,business_date,observation_type,status,progress,target_count,objective_text,reward_json)
    VALUES (?,?,?,'accepted',0,?,?,?)`, [character.id, key, type, definition.target, definition.objective, JSON.stringify(definition.items)]);
    return { type, ...definition, rewards: observationRewardsText(definition.items) };
});
const advanceActiveObservation = async (connection, characterId, advance) => {
    const key = businessDate();
    const [rows] = await connection.execute("SELECT * FROM player_evolution_observations WHERE character_id=? AND business_date=? AND status='accepted' LIMIT 1 FOR UPDATE", [characterId, key]);
    const row = rows[0];
    if (!row)
        return null;
    const delta = Math.max(0, Math.floor(advance(row)));
    if (!delta)
        return null;
    const target = Math.max(1, Number(row.target_count));
    const progress = Math.min(target, Number(row.progress) + delta);
    const completed = progress >= target;
    await connection.execute(`UPDATE player_evolution_observations SET progress=?,status=?,completed_at=IF(?,NOW(),completed_at),updated_at=NOW() WHERE id=?`, [progress, completed ? 'completed' : 'accepted', completed ? 1 : 0, row.id]);
    return { type: row.observation_type, name: observationDefinitions[row.observation_type].name, progress, target, completed };
};
const advanceEvolutionObservationBattle = (connection, characterId, context) => advanceActiveObservation(connection, characterId, row => {
    if (row.observation_type === 'behavior' || row.observation_type === 'containment')
        return context.eliteOrBossDefeats;
    if (row.observation_type === 'adaptation')
        return 1;
    if (row.observation_type === 'resonance')
        return context.playerPartySize >= 2 ? Number(row.target_count) : 1;
    return 0;
});
const advanceEvolutionObservationMining = (connection, characterId) => advanceActiveObservation(connection, characterId, row => row.observation_type === 'sample' ? 1 : 0);
const claimEvolutionObservation = async (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    const key = businessDate();
    const claimed = String(profile.daily_key ?? '') === key ? Number(profile.daily_claims) : 0;
    if (claimed >= 2)
        throw new Error('今天的主观察与补充观察都已整理完毕。');
    const [rows] = await connection.execute("SELECT * FROM player_evolution_observations WHERE character_id=? AND business_date=? AND status IN ('accepted','completed') ORDER BY id DESC LIMIT 1 FOR UPDATE", [character.id, key]);
    const row = rows[0];
    if (!row)
        throw new Error('没有可提交的观察记录。');
    if (row.status !== 'completed')
        throw new Error(`观察尚未完成：${row.objective_text}（${row.progress}/${row.target_count}）。`);
    const items = jsonObject(row.reward_json);
    for (const [code, quantity] of Object.entries(items))
        await addItem(connection, Number(character.id), code, quantity);
    await connection.execute("UPDATE player_evolution_observations SET status='claimed',claimed_at=NOW(),updated_at=NOW() WHERE id=?", [row.id]);
    await connection.execute('UPDATE player_evolution_profiles SET daily_key=?,daily_claims=?,updated_at=NOW() WHERE character_id=?', [key, claimed + 1, character.id]);
    return { name: observationDefinitions[row.observation_type].name, items, remaining: Math.max(0, 1 - claimed) };
});
const mutationFor = async (connection, characterId, mutationId, lock = false) => {
    const [rows] = await connection.execute(`SELECT * FROM player_mutations WHERE id=? AND character_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [mutationId, characterId]);
    if (!rows[0])
        throw new Error('找不到这份变异记录。');
    return rows[0];
};
const setMutationPaused = async (qqUserId, mutationId, paused) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    const mutation = await mutationFor(connection, Number(character.id), mutationId, true);
    if (paused) {
        if (mutation.mutation_state !== 'deviation')
            throw new Error('只有偏差型变异可以暂停。');
        await connection.execute(`UPDATE player_mutations SET mutation_state='paused',updated_at=NOW() WHERE id=?`, [mutation.id]);
    }
    else {
        if (mutation.mutation_state !== 'paused')
            throw new Error('这份变异目前无需恢复。');
        await connection.execute(`UPDATE player_mutations SET mutation_state='deviation',updated_at=NOW() WHERE id=?`, [mutation.id]);
    }
    await connection.execute(`INSERT INTO player_events (player_id,event_type,payload) SELECT player_id,?,? FROM characters WHERE id=?`, [paused ? 'evolution.mutation_paused' : 'evolution.mutation_resumed', JSON.stringify({ mutationId, code: mutation.mutation_code }), character.id]);
    return { characterId: Number(character.id), name: mutation.mutation_name, paused };
});
const stabilizeMutation = async (qqUserId, mutationId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    const mutation = await mutationFor(connection, Number(character.id), mutationId, true);
    if (!['deviation', 'paused'].includes(mutation.mutation_state))
        throw new Error('只有偏差型变异需要稳定处理。');
    const [occupied] = await connection.execute(`SELECT id FROM player_mutations WHERE character_id=? AND body_part=? AND mutation_state IN ('stable','rare') AND id<>? LIMIT 1 FOR UPDATE`, [character.id, mutation.body_part, mutation.id]);
    if (occupied[0])
        throw new Error(`${bodyPartNames[mutation.body_part]}已有稳定观测，请先封存其中一项。`);
    await consumeItems(connection, Number(character.id), { evolution_stable_medium: 2 });
    const stabilizedEffect = Object.fromEntries(Object.entries(jsonObject(mutation.effect_json)).filter(([, value]) => Number(value) > 0));
    await connection.execute(`UPDATE player_mutations SET mutation_state='stable',effect_json=?,description=?,updated_at=NOW() WHERE id=?`, [JSON.stringify(stabilizedEffect), `经稳定介质校正后的${mutation.mutation_name}。它保留可利用的表型，不再携带偏差代价。`, mutation.id]);
    const pressure = clamp(Number(profile.adaptation_pressure) - 1, 0, 8);
    const stability = clamp(Number(profile.stability) + 10, 0, 100);
    await connection.execute(`UPDATE player_evolution_profiles SET adaptation_pressure=?,stability=?,updated_at=NOW() WHERE character_id=?`, [pressure, stability, character.id]);
    await connection.execute(`INSERT INTO player_events (player_id,event_type,payload) SELECT player_id,'evolution.mutation_stabilized',? FROM characters WHERE id=?`, [JSON.stringify({ mutationId, code: mutation.mutation_code }), character.id]);
    return { characterId: Number(character.id), name: mutation.mutation_name, pressure, stability };
});
const archiveMutation = async (qqUserId, mutationId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    const mutation = await mutationFor(connection, Number(character.id), mutationId, true);
    if (mutation.mutation_state === 'archived')
        throw new Error('这份记录已经封存。');
    await connection.execute(`UPDATE player_mutations SET mutation_state='archived',updated_at=NOW() WHERE id=?`, [mutation.id]);
    await connection.execute(`INSERT INTO player_events (player_id,event_type,payload) SELECT player_id,'evolution.mutation_archived',? FROM characters WHERE id=?`, [JSON.stringify({ mutationId, code: mutation.mutation_code }), character.id]);
    return { characterId: Number(character.id), name: mutation.mutation_name };
});
const selectableFinalTraits = async (connection, characterId, lock = false) => {
    const [rows] = await connection.execute(`SELECT * FROM player_mutations WHERE character_id=? AND mutation_state IN ('stable','rare') ORDER BY acquired_at,id${lock ? ' FOR UPDATE' : ''}`, [characterId]);
    return rows;
};
const shapingDraft = async (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    if (Number(profile.unlocked_level) !== 29)
        throw new Error('自我定义会在 Lv.29 的成熟结前开启。');
    const traits = await selectableFinalTraits(connection, Number(character.id), true);
    const selectedIds = jsonNumberList(profile.final_traits_json).filter(id => traits.some(trait => Number(trait.id) === id));
    return { traits, selectedIds, required: Math.min(3, traits.length) };
});
const toggleShapingTrait = async (qqUserId, mutationId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    if (Number(profile.unlocked_level) !== 29)
        throw new Error('自我定义会在 Lv.29 的成熟结前开启。');
    const traits = await selectableFinalTraits(connection, Number(character.id), true);
    if (!traits.some(trait => Number(trait.id) === mutationId))
        throw new Error('只能定型已有的稳定或稀有观测。');
    const required = Math.min(3, traits.length);
    let selectedIds = jsonNumberList(profile.final_traits_json).filter(id => traits.some(trait => Number(trait.id) === id));
    if (selectedIds.includes(mutationId))
        selectedIds = selectedIds.filter(id => id !== mutationId);
    else {
        if (selectedIds.length >= required)
            throw new Error(`最多选择 ${required} 项定型特征。`);
        selectedIds.push(mutationId);
    }
    await connection.execute(`UPDATE player_evolution_profiles SET final_traits_json=?,updated_at=NOW() WHERE character_id=?`, [JSON.stringify(selectedIds), character.id]);
    return { traits, selectedIds, required };
});
const mutationDetail = async (qqUserId, mutationId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        throw new Error('研究室尚未向你开放。');
    return mutationFor(connection, Number(character.id), mutationId, true);
});
const evolutionPanel = async (qqUserId) => withTransaction(async (connection) => {
    const character = await characterFor(connection, qqUserId, true);
    const profile = await ensureEvolutionProfile(connection, character, true);
    if (!profile)
        return null;
    const [mutations] = await connection.execute('SELECT * FROM player_mutations WHERE character_id=? ORDER BY FIELD(body_part,\'eye\',\'nerve\',\'skin\',\'chest\',\'bone\',\'organ\'),id', [character.id]);
    const [history] = await connection.execute(`SELECT e.event_type,e.payload,e.created_at FROM player_events e
    JOIN characters c ON c.player_id=e.player_id WHERE c.id=? AND e.event_type LIKE 'evolution.%' ORDER BY e.id DESC LIMIT 12`, [character.id]);
    const materials = await Promise.all(['evolution_active_sample', 'evolution_stable_medium', 'evolution_catalyst'].map(async (code) => ({ code, quantity: Number((await itemQuantity(connection, Number(character.id), code))?.quantity ?? 0) })));
    const injections = await Promise.all(Object.keys(injectionItemCodes).map(async (code) => ({ code, quantity: Number((await itemQuantity(connection, Number(character.id), injectionItemCodes[code]))?.quantity ?? 0) })));
    return { character, profile, mutations, history, materials, injections, injectionNames, bodyPartNames, available: Object.keys(injectionRules).filter(code => injectionAvailable(code, Number(profile.unlocked_level))) };
});
const evolutionLabAvailable = async (qqUserId) => {
    const pool = await getPool();
    const character = await characterFor(pool, qqUserId);
    return Number(character.evolution_stage) >= 8 && Boolean(await ensureEvolutionProfile(pool, character));
};

export { acceptEvolutionObservation, activateEvolutionProfile, advanceEvolutionObservationBattle, advanceEvolutionObservationMining, applyEvolutionBaseStats, archiveMutation, bodyPartNames, claimEvolutionObservation, ensureEvolutionProfile, evolutionInjectionMaterials, evolutionItemName, evolutionLabAvailable, evolutionObservationDashboard, evolutionPanel, evolutionStatBonuses, injectEvolution, mutationDetail, repairEvolutionProgress, setMutationPaused, shapingDraft, stabilizeMutation, symbiosisTraitCodes, symbiosisTraitName, symbiosisTraits, toggleShapingTrait };
