const alchemyTactics = [
    { code: 'emergency', name: '凝血救急剂', tags: ['生机', '凝胶'], enemy: false, description: '回复最大生命的30%；使用前生命低于30%时额外回复15%。' },
    { code: 'overflow', name: '满溢琥珀露', tags: ['生机', '韧护'], enemy: false, description: '回复30%最大生命；溢出治疗的70%转为护盾，上限15%最大生命，持续2回合。' },
    { code: 'clean_shield', name: '涤垢护心液', tags: ['潮汐', '光辉'], enemy: false, description: '净化最多3个普通减益，每个转为5%最大生命护盾，持续2回合。' },
    { code: 'last_life', name: '灰烬续生剂', tags: ['生机', '炎性'], enemy: false, description: '3回合内承受致命伤时保留1生命并回复15%最大生命；每人每场只能触发一次。' },
    { code: 'mana_spring', name: '静息魔泉', tags: ['灵能', '潮汐'], enemy: false, description: '立即恢复25%最大魔力，之后两回合结束各恢复10%。' },
    { code: 'blood_mana', name: '血蓝交换液', tags: ['生机', '灵能'], enemy: false, description: '支付12%最大生命，恢复40%最大魔力；支付后必须存活。' },
    { code: 'berserk', name: '脆壳狂战剂', tags: ['锋锐', '炎性'], enemy: false, description: '双攻提高40%，双防降低15%，持续3回合。' },
    { code: 'thorns', name: '铁木反刺膏', tags: ['韧护', '锋锐'], enemy: false, description: '双防提高25%，持续2回合；每回合首次受到直击反刺35%标准投掷伤害。' },
    { code: 'shed', name: '蝉蜕雾露', tags: ['暗蚀', '迅捷'], enemy: false, description: 'PVE已有仇恨降低40%；闪避提高25%，持续2回合。PVP只提供闪避。' },
    { code: 'lure', name: '引敌标记瓶', tags: ['光辉', '凝胶'], enemy: true, description: '造成70%标准投掷伤害，PVE增加自身仇恨；PVP使目标命中降低20%，持续1回合。' },
    { code: 'wind_charge', name: '借风蓄势剂', tags: ['迅捷', '锋锐'], enemy: false, description: '3回合内下一次主动伤害技能的直伤总量提高45%；多段与群体各按该段原伤害计算，同一行动只消费一次。' },
    { code: 'quick_chant', name: '凝时速咏露', tags: ['灵能', '霜寒'], enemy: false, description: '3回合内下一次有吟唱的技能缩短1回合吟唱，不重置冷却、不增加行动。' },
    { code: 'thunder_seed', name: '蓄雷引爆瓶', tags: ['雷鸣', '凝胶'], enemy: true, description: '造成65%标准投掷伤害；投掷本身计第一次；后续2回合内第三次直击触发90%标准伤害，每回合只计一次。' },
    { code: 'oil', name: '油膜燃烧瓶', tags: ['炎性', '凝胶'], enemy: true, description: '造成50%标准投掷伤害，附油膜3回合；下一次火直击引爆80%标准伤害并灼烧。' },
    { code: 'frost_crack', name: '霜裂蚀甲瓶', tags: ['霜寒', '锋锐'], enemy: true, description: '造成60%标准投掷伤害并降低双防25%，持续2回合；已束缚目标追加35%标准伤害。' },
    { code: 'chain', name: '雷水导流瓶', tags: ['雷鸣', '潮汐'], enemy: true, description: '主目标承受80%标准投掷伤害，最多两个其他目标各承受35%，不重复传导。' },
    { code: 'antiheal', name: '封疗苦胆液', tags: ['凝胶', '暗蚀'], enemy: true, description: '造成60%标准投掷伤害，受到治疗降低40%，持续2回合。' },
    { code: 'echo_damage', name: '回声蓄伤瓶', tags: ['灵能', '雷鸣'], enemy: true, description: '记录2回合内实际受到的直伤，期满追加20%，上限120%标准投掷伤害，不递归记录。' },
    { code: 'steal_light', name: '夺辉剥离剂', tags: ['光辉', '暗蚀'], enemy: true, description: '驱散最多2个普通增益，每个转为自身6%最大生命护盾，持续2回合。' },
    { code: 'reflect', name: '镜面折光露', tags: ['光辉', '灵能'], enemy: false, description: '2回合内首次魔法直击减免35%，反射减免量的一半，上限80%标准投掷伤害。' },
    { code: 'resistance', name: '逆相抗性剂', tags: ['霜寒', '韧护'], enemy: false, description: '火抗性增加25点，冰抗性降低10点，持续3回合。' },
    { code: 'rescue', name: '共鸣救援雾', tags: ['生机', '潮汐', '迅捷'], enemy: false, description: '生命比例最低的最多3名存活队员各恢复18%最大生命。' },
    { code: 'chaos', name: '混沌骰瓶', tags: ['暗蚀', '雷鸣', '灵能'], enemy: true, description: '等概率触发：140%标准直伤；80%标准直伤及1回合减速；自身回复25%生命及50%标准直伤。' },
    { code: 'defer', name: '延迟偿伤剂', tags: ['韧护', '霜寒', '灵能'], enemy: false, description: '2回合内将直伤的30%延后偿还，延迟池上限20%最大生命；到期偿伤，不可净化欠伤。' }
];
const alchemyTacticByCode = new Map(alchemyTactics.map(item => [item.code, item]));

export { alchemyTacticByCode, alchemyTactics };
