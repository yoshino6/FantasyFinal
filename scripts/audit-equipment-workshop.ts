/** Read-only audit; deliberately bypasses getPool(), which initializes and migrates the live schema. */
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { getDatabaseConfig } from '../src/database/config';
import { verifiedLegacyLayers } from '../src/game/equipment-workshop-rules';
const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v??{};
const connection=await createConnection(getDatabaseConfig());
try{
  await connection.query('START TRANSACTION READ ONLY');
  let cursor=0,verified=0,blocked=0;
  for(;;){
    const [items]=await connection.execute<RowDataPacket[]>(`SELECT ii.id,ii.character_id,ii.item_id,i.code,i.name,i.effect_json AS base_effect,ii.effect_json
      FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id
      WHERE ii.id>? AND EXISTS(SELECT 1 FROM equipment_fusions f WHERE f.instance_id=ii.id) ORDER BY ii.id LIMIT 200`,[cursor]);
    if(!items.length)break;
    for(const item of items){
      const [ledger]=await connection.execute<RowDataPacket[]>('SELECT effect_json FROM equipment_fusions WHERE instance_id=? ORDER BY id',[item.id]);
      const layers=verifiedLegacyLayers(item.code,parse(item.base_effect),parse(item.effect_json??item.base_effect),ledger.map(r=>parse(r.effect_json)));
      if(layers)verified++;else{blocked++;process.stdout.write(JSON.stringify({instanceId:item.id,characterId:item.character_id,itemId:item.item_id,name:item.name,reason:'原定义、现有属性与台账未能共同核实；不得自动补发或清除',definition:parse(item.base_effect),current:parse(item.effect_json),ledger:ledger.map(r=>parse(r.effect_json))})+'\n');}
    }
    cursor=Number(items.at(-1)!.id);
  }
  await connection.rollback();
  process.stdout.write(JSON.stringify({verified,blocked,readOnly:true})+'\n');
}finally{await connection.end();}
