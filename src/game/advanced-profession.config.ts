import { advancedProfessionRoutes, type AdvancedProfessionRoute } from './advanced-profession-routes.config';
import { hiddenProfessions, hiddenSkills, hiddenPassiveCode } from './hidden-profession.config';

export type AdvancedProfession = {
  code: string;
  name: string;
  baseProfession: '战士' | '法师' | '盗贼' | '牧师';
  mentor: { code: string; name: string; title: string; x: number; y: number };
  role: string;
  passive: { code: string; name: string; description: string; effect: Record<string, number> };
  route: AdvancedProfessionRoute;
  first: { title: string; story: string; targetCodes: string[]; targetText: string; requiredKills: number };
  second: { title: string; story: string; targetCodes: string[]; targetText: string; requiredKills: number; materialCount: number };
  trial: { code: string; name: string; description: string; skillCodes: string[]; stats: [number, number, number, number, number, number] };
};

const trials = (code: string, name: string, description: string, skillCodes: string[], stats: AdvancedProfession['trial']['stats']): AdvancedProfession['trial'] => ({ code: `mentor_trial_${code}`, name, description, skillCodes, stats });

export const worldTreeAdvancedProfessions: AdvancedProfession[] = [
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
  { code: 'aegis_priest', name: '圣盾使', baseProfession: '牧师', mentor: { code: 'mentor_aegis_hector', name: '赫克托', title: '壁垒司祭', x: 6, y: -8 }, role: '护盾减伤 / 前排辅助', passive: { code: 'passive_aegis_vow', name: '壁垒誓言', description: '受到的伤害降低 3%。', effect: { damageReductionPct: 3 } }, route: advancedProfessionRoutes.ridge_foothills, first: { title: '修补过的祷词', story: `赫克托托你守住岩脊山麓的旧石阶，击退冲撞祷墙的石脉傀儡与峭壁羊怪。`, targetCodes: ['stonevein_golem','cliff_ram'], targetText: '石脉傀儡或峭壁羊怪', requiredKills: 3 }, second: { title: '立在缺口前', story: `清走祷墙缺口附近的山甲虫与碎岩兽，带回岩脊核心嵌入裂隙，为后来者撑起屏障。`, targetCodes: ['mountain_beetle','rubble_beast'], targetText: '山甲虫或碎岩兽', requiredKills: 5, materialCount: 4 }, trial: trials('aegis_hector', '壁垒司祭·赫克托', '赫克托会以连续重击询问：你的誓言能撑过第几下。', ['shield_counter', 'blessing_aegis', 'shield_bash_player'], [71, 55, 48, 53, 30, 25]) },
  { code: 'dawn_inquisitor', name: '晨星祷者', baseProfession: '牧师', mentor: { code: 'mentor_dawn_sola', name: '索拉', title: '晨星司祭', x: 8, y: -6 }, role: '光耀输出 / 团队祝福', passive: { code: 'passive_morning_psalm', name: '晨祷余辉', description: '光明技能伤害提高 6%。', effect: { lightSkillBonusPct: 6 } }, route: advancedProfessionRoutes.dark_forest_deep, first: { title: '晨钟余音', story: `索拉让你深入幽暗密林深处，击败哥布林祭司，驱散遮住旅人归路的阴影。`, targetCodes: ['goblin_priest'], targetText: '哥布林祭司', requiredKills: 3 }, second: { title: '让第一束光落下', story: `清除阻断晨光的哥布林法师，带回哥布林耳作为凭证。让第一束光落在需要方向的人身上。`, targetCodes: ['goblin_mage'], targetText: '哥布林法师', requiredKills: 5, materialCount: 3 }, trial: trials('dawn_sola', '晨星司祭·索拉', '索拉会以明灭不定的光考验你的信念与节奏。', ['sanctified_bolt', 'purifying_light', 'mana_benediction'], [47, 70, 27, 78, 34, 32]) }
];

