import fs from 'node:fs';
function edit(file, fn) { const s=fs.readFileSync(file,'utf8'); const next=fn(s.replaceAll('\r\n','\n')); if(next===s)throw Error('unchanged '+file);fs.writeFileSync(file,next); }
edit('src/game/character.service.ts', s=>{
 s="import { playerGrowthShares } from './growth-rules';\nimport { armorPanelPercent } from './armor-class';\n"+s;
 s=s.replace('Math.max(0, Number(row.level ?? 1) - 1)',"(row.npc_code ? Math.max(0, Number(row.level ?? 1) - 1) : playerGrowthShares(Number(row.level ?? 1)))");
 const a=s.indexOf('const armorClassModifier:'), b=s.indexOf('const withEquipmentStats',a);
 s=s.slice(0,a)+`/** 所有甲类使用同一双防基准；保留详情页的兼容入口。 */
export const armorClassDefenseMultiplier = (_subtype: string | null | undefined, _key: 'physicalDefense' | 'magicDefense') => 1;

`+s.slice(b);
 s=s.replace(", armor: armorClassModifier[String(row.weapon_type ?? '')]",'').replace(', armor: undefined','');
 s=s.replace(" * (key === 'physicalDefense' ? entry.armor?.physicalDefense ?? 1 : key === 'magicDefense' ? entry.armor?.magicDefense ?? 1 : 1)",'');
 s=s.replace('armorSetFromRows(rows)?.panelPercent ?? {}]', 'armorSetFromRows(rows)?.panelPercent ?? {}, armorPanelPercent(rows)]');
 const c=s.indexOf('  const finalMultiplier ='),d=s.indexOf('\n};',c);
 s=s.slice(0,c)+'  return stats;'+s.slice(d);return s;
});
edit('src/game/blacksmith.service.ts',s=>{
 s="import { armorPieceDescription } from './armor-class';\n"+s;
 const a=s.indexOf('const armorClassEffects:'),b=s.indexOf('\n\n',s.indexOf('export const armorClassEffectText',a));
 s=s.slice(0,a)+`export const armorClassEffectText = (subtype: string | null | undefined, slot?: string) => {
  const large = armorPieceDescription(subtype, slot ?? 'upper');
  return large ? '甲类影响：各甲类基础双防相同；' + (slot ? large : '上装/下装每件' + large + '；头肩/腰部/脚部每件' + armorPieceDescription(subtype, 'shoulder')) + '。按品质发挥，逐件乘算。' : '';
};`+s.slice(b);
 s=s.replace("forgedEquipmentBase(level, '防具')", "forgedEquipmentBase(level, '防具', category)");
 s=s.replace("(category: '武器' | '防具', subtype: string, level: number)","(category: string, subtype: string, level: number)");
 s=s.replace('forgedEquipmentCaps(equipmentKind(category, subtype), level, rarity, primaryKeys)','forgedEquipmentCaps(equipmentKind(category, subtype), level, rarity, primaryKeys, category)');
 s=s.replace('armorClassEffectText(session.subtype)','armorClassEffectText(session.subtype, session.equipment_category)');
 return s;
});
edit('src/game/owner-test-equipment.service.ts',s=>s.replace('legendaryTestForgeDraft(entry.forgeCategory, entry.subtype, level)',"legendaryTestForgeDraft(entry.forgeCategory === '防具' ? entry.itemCategory : entry.forgeCategory, entry.subtype, level)"));
edit('src/game/automaton-growth.ts',s=>"import { standardPlayerAttribute } from './growth-rules';\n"+s.replace('(100 + 10 * (level - 1)) / 6','standardPlayerAttribute(level)'));
edit('src/game/combat-rule-registry.ts',s=>s.replace('armorSet?: StrikeCorrections | null','armorSet?: (StrikeCorrections & { damageReductionPct?: number }) | null').replace("let reduction = this.value(target, 'reduction')", "let reduction = Number(target.armorSet?.damageReductionPct ?? 0) + this.value(target, 'reduction')"));
edit('src/database/bootstrap.ts',s=>s.replace("  const armorBase = forgedEquipmentBase(level, '防具');\n",'').replace('effect: { physicalDefense: armorBase, magicDefense: armorBase }',"effect: { physicalDefense: forgedEquipmentBase(level, '防具', slot.code), magicDefense: forgedEquipmentBase(level, '防具', slot.code) }"));
edit('src/database/opening-chests.ts',s=>s.replaceAll("forgedEquipmentBase(1,'防具')","forgedEquipmentBase(1,'防具',slot)"));
edit('src/game/adventure.service.ts',s=>s.replace("  const baseArmor = Math.floor(forgedEquipmentBase(level, '防具'));\n",'').replace('effect: { physicalDefense: baseArmor, magicDefense: baseArmor }',"effect: { physicalDefense: forgedEquipmentBase(level, '防具', slot), magicDefense: forgedEquipmentBase(level, '防具', slot) }"));
edit('src/game/advanced-mentor-trial.config.ts',s=>{
 s=s.replace("import { armorClassDefenseMultiplier, armorClassMobilityModifier } from './character.service';","import { armorPanelPercent, armorSlots } from './armor-class';\nimport { armorSetFromRows, type ArmorSet } from './armor-set';\nimport { playerGrowthShares } from './growth-rules';");
 s=s.replace('version: 2;', 'version: 3;\n  armorSet: ArmorSet | null;').replace('    version: 2,',"    version: 3,\n    armorSet: armorSetFromRows(armorSlots.map(slot => ({slot, weapon_type: profile.armor}))),");
 s=s.replace("forgedEquipmentBase(30, '防具') * primaryMultiplier", "armorSlots.reduce((sum, slot) => sum + forgedEquipmentBase(30, '防具', slot), 0) * primaryMultiplier");
 s=s.replace("armorValue * 5 * armorClassDefenseMultiplier(profile.armor, 'physicalDefense')",'armorValue').replace("armorValue * 5 * armorClassDefenseMultiplier(profile.armor, 'magicDefense')",'armorValue');
 s=s.replace('  const stats = calculatePanelStats(base, result, evolution, [masteryPercent]);',"  const rows = armorSlots.map(slot => ({slot, weapon_type: profile.armor, quality:100}));\n  const stats = calculatePanelStats(base, result, evolution, [masteryPercent, armorPanelPercent(rows), armorSetFromRows(rows)?.panelPercent ?? {}]);");
 s=s.replace(/  for \(const key of \['accuracy', 'evasion', 'speed'\] as const\) stats\[key\] = .*\n/,'');
 return s.replace(' * 29])) as Allocation',' * playerGrowthShares(30)])) as Allocation');
});
