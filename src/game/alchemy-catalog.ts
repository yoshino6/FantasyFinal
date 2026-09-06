import { alchemyTierIndex, alchemyTierValues, alchemySupportsQuality } from './alchemy-balance';
import { alchemyTactics, type AlchemyTactic } from './alchemy-tactics';
export type AlchemyTag = '生机' | '灵能' | '韧护' | '迅捷' | '锋锐' | '凝胶' | '潮汐' | '炎性' | '霜寒' | '雷鸣' | '光辉' | '暗蚀';

export type AlchemyStatusCode = 'regeneration' | 'mana_regeneration' | 'barrier' | 'battle_cry' | 'precision' | 'critical_focus' | 'sprint' | 'alchemy_guard' | 'alchemy_evasion' | 'burn' | 'bind' | 'stun' | 'exposed' | 'imbalance' | 'alchemy_confusion';

export type AlchemyConsumableEffect = {
  tactic?: AlchemyTactic;
  quality?: number;
  skillReset?: boolean;
  requiredLevel?:number;
  tacticPotency?:number;
  healPct?: number;
  restoreMpPct?: number;
  cleanse?: boolean;
  battleCount?: number;
  experienceBonusPct?: number;
  partyDropBonusPct?: number;
  target?: 'self' | 'enemy';
  /** 控制使用固定概率，不受目标等级限制；Boss 应用控制衰减。 */
  targetScope?: 'single' | 'all';
  status?: { code: AlchemyStatusCode; value: number; turns: number; chance?: number; applicableLevel?: number };
  throwable?: { damageScale: number; element: string };
  perBattleLimit?: number;
};

export type AlchemyOutputDefinition = {
  code: string;
  name: string;
  description: string;
  level: number;
  tier: '基础' | '下位' | '中位' | '上位' | '超位';
  tags: AlchemyTag[];
  category: '药剂' | '投掷物' | '符咒' | '秘药';
  effect: AlchemyConsumableEffect;
};

const output = (definition: AlchemyOutputDefinition) => definition;

