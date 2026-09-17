import { advancedProfessionRoutes } from './advanced-profession-routes.config.js';
import { hiddenProfessions, hiddenSkills, hiddenPassiveCode } from './hidden-profession.config.js';

const trials = (code, name, description, skillCodes, stats) => ({ code: `mentor_trial_${code}`, name, description, skillCodes, stats });
const worldTreeAdvancedProfessions = [
    { code: 'bulwark_guard', name: '盾卫', baseProfession: '战士', mentor: { code: 'mentor_bulwark_gareth', name: '加雷斯', title: '守根骑士', x: -8, y: -7 }, role: '前排承伤 / 守护队友', passive: { code: 'passive_guard_instinct', name: '守势直觉', description: '受到的伤害降低 4%。', effect: { damageReductionPct: 4 } }, route: advancedProfessionRoutes.ridge_foothills, first: { title: '盾上的名字', story: `加雷斯把缺角旧盾交给你：去岩脊山麓挡住山甲虫的冲撞，替旧护送队清出停靠点。`, targetCodes: ['mountain_beetle'], targetText: '山甲虫', requiredKills: 3 }, second: { title: '补回缺口', story: `清理封住护送道的石脉傀儡，带回岩脊核心修补旧盾。守护要从站稳缺口开始。`, targetCodes: ['stonevein_golem'], targetText: '石脉傀儡', requiredKills: 5, materialCount: 4 }, trial: trials('bulwark_gareth', '守根骑士·加雷斯', '加雷斯会用最沉的盾击询问：你愿意为谁留下。', ['warrior_taunt', 'shield_counter', 'shield_bash_player'], [74, 38, 58, 24, 33, 28]) },
    { code: 'war_lord', name: '战旗使', baseProfession: '战士', mentor: { code: 'mentor_warlord_oren', name: '奥伦', title: '旗语教官', x: -6, y: -8 }, role: '近战增益 / 节奏组织', passive: { code: 'passive_formation_voice', name: '阵前号令', description: '造成的伤害提高 3%。', effect: { damageBonusPct: 3 } }, route: advancedProfessionRoutes.dark_forest_deep, first: { title: '没有旗的队伍', story: `奥伦让你深入幽暗密林深处，击败哥布林战鼓手，辨认敌阵如何通过鼓声聚散。`, targetCodes: ['goblin_drummer'], targetText: '哥布林战鼓手', requiredKills: 3 }, second: { title: '让风记住方向', story: `击退封锁林间道路的哥布林盾卫，带回哥布林耳作为清路凭证，让同伴能并肩前进。`, targetCodes: ['goblin_shieldbearer'], targetText: '哥布林盾卫', requiredKills: 5, materialCount: 3 }, trial: trials('warlord_oren', '旗语教官·奥伦', '奥伦不替你下令；他只看你能否在混战里让人听见。', ['war_cry', 'sweeping_slash', 'piercing_thrust'], [62, 31, 61, 20, 42, 36]) },
    { code: 'ironbreaker', name: '剑豪', baseProfession: '战士', mentor: { code: 'mentor_ironbreaker_noll', name: '诺尔', title: '钝锋剑士', x: -4, y: -8 }, role: '爆发近战 / 破防处决', passive: { code: 'passive_edge_focus', name: '锋芒专注', description: '暴击+5%。', effect: { critRatePct: 5 } }, route: advancedProfessionRoutes.ridge_foothills, first: { title: '钝锋的分寸', story: `诺尔让你去岩脊山麓观察峭壁羊怪的发力，在冲撞的间隙练习收锋。`, targetCodes: ['cliff_ram'], targetText: '峭壁羊怪', requiredKills: 3 }, second: { title: '一线开石', story: `劈开旧矿道上的碎岩兽，收集岩脊核心辨认受力回音。剑豪只出必要的一剑。`, targetCodes: ['rubble_beast'], targetText: '碎岩兽', requiredKills: 5, materialCount: 4 }, trial: trials('ironbreaker_noll', '钝锋剑士·诺尔', '诺尔会让你先看见空隙，再决定是否挥剑。', ['heavy_strike', 'armor_break', 'charge'], [60, 27, 69, 18, 45, 34]) },
    { code: 'elementalist', name: '元素使', baseProfession: '法师', mentor: { code: 'mentor_elementalist_sen', name: '森', title: '调律师', x: 6, y: 8 }, role: '远程四系输出 / 属性克制', passive: { code: 'passive_elemental_resonance', name: '元素共鸣', description: '魔法伤害提高 4%。', effect: { magicDamagePct: 4 } }, route: advancedProfessionRoutes.rediron_pass, first: { title: '温差中的答案', story: `森让你前往赤铁山道，平息赤铁矿灵的热流，辨认火元素与矿脉之间失衡的节拍。`, targetCodes: ['rediron_wisp'], targetText: '赤铁矿灵', requiredKills: 3 }, second: { title: '借来的回响', story: `驱离积热的炉心甲虫，收集炉心赤晶作为元素回声样本。把热流引回边界，而非制造新的灾害。`, targetCodes: ['furnace_beetle'], targetText: '炉心甲虫', requiredKills: 5, materialCount: 3 }, trial: trials('elementalist_sen', '调律师·森', '森会以火、冰、风、雷四种错乱节拍逼你做出正确取舍。', ['fireball', 'frost_bind', 'wind_blade', 'thunder_lance'], [43, 67, 22, 73, 39, 35]) },
    { code: 'spirit_summoner', name: '唤灵师', baseProfession: '法师', mentor: { code: 'mentor_summoner_mia', name: '米娅', title: '灵契引路人', x: 8, y: 6 }, role: '多灵协作 / 持续支援', passive: { code: 'passive_spirit_breath', name: '灵息', description: '每回合额外恢复 2% 魔力；灵位上限从 1 提升至 3。', effect: { mpRegenPct: 2, spiritLimitBonus: 2 } }, route: advancedProfessionRoutes.mistalgae_marsh, first: { title: '三席灵位', story: `米娅请你前往雾藻湿地，驱散水镜妖的虚假呼唤，让走散的灵息找到自己的回应。`, targetCodes: ['watermirror_siren'], targetText: '水镜妖', requiredKills: 3 }, second: { title: '让灵各归其位', story: `清理堵住旧巢的雾藻团，带回雾沼心保存微弱灵息。为守望、疗愈与追击各留一个位置。`, targetCodes: ['mistalgae_mass'], targetText: '雾藻团', requiredKills: 5, materialCount: 3 }, trial: trials('summoner_mia', '灵契引路人·米娅', '米娅会令攻、防、疗三道灵息同时回应，考验你能否听清每一种呼唤。', ['mia_ember_echo', 'mia_tide_chorus', 'mia_root_resonance'], [41, 71, 20, 76, 33, 30]) },
    { code: 'spellblade', name: '战斗法师', baseProfession: '法师', mentor: { code: 'mentor_spellblade_vane', name: '维恩', title: '近咒行者', x: 8, y: 8 }, role: '近中距离魔法输出 / 自保', passive: { code: 'passive_spellsteel', name: '咒钢护身', description: '魔法伤害提高 2%，受到的伤害降低 2%。', effect: { magicDamagePct: 2, damageReductionPct: 2 } }, route: advancedProfessionRoutes.rediron_pass, first: { title: '两步之间', story: `维恩要你走进赤铁山道，在磁石傀儡的牵制中练习贴近施咒，让脚步和咒文同时落定。`, targetCodes: ['magnet_golem'], targetText: '磁石傀儡', requiredKills: 3 }, second: { title: '把咒留在掌心', story: `迎击焦岩野猪的突进，带回炉心赤晶校准剑上的热流。近咒的分寸，是在冲击到来前完成一击。`, targetCodes: ['cinder_boar'], targetText: '焦岩野猪', requiredKills: 5, materialCount: 4 }, trial: trials('spellblade_vane', '近咒行者·维恩', '维恩会不断压近，考验你的咒语能否跟上脚步。', ['arcane_bolt', 'sweeping_slash', 'mist_step_slash'], [53, 52, 45, 56, 42, 42]) },
    { code: 'nightblade', name: '夜刃', baseProfession: '盗贼', mentor: { code: 'mentor_nightblade_loke', name: '洛克', title: '暮影斥候', x: -9, y: 4 }, role: '单体爆发 / 侦察切入', passive: { code: 'passive_night_focus', name: '夜行专注', description: '暴击+5%。', effect: { critRatePct: 5 } }, route: advancedProfessionRoutes.dark_forest_deep, first: { title: '没人看见的退路', story: `前往幽暗密林深处，清除哥布林网罗工兵，练习在暴露之前辨认埋伏。`, targetCodes: ['goblin_trapper'], targetText: '哥布林网罗工兵', requiredKills: 3 }, second: { title: '影子也要有重量', story: `绕过林间射线，击败哥布林弓箭手，并带回哥布林耳证明退路已清。夜刃的锋芒应结束危险。`, targetCodes: ['goblin_archer'], targetText: '哥布林弓箭手', requiredKills: 5, materialCount: 3 }, trial: trials('nightblade_loke', '暮影斥候', '洛克不会正面迎你；你要从他的消失里读懂先机。', ['backstab', 'mist_step_slash', 'smoke_screen'], [45, 30, 64, 21, 72, 57]) },
    { code: 'venomancer', name: '蚀毒师', baseProfession: '盗贼', mentor: { code: 'mentor_venomancer_ning', name: '宁', title: '药痕师', x: -9, y: 2 }, role: '持续削弱 / 单体压制', passive: { code: 'passive_corrosive_instinct', name: '蚀痕', description: '造成的伤害提高 3%。', effect: { damageBonusPct: 3 } }, route: advancedProfessionRoutes.mistalgae_marsh, first: { title: '草药不替人决定', story: `宁让你走进雾藻湿地，清除毒沼蜉蝣，辨别风里毒性的扩散方向。`, targetCodes: ['bog_midge'], targetText: '毒沼蜉蝣', requiredKills: 3 }, second: { title: '留下解法', story: `驱离药草水道中的沼泽鳄，收集雾沼心配制解毒药液。学会用毒，也必须留下解法。`, targetCodes: ['marsh_crocodile'], targetText: '沼泽鳄', requiredKills: 5, materialCount: 3 }, trial: trials('venomancer_ning', '药痕师·宁', '宁会让你在一击见效与留下余地之间作答。', ['toxic_edge', 'armor_break', 'backstab'], [44, 41, 56, 33, 66, 48]) },
    { code: 'trickster_ranger', name: '机关游侠', baseProfession: '盗贼', mentor: { code: 'mentor_trickster_vera', name: '维拉', title: '线机师', x: -8, y: 0 }, role: '远程牵制 / 控场引导', passive: { code: 'passive_hunter_measure', name: '猎手测距', description: '命中率提高 8%。', effect: { accuracyPct: 8 } }, route: advancedProfessionRoutes.rediron_pass, first: { title: '绳结与风向', story: `维拉让你去赤铁山道追查被剪断的索道，击退盗矿团弩手，判断每一道射线的落点。`, targetCodes: ['ore_raider'], targetText: '盗矿团弩手', requiredKills: 3 }, second: { title: '让路自己说话', story: `清除干扰索道机关的矿坑咒师，收集炉心赤晶稳定触发器。用预先安排的路线把危险引开。`, targetCodes: ['mine_hexer'], targetText: '矿坑咒师', requiredKills: 5, materialCount: 4 }, trial: trials('trickster_vera', '线机师·维拉', '维拉会不断改变站位，逼你用判断而非运气命中。', ['piercing_thrust', 'wind_blade', 'frost_bind'], [46, 38, 51, 35, 68, 60]) },
    { code: 'saint_healer', name: '圣愈者', baseProfession: '牧师', mentor: { code: 'mentor_saint_mare', name: '玛蕾', title: '白枝修女', x: 4, y: -8 }, role: '治疗续航 / 净化支援', passive: { code: 'passive_gentle_light', name: '柔光', description: '治疗效果提高 5%。', effect: { healingBonusPct: 5 } }, route: advancedProfessionRoutes.mistalgae_marsh, first: { title: '留给后来者的白枝', story: `玛蕾请你把白枝带到雾藻湿地的旧营地，清除芦苇行尸，为伤者留出归路。`, targetCodes: ['reed_walker'], targetText: '芦苇行尸', requiredKills: 3 }, second: { title: '把灯续到天亮', story: `熄灭诱人迷途的沼火鬼灯，带回雾沼心为营地续灯。治疗也意味着让等待的人看见天明。`, targetCodes: ['bogfire_wisp'], targetText: '沼火鬼灯', requiredKills: 5, materialCount: 3 }, trial: trials('saint_mare', '白枝修女·玛蕾', '玛蕾会让光照向最难兼顾的地方。', ['healing_light', 'purifying_light', 'healing_prayer'], [48, 72, 25, 75, 31, 29]) },
    { code: 'aegis_priest', name: '圣盾使', baseProfession: '牧师', mentor: { code: 'mentor_aegis_hector', name: '赫克托', title: '壁垒司祭', x: 6, y: -8 }, role: '护盾减伤 / 前排辅助', passive: { code: 'passive_aegis_vow', name: '壁垒誓言', description: '受到的伤害降低 3%。', effect: { damageReductionPct: 3 } }, route: advancedProfessionRoutes.ridge_foothills, first: { title: '修补过的祷词', story: `赫克托托你守住岩脊山麓的旧石阶，击退冲撞祷墙的石脉傀儡与峭壁羊怪。`, targetCodes: ['stonevein_golem', 'cliff_ram'], targetText: '石脉傀儡或峭壁羊怪', requiredKills: 3 }, second: { title: '立在缺口前', story: `清走祷墙缺口附近的山甲虫与碎岩兽，带回岩脊核心嵌入裂隙，为后来者撑起屏障。`, targetCodes: ['mountain_beetle', 'rubble_beast'], targetText: '山甲虫或碎岩兽', requiredKills: 5, materialCount: 4 }, trial: trials('aegis_hector', '壁垒司祭·赫克托', '赫克托会以连续重击询问：你的誓言能撑过第几下。', ['shield_counter', 'blessing_aegis', 'shield_bash_player'], [71, 55, 48, 53, 30, 25]) },
    { code: 'dawn_inquisitor', name: '晨星祷者', baseProfession: '牧师', mentor: { code: 'mentor_dawn_sola', name: '索拉', title: '晨星司祭', x: 8, y: -6 }, role: '光耀输出 / 团队祝福', passive: { code: 'passive_morning_psalm', name: '晨祷余辉', description: '光明技能伤害提高 6%。', effect: { lightSkillBonusPct: 6 } }, route: advancedProfessionRoutes.dark_forest_deep, first: { title: '晨钟余音', story: `索拉让你深入幽暗密林深处，击败哥布林祭司，驱散遮住旅人归路的阴影。`, targetCodes: ['goblin_priest'], targetText: '哥布林祭司', requiredKills: 3 }, second: { title: '让第一束光落下', story: `清除阻断晨光的哥布林法师，带回哥布林耳作为凭证。让第一束光落在需要方向的人身上。`, targetCodes: ['goblin_mage'], targetText: '哥布林法师', requiredKills: 5, materialCount: 3 }, trial: trials('dawn_sola', '晨星司祭·索拉', '索拉会以明灭不定的光考验你的信念与节奏。', ['sanctified_bolt', 'purifying_light', 'mana_benediction'], [47, 70, 27, 78, 34, 32]) }
];
const advancedPassiveBalance = {
    bulwark_guard: { name: '根壁体魄', description: '最大生命提高 18%，物理防御提高 15%，魔法防御提高 12%；战斗中控制抗性修正 +15%。', effect: { hpPct: 18, physicalDefensePct: 15, magicDefensePct: 12, controlResistancePct: 15 } },
    war_lord: { name: '列阵威仪', description: '物理攻击提高 12%，命中属性提高 10%，速度提高 8%。', effect: { physicalAttackPct: 12, accuracyPct: 10, speedPct: 8 } },
    ironbreaker: { description: '暴击率修正 +33%，暴击伤害属性提高 12%。', effect: { critRateCorrectionPct: 33, critDamagePct: 12 } },
    elementalist: { name: '四相感应', description: '火、冰、风、雷四元素精通各提高 50。', effect: { fireMastery: 50, iceMastery: 50, windMastery: 50, thunderMastery: 50 } },
    spirit_summoner: { description: '最大魔力提高 18%，每回合额外恢复 4% 最大魔力；灵位上限从 1 提升至 3，召唤物最大生命提高 20%。', effect: { mpPct: 18, mpRegenPct: 4, spiritLimitBonus: 2, spiritHpPct: 20 } },
    spellblade: { description: '魔法攻击提高 14%，物理防御与魔法防御各提高 10%。', effect: { magicAttackPct: 14, physicalDefensePct: 10, magicDefensePct: 10 } },
    nightblade: { name: '暮影本能', description: '暴击率修正 +18%，暴击伤害属性提高 28%，速度提高 10%。', effect: { critRateCorrectionPct: 18, critDamagePct: 28, speedPct: 10 } },
    venomancer: { description: '破韧命中修正 +20%；自身施加的剧毒与毒血引爆伤害提高 25%。', effect: { statusHitCorrectionPct: 20, venomDamagePct: 25 } },
    trickster_ranger: { description: '命中属性与速度各提高 10%；命中率修正 +15%。', effect: { accuracyPct: 10, speedPct: 10, hitCorrectionPct: 15 } },
    saint_healer: { description: '最大魔力提高 15%，直接治疗效果提高 12%；自身施加的再生每回合恢复量额外 +2% 最大生命。', effect: { mpPct: 15, healingBonusPct: 12, regenerationBonusPct: 2 } },
    aegis_priest: { description: '最大生命提高 15%，物理防御与魔法防御各提高 10%，受到的伤害降低 4%。', effect: { hpPct: 15, physicalDefensePct: 10, magicDefensePct: 10, damageReductionPct: 4 } },
    dawn_inquisitor: { description: '魔法攻击提高 12%，光明技能伤害提高 15%。', effect: { magicAttackPct: 12, lightSkillBonusPct: 15 } }
};
for (const profession of worldTreeAdvancedProfessions) {
    const balance = advancedPassiveBalance[profession.code];
    if (balance)
        profession.passive = { ...profession.passive, ...balance };
}
const mentorIdentities = {
    mentor_bulwark_gareth: { name: '石垒', title: '根壁骑士' },
    mentor_warlord_oren: { name: '旌岚', title: '战旗领唱' },
    mentor_ironbreaker_noll: { name: '铮然', title: '问锋剑师' },
    mentor_elementalist_sen: { name: '澜烬', title: '四相调律师' },
    mentor_summoner_mia: { name: '栖羽', title: '灵契引路人' },
    mentor_spellblade_vane: { name: '砺烬', title: '咒锋行者' },
    mentor_nightblade_loke: { name: '影渡', title: '影径斥候' },
    mentor_venomancer_ning: { name: '青蘅', title: '百草毒师' },
    mentor_trickster_vera: { name: '弦枢', title: '机关巡游者' },
    mentor_saint_mare: { name: '白芷', title: '白枝愈师' },
    mentor_aegis_hector: { name: '砺誓', title: '誓壁司祭' },
    mentor_dawn_sola: { name: '曦歌', title: '晨星祷官' }
};
const mentorNameReplacements = new Map(worldTreeAdvancedProfessions.map(profession => [profession.mentor.name, mentorIdentities[profession.mentor.code]?.name ?? profession.mentor.name]));
const renameAdvancedMentorText = (text) => [...mentorNameReplacements.entries()].reduce((result, [previous, current]) => result.replaceAll(previous, current), text);
for (const profession of worldTreeAdvancedProfessions) {
    const identity = mentorIdentities[profession.mentor.code];
    if (!identity)
        continue;
    profession.first.story = renameAdvancedMentorText(profession.first.story);
    profession.second.story = renameAdvancedMentorText(profession.second.story);
    profession.trial.description = renameAdvancedMentorText(profession.trial.description);
    profession.mentor.name = identity.name;
    profession.mentor.title = identity.title;
    profession.trial.name = `${identity.title}·${identity.name}`;
}
const advancedProfessionByCode = (code) => worldTreeAdvancedProfessions.find(entry => entry.code === code);
const advancedProfessionByMentor = (code) => worldTreeAdvancedProfessions.find(entry => entry.mentor.code === code);
const hiddenPassiveBalances = {
    magical_scholar: {
        description: '最大魔力提高 25%，魔法攻击提高 12%；破韧命中修正 +12%。',
        effect: { mpPct: 25, magicAttackPct: 12, statusHitCorrectionPct: 12 }
    },
    weapon_master: {
        description: '物理攻击与魔法攻击各提高 12%；抗暴率修正 +10%。',
        effect: { physicalAttackPct: 12, magicAttackPct: 12, critAvoidanceCorrectionPct: 10 }
    },
    inventor: {
        description: '最大魔力提高 20%，物理攻击与魔法攻击各提高 10%；命中率修正 +10%。',
        effect: { mpPct: 20, physicalAttackPct: 10, magicAttackPct: 10, hitCorrectionPct: 10 }
    },
    tactician: {
        description: '最大魔力提高 15%，物理攻击与魔法攻击各提高 8%，速度提高 12%；控制抗性修正 +15%。',
        effect: { mpPct: 15, physicalAttackPct: 8, magicAttackPct: 8, speedPct: 12, controlResistancePct: 15 }
    }
};
const registeredAdvancedProfessionByCode = (code) => advancedProfessionByCode(code) ?? (() => {
    const profession = hiddenProfessions.find(entry => entry.code === code);
    const balance = hiddenPassiveBalances[code];
    return profession ? { code: profession.code, name: profession.name, role: profession.role,
        mentor: { code: profession.npc, name: profession.mentor },
        passive: { code: hiddenPassiveCode(profession.code), name: profession.passive, description: balance?.description ?? profession.role, effect: balance?.effect ?? { hiddenProfession: 1 } } } : undefined;
})();
const cachedAdvancedPassiveKeys = new Set([
    'hpPct', 'mpPct', 'physicalAttackPct', 'magicAttackPct', 'physicalDefensePct', 'magicDefensePct',
    'accuracyPct', 'evasionPct', 'speedPct', 'critRatePct', 'critDamagePct', 'critResistPct',
    'critDamageReductionPct', 'tenacityPct', 'tenacityPiercePct'
]);
const isCachedAdvancedPassiveKey = (key) => cachedAdvancedPassiveKeys.has(key);
const cachedAdvancedPassiveEffectFor = (professionCode) => {
    const effect = registeredAdvancedProfessionByCode(String(professionCode ?? ''))?.passive.effect ?? {};
    return Object.fromEntries(Object.entries(effect).filter(([key]) => isCachedAdvancedPassiveKey(key)));
};
const advancedElementMasteryBonusFor = (professionCode) => {
    const effect = registeredAdvancedProfessionByCode(String(professionCode ?? ''))?.passive.effect ?? {};
    return {
        火: Number(effect.fireMastery ?? 0),
        冰: Number(effect.iceMastery ?? 0),
        风: Number(effect.windMastery ?? 0),
        雷: Number(effect.thunderMastery ?? 0)
    };
};
const hasBattleOnlyAdvancedPassiveEffect = (professionCode) => {
    const effect = registeredAdvancedProfessionByCode(String(professionCode ?? ''))?.passive.effect ?? {};
    return Object.keys(effect).some(key => !isCachedAdvancedPassiveKey(key));
};
const advancedProfessionActiveSkillCodes = {
    bulwark_guard: ['bulwark_shieldwall_advance', 'bulwark_vicarious_guard', 'bulwark_immovable_mountain', 'bulwark_bastion_judgment'],
    war_lord: ['warlord_quake_command', 'warlord_break_formation', 'warlord_triumph_banner', 'warlord_hundred_battle_sweep'],
    ironbreaker: ['ironbreaker_armor_rend', 'ironbreaker_breaking_pursuit', 'ironbreaker_gap_execution', 'ironbreaker_steel_flash'],
    elementalist: ['elementalist_cinderfrost_cycle', 'elementalist_storm_chain', 'elementalist_fourfold_resonance', 'elementalist_sky_sequence'],
    spirit_summoner: ['summoner_contract_spirit', 'summoner_spirit_tether', 'summoner_returning_veil', 'summoner_star_pact'],
    spellblade: ['spellblade_arcane_thrust', 'spellblade_phase_guard', 'spellblade_spellbreak_whirl', 'spellblade_starfire_duel'],
    nightblade: ['nightblade_shadow_mark', 'nightblade_gap_stab', 'nightblade_crescent_throat', 'nightblade_silent_finale'],
    venomancer: ['venomancer_serpent_kiss', 'venomancer_corrosion_mist', 'venomancer_venom_burst', 'venomancer_thousand_throat'],
    trickster_ranger: ['ranger_grapple_trap', 'ranger_weakness_survey', 'ranger_guiding_smoke', 'ranger_hundred_hunt'],
    saint_healer: ['saint_healer_mending_prayer', 'saint_healer_absolution_hand', 'saint_healer_resonant_mass', 'saint_healer_revival_sanctuary'],
    aegis_priest: ['aegis_watch_bastion', 'aegis_shared_vow', 'aegis_luminous_echo', 'aegis_undying_dome'],
    dawn_inquisitor: ['dawn_morning_mark', 'dawn_exorcism_word', 'dawn_judgment_litany', 'dawn_daybreak_decree']
};
for (const profession of hiddenProfessions)
    advancedProfessionActiveSkillCodes[profession.code] = hiddenSkills.filter(skill => skill.profession === profession.code).map(skill => skill.code);
