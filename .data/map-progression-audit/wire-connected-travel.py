from pathlib import Path
p=Path('src/game/adventure.service.ts');s=p.read_text(encoding='utf-8')
def replace(a,b):
 global s
 assert a in s,a[:90]
 s=s.replace(a,b,1)
replace("import { assertMappedTravelRoute } from './mapped-travel-route';", "import { planConnectedTravel, saveTravelConfirmation, parseTravelPlan, travelPlanSignature, executeTravelTransfers } from './connected-travel.service';")
replace('const ensureForestGuideFreeAction =','export const ensureForestGuideFreeAction =')
replace("const moveToPosition = async (connection: PoolConnection, qqUserId: string, x: number, y: number, restrictToPerception: boolean, speedLimit?: number, destinationRegionId?: number, allowRestingArrival = false) => {\n  const character = await characterFor(qqUserId);", "const moveToPosition = async (connection: PoolConnection, qqUserId: string, x: number, y: number, restrictToPerception: boolean, speedLimit?: number, destinationRegionId?: number, allowRestingArrival = false) => {\n  const character = await characterFor(qqUserId, connection);")
replace("options: { destinationKind?: 'normal' | 'home'; destinationRegionId?: number } = {}", "options: { destinationKind?: 'normal' | 'home'; destinationRegionId?: number; confirmationToken?: string } = {}")
replace("const character = await characterFor(qqUserId); if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。'); await assertNoNegotiation(connection, Number(character.id)); const distance = Math.abs(x - Number(character.pos_x)) + Math.abs(y - Number(character.pos_y));\n    if (z !== Number(character.pos_z)) throw new Error('目标与当前位置不在同一高度，无法直接前往；请使用可通行的入口或传送方式。');", "const character = await characterFor(qqUserId, connection); if (await isInHome(connection, Number(character.id))) throw new Error('你正在自己的家园中，请先使用“/家园 出门”。'); await assertNoNegotiation(connection, Number(character.id));")
replace("await assertMappedTravelRoute(connection,Number(character.id),partyRows[0]?Number(partyRows[0].party_id):undefined,\n      {x:Number(character.pos_x),y:Number(character.pos_y),z:Number(character.pos_z)}, {x,y,z},Number(region.id));", """const plan = await planConnectedTravel(connection, Number(character.id),
      {x:Number(character.pos_x),y:Number(character.pos_y),z:Number(character.pos_z),regionId:Number(character.current_region_id)},
      {x,y,z,regionId:Number(region.id)}, partyRows[0]?Number(partyRows[0].party_id):undefined);
    plan.destinationKind = options.destinationKind ?? 'normal';
    const transfer = plan.legs.some(leg => leg.kind !== 'walk');
    const distance = plan.legs.reduce((sum,leg)=>sum+leg.distance,0);""")
replace('if (sameRegion && distance <= carry.movementSpeed)', 'if (!transfer && sameRegion && distance <= carry.movementSpeed)')
replace("const seconds = Math.max(1, Math.ceil(distance / carry.movementSpeed * await talentMovementFactor(connection,character,{x,y,z,regionId:Number(region.id)})));", """for (const leg of plan.legs) leg.seconds = leg.kind === 'portal' ? 1 : Math.ceil(leg.distance / carry.movementSpeed * (leg.kind === 'walk' ? await talentMovementFactor(connection,character,leg.to) : 1));
    const seconds = Math.max(1, plan.legs.reduce((sum,leg)=>sum+(leg.seconds??0),0));
    plan.seconds = seconds;
    if (transfer) {
      if (!options.confirmationToken) return saveTravelConfirmation(connection, Number(character.id), plan);
      const [confirmations] = await connection.execute<RowDataPacket[]>("SELECT plan_json FROM player_travel_routes WHERE character_id=? AND token=? AND state='pending' AND expires_at>NOW() FOR UPDATE", [character.id,options.confirmationToken]);
      if (!confirmations[0]) throw new Error('这条行动确认已失效，请重新发送前往。');
      if (travelPlanSignature(parseTravelPlan(confirmations[0].plan_json)) !== travelPlanSignature(plan) || parseTravelPlan(confirmations[0].plan_json).seconds !== seconds) return saveTravelConfirmation(connection,Number(character.id),plan);
    }
    await connection.execute("INSERT INTO player_travel_routes(character_id,token,state,plan_json,expires_at) VALUES (?,?,'active',?,DATE_ADD(NOW(),INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE token=VALUES(token),state='active',plan_json=VALUES(plan_json),expires_at=VALUES(expires_at)", [character.id,randomUUID(),JSON.stringify(plan)]);""")
