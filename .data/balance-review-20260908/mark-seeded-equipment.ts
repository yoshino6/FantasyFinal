import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createConnection} from 'mysql2/promise';
import {balanceRecord,equipmentBalancePreview} from '../../src/game/equipment-balance';
const cfg=createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8')),db=cfg.FantasyFinal?.database??cfg.mysql;
const c=await createConnection({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database});
try{
  await c.beginTransaction();
  const [rows]=await c.query<any[]>("SELECT id,code,item_category,weapon_type,rarity,required_level,effect_json FROM item_definitions WHERE code LIKE 'dawn_%' OR code LIKE 'opening_rare_%' OR code LIKE 'crimson_%' FOR UPDATE");
  const changed=[];
  for(const row of rows){const plan=equipmentBalancePreview(row),original=balanceRecord(row.effect_json);if(!plan.changed)continue;for(const key of new Set([...Object.keys(original),...Object.keys(plan.effect)])){if(key!=='balanceVersion'&&JSON.stringify(original[key])!==JSON.stringify(plan.effect[key]))throw new Error(`非标记字段发生变化 ${row.id}/${key}`);}await c.execute('UPDATE item_definitions SET effect_json=? WHERE id=?',[JSON.stringify(plan.effect),row.id]);changed.push(row);}
  writeFileSync('.data/balance-review-20260908/seed-marker-backup.json',JSON.stringify(changed,null,2));
  await c.query("UPDATE item_definitions SET effect_json=JSON_REMOVE(effect_json,'$.balanceVersion') WHERE code IN ('opening_golden_chest','opening_medical_coupon','opening_trade_coupon')");
  await c.commit();console.log(JSON.stringify({marked:changed.length,numericChanges:0}));
}catch(e){await c.rollback();throw e;}finally{await c.end();}
