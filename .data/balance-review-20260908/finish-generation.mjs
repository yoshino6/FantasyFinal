import fs from 'node:fs';
function edit(file,fn){const raw=fs.readFileSync(file,'utf8'),backup='.data/balance-review-20260908/implementation-baseline/'+file;if(!fs.existsSync(backup)){fs.mkdirSync(backup.slice(0,backup.lastIndexOf('/')),{recursive:true});fs.writeFileSync(backup,raw);}fs.writeFileSync(file,fn(raw.replaceAll('\r\n','\n')));}
edit('src/game/blacksmith.service.ts',s=>{
 s=s.replace('import { forgedAffixCap,','import { forgedPrimaryStats, forgedAffixCap,');
 const a=s.indexOf('const baseForgeEffect ='),b=s.indexOf('type ForgeMaterialProfile',a);return s.slice(0,a)+'const baseForgeEffect = forgedPrimaryStats;\n'+s.slice(b);
});
edit('src/database/opening.ts',s=>"import { forgedPrimaryStats } from '../game/constants';\n"+s.replace('{ physicalAttack: 3, magicAttack: 3 }',"{...forgedPrimaryStats('武器','法杖',1,'普通'), physicalAttack:3,balanceVersion:3}").replace("{ slot:'上装', physicalDefense: 2, magicDefense: 2 }","{slot:'上装',...forgedPrimaryStats('防具','布甲',1,'普通','上装'),balanceVersion:3}"));
edit('src/database/opening-chests.ts',s=>{
 s=s.replace("import { forgedEquipmentBase }", "import { forgedEquipmentBase, forgedPrimaryStats }");
 s=s.replace('balanceVersion:3,[stat]:forgedEquipmentBase(1,\'武器\')',"...forgedPrimaryStats('武器',type,1,'普通'),balanceVersion:3");
 s=s.replace("{[stat]:Math.floor(forgedEquipmentBase(1,'武器')*2),", "{...forgedPrimaryStats('武器',type,1,'史诗'),").replace("{[stat]:Math.floor(forgedEquipmentBase(1,'武器')*1.5)}", "{...forgedPrimaryStats('武器',type,1,'稀有')}");
 // 两种防具部位的实际值保留小数至面板统一取整。
 s=s.replaceAll("Math.floor(forgedEquipmentBase(1,'防具',slot)*2)","forgedEquipmentBase(1,'防具',slot)*2").replaceAll("Math.floor(forgedEquipmentBase(1,'防具',slot)*1.5)","forgedEquipmentBase(1,'防具',slot)*1.5");return s;
});
