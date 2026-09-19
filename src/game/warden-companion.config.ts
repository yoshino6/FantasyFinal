/**
 * 林巡的林伴体系：三只林伴是战场实体，继承林巡属性但不独立行动。
 * 林伴没有持续回合限制，倒地离场后进入冷却；常规单体攻击不点名林伴，
 * 只有 BOSS 仇恨点名与群体攻击会命中林伴。林伴记录复用 combat_spirits 表，
 * 以 spirit_code 前缀 warden_ 与唤灵师的灵契区分。
 */
export type WardenCompanionDefinition = {
  code: string;
  skillCode: string;
  name: string;
  role: string;
  cooldown: number;
  statScale: { hp: number; physicalAttack: number; magicAttack: number; physicalDefense: number; magicDefense: number; accuracy: number; evasion: number; crit: number; speed: number };
};

export const wardenCompanionDefinitions: WardenCompanionDefinition[] = [
  { code: 'owl', skillCode: 'ranger_hunters_mark', name: '雾枭', role: '侦察命中', cooldown: 4, statScale: { hp: .45, physicalAttack: .25, magicAttack: .20, physicalDefense: .35, magicDefense: .35, accuracy: 1.10, evasion: 1.00, crit: .70, speed: .95 } },
  { code: 'squirrel', skillCode: 'ranger_trap_barrage', name: '栗影', role: '迅捷干扰', cooldown: 3, statScale: { hp: .35, physicalAttack: .45, magicAttack: .20, physicalDefense: .25, magicDefense: .25, accuracy: .85, evasion: 1.20, crit: .60, speed: 1.40 } },
  { code: 'snake', skillCode: 'ranger_flanking_shot', name: '青鳞', role: '压制持续', cooldown: 5, statScale: { hp: .55, physicalAttack: .60, magicAttack: .35, physicalDefense: .55, magicDefense: .55, accuracy: .90, evasion: .70, crit: .65, speed: .80 } }
];

export const wardenCompanionBySkill = (skillCode: string) => wardenCompanionDefinitions.find(companion => companion.skillCode === skillCode);
export const wardenCompanionByCode = (code: string) => wardenCompanionDefinitions.find(companion => companion.code === code);

/** 林伴统一沿用 combat_spirits 表，用 spirit_code 前缀区分来源。 */
export const wardenSpiritCode = (code: string) => `warden_${code}`;
export const isWardenCompanionRow = (spiritCode: string) => spiritCode.startsWith('warden_');
