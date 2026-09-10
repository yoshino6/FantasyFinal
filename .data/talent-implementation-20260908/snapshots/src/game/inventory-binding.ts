import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export type Binding = { unbound: number; trade: number; personal: number };
export const consumeBinding = (stock: Binding, quantity: number, unboundOnly = false): Binding => {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || Object.values(stock).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('物品数量无效。');
  if ((unboundOnly ? stock.unbound : stock.unbound+stock.trade+stock.personal) < quantity) throw new Error(unboundOnly ? '未绑定数量不足。' : '物品数量不足。');
  const personal = unboundOnly ? 0 : Math.min(stock.personal,quantity);
  const trade = unboundOnly ? 0 : Math.min(stock.trade,quantity-personal);
  return {personal,trade,unbound:quantity-personal-trade};
};
export const consumeInventory = async (connection: PoolConnection, characterId: number, itemId: number, quantity: number, unboundOnly = false) => {
  const [rows] = await connection.execute<(RowDataPacket & {quantity:number;trade_bound_quantity:number;personal_bound_quantity:number})[]>('SELECT quantity,trade_bound_quantity,personal_bound_quantity FROM player_inventory WHERE character_id=? AND item_id=? FOR UPDATE',[characterId,itemId]);
  const row = rows[0], trade = Number(row?.trade_bound_quantity ?? 0), personal = Number(row?.personal_bound_quantity ?? 0);
  const used = consumeBinding({trade,personal,unbound:Number(row?.quantity ?? 0)-trade-personal},quantity,unboundOnly);
  await connection.execute(`UPDATE player_inventory SET quantity=quantity-?,trade_bound_quantity=trade_bound_quantity-?,personal_bound_quantity=personal_bound_quantity-?,binding_revision=binding_revision+1 WHERE character_id=? AND item_id=?`,[quantity,used.trade,used.personal,characterId,itemId]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity=0',[characterId,itemId]);
  return used;
};
export const grantInventory = async (connection: PoolConnection, characterId: number, itemId: number, binding: Binding) => {
  const total = binding.unbound+binding.trade+binding.personal;
  if (!total) return;
  if(Object.values(binding).some(v => !Number.isSafeInteger(v) || v<0)) throw new Error('物品发放数量无效。');
  await connection.execute(`INSERT INTO player_inventory (character_id,item_id,quantity,trade_bound_quantity,personal_bound_quantity,binding_revision) VALUES (?,?,?,?,?,1)
    ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),trade_bound_quantity=trade_bound_quantity+VALUES(trade_bound_quantity),personal_bound_quantity=personal_bound_quantity+VALUES(personal_bound_quantity),binding_revision=binding_revision+1`,[characterId,itemId,total,binding.trade,binding.personal]);
};
export const productionBinding = (used: Binding, quantity: number, irreversible: boolean): Binding => used.personal ? {personal:quantity,trade:0,unbound:0} : used.trade && !irreversible ? {personal:0,trade:quantity,unbound:0} : {personal:0,trade:0,unbound:quantity};
