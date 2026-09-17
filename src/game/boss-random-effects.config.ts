export type BossRandomEffectTrait = {
  code: 'boss_random_effect'; name: ''; version: 1; common: string[]; exclusive: string[];
};

export type BossRandomEffectDefinition = { code: string; name: string; summary: string };

export const bossCommonEffects: BossRandomEffectDefinition[] = [
  { code: 'blood_tide_recovery', name: '血潮归元', summary: '直击造成的实际生命伤害按35%回复生命（受禁疗与降疗影响）' },
  { code: 'thorn_armor_retribution', name: '荆甲反噬', summary: '受到近程直击后反射35%实际生命伤害' },
  { code: 'all_methods_calamity', name: '万法同劫', summary: '敌方单体技能改为全体，新增群攻使用原技能65%的直接威力；原生群攻不重复折算' },
  { code: 'ever_braver', name: '愈战愈勇', summary: '每次实际行动后伤害+5%，最多10层' },
  { code: 'desperate_hunt', name: '绝境猎杀', summary: '对生命低于35%的目标造成直击伤害+100%' },
  { code: 'endless_mana_spring', name: '魔泉不涸', summary: '每次实际行动开始回复10%最大魔力' },
  { code: 'mountain_guard', name: '重峦护体', summary: '每回合首次受到的直击伤害降低60%' },
  { code: 'steadfast_soul', name: '定魂守魄', summary: '玩家对其施加控制的最终成功率减半' },
  { code: 'setting_sun_return', name: '残阳返照', summary: '首次降至20%生命以下回复30%最大生命（受禁疗与降疗影响）' },
  { code: 'wrath_counter', name: '怒意回锋', summary: '每受1次暴击积1层怒意（最多3层），下次直击每层伤害+20%' }
];

const exclusive = (code: string, name: string, summary: string): BossRandomEffectDefinition => ({ code, name, summary });
export const bossExclusiveEffects: Record<string, BossRandomEffectDefinition[]> = {
  rootcrown_ram: [exclusive('root_treads_court','根脉践庭','冲锋留根印，荆棘爆发伤害+80%并有60%束缚'), exclusive('royal_horn_counter','王角回刺','反击成功获得20%最大生命护盾并强化、加速下次冲锋')],
  forest_slime: [exclusive('forest_gel_proliferation','森胶增殖','75%/50%/25%生命各增殖1只子体，子体存活提高本体减伤'), exclusive('acid_dew_growth','酸露滋生','酸液喷射同时削弱双防与受疗，并按染酸人数自疗')],
  black_slime: [exclusive('gloom_prison','幽幕凝牢','束缚目标无法闪避黑潮且承伤翻倍'), exclusive('dark_gel_reflux','黯胶回流','再生持续与治疗翻倍，期间减伤25%并额外汲取直击伤害')],
  dawntide_crocodile: [exclusive('hidden_tide_hunt','潜潮伏杀','雾袭后大幅闪避，下一次撕咬或绞杀命中与伤害强化'), exclusive('crocodile_throat_lock','鳄吻锁喉','绞杀施加80%禁疗并使后续单体伤害提高60%')],
  shadow_wolf_king: [exclusive('moonlit_pack_hunt','月下群狩','召唤4只影狼；影狼死亡永久强化狼王，最多8层'), exclusive('eclipsed_moon_curse','蚀月影咒','暗影诅咒强化回复并补满4狼，影狼短期大幅强化')],
  shattertide_crab: [exclusive('twin_claw_kill','双螯夹杀','重击留破绽，横扫无视40%防御且伤害+100%'), exclusive('tide_shell_rebound','潮壳震返','反击后获得15%最大生命护盾并震伤其他所有玩家')],
  skeleton_general: [exclusive('nether_banner_command','冥旗号令','号令使后续3次核心攻击伤害+70%、命中+30%'), exclusive('bone_formation','骨阵森严','75%/50%/25%生命各重建一次完整骨障，障存期间控制率再减半')],
  death_knight: [exclusive('iron_cavalry_soul','铁骑踏魂','冲锋留印，骑枪无视50%防御且伤害+120%'), exclusive('nether_armor_immortality','冥甲长生','护障与再生翻倍并延长；破障后立刻刷新、强化连招')],
  goblin_king: [exclusive('royal_court_reconquest','王庭再征','援军提升为雷矛侍卫与王庭盾卫各2名，征召间隔10回合缩短至6回合'), exclusive('royal_beast_blood_pact','王兽血盟','一名核心倒下时幸存核心治疗30%，并永久获得攻命速与控制抗性各+45%')],
  gruen_mountainheart: [exclusive('mountainheart_resonance','山心共振','地脉压力60以上时直击伤害额外提高50%，并无视25%防御'), exclusive('leyline_recast','地脉复铸','首次逆脉卸力后获得20%最大生命护盾，持续2回合，每场一次')],
  valk_forge_overseer: [exclusive('everburning_embers','永燃余烬','封炉清算后炉温重置为75，并施加5%灼烧3回合；停炉仍可取消清算'), exclusive('soul_chain_forging','拘魂连锻','抽检后其余仍有鞭痕的违令者额外受到4%最大生命机制伤害')],
  threehead_mother: [exclusive('three_calamities','三灾并生','持续伤害上限提升至10层，首领技周期性延长并立即结算'), exclusive('serpent_molt_heads','蛇蜕续首','前两颗倒下的头颅各可延迟复生一次，击倒其他头可打断')],
  necromancer_uz: [exclusive('fourfold_dead_tide','亡潮四起','一次召唤4只亡灵，获得护盾与3层狂乱'), exclusive('nether_dragon_return','冥龙再临','死荣咏唱缩短至1回合并可重试，骨龙带盾且领域效果翻倍')],
  fallingstar_mudid: [exclusive('star_mud_reform','星泥复塑','80%/60%/40%/20%生命各获得20%护盾并净化1项普通减益'), exclusive('meteor_light_pull','陨光牵引','奥术枷锁留印，后续法术无视40%魔防、伤害+80%并群体溅射')],
  frostking_whiteantler: [exclusive('eternal_frost_realm','霜疆永冻','冰缚持续与效果翻倍；提前净化会留下霜印'), exclusive('white_antler_snow_tread','白角踏雪','冲锋对受寒目标无视50%防御、伤害+120%，并刷新强化横扫')],
  askr_stormroc: [exclusive('wind_thunder_chorus','风雷合鸣','风刃留印，雷枪无视50%魔防、伤害+100%并大幅强化眩晕'), exclusive('sky_rending_wings','裂空振翼','每2次实际行动追加横扫：直接威力65%，并叠加速度')],
  seles_eclipse_watcher: [exclusive('sun_moon_rotation','日月轮转','日月交替施法时无视50%魔防、伤害+100%并获得护盾'), exclusive('eclipse_twin_lock','蚀锁双生','枷锁3名低血目标并提高其光暗奥承伤，命中会加速反击')]
};

