const spiritSummonerPassiveDescription = '每回合额外恢复 2% 魔力；灵位上限从 1 提升至 3。';
const spiritDefinitions = [
    { code: 'ember', skillCode: 'spirit_call_ember', name: '炽羽雀', duration: 4, role: '单体火焰追击', statScale: { hp: .38, physicalAttack: .15, magicAttack: .78, physicalDefense: .25, magicDefense: .42, accuracy: .75, evasion: .88, crit: .75, speed: 1.12 } },
    { code: 'tide', skillCode: 'spirit_call_tide', name: '清泉鹿', duration: 4, role: '治疗最虚弱的同伴', statScale: { hp: .58, physicalAttack: .15, magicAttack: .56, physicalDefense: .45, magicDefense: .62, accuracy: .55, evasion: .52, crit: .25, speed: .82 } },
    { code: 'bark', skillCode: 'spirit_call_bark', name: '苔甲龟', duration: 4, role: '为全队编织护根壁垒', statScale: { hp: .82, physicalAttack: .18, magicAttack: .35, physicalDefense: .92, magicDefense: .80, accuracy: .35, evasion: .18, crit: .12, speed: .48 } },
    { code: 'gale', skillCode: 'spirit_call_gale', name: '逐风貂', duration: 3, role: '风压干扰与群体牵制', statScale: { hp: .36, physicalAttack: .32, magicAttack: .50, physicalDefense: .25, magicDefense: .36, accuracy: .92, evasion: 1.05, crit: .52, speed: 1.28 } },
    { code: 'moon', skillCode: 'spirit_call_moon', name: '弯月猫', duration: 3, role: '回流魔力并削弱目标', statScale: { hp: .42, physicalAttack: .22, magicAttack: .68, physicalDefense: .30, magicDefense: .55, accuracy: .82, evasion: .95, crit: .68, speed: 1.05 } }
];
const spiritDefinitionBySkill = (skillCode) => spiritDefinitions.find(spirit => spirit.skillCode === skillCode);
const spiritSummonerActiveSkillCodes = spiritDefinitions.map(spirit => spirit.skillCode);

export { spiritDefinitionBySkill, spiritDefinitions, spiritSummonerActiveSkillCodes, spiritSummonerPassiveDescription };
