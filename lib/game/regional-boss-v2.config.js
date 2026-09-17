const regionalV2Resistance = {
    gruen_mountainheart: { 水: 45, 火: 110, 土: 200, 木: 80, 风: -35, 冰: -25, 雷: 65, 光: 30, 暗: 50 },
    valk_forge_overseer: { 水: -40, 火: 200, 土: 80, 木: 100, 风: 60, 冰: 45, 雷: -30, 光: 45, 暗: 30 }
};
const regionalV2Passives = {
    gruen_mountainheart: [
        { name: '山体承压', description: '玩家每次实际行动仅改变一次共享压力；多段、追击、DOT和灵兽不重复计数。压力区间影响最终承伤与直击伤害。' },
        { name: '岩层剥落', description: '第二阶段起，每轮首次进入断层或临界时，本轮承受最终伤害额外提高10%。' },
        { name: '无根山体', description: '第三阶段压力下限15，临界承伤165%；逆脉卸力额外自损最大生命3%，每场最多两次。' }
    ],
    valk_forge_overseer: [
        { name: '监工法度', description: '炉令逐人判定，鞭痕最多4层；集体停炉门槛向上取有效行动人数的一半。控制停工者不计入分母。' },
        { name: '炉火锻身', description: '冷炉造成伤害降低15%、承伤提高10%；赤热和白热仅增强火属性直击，不放大鞭痕。' },
        { name: '不息工序', description: '连续成功停炉只能隔次取消工序；满额开炉回血最多两次。总罢工后永久失去炉温增伤，双防降低20%，炉温上限80。' }
    ]
};
const regionalV2SkillProfiles = {
    山脊测重: { power: 140, ratio: 1 }, 断层推进: { power: 150, ratio: .65 },
    山心崩震: { power: 150, ratio: .65 }, 断层崩震: { power: 175, ratio: .70 }, 万壑倾覆: { power: 185, ratio: .75 },
    赤铁抽检: { power: 140, ratio: 1 }, 冷砧回火: { power: 140, ratio: 1 }, 赤铁横锻: { power: 150, ratio: .65 },
    炉渣喷流: { power: 150, ratio: .65 }, 白热裁决: { power: 175, ratio: 1 }, 白热溅射: { power: 175, ratio: 1 },
    封炉清算: { power: 185, ratio: .75 }, 停炉后的挥锤: { power: 80, ratio: 1 },
    承重点追震: { power: 45, ratio: 1 }, 碎岩追震: { power: 45, ratio: 1 }
};
const regionalV2Skills = [
    ['gruen_v2_measure', '山脊测重', 'physical', '土'], ['gruen_v2_fault', '断层推进', 'physical', '土'],
    ['gruen_v2_warning', '地脉预震', 'utility', '土'], ['gruen_v2_quake', '山心崩震', 'physical', '土'],
    ['gruen_v2_faultquake', '断层崩震', 'physical', '土'], ['gruen_v2_overturn', '万壑倾覆', 'physical', '土'],
    ['valk_v2_orders', '监工派令', 'utility', '无'], ['valk_v2_inspect', '赤铁抽检', 'physical', '无'],
    ['valk_v2_cold', '冷砧回火', 'physical', '无'], ['valk_v2_forge', '赤铁横锻', 'physical', '无'],
    ['valk_v2_slag', '炉渣喷流', 'magic', '火'], ['valk_v2_sentence', '白热裁决', 'magic', '火'],
    ['valk_v2_overload', '封炉清算', 'magic', '火']
];
const regionalV2Rotation = {
    gruen_mountainheart: regionalV2Skills.filter(skill => skill[0].startsWith('gruen_')).map(skill => skill[0]),
    valk_forge_overseer: regionalV2Skills.filter(skill => skill[0].startsWith('valk_')).map(skill => skill[0])
};

export { regionalV2Passives, regionalV2Resistance, regionalV2Rotation, regionalV2SkillProfiles, regionalV2Skills };
