/** 四商店隐藏二转。与世界树导师目录分离，避免泄露私人委托。 */
export type HiddenProfessionCode = 'magical_scholar' | 'weapon_master' | 'inventor' | 'tactician';
/** 四职业共享战斗执行、私有演练与数据库集成验收已接通。 */
export const hiddenProfessionsReleased = true;
/** 首次发现私人委托要求好感3级「莫逆之交」。 */
export const hiddenProfessionDiscoveryAffinity = 500;
export type HiddenSkill = { code: string; name: string; button: string; profession: HiddenProfessionCode; tier: '下位' | '中位'; mana: number; resource: number; cooldown: number; power: number; description: string };
export const hiddenProfessions = [
  { code: 'magical_scholar', name: '魔学者', npc: 'alchemy_sweetshop', mentor: '晴儿', secondary: 'alchemist', resource: '实验值', cap: 35, topic: '后屋的响声', passive: '奇釜实验', inheritance: '善后笔记', role: '十二粒子调配、风险与大成功' },
  { code: 'weapon_master', name: '御器师', npc: 'blacksmith', mentor: '小北', secondary: 'blacksmith', resource: '器鸣', cap: 30, topic: '不肯安静的剑', passive: '百器共鸣', inheritance: '归鞘余响', role: '器阵组合、攻守与多器合击' },
  { code: 'inventor', name: '发明家', npc: 'oddworkshop', mentor: '唯薇安', secondary: 'deconstructor', resource: '灵感', cap: 30, topic: '没完成的机组', passive: '异械主脑', inheritance: '验收合格', role: '异械驱动、供能与能力协同' },
  { code: 'tactician', name: '执奕者', npc: 'bookshop', mentor: '洛文·赫斯特', secondary: 'omniscient', resource: '筹策', cap: 30, topic: '棋盘上的空位', passive: '全局视野', inheritance: '留下一手', role: '公开信息、保护预案与行动次序' }
] as const;
export const hiddenProfession = (code: string) => hiddenProfessions.find(p => p.code === code || p.name === code || p.npc === code);
const skill = (profession: HiddenProfessionCode, suffix: string, name: string, button: string, mana: number, resource: number, cooldown: number, power: number, description: string, tier: HiddenSkill['tier'] = '中位'): HiddenSkill =>
  ({ code: 'hidden_' + suffix, name, button, profession, tier, mana, resource, cooldown, power, description });
export const hiddenSkills: HiddenSkill[] = [
  skill('magical_scholar','mix','粒子调配','调配',90,0,1,100,'选择2～4颗粒子，首颗为主材。按数量、类别、范围计算MP和冷却；失败友伤35%，异常不额外减弱。'),
  skill('magical_scholar','catalyst','双路催化','催化',110,0,2,0,'选择稳定或激发，调整下一次调配或奇釜的结果概率，保留后续2个完整回合。'),
  skill('magical_scholar','neutralize','反应中和','中和',190,0,3,0,'己全体各清除1个本人调配事故异常；没有该异常者获得6%最大生命的护盾2回合。'),
  skill('magical_scholar','kettle','万象奇釜','奇釜',250,100,6,100,'用同一份2～4颗粒子过载调配。MP为对应调配+160，数值×1.25，大成功概率提高。'),
  skill('weapon_master','weapon_strike','离手御击','御击',60,0,1,125,'选择阵内一器125%器具攻击；有效命中+20器鸣，异型御击再+10。','下位'),
  skill('weapon_master','weapon_guard','回环护阵','护阵',150,0,3,0,'友方生命盾=8%最大生命+施法者双防30%，上限20%目标生命；首次吸收敌伤给施法者20器鸣。'),
  skill('weapon_master','weapon_combo','三器合锋','合锋',240,50,4,165,'选择1/2/3器，分别165%/每器110%/每器90%；各段独立结算防御与器性。'),
  skill('weapon_master','weapon_finale','万器归宗','归宗',400,100,6,145,'全敌1/2/3器分别145%/每器95%/每器75%；只触发一次主位器性。'),
  skill('inventor','overclock','异械超频','超频',90,0,2,0,'同一行动内启动1台异械，支付原生成本；伤害/治疗/盾最终×1.20，普通状态×1.10。'),
  skill('inventor','transfer','能源转供','转供',110,0,3,0,'兼容异械付40能量、收30；接收者补足能量后本次立即启动，仍支付完整原生费用。'),
  skill('inventor','synergy','双机协同','协同',220,50,4,100,'同次驱动两台不同异械，分别支付原生成本；伤害/治疗/盾投影90%，遵守能力与次数预算。'),
  skill('inventor','debug','全域调试','调试',300,100,6,0,'至多两台各回30能量、原生CD减2；其中一台本次立即启动，主要数值×1.25。'),
  skill('tactician','mark','落子定势','落子',90,0,1,105,'105%较高攻击直击，标记后续2次主动作直伤+15%，每次至多25%施法者攻击；标记建立+20、首兑+10筹策。','下位'),
  skill('tactician','order','先手调度','调度',150,30,3,0,'下轮友方前移2位或敌方后移2位；提位友方/本人立即获得8%生命盾。不增加行动。'),
  skill('tactician','plan','条件预案','预案',150,0,3,0,'守势：一次敌方主动作直伤减35%；接应：低血受伤前16%生命盾；截断：50%基础打断公开可打断吟唱。'),
  skill('tactician','finale','合围收官','收官',400,100,6,175,'175%较高攻击直击，后续2回合最多2次70%追击；本人可不同回合各兑一次，不递归、不暴击。')
];
export const hiddenSkill = (code: string) => hiddenSkills.find(s => s.code === code);
export const isHiddenSkill = (code: string) => Boolean(hiddenSkill(code));
export const hiddenPassiveCode = (code: string) => 'hidden_passive_' + code;
export const hiddenVersion = 3;
