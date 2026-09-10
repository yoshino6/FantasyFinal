import fs from 'node:fs';
function edit(file,fn){const raw=fs.readFileSync(file,'utf8'),backup='.data/enemy-balance-20260908/baseline/'+file.split('/').at(-1);if(!fs.existsSync(backup))fs.writeFileSync(backup,raw);fs.writeFileSync(file,fn(raw.replaceAll('\r\n','\n')));}
edit('src/game/dungeon.service.ts',s=>{
 s=s.replace("import { calculateDerivedStats, virtualEquipmentStats } from './constants';","import { monsterCombatStats } from './adventure.service';\ntype DungeonMonsterTemplate = RowDataPacket & Parameters<typeof monsterCombatStats>[0] & {id:number;code:string;skill_sequence:unknown};");
 const a=s.indexOf('// 地下三层的乌兹'),b=s.indexOf('const dungeonSmallMonsterPlan',a);s=s.slice(0,a)+s.slice(b);
 s=s.replace(/connection.execute<\(RowDataPacket & \{ id: number; code: string; (?:level: number; )?constitution: number;[^\n]*?\}\)\[\]>/g,'connection.execute<DungeonMonsterTemplate[]>');
 s=s.replace(/SELECT id,code,(?:level,)?constitution,spirit,strength,intelligence,agility,perception,(?:constitution_growth,spirit_growth,strength_growth,intelligence_growth,agility_growth,perception_growth,)?skill_sequence FROM monster_templates/g,'SELECT * FROM monster_templates');
 s=s.replaceAll('Math.max(100, Math.floor((Number(template.constitution) * 42 + level * 70) * 1.2))','monsterCombatStats({...template,level}).hpMax');
 s=s.replace("code === 'necromancer_uz' ? level32DungeonBossHp(boss, trait) : Math.max(900, Math.floor((Number(boss.constitution) * 60 + Number(boss.level) * 120) * 4))",'monsterCombatStats({...boss,traits_json:[trait]}).hpMax');return s;
});
edit('src/game/main-quest.service.ts',s=>{
 s=s.replace("import { calculateDerivedStats, experienceRequiredForLevel } from './constants';","import { experienceRequiredForLevel } from './constants';\nimport { monsterCombatStats } from './adventure.service';");
 s=s.replace("import { attributes, type Allocation } from './types';","import type { Allocation } from './types';");
 const a=s.indexOf('const monsterHp ='),b=s.indexOf('\n\n',a);return s.slice(0,a)+`const monsterHp = (template: QuestMonsterTemplate, level: number, bossCore: boolean) => monsterCombatStats({...template,level,traits_json:bossCore?[{code:'main_quest_evolution',name:'剧情首领'}]:[]}).hpMax;`+s.slice(b);
});