# Region maps can have an elevated layer; validWorldSitePoint must use that layer.
replace("if (Number(character.pos_z) !== 0) throw new Error('请先返回地表，再前往区域地图。');", "const [layers] = await pool.execute<RowDataPacket[]>('SELECT min_z FROM map_regions WHERE id=?', [map.region_id]);\n  const targetZ = Number(layers[0]?.min_z ?? 0);")
replace("const { x, y } = validWorldSitePoint(areas, Number(map.region_id), { x: Number(character.pos_x), y: Number(character.pos_y), z: 0 });\n  return moveTo(qqUserId, x, y, 0);", "const { x, y } = validWorldSitePoint(areas, Number(map.region_id), { x: Number(character.pos_x), y: Number(character.pos_y), z: targetZ });\n  return moveTo(qqUserId, x, y, targetZ);")
# Complete only after rechecking the persisted plan; existing pre-update travels retain original handling.
needle="""    await connection.execute('DELETE FROM player_travels WHERE character_id=?', [character.id]);
    const result = await moveToPosition(connection, qqUserId, targetX, targetY, false, undefined, Number(travel.region_id), true);"""
replace(needle,"""    await connection.execute('DELETE FROM player_travels WHERE character_id=?', [character.id]);
    const [savedRoutes] = await connection.execute<RowDataPacket[]>("SELECT plan_json FROM player_travel_routes WHERE character_id=? AND state='active' FOR UPDATE", [character.id]);
    if (savedRoutes[0] && travel.activity_type === 'move') {
      const saved = parseTravelPlan(savedRoutes[0].plan_json);
      try {
        const [party] = await connection.execute<RowDataPacket[]>('SELECT party_id FROM party_members WHERE character_id=? LIMIT 1', [character.id]);
        const current = await planConnectedTravel(connection,Number(character.id),{regionId:Number(character.current_region_id),x:Number(character.pos_x),y:Number(character.pos_y),z:Number(character.pos_z)},saved.target,party[0]?Number(party[0].party_id):undefined);
        current.destinationKind = saved.destinationKind;
        if (travelPlanSignature(saved) !== travelPlanSignature(current)) throw new Error('起点、队伍或通行路线已经改变。');
      } catch (error) {
        await connection.execute('DELETE FROM player_travel_routes WHERE character_id=?', [character.id]);
        return {kind:'route_cancelled' as const,character,text:`本次前往已停止，仍留在出发点。${error instanceof Error?error.message:'请重新规划路线。'}`,arrivalActivity:travel.activity_type,destinationKind:'normal' as const};
      }
      await executeTravelTransfers(connection,saved);
      await connection.execute('DELETE FROM player_travel_routes WHERE character_id=?', [character.id]);
    }
    const result = await moveToPosition(connection, qqUserId, targetX, targetY, false, undefined, Number(travel.region_id), true);""")
# cancel clears pending itinerary as well as active timers.
needle="  await recordCharacterOperation(connection, { characterId: Number(character.id), kind: 'travel.cancelled'"
replace(needle,"  await connection.execute('DELETE FROM player_travel_routes WHERE character_id=?', [character.id]);\n"+needle)
p.write_text(s,encoding='utf-8')
