const wardenCompanionDefinitions = [
    { code: 'owl', skillCode: 'ranger_hunters_mark', name: '雾枭', role: '侦察命中', cooldown: 4, statScale: { hp: .45, physicalAttack: .25, magicAttack: .20, physicalDefense: .35, magicDefense: .35, accuracy: 1.10, evasion: 1.00, crit: .70, speed: .95 } },
    { code: 'squirrel', skillCode: 'ranger_trap_barrage', name: '栗影', role: '迅捷干扰', cooldown: 3, statScale: { hp: .35, physicalAttack: .45, magicAttack: .20, physicalDefense: .25, magicDefense: .25, accuracy: .85, evasion: 1.20, crit: .60, speed: 1.40 } },
    { code: 'snake', skillCode: 'ranger_flanking_shot', name: '青鳞', role: '压制持续', cooldown: 5, statScale: { hp: .55, physicalAttack: .60, magicAttack: .35, physicalDefense: .55, magicDefense: .55, accuracy: .90, evasion: .70, crit: .65, speed: .80 } }
];
const wardenCompanionBySkill = (skillCode) => wardenCompanionDefinitions.find(companion => companion.skillCode === skillCode);
const wardenCompanionByCode = (code) => wardenCompanionDefinitions.find(companion => companion.code === code);
const wardenSpiritCode = (code) => `warden_${code}`;
const isWardenCompanionRow = (spiritCode) => spiritCode.startsWith('warden_');

export { isWardenCompanionRow, wardenCompanionByCode, wardenCompanionBySkill, wardenCompanionDefinitions, wardenSpiritCode };
