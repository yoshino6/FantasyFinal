import fs from 'node:fs';
function edit(file,fn){const raw=fs.readFileSync(file,'utf8'),backup='.data/enemy-balance-20260908/baseline/'+file.split('/').at(-1);if(!fs.existsSync(backup))fs.writeFileSync(backup,raw);fs.writeFileSync(file,fn(raw.replaceAll('\r\n','\n')));}
edit('src/game/adventure.service.ts',s=>{
 s="import { monsterGrowthAllocation, monsterIdentityCode, isResidentMonsterCode } from './monster-growth';\n"+s;
 s=s.replace('const monsterAttributeColumns = `${','const monsterAttributeColumns = `t.code AS growth_template_code,${').replace('const templateMonsterAttributeColumns = `${','const templateMonsterAttributeColumns = `t.code AS growth_template_code,${');
 const a=s.indexOf('  return Object.fromEntries(attributes.map(attribute => {',s.indexOf('export const monsterAttributes')),b=s.indexOf('\n};',a);
 s=s.slice(0,a)+'  return monsterGrowthAllocation(monster, multiplier);'+s.slice(b);
 s=s.replace('virtualEquipmentStats(Number(monster.level), tier, baseStats.physicalAttack, baseStats.magicAttack)','virtualEquipmentStats(Number(monster.level), tier, baseStats.physicalAttack, baseStats.magicAttack, undefined, isResidentMonsterCode(monsterIdentityCode(monster)) ? \'resident\' : \'monster\')');
 // 显式列出的非公共SQL也传递种类身份，避免模板/实物读到不同成长基准。
 s=s.replaceAll('SELECT t.id AS template_id,t.name,t.monster_class','SELECT t.id AS template_id,t.code AS growth_template_code,t.name,t.monster_class');return s;
});
edit('src/game/character.service.ts',s=>{
 s=s.replace("(row.npc_code ? Math.max(0, Number(row.level ?? 1) - 1) : playerGrowthShares(Number(row.level ?? 1)))",'playerGrowthShares(Number(row.level ?? 1))');
 s=s.replace('virtualEquipmentStats(level, tier, stats.physicalAttack, stats.magicAttack)','virtualEquipmentStats(level, tier, stats.physicalAttack, stats.magicAttack, undefined, \'resident\')');
 s=s.replace('return { ...stats, physicalAttack: Math.floor(stats.physicalAttack + virtual.physicalAttack), magicAttack: Math.floor(stats.magicAttack + virtual.magicAttack), physicalDefense: Math.floor(stats.physicalDefense + virtual.physicalDefense), magicDefense: Math.floor(stats.magicDefense + virtual.magicDefense) };','return Object.fromEntries((Object.keys(stats) as Array<keyof DerivedStats>).map(key => [key, Math.floor(stats[key] + virtual[key])])) as DerivedStats;');return s;
});
for(const file of ['src/game/adventure.service.ts','src/game/npc-sparring.service.ts','src/game/pvp.service.ts'])edit(file,s=>s.replaceAll("('npc_code' in character && character.npc_code ? Math.max(0, Number(character.level) - 1) : playerGrowthShares(Number(character.level)))",'playerGrowthShares(Number(character.level))'));
edit('src/game/combat-rule-adapter.ts',s=>s.replace(": (Array.isArray(traits) ? traits.find(trait => trait.code === 'advanced_mentor_build')?.build?.armorSet : undefined)",": profile?.armorSet ?? (Array.isArray(traits) ? traits.find(trait => trait.code === 'advanced_mentor_build')?.build?.armorSet : undefined)"));
