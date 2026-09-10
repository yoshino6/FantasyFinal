import fs from 'node:fs';
function edit(file,fn){const raw=fs.readFileSync(file,'utf8'),backup='.data/balance-review-20260908/implementation-baseline/'+file;if(!fs.existsSync(backup)){fs.mkdirSync(backup.slice(0,backup.lastIndexOf('/')),{recursive:true});fs.writeFileSync(backup,raw);}fs.writeFileSync(file,fn(raw.replaceAll('\r\n','\n')));}
edit('test/armor-set.integration.test.ts',s=>{
 s="import { armorPanelPercent } from '../src/game/armor-class';\nimport { panelPercentKeys } from '../src/game/panel-stat-formula';\n"+s;
 s=s.replace('count===5?1.2:count===3?1.1:1','count===5?1.25:count===3?1.12:1').replace("const panel=await wear('轻甲',count),ratio=count===5?1.05:1.03;","const panel=await wear('轻甲',count),ratio=count===5?1.15:1.08;\n      const armor=armorPanelPercent(slots.slice(0,count).map(slot=>({slot,weapon_type:'轻甲',quality:100})));");
 s=s.replace("['accuracy','evasion','speed'].includes(key)?1+count*characterService.armorClassMobilityModifier('轻甲',key)/100:1","1+Number(armor[panelPercentKeys[key as keyof typeof panelPercentKeys]]??0)/100").replace('*ratio*mobility',"*(['hpMax','mpMax'].includes(key)?ratio:1)*mobility").replaceAll('CorrectionPct,33','CorrectionPct,12').replace('rendered,/33%/','rendered,/12%/');return s;
});
edit('src/game/character.service.ts',s=>{
 s=s.replace("import { playerGrowthShares }", "import { playerGrowthShares, STAT_BALANCE_VERSION }");
 const before="  await connection.execute('UPDATE characters SET hp_max=?,mp_max=?,current_hp=LEAST(current_hp,?),current_mp=LEAST(current_mp,?),";
 s=s.replace(before,`  const migrating = Number(character.stat_formula_version ?? 2) < STAT_BALANCE_VERSION;
  const vital = (current: unknown, previousMax: unknown, maximum: number) => migrating
    ? Number(current) <= 0 ? 0 : Math.min(maximum, Math.max(1, Math.floor(Number(current) / Math.max(1, Number(previousMax)) * maximum)))
    : Math.min(Number(current), maximum);
  const hp = vital(character.current_hp, character.hp_max, stats.hpMax), mp = vital(character.current_mp, character.mp_max, stats.mpMax);
  await connection.execute('UPDATE characters SET stat_formula_version=3,hp_max=?,mp_max=?,current_hp=?,current_mp=?,`);
 s=s.replace('[stats.hpMax, stats.mpMax, stats.hpMax, stats.mpMax, stats.physicalAttack','[stats.hpMax, stats.mpMax, hp, mp, stats.physicalAttack');
 // 新创建角色直接标记新版，穿卸装备不会触发一次性比例迁移。
 s=s.replace('INSERT INTO characters (player_id, name,','INSERT INTO characters (stat_formula_version, player_id, name,').replace("pos_z) VALUES (?, ?, ?, ?,", "pos_z) VALUES (3, ?, ?, ?, ?,");return s;
});
edit('src/game/advanced-profession.service.ts',s=>{
 s=s.replace("if (existing[0]) {\n    if (Number(","if (existing[0]) {\n    const [active] = await connection.execute<RowDataPacket[]>(\"SELECT 1 FROM combat_targets ct JOIN combat_sessions cs ON cs.id=ct.session_id WHERE ct.spawn_id=? AND cs.state='active' LIMIT 1\", [existing[0].id]);\n    if (active.length) throw new Error('导师正在战斗，请先结束当前试炼。');\n    if (Number(");return s;
});
