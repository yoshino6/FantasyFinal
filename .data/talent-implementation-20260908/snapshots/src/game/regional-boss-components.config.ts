/**
 * 区域 Boss 的战斗内多部位配置。
 *
 * 部位模板只提供名称、鉴识与元素耐性；本场 HP 和战斗面板由本体最终属性派生，
 * 因而不会重复吃到本体随机词条。
 */
export const regionalBossElements = ['水', '火', '土', '木', '风', '冰', '雷', '光', '暗'] as const;
export type RegionalBossElement = typeof regionalBossElements[number];
export type RegionalBossComponentKey =
  | 'gruen_armor' | 'gruen_horn' | 'gruen_arm'
  | 'valk_armor' | 'valk_chain' | 'valk_bellows';

export type RegionalBossComponentDefinition = {
  key: RegionalBossComponentKey;
  templateCode: string;
  name: string;
  bodyCode: 'gruen_mountainheart' | 'valk_forge_overseer';
  hpRatio: number;
  physicalDefenseRatio: number;
  magicDefenseRatio: number;
  physicalAttackRatio: number;
  magicAttackRatio: number;
  speedRatio: number;
  elementResistance: Record<RegionalBossElement, number>;
  passiveSummary: string;
  breakSummary: string;
};

const resistance = (values: Record<RegionalBossElement, number>) => values;

export const regionalBossComponentDefinitions: RegionalBossComponentDefinition[] = [
  {
    key: 'gruen_armor', templateCode: 'gruen_everlasting_armor', name: '格鲁恩·永固之铠', bodyCode: 'gruen_mountainheart',
    hpRatio: .28, physicalDefenseRatio: 1.8, magicDefenseRatio: 1.55, physicalAttackRatio: .2, magicAttackRatio: .2, speedRatio: .55,
    elementResistance: resistance({ 水: -35, 火: 100, 土: 250, 木: 70, 风: -15, 冰: -30, 雷: 90, 光: 60, 暗: 65 }),
    passiveSummary: '本体减伤 30%｜每3回合双防+25%', breakSummary: '本体双防 -50%'
  },
  {
    key: 'gruen_horn', templateCode: 'gruen_resonant_horn', name: '格鲁恩·镇脉之角', bodyCode: 'gruen_mountainheart',
    hpRatio: .22, physicalDefenseRatio: 1.15, magicDefenseRatio: 1.35, physicalAttackRatio: .2, magicAttackRatio: .2, speedRatio: 1.12,
    elementResistance: resistance({ 水: 20, 火: 80, 土: 250, 木: 110, 风: -30, 冰: -22, 雷: -30, 光: 55, 暗: 70 }),
    passiveSummary: '本体减伤 30%｜预震时角鸣蓄能', breakSummary: '中断强化崩震｜本体双攻 -30%（2回合）'
  },
  {
    key: 'gruen_arm', templateCode: 'gruen_rift_arm', name: '格鲁恩·断层重臂', bodyCode: 'gruen_mountainheart',
    hpRatio: .26, physicalDefenseRatio: 1.45, magicDefenseRatio: 1.05, physicalAttackRatio: .45, magicAttackRatio: .2, speedRatio: .78,
    elementResistance: resistance({ 水: -20, 火: 120, 土: 250, 木: 65, 风: -25, 冰: -30, 雷: 105, 光: 35, 暗: 60 }),
    passiveSummary: '本体减伤 30%｜启用断层连段', breakSummary: '本体物攻 -30%｜下次只能普攻'
  },
  {
    key: 'valk_armor', templateCode: 'valk_blackiron_plate', name: '瓦尔克·黑铁炉甲', bodyCode: 'valk_forge_overseer',
    hpRatio: .30, physicalDefenseRatio: 1.9, magicDefenseRatio: 1.45, physicalAttackRatio: .2, magicAttackRatio: .2, speedRatio: .52,
    elementResistance: resistance({ 水: -35, 火: 250, 土: 140, 木: 80, 风: 55, 冰: -30, 雷: 110, 光: 65, 暗: 75 }),
    passiveSummary: '本体减伤 30%｜低炉温时双防+20%', breakSummary: '本体双防 -45%'
  },
  {
    key: 'valk_chain', templateCode: 'valk_soul_chain', name: '瓦尔克·拘魂锁链', bodyCode: 'valk_forge_overseer',
    hpRatio: .19, physicalDefenseRatio: 1.5, magicDefenseRatio: .9, physicalAttackRatio: .35, magicAttackRatio: .2, speedRatio: 1.08,
    elementResistance: resistance({ 水: 45, 火: 200, 土: 120, 木: 75, 风: 25, 冰: -20, 雷: -35, 光: -25, 暗: 30 }),
    passiveSummary: '本体减伤 30%｜熔链处刑倒计时', breakSummary: '取消锁定｜本体攻击 -20%（2回合）'
  },
  {
    key: 'valk_bellows', templateCode: 'valk_redfurnace_bellows', name: '瓦尔克·赤炉风箱', bodyCode: 'valk_forge_overseer',
    hpRatio: .25, physicalDefenseRatio: 1.05, magicDefenseRatio: 1.65, physicalAttackRatio: .2, magicAttackRatio: .3, speedRatio: .82,
    elementResistance: resistance({ 水: -40, 火: 250, 土: 75, 木: 55, 风: -25, 冰: -35, 雷: 70, 光: 45, 暗: 50 }),
    passiveSummary: '本体减伤 30%｜炉温上限 3', breakSummary: '清空炉温｜炉温2时触发爆压反冲'
  }
];

export const regionalBossComponentByTemplateCode = new Map(regionalBossComponentDefinitions.map(definition => [definition.templateCode, definition]));
export const regionalBossComponentsFor = (bodyCode: string) => regionalBossComponentDefinitions.filter(definition => definition.bodyCode === bodyCode);
export const regionalBossComponentByKey = (key: string) => regionalBossComponentDefinitions.find(definition => definition.key === key);
