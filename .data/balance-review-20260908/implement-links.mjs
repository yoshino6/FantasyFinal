import fs from 'node:fs';
const dir='.data/balance-review-20260908/implementation-baseline/';
function edit(file, fn) { const raw=fs.readFileSync(file,'utf8'), backup=dir+file; if(!fs.existsSync(backup)){fs.mkdirSync(backup.slice(0,backup.lastIndexOf('/')),{recursive:true});fs.writeFileSync(backup,raw);} fs.writeFileSync(file,fn(raw.replaceAll('\r\n','\n'))); }
edit('src/game/advanced-profession.service.ts',s=>s.replace(`!String(existing[0].traits_json ?? '').includes('"version":2')`,`Number((typeof existing[0].traits_json === 'string' ? JSON.parse(existing[0].traits_json) : existing[0].traits_json as any[]).find((trait: any) => trait.code === 'advanced_mentor_build')?.build?.version ?? 0) < build.version`));
edit('src/game/automaton.service.ts',s=>s.replace('createAutomaton, cultivateAutomaton,','createAutomaton, migrateAutomatonGrowth, cultivateAutomaton,').replace('  const state=craftJson<AutomatonState>(row.state_json);',`  const stored=craftJson<AutomatonState>(row.state_json);
  const state=row.combat_id ? stored : migrateAutomatonGrowth(stored);
  if (state !== stored) await saveAutomaton(connection,row,state);
`));
edit('src/game/companion.service.ts',s=>"import { standardPlayerAttribute } from './growth-rules';\n"+s.replace('100/6+Math.max(0,level-1)*10/6','standardPlayerAttribute(level)'));
for(const file of ['src/game/adventure.service.ts','src/game/npc-sparring.service.ts','src/game/pvp.service.ts']) edit(file,s=>"import { playerGrowthShares } from './growth-rules';\n"+s.replaceAll('Math.max(0, Number(character.level) - 1)',"('npc_code' in character && character.npc_code ? Math.max(0, Number(character.level) - 1) : playerGrowthShares(Number(character.level)))"));
edit('src/response/equipment-detail.ts',s=>"import { armorPieceDescription } from '../game/armor-class';\n"+s.replace("  if (effect.physicalForceCrit)","  const armorText = armorPieceDescription(subtype, String(effect.slot ?? category), quality);\n  if (armorText) effects.unshift('甲类逐件乘算：' + armorText);\n  if (effect.physicalForceCrit)"));
edit('src/game/blacksmith.service.ts',s=>s.replace('  return effect;\n};\n/** 熔铸', '  effect.balanceVersion = 3;\n  return effect;\n};\n/** 熔铸'));
edit('src/database/bootstrap.ts',s=>s.replace("item.level, 2, JSON.stringify(item.effect)","item.level, 2, JSON.stringify({...item.effect, balanceVersion:3})"));
edit('src/database/opening-chests.ts',s=>s.replace('JSON.stringify({[stat]:forgedEquipmentBase', 'JSON.stringify({balanceVersion:3,[stat]:forgedEquipmentBase').replace('JSON.stringify(effect)]);','JSON.stringify({...effect,balanceVersion:3})]);'));
edit('src/game/adventure.service.ts',s=>s.replaceAll('JSON.stringify(item.effect)','JSON.stringify({...item.effect,balanceVersion:3})'));