const difficultySlots: Record<string, { common: number; exclusive: number }> = {
  infernal: { common: 1, exclusive: 0 }, abyssal: { common: 1, exclusive: 0 },
  crimson: { common: 1, exclusive: 1 }, corrupted: { common: 1, exclusive: 1 }, holy: { common: 1, exclusive: 1 },
  golden: { common: 1, exclusive: 2 }, brilliant: { common: 1, exclusive: 2 }, dreamlike: { common: 1, exclusive: 2 }
};
const pick = <T>(items: T[], count: number, random: () => number) => {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) { const selected = Math.floor(random() * (index + 1)); [pool[index], pool[selected]] = [pool[selected]!, pool[index]!]; }
  return pool.slice(0, count);
};
export const bossRandomEffectTrait = (bossCode: string, difficultyCode: string, random: () => number = Math.random): BossRandomEffectTrait | undefined => {
  const slots = difficultySlots[difficultyCode]; if (!slots) return undefined;
  const exclusives = bossExclusiveEffects[bossCode] ?? [];
  return { code: 'boss_random_effect', name: '', version: 1, common: pick(bossCommonEffects, slots.common, random).map(item => item.code), exclusive: pick(exclusives, slots.exclusive, random).map(item => item.code) };
};
export const readBossRandomEffect = (traits: unknown): BossRandomEffectTrait | undefined => {
  let values: unknown[] = [];
  if (Array.isArray(traits)) values = traits; else if (typeof traits === 'string') { try { const parsed = JSON.parse(traits); values = Array.isArray(parsed) ? parsed : []; } catch {} }
  const value = values.find(item => item && typeof item === 'object' && (item as { code?: string }).code === 'boss_random_effect') as Partial<BossRandomEffectTrait> | undefined;
  return value ? { code: 'boss_random_effect', name: '', version: 1, common: Array.isArray(value.common) ? value.common.map(String) : [], exclusive: Array.isArray(value.exclusive) ? value.exclusive.map(String) : [] } : undefined;
};
export const bossRandomEffectDefinitions = (trait?: BossRandomEffectTrait) => {
  if (!trait) return [];
  const allExclusive = Object.values(bossExclusiveEffects).flat();
  return [...trait.common.map(code => bossCommonEffects.find(item => item.code === code)), ...trait.exclusive.map(code => allExclusive.find(item => item.code === code))].filter((item): item is BossRandomEffectDefinition => Boolean(item));
};
export const hasBossRandomEffect = (traits: unknown, code: string) => {
  const trait = readBossRandomEffect(traits); return Boolean(trait && (trait.common.includes(code) || trait.exclusive.includes(code)));
};