/** 以实际战斗结算为准校准固有被动：每条二转被动保留独立的定位与收益入口。 */
const advancedPassiveBalance: Record<string, Pick<AdvancedProfession['passive'], 'description' | 'effect'>> = {
  ironbreaker: { description: '暴击属性提高 15%。', effect: { critRatePct: 15 } },
  nightblade: { description: '暴击属性提高 10%，暴击伤害属性提高 10%。', effect: { critRatePct: 10, critDamagePct: 10 } },
  venomancer: { description: '自身施加的剧毒每次结算，以及毒血引爆的剧毒结算伤害提高 15%。', effect: { venomDamagePct: 15 } },
  trickster_ranger: { description: '实际命中率提高 5%。', effect: { actualHitRatePct: 5 } },
  saint_healer: { description: '直接治疗效果提高 5%；自身施加的再生每回合恢复量额外 +1% 最大生命。', effect: { healingBonusPct: 5, regenerationBonusPct: 1 } }
};
for (const profession of worldTreeAdvancedProfessions) {
  const balance = advancedPassiveBalance[profession.code];
  if (balance) profession.passive = { ...profession.passive, ...balance };
}

/** 导师代号保持稳定，展示姓名与称谓则按职业气质统一维护。 */
const mentorIdentities: Record<string, { name: string; title: string }> = {
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

export const renameAdvancedMentorText = (text: string) => [...mentorNameReplacements.entries()].reduce((result, [previous, current]) => result.replaceAll(previous, current), text);

for (const profession of worldTreeAdvancedProfessions) {
  const identity = mentorIdentities[profession.mentor.code];
  if (!identity) continue;
  profession.first.story = renameAdvancedMentorText(profession.first.story);
  profession.second.story = renameAdvancedMentorText(profession.second.story);
  profession.trial.description = renameAdvancedMentorText(profession.trial.description);
  profession.mentor.name = identity.name;
  profession.mentor.title = identity.title;
  profession.trial.name = `${identity.title}·${identity.name}`;
}

export const advancedProfessionByCode = (code: string) => worldTreeAdvancedProfessions.find(entry => entry.code === code);
export const advancedProfessionByMentor = (code: string) => worldTreeAdvancedProfessions.find(entry => entry.mentor.code === code);

/** 角色展示用目录；隐藏委托不进入世界树导师与公开职业任务目录。 */
export const registeredAdvancedProfessionByCode = (code: string) => advancedProfessionByCode(code) ?? (() => {
  const profession = hiddenProfessions.find(entry => entry.code === code);
  return profession ? { code: profession.code, name: profession.name, role: profession.role,
    mentor: { code: profession.npc, name: profession.mentor },
    passive: { code: hiddenPassiveCode(profession.code), name: profession.passive, description: profession.role, effect: { hiddenProfession: 1 } as Record<string, number> } } : undefined;
})();

/** 会写入角色派生属性的二转固有被动字段；其余战斗规则效果仍在战斗层处理。 */
const cachedAdvancedPassiveKeys = new Set([
  'hpPct', 'mpPct', 'physicalAttackPct', 'magicAttackPct', 'physicalDefensePct', 'magicDefensePct',
  'accuracyPct', 'evasionPct', 'speedPct', 'critRatePct', 'critDamagePct', 'critResistPct',
  'critDamageReductionPct', 'tenacityPct', 'tenacityPiercePct'
]);

export const isCachedAdvancedPassiveKey = (key: string) => cachedAdvancedPassiveKeys.has(key);
export const cachedAdvancedPassiveEffectFor = (professionCode: string | null | undefined) => {
  const effect = registeredAdvancedProfessionByCode(String(professionCode ?? ''))?.passive.effect ?? {};
  return Object.fromEntries(Object.entries(effect).filter(([key]) => isCachedAdvancedPassiveKey(key))) as Record<string, number>;
};
export const hasBattleOnlyAdvancedPassiveEffect = (professionCode: string | null | undefined) => {
  const effect = registeredAdvancedProfessionByCode(String(professionCode ?? ''))?.passive.effect ?? {};
  return Object.keys(effect).some(key => !isCachedAdvancedPassiveKey(key));
};

/**
 * 二转完成时授予的职业主动技能。导师试炼的 skillCodes 仅用于 Boss，不能拿来当作玩家奖励。
 * 唤灵师的五个召唤灵契由 spirit-summoner.config.ts 额外并入，因此这里保留方案中的四个指令技。
 */
export const advancedProfessionActiveSkillCodes: Record<string, string[]> = {
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

for (const profession of hiddenProfessions) advancedProfessionActiveSkillCodes[profession.code] = hiddenSkills.filter(skill => skill.profession === profession.code).map(skill => skill.code);
export const activeSkillCodesForAdvancedProfession = (professionCode: string) => advancedProfessionActiveSkillCodes[professionCode] ?? [];

export const advancedProfessionPassiveCodes = new Set([...worldTreeAdvancedProfessions.map(profession => profession.passive.code), ...hiddenProfessions.map(profession => hiddenPassiveCode(profession.code))]);
export const advancedInheritanceSkillCode = (professionCode: string) => `inheritance_${professionCode}`;
export const advancedProfessionInheritanceCodes = new Set([...worldTreeAdvancedProfessions, ...hiddenProfessions].map(profession => advancedInheritanceSkillCode(profession.code)));
export const isAdvancedProfessionSkillCode = (code: string) => advancedProfessionPassiveCodes.has(code)
  || advancedProfessionInheritanceCodes.has(code)
  || Object.values(advancedProfessionActiveSkillCodes).some(codes => codes.includes(code))
  || ['spirit_call_ember', 'spirit_call_tide', 'spirit_call_bark', 'spirit_call_gale', 'spirit_call_moon'].includes(code);

export const isCachedAdvancedPassiveEffect = (skillCode: string, effectKey: string) => advancedProfessionPassiveCodes.has(skillCode) && isCachedAdvancedPassiveKey(effectKey);

/**
 * 传承被动不占普通被动槽。本职完成二转后常驻；旁修者达到 Lv.30 并完成导师课后，
 * 只能从已学传承中装备一条，所有数值均使用较低的旁修档。
 */
export type InheritancePassiveDefinition = {
  professionCode: string;
  name: string;
  ownDescription: string;
  studyDescription: string;
  own: number[];
  study: number[];
};

export const inheritancePassiveDefinitions: Record<string, InheritancePassiveDefinition> = {
  bulwark_guard: { professionCode: 'bulwark_guard', name: '护阵余韵', ownDescription: '自身带有护盾、盾反或守护效果结束行动时，生命比例最低的队友获得1回合6%伤害减免；每回合一次。', studyDescription: '同上，伤害减免降为4%。不会转移伤害。', own: [6], study: [4] },
  war_lord: { professionCode: 'war_lord', name: '共鸣号令', ownDescription: '自身对敌人施加减益后，标记其下一次受到的队友技能伤害：伤害+8%、命中+10%；每回合仅标记一个目标。', studyDescription: '伤害提升降为5%，仍提供10%命中。', own: [8, 10], study: [5, 10] },
  ironbreaker: { professionCode: 'ironbreaker', name: '临界识破', ownDescription: '每回合首次以单体技能命中带破甲或易伤的目标时，该次攻击暴击+10%。', studyDescription: '该次攻击暴击+6%。', own: [10], study: [6] },
  elementalist: { professionCode: 'elementalist', name: '异相共鸣', ownDescription: '本回合首次以技能给目标施加常规减益时，恢复4%最大MP。', studyDescription: '恢复2%最大MP。', own: [4], study: [2] },
  spirit_summoner: { professionCode: 'spirit_summoner', name: '灵契余荫', ownDescription: '每场战斗首次有队友生命降至50%以下时，为其施加2回合8%伤害减免壁垒。', studyDescription: '壁垒降为5%。', own: [8], study: [5] },
  spellblade: { professionCode: 'spellblade', name: '攻势换挡', ownDescription: '伤害技能后的下一次治疗、护盾或增益效果+12%；该效果后的下一次伤害技能+8%，两种强化各每回合一次。', studyDescription: '分别降为+7%与+5%。', own: [12, 8], study: [7, 5] },
  nightblade: { professionCode: 'nightblade', name: '低光狩猎', ownDescription: '对生命比例不高于35%的敌人造成的技能直击伤害+10%，不作用于持续伤害与反击。', studyDescription: '直击伤害提升降为6%。', own: [10], study: [6] },
  venomancer: { professionCode: 'venomancer', name: '渗毒判断', ownDescription: '每回合首次以技能命中带持续伤害、破甲或易伤的敌人时，该次攻击暴击+8%，破韧+8%。', studyDescription: '暴击降为+5%，破韧降为+5%。', own: [8], study: [5] },
  trickster_ranger: { professionCode: 'trickster_ranger', name: '猎线回响', ownDescription: '本回合内已有另一名队友命中过的目标，被自身技能命中后获得1回合10%减速；每回合一次。', studyDescription: '减速降为6%。', own: [10], study: [6] },
  saint_healer: { professionCode: 'saint_healer', name: '余辉援护', ownDescription: '每回合首次治疗生命低于40%的队友时，额外为其施加1回合8%伤害减免壁垒。', studyDescription: '壁垒降为5%。', own: [8], study: [5] },
  aegis_priest: { professionCode: 'aegis_priest', name: '守壁余响', ownDescription: '护盾或壁垒吸收伤害后，目标获得1回合20%控制抗性；每目标每回合一次。', studyDescription: '控制抗性降为12%。', own: [20], study: [12] },
  dawn_inquisitor: { professionCode: 'dawn_inquisitor', name: '晨钟裁意', ownDescription: '成功施加易伤或驱散敌方增益后，自身下一次对该目标的技能直击伤害+10%，持续至下回合结束。', studyDescription: '伤害提升降为6%。', own: [10], study: [6] }
};

const hiddenInheritanceText: Record<string, string> = {
  magical_scholar: '每场战斗首次有效中和本人造成的事故时，自身获得4%最大生命护盾。',
  weapon_master: '每场战斗首次有效三器合锋时，自身获得4%最大生命护盾。',
  inventor: '每场战斗首次双机协同的两台异械均有效时，自身获得4%最大生命护盾。',
  tactician: '每场战斗首次预案有效响应时，自身获得4%最大生命护盾。'
};
for (const profession of hiddenProfessions) inheritancePassiveDefinitions[profession.code] = { professionCode: profession.code, name: profession.inheritance, ownDescription: hiddenInheritanceText[profession.code], studyDescription: '此传承只随本职生效。', own: [4], study: [] };
export const inheritancePassiveFor = (professionCode: string) => inheritancePassiveDefinitions[professionCode];

/** 两项本职能力均登记为绑定技能；传承数值仍由职业结算，技能记录不再次叠加效果。 */
export const advancedBoundSkillDefinitions = [...worldTreeAdvancedProfessions, ...hiddenProfessions].flatMap(entry => {
  const profession = registeredAdvancedProfessionByCode(entry.code)!;
  const inheritance = inheritancePassiveFor(entry.code)!;
  return [
    { professionCode: entry.code, code: profession.passive.code, name: profession.passive.name, kind: '固有', description: profession.passive.description, effect: profession.passive.effect },
    { professionCode: entry.code, code: advancedInheritanceSkillCode(entry.code), name: inheritance.name, kind: '传承', description: inheritance.ownDescription, effect: {} as Record<string, number> }
  ];
});