const activeSkillCodesForAdvancedProfession = (professionCode) => advancedProfessionActiveSkillCodes[professionCode] ?? [];
const advancedProfessionPassiveCodes = new Set([...worldTreeAdvancedProfessions.map(profession => profession.passive.code), ...hiddenProfessions.map(profession => hiddenPassiveCode(profession.code))]);
const advancedInheritanceSkillCode = (professionCode) => `inheritance_${professionCode}`;
const advancedProfessionInheritanceCodes = new Set([...worldTreeAdvancedProfessions, ...hiddenProfessions].map(profession => advancedInheritanceSkillCode(profession.code)));
const isAdvancedProfessionSkillCode = (code) => advancedProfessionPassiveCodes.has(code)
    || advancedProfessionInheritanceCodes.has(code)
    || Object.values(advancedProfessionActiveSkillCodes).some(codes => codes.includes(code))
    || ['spirit_call_ember', 'spirit_call_tide', 'spirit_call_bark', 'spirit_call_gale', 'spirit_call_moon'].includes(code);
const isCachedAdvancedPassiveEffect = (skillCode, effectKey) => advancedProfessionPassiveCodes.has(skillCode) && isCachedAdvancedPassiveKey(effectKey);
const inheritancePassiveDefinitions = {
    bulwark_guard: { professionCode: 'bulwark_guard', name: '不退护阵', ownDescription: '自身带有嘲讽、守护、减伤壁垒或生命护盾并结束行动时，为生命比例最低的其他队友施加护阵1回合。其首次受到技能直击时，25%伤害转移给盾卫，转移量不超过目标最大生命12%，其余未转移伤害再降低12%；每回合一次。', studyDescription: '满足相同前置时，生命比例最低的队友首次受到技能直击伤害降低8%；无伤害转移。', own: [25, 12], study: [8] },
    war_lord: { professionCode: 'war_lord', name: '战阵接令', ownDescription: '成功施加新减益后对目标施加军令2回合。第一名不同队友的技能直击最终伤害+12%、命中率修正+12%，并留下应旗；战旗使下一次直击同一目标时忽略对应防御12%、获得20战意并消耗应旗。每回合最多指定一个目标。', studyDescription: '成功施加新减益后施加简化军令；下一名不同队友技能直击最终伤害+8%、命中率修正+8%后消耗。', own: [12, 12, 12, 20], study: [8, 8] },
    ironbreaker: { professionCode: 'ironbreaker', name: '临界识破', ownDescription: '每个目标每回合首次被自身单体技能命中时，若目标带破甲、易伤或追猎，本次暴击率修正+12%并施加裂口2回合；下一名不同队友的单体技能直击暴击率修正+15%、忽略对应防御12%后消耗裂口。', studyDescription: '满足前置时施加裂口；下一名不同队友的单体技能直击暴击率修正+8%后消耗。', own: [12, 15, 12], study: [8] },
    elementalist: { professionCode: 'elementalist', name: '异相共鸣', ownDescription: '成功施加一种此前不存在的冰、火、风、雷印记或对应元素减益时施加导相2回合；下一次不同元素技能直击最终伤害+12%，施法者恢复4%最大MP；若为元素使本人再获得20奥术。', studyDescription: '施加简化导相；下一次不同元素技能直击最终伤害+8%，施法者恢复2%最大MP后消耗。', own: [12, 4, 20], study: [8, 2] },
    spirit_summoner: { professionCode: 'spirit_summoner', name: '灵契余荫', ownDescription: '每回合首次有队友在生命低于60%时获得直接治疗、生命护盾或减伤壁垒，将其标记为灵荫；场上有存活灵时，回合结束该队友恢复3%最大生命，生命最低的灵恢复12%最大生命，唤灵师获得15灵契。', studyDescription: '每回合首次有生命低于50%的队友获得治疗、护盾或壁垒时，为其施加6%最大生命的生命护盾1回合。', own: [3, 12, 15], study: [6] },
    spellblade: { professionCode: 'spellblade', name: '攻势换挡', ownDescription: '技能直击造成伤害后，下一次有效治疗、生命护盾、减伤壁垒或友方增益强度+20%；支援生效后，下一次技能直击最终伤害+12%、忽略对应防御10%。每回合最多完成一轮。', studyDescription: '每回合首次完成伤害到支援时，支援效果+12%；随后下一次技能直击最终伤害+8%，无防御穿透。', own: [20, 12, 10], study: [12, 8] },
    nightblade: { professionCode: 'nightblade', name: '低光狩猎', ownDescription: '每目标每回合首次技能直击生命不高于45%或带自身追猎的目标时，最终直击伤害+16%，并进入退影：下次自身回合前首次受到技能直击伤害-20%；击杀时额外清除自身一个普通减益。', studyDescription: '每目标每回合首次符合低血条件时，最终直击伤害+8%，并获得一次10%退影减伤；无追猎扩展和击杀净化。', own: [16, 20], study: [8, 10] },
    venomancer: { professionCode: 'venomancer', name: '渗毒判断', ownDescription: '自身剧毒存在后，同回合由任意队友成功施加另一种新减益时获得蚀媒；下一次不同角色技能直击立刻结算一层剧毒下回合伤害的35%，普通敌人不超过最大生命1.2%，Boss不超过0.45%。', studyDescription: '对带持续伤害的目标成功施加另一种新减益时，下一次不同队友技能直击最终伤害+6%。', own: [35, 1.2, .45], study: [6] },
    trickster_ranger: { professionCode: 'trickster_ranger', name: '猎线回响', ownDescription: '其他队友先以技能直击命中目标后，机关游侠再命中可施加猎线2回合；另外两名不同队友命中后收线，驱散一个闪避、加速或命中增益，无可驱散增益则减速20%一回合，并获得20机巧。', studyDescription: '满足两名不同队友命中条件后，施加12%减速1回合；无驱散与机巧返还。', own: [20, 20], study: [12] },
    saint_healer: { professionCode: 'saint_healer', name: '余辉援护', ownDescription: '每回合首次直接治疗生命低于50%的目标时，附加10%最大生命的生命护盾2回合；若治疗使其跨过50%生命，将实际恢复量35%转化为对生命最低的另一名队友的额外治疗。', studyDescription: '每回合首次直接治疗生命低于40%的目标时，附加6%最大生命的生命护盾1回合；无余辉转注。', own: [10, 35], study: [6] },
    aegis_priest: { professionCode: 'aegis_priest', name: '守壁余响', ownDescription: '每名队友每回合首次由圣盾使施加的生命护盾或减伤壁垒抵消、减少技能直击时，获得30%控制抗性至下次回合结束，并恢复吸收或减免伤害的25%，最多6%最大生命。', studyDescription: '每名队友每回合首次由自身护盾或壁垒生效时，获得18%控制抗性，并恢复吸收或减免伤害的10%，最多3%最大生命。', own: [30, 25, 6], study: [18, 10, 3] },
    dawn_inquisitor: { professionCode: 'dawn_inquisitor', name: '晨钟裁意', ownDescription: '成功施加易伤或实际驱散敌方增益时施加晨钟判词2回合；最多两种不同伤害类别的队友技能直击各获得最终伤害+12%并延长易伤1回合，第二种触发后获得25信念并消耗。', studyDescription: '成功施加易伤或驱散增益后，下一名不同队友的技能直击最终伤害+8%并消耗；无易伤延长和信念返还。', own: [12, 25], study: [8] }
};
const hiddenInheritanceText = {
    magical_scholar: '每回合首次以反应中和移除自己造成的事故时，获得8%最大生命护盾2回合、恢复30 MP并获得复盘；下一次不同主粒子的有效调配令首个非控制正面效果延长1回合，大成功额外恢复10实验值。',
    weapon_master: '每2回合一次，三器合锋以至少两种不同器类全部命中时恢复15器鸣并获得归鞘；下一次不同器类命中时附带所记录普通器性的60%效果。',
    inventor: '每2回合一次，双机协同的两台异械均实际生效后，为能量较低者恢复20能量、两台原生冷却各减1，并令下一次单机行动使另一台进入待机：下次能源消耗降低25%。',
    tactician: '每2回合一次，条件预案实际触发后获得余策：守势净化普通减益，接应延长护盾，截断成功附加20%减速；下一次预案筹策消耗降低25%。'
};
const hiddenInheritanceValues = {
    magical_scholar: [8, 30, 10],
    weapon_master: [15, 60],
    inventor: [20, 1, 25],
    tactician: [25, 20]
};
for (const profession of hiddenProfessions)
    inheritancePassiveDefinitions[profession.code] = { professionCode: profession.code, name: profession.inheritance, ownDescription: hiddenInheritanceText[profession.code], studyDescription: '此传承只随本职生效。', own: hiddenInheritanceValues[profession.code], study: [] };
