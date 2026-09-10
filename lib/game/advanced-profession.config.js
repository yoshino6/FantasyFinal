import { hiddenProfessions, hiddenSkills, hiddenPassiveCode } from './hidden-profession.config.js';

const ridge = '岩脊山麓';
const trials = (code, name, description, skillCodes, stats) => ({ code: `mentor_trial_${code}`, name, description, skillCodes, stats });
const worldTreeAdvancedProfessions = [
    { code: 'bulwark_guard', name: '盾卫', baseProfession: '战士', mentor: { code: 'mentor_bulwark_gareth', name: '加雷斯', title: '守根骑士', x: -8, y: -7 }, role: '前排承伤 / 守护队友', passive: { code: 'passive_guard_instinct', name: '守势直觉', description: '受到的伤害降低 4%。', effect: { damageReductionPct: 4 } }, first: { title: '盾上的名字', story: `加雷斯把一面缺角旧盾交给你：它来自一支在${ridge}失散的护送队。去看一看那些仍守在断坡上的生物，记住盾牌真正要挡在谁前面。`, targetCodes: ['mountain_beetle', 'stonevein_golem', 'cliff_ram'], targetText: '山甲虫、岩脉傀儡或峭壁岩羊', requiredKills: 3 }, second: { title: '补回缺口', story: `旧盾的裂缝需要岩层深处仍在跳动的回响。带回岩脊核心，也替护送队清理阻住山道的顽石；你要学会站稳，而不是逞强。`, targetCodes: ['rubble_beast', 'stonevein_golem'], targetText: '碎岩兽或岩脉傀儡', requiredKills: 5, materialCount: 4 }, trial: trials('bulwark_gareth', '守根骑士·加雷斯', '加雷斯会用最沉的盾击询问：你愿意为谁留下。', ['warrior_taunt', 'shield_counter', 'shield_bash_player'], [74, 38, 58, 24, 33, 28]) },
    { code: 'war_lord', name: '战旗使', baseProfession: '战士', mentor: { code: 'mentor_warlord_oren', name: '奥伦', title: '旗语教官', x: -6, y: -8 }, role: '近战增益 / 节奏组织', passive: { code: 'passive_formation_voice', name: '阵前号令', description: '造成的伤害提高 3%。', effect: { damageBonusPct: 3 } }, first: { title: '没有旗的队伍', story: `奥伦让你走进${ridge}的风口。散开的脚印不会自己汇成队伍；驱散循着残旗盘旋的野兽，带回你看见的行军顺序。`, targetCodes: ['canyon_jackal', 'ironfeather_vulture'], targetText: '峡谷豺或铁羽秃鹫', requiredKills: 3 }, second: { title: '让风记住方向', story: `他把旗杆插在地上：旗不是为了好看，而是让犹豫的人知道该往哪里走。取岩脊核心压住旗座，再清出一段能让同伴并肩通过的路。`, targetCodes: ['ironfeather_vulture', 'canyon_jackal', 'mine_goblin'], targetText: '铁羽秃鹫、峡谷豺或矿洞地精', requiredKills: 5, materialCount: 3 }, trial: trials('warlord_oren', '旗语教官·奥伦', '奥伦不替你下令；他只看你能否在混战里让人听见。', ['war_cry', 'sweeping_slash', 'piercing_thrust'], [62, 31, 61, 20, 42, 36]) },
    { code: 'ironbreaker', name: '剑豪', baseProfession: '战士', mentor: { code: 'mentor_ironbreaker_noll', name: '诺尔', title: '钝锋剑士', x: -4, y: -8 }, role: '爆发近战 / 破防处决', passive: { code: 'passive_edge_focus', name: '锋芒专注', description: '暴击+5%。', effect: { critRatePct: 5 } }, first: { title: '钝锋的分寸', story: `诺尔用木片遮住剑刃，说锋利之前先要知道哪里不能砍。去${ridge}观察石壳与岩羊的发力点，以三场战斗证明你没有把力量交给怒气。`, targetCodes: ['mountain_beetle', 'cliff_ram', 'stonevein_golem'], targetText: '山甲虫、峭壁岩羊或岩脉傀儡', requiredKills: 3 }, second: { title: '一线开石', story: `岩脊核心会在受力处发出不同回音。诺尔要你收集回音，并劈开挡住旧矿道的石质威胁；剑豪的第一课，是只出必要的一剑。`, targetCodes: ['stonevein_golem', 'rubble_beast'], targetText: '岩脉傀儡或碎岩兽', requiredKills: 5, materialCount: 4 }, trial: trials('ironbreaker_noll', '钝锋剑士·诺尔', '诺尔会让你先看见空隙，再决定是否挥剑。', ['heavy_strike', 'armor_break', 'charge'], [60, 27, 69, 18, 45, 34]) },
    { code: 'elementalist', name: '元素使', baseProfession: '法师', mentor: { code: 'mentor_elementalist_sen', name: '森', title: '调律师', x: 6, y: 8 }, role: '远程四系输出 / 属性克制', passive: { code: 'passive_elemental_resonance', name: '元素共鸣', description: '魔法伤害提高 4%。', effect: { magicDamagePct: 4 } }, first: { title: '温差中的答案', story: `森让你别急着念咒。${ridge}的热风、寒雾、枝间乱流与低垂雷云各有脾气；击败扰乱气流的生物，辨认火、冰、风与雷如何彼此让步。`, targetCodes: ['ember_bat', 'rubble_beast', 'canyon_jackal'], targetText: '余烬蝠、碎岩兽或峡谷豺', requiredKills: 3 }, second: { title: '借来的回响', story: `岩脊核心能留住短暂的元素回声。带回样本，再平息被热流惊动的魔物；元素使不制造灾害，而是把火、冰、风与雷的失衡推回边界。`, targetCodes: ['ember_bat', 'mountain_beetle', 'fault_centipede'], targetText: '余烬蝠、山甲虫或断层蜈蚣', requiredKills: 5, materialCount: 3 }, trial: trials('elementalist_sen', '调律师·森', '森会以火、冰、风、雷四种错乱节拍逼你做出正确取舍。', ['fireball', 'frost_bind', 'wind_blade', 'thunder_lance'], [43, 67, 22, 73, 39, 35]) },
    { code: 'spirit_summoner', name: '唤灵师', baseProfession: '法师', mentor: { code: 'mentor_summoner_mia', name: '米娅', title: '灵契引路人', x: 8, y: 6 }, role: '多灵协作 / 持续支援', passive: { code: 'passive_spirit_breath', name: '灵息', description: '每回合额外恢复 2% 魔力；灵位上限从 1 提升至 3。', effect: { mpRegenPct: 2, spiritLimitBonus: 2 } }, first: { title: '三席灵位', story: `米娅在世界树根旁摆下三张空椅：一张为受伤者，一张为前线，一张为尚未归来的灵。她要你去${ridge}驱离侵扰旧巢的兽群，让走散的微小灵息重新知道该回应谁。`, targetCodes: ['canyon_jackal', 'ironfeather_vulture', 'mine_goblin'], targetText: '峡谷豺、铁羽秃鹫或矿洞地精', requiredKills: 3 }, second: { title: '让灵各归其位', story: `岩脊核心的微光可以分成守望、疗愈与追击三种不同的呼应。带回核心，并清除会吞掉灯火的暗处威胁；唤灵师的本领不在召来更多灵，而在让每一份回应落到正确的位置。`, targetCodes: ['ember_bat', 'fault_centipede', 'mine_goblin'], targetText: '余烬蝠、断层蜈蚣或矿洞地精', requiredKills: 5, materialCount: 3 }, trial: trials('summoner_mia', '灵契引路人·米娅', '米娅会令攻、防、疗三道灵息同时回应，考验你能否听清每一种呼唤。', ['mia_ember_echo', 'mia_tide_chorus', 'mia_root_resonance'], [41, 71, 20, 76, 33, 30]) },
    { code: 'spellblade', name: '战斗法师', baseProfession: '法师', mentor: { code: 'mentor_spellblade_vane', name: '维恩', title: '近咒行者', x: 8, y: 8 }, role: '近中距离魔法输出 / 自保', passive: { code: 'passive_spellsteel', name: '咒钢护身', description: '魔法伤害提高 2%，受到的伤害降低 2%。', effect: { magicDamagePct: 2, damageReductionPct: 2 } }, first: { title: '两步之间', story: `维恩把法杖横在剑架上：距离不是退让，也不是逞能。去${ridge}的狭路和石阶战斗，体会何时用咒逼开空间、何时用步法守住空当。`, targetCodes: ['mountain_beetle', 'canyon_jackal', 'ember_bat'], targetText: '山甲虫、峡谷豺或余烬蝠', requiredKills: 3 }, second: { title: '把咒留在掌心', story: `岩脊核心能让术式在金属上停留片刻。带回它们，并击退封住窄路的敌人；战斗法师的护身咒，必须在最短距离也能成立。`, targetCodes: ['stonevein_golem', 'mine_goblin', 'rubble_beast'], targetText: '岩脉傀儡、矿洞地精或碎岩兽', requiredKills: 5, materialCount: 4 }, trial: trials('spellblade_vane', '近咒行者·维恩', '维恩会不断压近，考验你的咒语能否跟上脚步。', ['arcane_bolt', 'sweeping_slash', 'mist_step_slash'], [53, 52, 45, 56, 42, 42]) },
    { code: 'nightblade', name: '夜刃', baseProfession: '盗贼', mentor: { code: 'mentor_nightblade_loke', name: '洛克', title: '暮影斥候', x: -9, y: 4 }, role: '单体爆发 / 侦察切入', passive: { code: 'passive_night_focus', name: '夜行专注', description: '暴击+5%。', effect: { critRatePct: 5 } }, first: { title: '没人看见的退路', story: `洛克让你在${ridge}找一条不用留下脚印的回程路。先处理守在阴影边缘的敌人，再告诉他：真正的潜行不是躲起来，而是让同伴能安全离开。`, targetCodes: ['canyon_jackal', 'mine_goblin', 'ironfeather_vulture'], targetText: '峡谷豺、矿洞地精或铁羽秃鹫', requiredKills: 3 }, second: { title: '影子也要有重量', story: `岩脊核心会在月下映出极短的轮廓。带回核心，清除追着采矿人走的威胁；你要学会把一次出手留给真正重要的目标。`, targetCodes: ['mine_goblin', 'fault_centipede', 'ember_bat'], targetText: '矿洞地精、断层蜈蚣或余烬蝠', requiredKills: 5, materialCount: 3 }, trial: trials('nightblade_loke', '暮影斥候', '洛克不会正面迎你；你要从他的消失里读懂先机。', ['backstab', 'mist_step_slash', 'smoke_screen'], [45, 30, 64, 21, 72, 57]) },
    { code: 'venomancer', name: '蚀毒师', baseProfession: '盗贼', mentor: { code: 'mentor_venomancer_ning', name: '宁', title: '药痕师', x: -9, y: 2 }, role: '持续削弱 / 单体压制', passive: { code: 'passive_corrosive_instinct', name: '蚀痕', description: '造成的伤害提高 3%。', effect: { damageBonusPct: 3 } }, first: { title: '草药不替人决定', story: `宁把两株相似的药草放在你面前：一株止血，一株会让伤口更深。去${ridge}观察毒腺与灼痕，击败携带异常体液的生物，学会先辨别再下手。`, targetCodes: ['fault_centipede', 'ember_bat', 'canyon_jackal'], targetText: '断层蜈蚣、余烬蝠或峡谷豺', requiredKills: 3 }, second: { title: '留下解法', story: `她要用岩脊核心的冷性稳定药液。带回核心，清理蔓延到旧营地周边的虫兽；蚀毒师的本事不是让人痛，而是知道痛该在哪里结束。`, targetCodes: ['fault_centipede', 'mountain_beetle', 'mine_goblin'], targetText: '断层蜈蚣、山甲虫或矿洞地精', requiredKills: 5, materialCount: 3 }, trial: trials('venomancer_ning', '药痕师·宁', '宁会让你在一击见效与留下余地之间作答。', ['toxic_edge', 'armor_break', 'backstab'], [44, 41, 56, 33, 66, 48]) },
    { code: 'trickster_ranger', name: '机关游侠', baseProfession: '盗贼', mentor: { code: 'mentor_trickster_vera', name: '维拉', title: '线机师', x: -8, y: 0 }, role: '远程牵制 / 控场引导', passive: { code: 'passive_hunter_measure', name: '猎手测距', description: '命中率提高 8%。', effect: { accuracyPct: 8 } }, first: { title: '绳结与风向', story: `维拉把一团细线交给你，叫你去${ridge}的风口看它如何摆动。赶走会扯断索道的飞兽与甲虫；机关不是陷阱本身，而是提前看见别人没看见的路。`, targetCodes: ['ironfeather_vulture', 'mountain_beetle', 'canyon_jackal'], targetText: '铁羽秃鹫、山甲虫或峡谷豺', requiredKills: 3 }, second: { title: '让路自己说话', story: `岩脊核心可以给机关提供稳定的触发回响。带回核心，清理旧索道下的威胁；游侠的本领，是让敌人按你预留的路前进。`, targetCodes: ['ironfeather_vulture', 'mine_goblin', 'rubble_beast'], targetText: '铁羽秃鹫、矿洞地精或碎岩兽', requiredKills: 5, materialCount: 4 }, trial: trials('trickster_vera', '线机师·维拉', '维拉会不断改变站位，逼你用判断而非运气命中。', ['piercing_thrust', 'wind_blade', 'frost_bind'], [46, 38, 51, 35, 68, 60]) },
    { code: 'saint_healer', name: '圣愈者', baseProfession: '牧师', mentor: { code: 'mentor_saint_mare', name: '玛蕾', title: '白枝修女', x: 4, y: -8 }, role: '治疗续航 / 净化支援', passive: { code: 'passive_gentle_light', name: '柔光', description: '治疗效果提高 5%。', effect: { healingBonusPct: 5 } }, first: { title: '留给后来者的白枝', story: `玛蕾托你把折断的白枝带到${ridge}旧路旁。那里曾有伤者靠一盏灯等到天明；清出周边的威胁，体会治疗不是替人战斗，而是让人还能继续走。`, targetCodes: ['rubble_beast', 'cliff_ram', 'canyon_jackal'], targetText: '碎岩兽、峭壁岩羊或峡谷豺', requiredKills: 3 }, second: { title: '把灯续到天亮', story: `岩脊核心能让微光不被夜风吹灭。带回核心，再消除逼近旧营地的生物；圣愈者要记住每一次施救的代价，也记住被救下的名字。`, targetCodes: ['ember_bat', 'mine_goblin', 'fault_centipede'], targetText: '余烬蝠、矿洞地精或断层蜈蚣', requiredKills: 5, materialCount: 3 }, trial: trials('saint_mare', '白枝修女·玛蕾', '玛蕾会让光照向最难兼顾的地方。', ['healing_light', 'purifying_light', 'healing_prayer'], [48, 72, 25, 75, 31, 29]) },
    { code: 'aegis_priest', name: '圣盾使', baseProfession: '牧师', mentor: { code: 'mentor_aegis_hector', name: '赫克托', title: '壁垒司祭', x: 6, y: -8 }, role: '护盾减伤 / 前排辅助', passive: { code: 'passive_aegis_vow', name: '壁垒誓言', description: '受到的伤害降低 3%。', effect: { damageReductionPct: 3 } }, first: { title: '修补过的祷词', story: `赫克托指着世界树下的一段旧石墙：祷词被风蚀过，仍替后来者挡住碎石。去${ridge}击退冲撞石阶的敌人，明白守护不是把自己藏在墙后。`, targetCodes: ['stonevein_golem', 'mountain_beetle', 'cliff_ram'], targetText: '岩脉傀儡、山甲虫或峭壁岩羊', requiredKills: 3 }, second: { title: '立在缺口前', story: `岩脊核心要嵌进祷墙的裂隙。带回核心，并清出挡住补墙人的石兽；圣盾使的屏障不是终点，而是给队友留下反击的一息。`, targetCodes: ['stonevein_golem', 'rubble_beast', 'mine_goblin'], targetText: '岩脉傀儡、碎岩兽或矿洞地精', requiredKills: 5, materialCount: 4 }, trial: trials('aegis_hector', '壁垒司祭·赫克托', '赫克托会以连续重击询问：你的誓言能撑过第几下。', ['shield_counter', 'blessing_aegis', 'shield_bash_player'], [71, 55, 48, 53, 30, 25]) },
    { code: 'dawn_inquisitor', name: '晨星祷者', baseProfession: '牧师', mentor: { code: 'mentor_dawn_sola', name: '索拉', title: '晨星司祭', x: 8, y: -6 }, role: '光耀输出 / 团队祝福', passive: { code: 'passive_morning_psalm', name: '晨祷余辉', description: '光明技能伤害提高 6%。', effect: { lightSkillBonusPct: 6 } }, first: { title: '晨钟余音', story: `索拉说晨钟停下后，回音仍会走很远。去${ridge}寻找被夜行生物惊散的旅人足迹，击退拦路者；你要分清光是照亮前方，还是替人决定方向。`, targetCodes: ['ironfeather_vulture', 'ember_bat', 'canyon_jackal'], targetText: '铁羽秃鹫、余烬蝠或峡谷豺', requiredKills: 3 }, second: { title: '让第一束光落下', story: `岩脊核心会把微弱的晨光聚在一点。带回核心，清除盘踞在朝阳坡的敌人；晨星祷者的祝福应当给迷路的人勇气，而不是替他们选择。`, targetCodes: ['ember_bat', 'fault_centipede', 'mine_goblin'], targetText: '余烬蝠、断层蜈蚣或矿洞地精', requiredKills: 5, materialCount: 3 }, trial: trials('dawn_sola', '晨星司祭·索拉', '索拉会以明灭不定的光考验你的信念与节奏。', ['sanctified_bolt', 'purifying_light', 'mana_benediction'], [47, 70, 27, 78, 34, 32]) }
];
const advancedPassiveBalance = {
    ironbreaker: { description: '暴击属性提高 15%。', effect: { critRatePct: 15 } },
    nightblade: { description: '暴击属性提高 10%，暴击伤害属性提高 10%。', effect: { critRatePct: 10, critDamagePct: 10 } },
    venomancer: { description: '自身施加的剧毒每次结算，以及毒血引爆的剧毒结算伤害提高 15%。', effect: { venomDamagePct: 15 } },
    trickster_ranger: { description: '实际命中率提高 5%。', effect: { actualHitRatePct: 5 } },
    saint_healer: { description: '直接治疗效果提高 5%；自身施加的再生每回合恢复量额外 +1% 最大生命。', effect: { healingBonusPct: 5, regenerationBonusPct: 1 } }
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
const registeredAdvancedProfessionByCode = (code) => advancedProfessionByCode(code) ?? (() => {
    const profession = hiddenProfessions.find(entry => entry.code === code);
    return profession ? { code: profession.code, name: profession.name, role: profession.role,
        mentor: { code: profession.npc, name: profession.mentor },
        passive: { code: hiddenPassiveCode(profession.code), name: profession.passive, description: profession.role, effect: { hiddenProfession: 1 } } } : undefined;
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
const hiddenInheritanceText = {
    magical_scholar: '每场战斗首次有效中和本人造成的事故时，自身获得4%最大生命护盾。',
    weapon_master: '每场战斗首次有效三器合锋时，自身获得4%最大生命护盾。',
    inventor: '每场战斗首次双机协同的两台异械均有效时，自身获得4%最大生命护盾。',
    tactician: '每场战斗首次预案有效响应时，自身获得4%最大生命护盾。'
};
for (const profession of hiddenProfessions)
    inheritancePassiveDefinitions[profession.code] = { professionCode: profession.code, name: profession.inheritance, ownDescription: hiddenInheritanceText[profession.code], studyDescription: '此传承只随本职生效。', own: [4], study: [] };
const inheritancePassiveFor = (professionCode) => inheritancePassiveDefinitions[professionCode];
const advancedBoundSkillDefinitions = [...worldTreeAdvancedProfessions, ...hiddenProfessions].flatMap(entry => {
    const profession = registeredAdvancedProfessionByCode(entry.code);
    const inheritance = inheritancePassiveFor(entry.code);
    return [
        { professionCode: entry.code, code: profession.passive.code, name: profession.passive.name, kind: '固有', description: profession.passive.description, effect: profession.passive.effect },
        { professionCode: entry.code, code: advancedInheritanceSkillCode(entry.code), name: inheritance.name, kind: '传承', description: inheritance.ownDescription, effect: {} }
    ];
});

export { activeSkillCodesForAdvancedProfession, advancedBoundSkillDefinitions, advancedInheritanceSkillCode, advancedProfessionActiveSkillCodes, advancedProfessionByCode, advancedProfessionByMentor, advancedProfessionInheritanceCodes, advancedProfessionPassiveCodes, cachedAdvancedPassiveEffectFor, hasBattleOnlyAdvancedPassiveEffect, inheritancePassiveDefinitions, inheritancePassiveFor, isAdvancedProfessionSkillCode, isCachedAdvancedPassiveEffect, isCachedAdvancedPassiveKey, registeredAdvancedProfessionByCode, renameAdvancedMentorText, worldTreeAdvancedProfessions };
