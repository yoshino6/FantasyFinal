import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../database/pool';
import { recalculateCharacterStats } from './character.service';
import { resetSkillPointAllocation, skillAllocationPlan } from './skill-point-ledger.service';
import { alchemyFingerprint } from './alchemy-journal';
import { completeCraftRequest, craftCharacterId, craftRequestFor, createCraftRequest } from './alchemy-journal.service';

const assertCanReset = async (connection: PoolConnection, id: number) => {
  const [characters] = await connection.execute<RowDataPacket[]>('SELECT current_hp FROM characters WHERE id=? FOR UPDATE', [id]);
  if (Number(characters[0]?.current_hp ?? 0) <= 0) throw new Error('死亡状态无法使用归悟洗练露。');
  const [pve] = await connection.execute<RowDataPacket[]>("SELECT s.id FROM combat_sessions s LEFT JOIN combat_members m ON m.session_id=s.id WHERE s.state='active' AND (s.character_id=? OR m.character_id=?) LIMIT 1 FOR UPDATE", [id,id]);
  const [pvp] = await connection.execute<RowDataPacket[]>("SELECT id FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1 FOR UPDATE", [id,id]);
  if (pve.length || pvp.length) throw new Error('战斗或战斗结算中无法洗练，请结束战斗后再试。');
  const [items] = await connection.execute<RowDataPacket[]>("SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='alchemy_skill_reset_elixir' AND pi.quantity>0 FOR UPDATE", [id]);
  if (!items[0]) throw new Error('需要归悟洗练露 ×1，可由炼金师制作或在糖水屋购买成品。');
  return Number(items[0].item_id);
};
export const previewSkillReset = async (user: string) => withTransaction(async connection => {
  const id = await craftCharacterId(connection,user,true); await assertCanReset(connection,id); const plan = await skillAllocationPlan(connection,id);
  if (!plan.canReset) throw new Error('没有可核实的待返还投入，也没有需要重置的技能点或加点，未消耗归悟洗练露。');
  const token = await createCraftRequest(connection,id,'skill_reset',{ fingerprint: alchemyFingerprint(plan) });
  return { ...plan, token };
});
export const executeSkillReset = async (user: string, token: string) => withTransaction(async connection => {
  const id = await craftCharacterId(connection,user,true); const request = await craftRequestFor<{ fingerprint: string }>(connection,id,'skill_reset',token);
  if (request.result) return request.result as Awaited<ReturnType<typeof resetSkillPointAllocation>>;
  const itemId = await assertCanReset(connection,id); const plan = await skillAllocationPlan(connection,id);
  if (!plan.canReset || alchemyFingerprint(plan) !== request.snapshot.fingerprint) throw new Error('角色等级、技能投入或配置已经改变，请重新打开归悟洗练面板。');
  const result = await resetSkillPointAllocation(connection,id,token);
  await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=? AND quantity>0',[id,itemId]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0',[id,itemId]);
  await recalculateCharacterStats(connection,id);
  await completeCraftRequest(connection,id,token,result); return result;
});