const inheritancePassiveFor = (professionCode) => inheritancePassiveDefinitions[professionCode];
const advancedBoundSkillDefinitions = [...worldTreeAdvancedProfessions, ...hiddenProfessions].flatMap(entry => {
    const profession = registeredAdvancedProfessionByCode(entry.code);
    const inheritance = inheritancePassiveFor(entry.code);
    return [
        { professionCode: entry.code, code: profession.passive.code, name: profession.passive.name, kind: '固有', description: profession.passive.description, effect: profession.passive.effect },
        { professionCode: entry.code, code: advancedInheritanceSkillCode(entry.code), name: inheritance.name, kind: '传承', description: inheritance.ownDescription, effect: {} }
    ];
});

export { activeSkillCodesForAdvancedProfession, advancedBoundSkillDefinitions, advancedElementMasteryBonusFor, advancedInheritanceSkillCode, advancedProfessionActiveSkillCodes, advancedProfessionByCode, advancedProfessionByMentor, advancedProfessionInheritanceCodes, advancedProfessionPassiveCodes, cachedAdvancedPassiveEffectFor, hasBattleOnlyAdvancedPassiveEffect, inheritancePassiveDefinitions, inheritancePassiveFor, isAdvancedProfessionSkillCode, isCachedAdvancedPassiveEffect, isCachedAdvancedPassiveKey, registeredAdvancedProfessionByCode, renameAdvancedMentorText, worldTreeAdvancedProfessions };
