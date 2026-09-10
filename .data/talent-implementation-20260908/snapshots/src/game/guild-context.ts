import type { RowDataPacket } from 'mysql2/promise';
import { openingHubs, type OpeningHubCode } from './opening-world.config';
import { assertOpeningFree, type OpeningConnection } from './opening-state';
import { getPool } from '../database/pool';

export const guildContextFor=async(connection:OpeningConnection,characterId:number)=>{
  const codes=Object.values(openingHubs).map(h=>h.guild);
  const[rows]=await connection.execute<RowDataPacket[]>(`SELECT r.code AS region_code,n.code AS building_code,n.pos_x,n.pos_y,n.pos_z,c.activity_status,c.npc_code
    FROM characters c JOIN map_regions r ON r.id=c.current_region_id JOIN map_npcs n ON n.region_id=r.id
    WHERE c.id=? AND r.is_enabled=1 AND r.is_owner_only=0 AND n.code IN (${codes.map(()=>'?').join(',')})
    AND n.pos_x=c.pos_x AND n.pos_y=c.pos_y AND n.pos_z=c.pos_z LIMIT 1`,[characterId,...codes]);
  const row=rows[0];if(!row||!openingHubs[String(row.region_code) as OpeningHubCode])throw new Error('请先到当地冒险者公会入口，可发送 /公会 查看方向。');
  return{code:String(row.region_code) as OpeningHubCode,hub:openingHubs[String(row.region_code) as OpeningHubCode],row};
};
export const requireGuildService=async(connection:OpeningConnection,characterId:number)=>{
  await assertOpeningFree(connection,characterId);const context=await guildContextFor(connection,characterId);
  if(context.row.activity_status!=='active')throw new Error('请先恢复行动状态，再办理公会业务。');
  const[busy]=await connection.execute<RowDataPacket[]>(`SELECT '战斗' AS kind FROM combat_sessions s JOIN combat_members m ON m.session_id=s.id WHERE s.state='active' AND m.character_id=?
    UNION ALL SELECT '切磋' FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?)
    UNION ALL SELECT '交涉' FROM negotiation_participants p JOIN negotiation_sessions n ON n.id=p.session_id WHERE p.character_id=? AND n.state='active'
    UNION ALL SELECT '移动' FROM player_travels WHERE character_id=? LIMIT 1`,[characterId,characterId,characterId,characterId,characterId]);
  if(busy.length)throw new Error('请先结束当前战斗或交涉。');
  if(context.code!=='baina_town'){
    const[visits]=await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_opening_visits WHERE character_id=? AND building_code=?',[characterId,context.hub.guild]);
    if(!visits.length)throw new Error('你还站在公会门外，请先进入公会。');
  }
  return context;
};
export const requireCurrentGuild=async(user:string)=>{
  const pool=await getPool();const[rows]=await pool.execute<RowDataPacket[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=?',[user]);
  if(!rows[0])throw new Error('请先注册角色。');return requireGuildService(pool,Number(rows[0].id));
};