const baseOutputs: AlchemyOutputDefinition[] = [
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

type TierStyle = { code: string; name: string; tags: AlchemyTag[]; category: AlchemyOutputDefinition['category']; effect: (step: number) => AlchemyConsumableEffect; description: (step: number) => string };
const controlApplicableLevel = (step: number) => Math.min(100, step * 10 + 5);
const thunderControlChance = (step: number) => Math.min(80, 40 + step * 5);
const thunderControl = (step: number): AlchemyConsumableEffect['status'] => step === 1
  ? { code: 'stun', value: 1, turns: 1, chance: 100, applicableLevel: controlApplicableLevel(step) }
  : { code: 'stun', value: 1, turns: step >= 4 ? 2 : 1, chance: thunderControlChance(step), applicableLevel: controlApplicableLevel(step) };
const thunderDescription = (step: number) => step === 1
  ? `适用等级：Lv.${controlApplicableLevel(step)}及以下。对当前目标降下雷属性直击，并使其必定眩晕 1 回合。`
  : `适用等级：Lv.${controlApplicableLevel(step)}及以下。雷光掠过全体敌人，有 ${thunderControlChance(step)}% 概率使其眩晕 ${step >= 4 ? 2 : 1} 回合。`;
const tierStyles: TierStyle[] = [
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

const tierForLevel = (level: number): AlchemyOutputDefinition['tier'] => level <= 10 ? '基础' : level <= 25 ? '下位' : level <= 45 ? '中位' : level <= 70 ? '上位' : '超位';

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

const statusNames: Record<string,string> = { regeneration:'每回合回复最大生命',mana_regeneration:'每回合回复最大魔力',barrier:'减伤',battle_cry:'双攻提高',alchemy_guard:'双防提高',sprint:'速度提高',precision:'命中提高',alchemy_evasion:'闪避提高',critical_focus:'暴击提高',burn:'灼烧',bind:'速度降低',stun:'眩晕',exposed:'受到直伤提高',imbalance:'命中闪避降低',alchemy_confusion:'混乱' };
export const alchemyEffectDescription = (effect: AlchemyConsumableEffect) => {
  if(effect.skillReset)return '战斗外使用，先确认后返还有账可查的尚未返还技能点。';
  if(effect.tactic){const description=alchemyTactics.find(tactic=>tactic.code===effect.tactic)?.description??'战术药剂';return description+(Number(effect.tacticPotency??1)>1?` 本阶回复、护盾、直伤与储伤上限系数×${effect.tacticPotency}。`:'')+(Number(effect.quality??1)>1?` 数值品质系数×${effect.quality}；控制概率、持续时间、次数与代价不变。`:'');}
  const lines: string[] = [];
  if (effect.healPct) lines.push(`恢复最大生命的${effect.healPct}%`);
  if (effect.restoreMpPct) lines.push(`恢复最大魔力的${effect.restoreMpPct}%`);
  if (effect.cleanse) lines.push('清除普通可净化异常');
  if (effect.throwable) lines.push(`${effect.targetScope === 'all' ? '对全体敌人' : '对当前目标'}造成${Math.round(effect.throwable.damageScale * 100)}%攻击基准的${effect.throwable.element}属性投掷伤害（结算防御与抗性）`);
  if (effect.status) { const s = effect.status; lines.push(`${statusNames[s.code] ?? s.code}${['stun','alchemy_confusion'].includes(s.code) ? '' : ` ${s.value}%`}，持续${s.turns}回合${s.chance !== undefined ? `，概率${s.chance}%` : ''}${s.applicableLevel ? `，适用Lv.${s.applicableLevel}及以下` : ''}`); }
  if (effect.experienceBonusPct) lines.push(`经验提高${effect.experienceBonusPct}%，持续${effect.battleCount}场战斗`);
  if (effect.partyDropBonusPct) lines.push(`全队材料掉率提高${effect.partyDropBonusPct}%，持续${effect.battleCount}场战斗`);
  if (effect.perBattleLimit) lines.push(`同效果族每场最多${effect.perBattleLimit}次`);
  return lines.join('；')+'。';
};
const balancedOutput = (definition: AlchemyOutputDefinition): AlchemyOutputDefinition => {
  const effect: AlchemyConsumableEffect = JSON.parse(JSON.stringify(definition.effect)); const tier = alchemyTierIndex(definition.level);effect.requiredLevel=definition.level;
  if(effect.status){delete effect.status.applicableLevel;if(['stun','alchemy_confusion','bind','imbalance'].includes(effect.status.code))effect.status.chance??=100;}
  if (effect.healPct && effect.restoreMpPct) { effect.healPct=alchemyTierValues.harmonyHp[tier]!; effect.restoreMpPct=alchemyTierValues.harmonyMp[tier]!; }
  else { if(effect.healPct) effect.healPct=alchemyTierValues.life[tier]!; if(effect.restoreMpPct) effect.restoreMpPct=alchemyTierValues.mana[tier]!; }
  if(effect.status && effect.target !== 'enemy') {
    const status=effect.status; const values = status.code==='regeneration'||status.code==='mana_regeneration' ? alchemyTierValues.regeneration : status.code==='barrier' ? alchemyTierValues.reduction : status.code==='battle_cry' ? alchemyTierValues.attack : status.code==='alchemy_guard' ? alchemyTierValues.defense : status.code==='sprint' ? alchemyTierValues.speed : null;
    if(values) { status.value=values[tier]!; status.turns=status.code==='barrier'?2:3; }
  }
  if(effect.throwable) effect.throwable.damageScale = +(effect.throwable.damageScale * 3.6).toFixed(2);
  return { ...definition,effect,description:alchemyEffectDescription(effect) };
};
const tacticalOutputs: AlchemyOutputDefinition[] = [30,50,80].flatMap(level => alchemyTactics.filter(tactic=>level===30||!['quick_chant','defer'].includes(tactic.code)).map(tactic => ({ code:`alchemy_${tactic.code}_l${level}`,name:`${tactic.name}·Lv.${level}`,description:alchemyEffectDescription({tactic:tactic.code,tacticPotency:level===80?1.3:level===50?1.15:1}),level,tier:tierForLevel(level),category:tactic.enemy?'投掷物':'药剂',tags:[...tactic.tags] as AlchemyTag[],effect:{ tactic:tactic.code,quality:1,tacticPotency:level===80?1.3:level===50?1.15:1,requiredLevel:level,target:tactic.enemy?'enemy':'self' } })));
const standardOutputs = [...baseOutputs,...tierOutputs.flat()].map(balancedOutput).concat(tacticalOutputs);
const qualities = standardOutputs.filter(item=>alchemySupportsQuality(item.effect)).flatMap(definition => [1,2].map(quality => {
  const factor = 1+quality*.2; const effect: AlchemyConsumableEffect = JSON.parse(JSON.stringify(definition.effect)); effect.quality=factor;
  if(effect.healPct) effect.healPct=+Math.min(90,effect.healPct*factor).toFixed(1);
  if(effect.restoreMpPct) effect.restoreMpPct=+Math.min(90,effect.restoreMpPct*factor).toFixed(1);
  if(effect.throwable) effect.throwable.damageScale=+(effect.throwable.damageScale*factor).toFixed(2);
  if(effect.status && !['stun','alchemy_confusion'].includes(effect.status.code)) effect.status.value=+Math.min(effect.status.code==='barrier'?60:60,effect.status.value*factor).toFixed(1);
  return { ...definition,code:`${definition.code}_q${quality}`,name:`${definition.name}【${quality===1?'精制':'匠造'}】`,effect,description:effect.tactic?`${definition.description} 回复、护盾、直伤及正向属性量提高${quality*20}%；控制、次数与持续时间不变。`:alchemyEffectDescription(effect) };
}));
export const alchemyOutputDefinitions: readonly AlchemyOutputDefinition[] = [...standardOutputs,...qualities, { code:'alchemy_skill_reset_elixir',name:'归悟洗练露',description:'战斗外使用。有技能点明细时按尚未返还的记录回溯；无明细时撤销旧加点并将可用点数重置为角色等级。重置后点数不超过等级，保留领悟记录及免费基础能力。使用时先显示确认面板。',level:1,tier:'下位',category:'秘药',tags:['灵能','生机'],effect:{skillReset:true} }];
export const alchemyOutputsAtOrBelow = (level: number) => standardOutputs.filter(output => output.level <= level);

export const alchemyStatusDefinitions = [
  { code: 'alchemy_guard', name: '坚守', effectType: 'stat_modifier', value: 8, duration: 2, description: '双防提高，效果值为百分比。' },
  { code: 'alchemy_evasion', name: '轻灵', effectType: 'stat_modifier', value: 12, duration: 2, description: '闪避提高，效果值为百分比。' },
  { code: 'alchemy_confusion', name: '混乱', effectType: 'stat_modifier', value: 1, duration: 1, description: '行动目标随机化。' }
] as const;
