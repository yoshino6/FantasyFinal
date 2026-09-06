import type { RowDataPacket,PoolConnection } from 'mysql2/promise';
import { getPool,withTransaction } from '../database/pool';
import { craftCharacterId } from './alchemy-journal.service';
const outsideBattle=async(connection:PoolConnection,id:number)=>{
  const[rows]=await connection.execute<RowDataPacket[]>("SELECT 1 FROM combat_members m JOIN combat_sessions s ON s.id=m.session_id WHERE m.character_id=? AND s.state='active' UNION ALL SELECT 1 FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1",[id,id,id]);
  const[characters]=await connection.execute<RowDataPacket[]>('SELECT current_hp FROM characters WHERE id=?',[id]);
  if(rows.length||Number(characters[0]?.current_hp??0)<=0)throw new Error('战斗或死亡状态无法修理装备。');
};
export const damagedEquipment=async(user:string)=>{const pool=await getPool();const id=await craftCharacterId(pool,user);const[rows]=await pool.execute<RowDataPacket[]>('SELECT ii.id,i.name,ii.durability,ii.durability_max FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND ii.durability<ii.durability_max ORDER BY ii.id LIMIT 20',[id]);return rows;};
export const useForgeRepairKit=async(user:string,instanceId:number)=>withTransaction(async connection=>{
  const id=await craftCharacterId(connection,user,true);await outsideBattle(connection,id);
  const[items]=await connection.execute<RowDataPacket[]>('SELECT ii.*,i.name FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE ii.character_id=? AND ii.id=? FOR UPDATE',[id,instanceId]);const item=items[0];
  if(!item)throw new Error('未找到你的这件装备。');if(Number(item.durability)>=Number(item.durability_max))throw new Error('装备耐久已满，未消耗维修包。');
  const[kits]=await connection.execute<RowDataPacket[]>("SELECT pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='forge_repair_kit' AND pi.quantity>0 FOR UPDATE",[id]);if(!kits[0])throw new Error('需要锻造维修包×1，可在铁匠铺购买成品或由锻造师制作。');
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=?',[id,kits[0].item_id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0',[id]);
  await connection.execute('UPDATE player_item_instances SET durability=durability_max WHERE id=? AND character_id=?',[instanceId,id]);return String(item.name);
});
export const craftForgeRepairKit=async(user:string)=>withTransaction(async connection=>{
  const id=await craftCharacterId(connection,user,true);await outsideBattle(connection,id);
  const[characters]=await connection.execute<RowDataPacket[]>('SELECT secondary_profession_code FROM characters WHERE id=?',[id]);if(characters[0]?.secondary_profession_code!=='blacksmith')throw new Error('制作维修包需要个人锻造师资格。');
  for(const[code,quantity]of [['living_wood',1],['metal_element_dust',3]] as const){
    const[rows]=await connection.execute<RowDataPacket[]>('SELECT pi.item_id,pi.quantity,i.name FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code=? FOR UPDATE',[id,code]);if(!rows[0]||Number(rows[0].quantity)<quantity)throw new Error('材料不足：需要活木×1、金元素微尘×3。');
    await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?',[quantity,id,rows[0].item_id]);
  }
  const[paid]=await connection.execute<any>('UPDATE characters SET copper_coins=copper_coins-10 WHERE id=? AND copper_coins>=10',[id]);if(!paid.affectedRows)throw new Error('需要制作费10铜币。');
  const[definitions]=await connection.execute<RowDataPacket[]>("SELECT id FROM item_definitions WHERE code='forge_repair_kit'");if(!definitions[0])throw new Error('维修包尚未初始化。');
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1',[id,definitions[0].id]);await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0',[id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)',[id,definitions[0].id]);
});
