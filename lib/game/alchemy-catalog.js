const output = (definition) => definition;
const baseOutputs = [
    output({ code: 'alchemy_base_life_draught', name: '微愈液', description: '立即恢复最大生命的 8%。', level: 1, tier: '基础', category: '药剂', tags: ['生机', '潮汐'], effect: { healPct: 8 } }),
    output({ code: 'alchemy_base_mana_draught', name: '澄蓝露', description: '立即恢复最大魔力的 8%。', level: 1, tier: '基础', category: '药剂', tags: ['灵能', '潮汐'], effect: { restoreMpPct: 8 } }),
    output({ code: 'alchemy_base_harmony_draught', name: '调和露', description: '立即恢复最大生命与魔力的 6%。', level: 1, tier: '基础', category: '药剂', tags: ['生机', '灵能', '潮汐'], effect: { healPct: 6, restoreMpPct: 6 } }),
    output({ code: 'alchemy_base_regrowth_salve', name: '回春药膏', description: '进入再生状态，每回合恢复 3% 最大生命，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['生机', '凝胶'], effect: { status: { code: 'regeneration', value: 3, turns: 2 } } }),
    output({ code: 'alchemy_base_mana_flow', name: '回流滴剂', description: '进入回流状态，每回合恢复 3% 最大魔力，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['灵能', '潮汐'], effect: { status: { code: 'mana_regeneration', value: 3, turns: 2 } } }),
    output({ code: 'alchemy_base_ward_tonic', name: '护体酊', description: '获得 8% 伤害减免，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['韧护', '潮汐'], effect: { status: { code: 'barrier', value: 8, turns: 2 } } }),
    output({ code: 'alchemy_base_sharpening', name: '锐化剂', description: '双攻提高 8%，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['锋锐', '炎性'], effect: { status: { code: 'battle_cry', value: 8, turns: 2 } } }),
    output({ code: 'alchemy_base_guard_tonic', name: '坚壳剂', description: '双防提高 8%，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['韧护', '潮汐'], effect: { status: { code: 'alchemy_guard', value: 8, turns: 2 } } }),
    output({ code: 'alchemy_base_swift_tonic', name: '迅行剂', description: '速度提高 10%，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['迅捷', '霜寒'], effect: { status: { code: 'sprint', value: 10, turns: 2 } } }),
    output({ code: 'alchemy_base_focus_tonic', name: '明眸剂', description: '命中提高 12%，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['迅捷', '光辉'], effect: { status: { code: 'precision', value: 12, turns: 2 } } }),
    output({ code: 'alchemy_base_evasion_tonic', name: '轻灵剂', description: '闪避提高 12%，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['迅捷', '暗蚀'], effect: { status: { code: 'alchemy_evasion', value: 12, turns: 2 } } }),
    output({ code: 'alchemy_base_crit_tonic', name: '静心剂', description: '暴击提高 10%，持续 2 回合。', level: 1, tier: '基础', category: '药剂', tags: ['灵能', '锋锐'], effect: { status: { code: 'critical_focus', value: 10, turns: 2 } } }),
    output({ code: 'alchemy_base_cleanse', name: '清浊剂', description: '清除自身可净化的异常状态。', level: 1, tier: '基础', category: '药剂', tags: ['潮汐', '光辉'], effect: { cleanse: true } }),
    output({ code: 'alchemy_base_fire_flask', name: '燃火瓶', description: '适用等级：Lv.10及以下。对当前目标造成火属性投掷伤害，并施加灼烧 2 回合。', level: 1, tier: '基础', category: '投掷物', tags: ['炎性', '凝胶'], effect: { target: 'enemy', throwable: { damageScale: .55, element: '火' }, status: { code: 'burn', value: 3, turns: 2, applicableLevel: 10 } } }),
    output({ code: 'alchemy_base_frost_flask', name: '霜缚瓶', description: '适用等级：Lv.10及以下。对当前目标造成冰属性投掷伤害，并施加束缚 2 回合。', level: 1, tier: '基础', category: '投掷物', tags: ['霜寒', '潮汐'], effect: { target: 'enemy', throwable: { damageScale: .45, element: '冰' }, status: { code: 'bind', value: 16, turns: 2, applicableLevel: 10 } } }),
    output({ code: 'alchemy_base_acid_flask', name: '腐蚀瓶', description: '适用等级：Lv.10及以下。对当前目标造成水属性投掷伤害，使其受到直击伤害提高 16%，持续 2 回合。', level: 1, tier: '基础', category: '投掷物', tags: ['凝胶', '潮汐'], effect: { target: 'enemy', throwable: { damageScale: .45, element: '水' }, status: { code: 'exposed', value: 16, turns: 2, applicableLevel: 10 } } }),
    output({ code: 'alchemy_base_shock_flask', name: '震荡瓶', description: '适用等级：Lv.10及以下。对当前目标造成雷属性投掷伤害，并使其必定眩晕 1 回合。', level: 1, tier: '基础', category: '投掷物', tags: ['雷鸣', '凝胶'], effect: { target: 'enemy', throwable: { damageScale: .5, element: '雷' }, status: { code: 'stun', value: 1, turns: 1, chance: 100, applicableLevel: 10 } } }),
    output({ code: 'alchemy_base_daze_mist', name: '迷乱雾剂', description: '适用等级：Lv.10及以下。使当前目标命中、闪避降低 18%，持续 2 回合。', level: 1, tier: '基础', category: '投掷物', tags: ['暗蚀', '凝胶'], effect: { target: 'enemy', status: { code: 'imbalance', value: 18, turns: 2, applicableLevel: 10 } } }),
    output({ code: 'alchemy_base_confusion_mist', name: '混乱雾剂', description: '适用等级：Lv.10及以下。使当前目标进入混乱状态，持续 1 回合。', level: 1, tier: '基础', category: '投掷物', tags: ['暗蚀', '雷鸣'], effect: { target: 'enemy', status: { code: 'alchemy_confusion', value: 1, turns: 1, chance: 100, applicableLevel: 10 } } }),
    output({ code: 'alchemy_base_study_elixir', name: '阅历秘药', description: '接下来 5 场战斗经验获取提高 10%。', level: 1, tier: '基础', category: '秘药', tags: ['灵能', '光辉'], effect: { experienceBonusPct: 10, battleCount: 5 } }),
    output({ code: 'alchemy_base_gather_elixir', name: '寻获秘药', description: '接下来 5 场战斗怪物材料掉率提高 10%。', level: 1, tier: '基础', category: '秘药', tags: ['暗蚀', '迅捷'], effect: { partyDropBonusPct: 10, battleCount: 5 } }),
    output({ code: 'alchemy_base_ward_charm', name: '护佑符', description: '获得 12% 伤害减免，持续 1 回合。', level: 1, tier: '基础', category: '符咒', tags: ['光辉', '韧护'], effect: { status: { code: 'barrier', value: 12, turns: 1 }, perBattleLimit: 1 } }),
    output({ code: 'alchemy_base_thunder_charm', name: '微雷符', description: '适用等级：Lv.15及以下。对当前目标造成雷属性投掷伤害，并使其必定眩晕 1 回合。', level: 1, tier: '基础', category: '符咒', tags: ['雷鸣', '光辉'], effect: { target: 'enemy', throwable: { damageScale: .7, element: '雷' }, status: { code: 'stun', value: 1, turns: 1, chance: 100, applicableLevel: 15 } } }),
    output({ code: 'alchemy_base_life_charm', name: '续命符', description: '立即恢复最大生命的 12%。', level: 1, tier: '基础', category: '符咒', tags: ['生机', '光辉'], effect: { healPct: 12, perBattleLimit: 1 } })
];
const controlApplicableLevel = (step) => Math.min(100, step * 10 + 5);
const thunderControlChance = (step) => Math.min(80, 40 + step * 5);
const thunderControl = (step) => step === 1
    ? { code: 'stun', value: 1, turns: 1, chance: 100, applicableLevel: controlApplicableLevel(step) }
    : { code: 'stun', value: 1, turns: step >= 4 ? 2 : 1, chance: thunderControlChance(step), applicableLevel: controlApplicableLevel(step) };
const thunderDescription = (step) => step === 1
    ? `适用等级：Lv.${controlApplicableLevel(step)}及以下。对当前目标降下雷属性直击，并使其必定眩晕 1 回合。`
    : `适用等级：Lv.${controlApplicableLevel(step)}及以下。雷光掠过全体敌人，有 ${thunderControlChance(step)}% 概率使其眩晕 ${step >= 4 ? 2 : 1} 回合。`;
const tierStyles = [
    { code: 'life', name: '复苏药', tags: ['生机', '潮汐'], category: '药剂', effect: step => ({ healPct: Math.min(55, 6 + step * 5) }), description: step => `立即恢复最大生命的 ${Math.min(55, 6 + step * 5)}%。` },
    { code: 'mana', name: '回响魔露', tags: ['灵能', '潮汐'], category: '药剂', effect: step => ({ restoreMpPct: Math.min(55, 6 + step * 5) }), description: step => `立即恢复最大魔力的 ${Math.min(55, 6 + step * 5)}%。` },
    { code: 'harmony', name: '调和秘露', tags: ['生机', '灵能', '潮汐'], category: '药剂', effect: step => ({ healPct: Math.min(25, 5 + step * 2), restoreMpPct: Math.min(25, 5 + step * 2) }), description: step => `立即恢复最大生命与魔力的 ${Math.min(25, 5 + step * 2)}%。` },
    { code: 'regrowth', name: '丰生膏', tags: ['生机', '凝胶'], category: '药剂', effect: step => ({ status: { code: 'regeneration', value: Math.min(9, 2 + Math.ceil(step * .7)), turns: step >= 6 ? 3 : 2 } }), description: step => `每回合恢复最大生命，持续 ${step >= 6 ? 3 : 2} 回合。` },
    { code: 'manaflow', name: '灵泉滴剂', tags: ['灵能', '潮汐'], category: '药剂', effect: step => ({ status: { code: 'mana_regeneration', value: Math.min(9, 2 + Math.ceil(step * .7)), turns: step >= 6 ? 3 : 2 } }), description: step => `每回合恢复最大魔力，持续 ${step >= 6 ? 3 : 2} 回合。` },
    { code: 'ward', name: '守护药剂', tags: ['韧护', '光辉'], category: '药剂', effect: step => ({ status: { code: 'barrier', value: Math.min(28, 8 + step * 2), turns: 2 } }), description: step => `获得 ${Math.min(28, 8 + step * 2)}% 伤害减免，持续 2 回合。` },
    { code: 'fury', name: '战意剂', tags: ['锋锐', '炎性'], category: '药剂', effect: step => ({ status: { code: 'battle_cry', value: Math.min(18, 7 + step), turns: 2 } }), description: step => `双攻提高 ${Math.min(18, 7 + step)}%，持续 2 回合。` },
    { code: 'swift', name: '风行剂', tags: ['迅捷', '霜寒'], category: '药剂', effect: step => ({ status: { code: 'sprint', value: Math.min(30, 10 + step * 2), turns: 2 } }), description: step => `速度提高 ${Math.min(30, 10 + step * 2)}%，持续 2 回合。` },
    { code: 'clarity', name: '清浊圣剂', tags: ['潮汐', '光辉'], category: '药剂', effect: step => ({ cleanse: true, status: step >= 5 ? { code: 'barrier', value: Math.min(20, 8 + step), turns: 1 } : undefined }), description: step => step >= 5 ? '清除自身可净化异常，并短暂获得减伤。' : '清除自身可净化异常状态。' },
    { code: 'fire', name: '爆炎瓶', tags: ['炎性', '凝胶'], category: '投掷物', effect: step => ({ target: 'enemy', throwable: { damageScale: .5 + step * .05, element: '火' }, status: { code: 'burn', value: Math.min(9, 3 + Math.floor(step / 2)), turns: 3, applicableLevel: controlApplicableLevel(step) } }), description: step => `适用等级：Lv.${controlApplicableLevel(step)}及以下。对当前目标造成火属性投掷伤害，并施加灼烧 3 回合。` },
    { code: 'frost', name: '冰缚瓶', tags: ['霜寒', '潮汐'], category: '投掷物', effect: step => ({ target: 'enemy', throwable: { damageScale: .42 + step * .04, element: '冰' }, status: { code: 'bind', value: Math.min(45, 14 + step * 4), turns: 2, applicableLevel: controlApplicableLevel(step) } }), description: step => `适用等级：Lv.${controlApplicableLevel(step)}及以下。对当前目标造成冰属性投掷伤害，并施加束缚 2 回合。` },
    { code: 'thunder', name: '天罚符', tags: ['雷鸣', '光辉'], category: '符咒', effect: step => ({ target: 'enemy', targetScope: step === 1 ? 'single' : 'all', throwable: { damageScale: .65 + step * .06, element: '雷' }, status: thunderControl(step) }), description: thunderDescription }
];
const tierForLevel = (level) => level <= 10 ? '基础' : level <= 25 ? '下位' : level <= 45 ? '中位' : level <= 70 ? '上位' : '超位';
const tierOutputs = Array.from({ length: 10 }, (_, index) => {
    const level = (index + 1) * 10;
    const step = index + 1;
    return tierStyles.map(style => output({
        code: `alchemy_${style.code}_l${level}`,
        name: `${style.name}·Lv.${level}`,
        description: style.description(step),
        level,
        tier: tierForLevel(level),
        category: style.category,
        tags: style.tags,
        effect: style.effect(step)
    }));
});
const alchemyOutputDefinitions = [...baseOutputs, ...tierOutputs.flat()];
const alchemyOutputsAtOrBelow = (level) => alchemyOutputDefinitions.filter(output => output.level <= level);
const alchemyStatusDefinitions = [
    { code: 'alchemy_guard', name: '坚守', effectType: 'stat_modifier', value: 8, duration: 2, description: '双防提高，效果值为百分比。' },
    { code: 'alchemy_evasion', name: '轻灵', effectType: 'stat_modifier', value: 12, duration: 2, description: '闪避提高，效果值为百分比。' },
    { code: 'alchemy_confusion', name: '混乱', effectType: 'stat_modifier', value: 1, duration: 1, description: '行动目标随机化。' }
];

export { alchemyOutputDefinitions, alchemyOutputsAtOrBelow, alchemyStatusDefinitions };
