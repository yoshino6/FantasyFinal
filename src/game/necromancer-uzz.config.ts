export const uzzTemplateCode = 'necromancer_uz';

export const uzzOrdinarySummonCodes = [
  'uzz_skeleton_berserker',
  'uzz_skeleton_archer',
  'uzz_pain_wraith',
  'uzz_skeleton_mage'
] as const;

export const uzzBoneDragonCode = 'uzz_frost_bone_dragon';

export const uzzPhaseTwoTransition = {
  code: 'uzz_phase_two',
  title: '第二阶段·亡者开门',
  description: '乌兹半跪在散落的骸骨之间，法杖顶端的幽火骤然熄灭。下一瞬，地面的碎骨同时悬起，在他身后拼成一扇缓缓张开的白骨之门。门后没有风，只有无数重叠的低语。',
  dialogue: [
    { speaker: '乌兹', text: '你们以为，粉碎几具骸骨，就能越过死亡？' },
    { speaker: '乌兹', text: '活人的灵魂，才是最好的祭品。醒来吧——沉睡在黑暗里的亡者！' }
  ],
  effect: '进入死灵狂潮：骷髅召唤永久替换为死灵召唤；灵魂撕裂与灵魂汲取加入攻击循环。'
};

export const uzzPhaseTwoTransitionLog = () => [
  `$阶段转换·${uzzPhaseTwoTransition.title}$${uzzPhaseTwoTransition.description}`,
  ...uzzPhaseTwoTransition.dialogue.map(line => `$${line.speaker}$“${line.text}”`),
  `➤ ${uzzPhaseTwoTransition.effect}`
].join('\n');

export const uzzPhaseTwoTransitionDue = (phaseTwoLocked: boolean, currentHp: number, maxHp: number) => !phaseTwoLocked && currentHp / Math.max(1, maxHp) < .5;

export const uzzSkills = {
  skeletonCall: 'uzz_skeleton_call',
  necromanticCall: 'uzz_necromantic_call',
  soulBlast: 'uzz_soul_blast',
  darkDecay: 'uzz_dark_decay',
  soulRend: 'uzz_soul_rend',
  soulDrain: 'uzz_soul_drain',
  dominion: 'uzz_undead_dominion',
  deathCoil: 'uzz_death_coil',
  deathGlory: 'uzz_death_glory',
  slash: 'uzz_skeleton_slash',
  fireArrow: 'uzz_skeleton_fire_arrow',
  fearScream: 'uzz_fear_scream',
  wraithBolt: 'uzz_wraith_bolt',
  mageBlast: 'uzz_mage_soul_blast',
  frostBreath: 'uzz_frost_breath',
  frostArmor: 'uzz_frost_armor',
  frostClaw: 'uzz_frost_claw'
} as const;

export const isUzzOrdinarySummonCode = (code: unknown) => uzzOrdinarySummonCodes.includes(String(code) as typeof uzzOrdinarySummonCodes[number]);
export const isUzzBoneDragonCode = (code: unknown) => String(code) === uzzBoneDragonCode;

/** 第 1 槽召唤后，第 8 槽才满足“中间隔 6 槽”。清场发生在第 10 槽后时，第 16 槽恢复。 */
export const uzzNextSummonSlot = (lastSummonSlot: number, lastClearSlot?: number) => Math.max(
  lastSummonSlot > 0 ? lastSummonSlot + 7 : 1,
  lastClearSlot === undefined ? 1 : lastClearSlot + 6
);

export const uzzSummonDue = (currentSlot: number, lastSummonSlot: number, lastClearSlot?: number) => currentSlot >= uzzNextSummonSlot(lastSummonSlot, lastClearSlot);

export const uzzRotationSkill = (phaseTwo: boolean, cursor: number) => {
  const slot = ((Math.max(0, Math.floor(cursor)) % 4) + 1);
  const phaseOne = [uzzSkills.soulBlast, uzzSkills.darkDecay, uzzSkills.soulBlast, uzzSkills.soulBlast];
  const phaseTwoSkills = [uzzSkills.soulRend, uzzSkills.darkDecay, uzzSkills.soulBlast, uzzSkills.soulDrain];
  return { slot, code: (phaseTwo ? phaseTwoSkills : phaseOne)[slot - 1]! };
};

/** 亡灵体质的三个乘区；光属性物理会同时乘物理与光属性倍率。 */
export const uzzUndeadConstitutionMultiplier = (magic: boolean, element: string) => {
  if (magic) return element === '光' ? 1.5 : .5;
  return 1.25 * (element === '光' ? 1.5 : 1);
};

export const uzzDomainMagicMultiplier = (magic: boolean, element: string) => magic && element !== '冰' ? .75 : 1;

export const uzzSpeedFactor = (domainActive: boolean, slowPct = 0, breathSlowPct = 0) => Math.max(.3, 1 - ((domainActive ? 20 : 0) + Math.max(0, slowPct) + Math.max(0, breathSlowPct)) / 100);

/** 灵魂汲取抽取目标当前 MP 的 50%（向下取整）；乌兹 MP 溢出部分按 1:1 转为 HP。 */
export const uzzSoulDrainTransfer = (
  victimCurrentMp: number,
  bossCurrentMp: number,
  bossMaxMp: number,
  bossCurrentHp: number,
  bossMaxHp: number
) => {
  const drained = Math.max(0, Math.floor(victimCurrentMp * .5));
  const restoredMp = Math.min(drained, Math.max(0, Math.floor(bossMaxMp - bossCurrentMp)));
  const overflowMp = drained - restoredMp;
  const restoredHp = Math.min(overflowMp, Math.max(0, Math.floor(bossMaxHp - bossCurrentHp)));
  return {
    drained,
    restoredMp,
    overflowMp,
    restoredHp,
    victimMp: Math.max(0, victimCurrentMp - drained),
    bossMp: Math.min(bossMaxMp, bossCurrentMp + restoredMp),
    bossHp: Math.min(bossMaxHp, bossCurrentHp + restoredHp)
  };
};
