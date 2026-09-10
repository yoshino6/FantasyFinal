/** 默认只读预览。停服后复核报告，再用 --apply 执行；遇到不能核实的存量数据整批拒绝写入。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createPool, type RowDataPacket } from 'mysql2/promise';
import { balanceRecord, equipmentBalancePreview, resetLegacyEquipmentPrimary, type BalanceEquipment } from '../src/game/equipment-balance';
import { migrateAutomatonGrowth, type AutomatonState } from '../src/game/automaton';

const cfg = createRequire(import.meta.url)('yaml').parse(readFileSync('alemon.config.yaml','utf8'));
const db = cfg.FantasyFinal?.database ?? cfg.mysql;
const pool = createPool({host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,database:db.database,connectionLimit:1,charset:'utf8mb4'});
const connection = await pool.getConnection(), apply = process.argv.includes('--apply');
const resetLegacy = process.argv.includes('--reset-legacy-primary');
const directory = `.data/stat-balance-migration/${new Date().toISOString().replace(/[:.]/g,'-')}`;
mkdirSync(directory,{recursive:true});
try {
  await connection.query(apply ? 'START TRANSACTION' : 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const lock = apply ? ' FOR UPDATE' : '';
  const [characters] = await connection.query<RowDataPacket[]>(`SELECT * FROM characters ORDER BY id${lock}`);
  const [combat] = await connection.query<RowDataPacket[]>(`SELECT id FROM combat_sessions WHERE state='active'${lock}`);
  const [pvp] = await connection.query<RowDataPacket[]>(`SELECT id FROM player_pvp_battle_sessions WHERE state='active'${lock}`);
  const [definitions] = await connection.query<(RowDataPacket & BalanceEquipment & {id:number})[]>(`SELECT id,code,item_category,weapon_type,rarity,required_level,effect_json FROM item_definitions WHERE item_type='equipment' ORDER BY id${lock}`);
  const [instances] = await connection.query<RowDataPacket[]>(`SELECT ii.id,ii.item_id,ii.character_id,ii.effect_json,ii.forge_primary_json,ii.market_listing_id FROM player_item_instances ii JOIN item_definitions i ON i.id=ii.item_id WHERE i.item_type='equipment' ORDER BY ii.id${lock}`);
  const [marketListings] = await connection.query<RowDataPacket[]>(`SELECT * FROM market_instance_listings WHERE kind='instance' AND status='open' ORDER BY id${lock}`);
  const [equipped] = await connection.query<RowDataPacket[]>(`SELECT character_id,item_id,instance_id FROM player_equipment${lock}`);
  const [inventory] = await connection.query<RowDataPacket[]>(`SELECT pi.item_id FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE i.item_type='equipment' AND pi.quantity>0${lock}`);
  const [automatons] = await connection.query<RowDataPacket[]>(`SELECT id,state_json,combat_id FROM player_automatons${lock}`);
  const [fusions] = await connection.query<RowDataPacket[]>(`SELECT instance_id,effect_json FROM equipment_fusions${lock}`);
  const [snapshots] = await connection.query<RowDataPacket[]>(`SELECT id,traits_json FROM monster_spawns WHERE defeated_at IS NULL AND (JSON_CONTAINS(COALESCE(traits_json,JSON_ARRAY()),JSON_OBJECT('code','advanced_mentor_build')) OR JSON_CONTAINS(COALESCE(traits_json,JSON_ARRAY()),JSON_OBJECT('code','npc_sparring')))${lock}`);
  const byId = new Map(definitions.map(row=>[Number(row.id),row]));
  const used = new Set([...instances,...equipped,...inventory].map(row=>Number(row.item_id)));
  const definitionPlan = definitions.map(row=>{let plan=equipmentBalancePreview(row);if(resetLegacy && plan.blocked && used.has(Number(row.id)))plan=resetLegacyEquipmentPrimary(row);return {id:Number(row.id),code:row.code,used:used.has(Number(row.id)),...plan};});
  const instancePlan = instances.map(row=>{const definition=byId.get(Number(row.item_id))!;let plan=equipmentBalancePreview(definition,row.effect_json);if(resetLegacy && plan.blocked)plan=resetLegacyEquipmentPrimary(definition,row.effect_json,fusions.filter(fusion=>Number(fusion.instance_id)===Number(row.id)).map(fusion=>fusion.effect_json));return {id:Number(row.id),characterId:Number(row.character_id),itemId:Number(row.item_id),...plan};});
  const automatonPlan = automatons.map(row=>({id:Number(row.id),state:migrateAutomatonGrowth(balanceRecord(row.state_json) as AutomatonState)}));
  const marketPlan = marketListings.flatMap(row=>{
    const instance=instancePlan.find(plan=>plan.id===Number(row.resource_id));if(!instance?.changed)return [];
    const definition=definitionPlan.find(plan=>plan.id===instance.itemId);
    return [{id:Number(row.id),snapshot:{...balanceRecord(row.snapshot_json),effect_json:instance.effect,definition_effect:definition?.effect}}];
  });
  const blockers = [...definitionPlan.filter(row=>row.used && row.blocked).map(row=>`定义 ${row.id}: ${row.reason}`), ...instancePlan.filter(row=>row.blocked).map(row=>`实例 ${row.id}: ${row.reason}`)];
  if(combat.length || pvp.length || automatons.some(row=>row.combat_id))blockers.push('存在进行中的战斗，须结束战斗并停服后执行');
  if(snapshots.length)blockers.push(`存在 ${snapshots.length} 个导师/NPC切磋构筑快照，须先完成或重新创建试炼`);
  for(const instance of instances.filter(row=>row.market_listing_id!=null))if(!marketListings.some(row=>Number(row.id)===Number(instance.market_listing_id)&&Number(row.resource_id)===Number(instance.id)))blockers.push(`实例 ${instance.id} 的寄售归属不一致`);
  const report = {capturedAt:new Date().toISOString(),mode:apply?'apply':'read-only',resetLegacy,counts:{characters:characters.length,definitions:definitions.length,instances:instances.length,automatons:automatons.length,definitionChanges:definitionPlan.filter(row=>row.changed).length,instanceChanges:instancePlan.filter(row=>row.changed).length,marketChanges:marketPlan.length},blockers,definitionPlan,instancePlan,marketPlan};
  writeFileSync(`${directory}/preview.json`,JSON.stringify(report,null,2));
  const summary = `# 人物数值迁移预览\n\n时间：${report.capturedAt}\n\n${Object.entries(report.counts).map(([k,v])=>`${k}：${v}`).join('；')}。\n\n${blockers.length?'存在以下阻塞，未执行数据库迁移：\n\n'+blockers.map(line=>'- '+line).join('\n'):'未发现迁移阻塞。停服后可执行 --apply。'}\n\n完整逐件记录见同目录 preview.json。神器、副词条、熔铸台账不缩放。普通怪物的六维成长不变，其双攻双防在战斗时从新虚拟预算计算；旧副词条预算保持，故普通怪物最大生命无需批量改写。\n`;
  writeFileSync(`${directory}/preview.md`,summary);
  if(apply) {
    if(blockers.length)throw new Error(`迁移拒绝：${blockers.length} 项阻塞，见 ${directory}/preview.md`);
    // 原始记录先落盘，任何 SQL 失败整批回滚；不覆盖旧备份。
    writeFileSync(`${directory}/backup.json`,JSON.stringify({characters,definitions,instances,automatons,fusions,marketListings,equipped},null,2));
    for(const row of instancePlan.filter(row=>row.changed)){
      const listing=instances.find(instance=>Number(instance.id)===row.id)?.market_listing_id;
      // 停服维护事务已锁住订单和实例；暂时解除关联、改值、恢复关联，对外不暴露中间状态，保留原有交易保护触发器。
      if(listing!=null)await connection.execute('UPDATE player_item_instances SET market_listing_id=NULL WHERE id=?',[row.id]);
      await connection.execute('UPDATE player_item_instances SET effect_json=? WHERE id=?',[JSON.stringify(row.effect),row.id]);
      if(listing!=null)await connection.execute('UPDATE player_item_instances SET market_listing_id=? WHERE id=?',[listing,row.id]);
    }
    for(const row of marketPlan)await connection.execute('UPDATE market_instance_listings SET snapshot_json=? WHERE id=?',[JSON.stringify(row.snapshot),row.id]);
    for(const row of definitionPlan.filter(row=>row.changed))await connection.execute('UPDATE item_definitions SET effect_json=? WHERE id=?',[JSON.stringify(row.effect),row.id]);
    for(const row of automatonPlan)await connection.execute('UPDATE player_automatons SET state_json=?,revision=revision+1 WHERE id=?',[JSON.stringify(row.state),row.id]);
    const { recalculateCharacterStats } = await import('../src/game/character.service');
    for(const row of characters) {
      await recalculateCharacterStats(connection,Number(row.id));
      await connection.execute(`UPDATE characters SET current_hp=IF(?<=0,0,LEAST(hp_max,GREATEST(1,FLOOR(hp_max*?/GREATEST(1,?))))),current_mp=LEAST(mp_max,GREATEST(0,FLOOR(mp_max*?/GREATEST(1,?)))),stat_formula_version=3 WHERE id=?`,[row.current_hp,row.current_hp,row.hp_max,row.current_mp,row.mp_max,row.id]);
    }
    const [afterCharacters] = await connection.query<RowDataPacket[]>('SELECT * FROM characters ORDER BY id');
    writeFileSync(`${directory}/after.json`,JSON.stringify({characters:afterCharacters},null,2));
    await connection.commit();
    writeFileSync(`${directory}/applied.json`,JSON.stringify({appliedAt:new Date().toISOString(),counts:report.counts}));
  } else await connection.rollback();
  console.log(JSON.stringify({directory,applied:apply,counts:report.counts,blockers:blockers.length}));
} catch(error) { await connection.rollback(); throw error; }
finally {connection.release();await pool.end();}
// 实装服务的框架模块保留计时器；本 CLI 已关闭数据库连接，不继续作为机器人进程驻留。
process.exit(0);
