import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';
import { detentionMessage } from './time-format';

type PvpCharacter = RowDataPacket & {
  id: number; game_id: number; name: string; current_region_id: number; pos_x: number; pos_y: number; pos_z: number;
  level: number; perception: number; perception_growth: number;
  hp_max: number; mp_max: number; current_hp: number; current_mp: number; physical_attack: number; magic_attack: number;
  physical_defense: number; magic_defense: number; accuracy: number; evasion: number; activity_status: string; detained_until: Date | null;
};
type PvpAction = { type: 'attack' } | { type: 'skill'; id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; manaCost: number; power: number; cooldown: number } | { type: 'item'; id: number; name: string; effect: Record<string, number> };
type PvpBattleRow = RowDataPacket & { id: string; attacker_character_id: number; defender_character_id: number; turn_no: number; state: string; attacker_hp: number; attacker_mp: number; defender_hp: number; defender_mp: number; attacker_cooldowns: unknown; defender_cooldowns: unknown; ambush_spawn_id: number | null; ambush_delivery_scope: 'group' | 'c2c' | null; ambush_delivery_target_id: string | null; ambush_delivery_bot_id: string | null };
export type PvpAmbushDelivery = { scope: 'group' | 'c2c'; targetId: string; botId?: string };

const random = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const perceptionRange = (character: PvpCharacter) => {
  const perception = Number(character.perception) + Number(character.perception_growth) * Math.max(0, Number(character.level) - 1);
  const statValue = 1 + Math.floor(Math.pow(Math.max(1, perception) / 7, .9));
  const levelCap = Math.min(10, 2 + Math.floor(Math.max(1, Number(character.level)) / 5));
  return Math.max(1, Math.min(10, levelCap, statValue));
};
const record = (value: unknown): Record<string, number> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, number>;
  try { return JSON.parse(String(value)) as Record<string, number>; } catch { return {}; }
};
const characterFor = async (connection: PoolConnection, qqUserId: string) => {
  const [rows] = await connection.execute<PvpCharacter[]>('SELECT c.* FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1 FOR UPDATE', [qqUserId]);
  if (!rows[0]) throw new Error('请先发送“注册”创建角色。');
  return rows[0];
};
const townRegion = async (connection: PoolConnection) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM map_regions WHERE code=\'baina_town\' LIMIT 1');
  if (!rows[0]) throw new Error('百纳镇区域尚未初始化。');
  return rows[0];
};
const wanted = async (connection: PoolConnection, characterId: number, regionId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM player_warrants WHERE wanted_character_id=? AND city_region_id=? AND status=\'active\' LIMIT 1 FOR UPDATE', [characterId, regionId]);
  return Number(rows[0]?.id ?? 0);
};
const activeWarrants = async (connection: PoolConnection, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM player_warrants WHERE wanted_character_id=? AND status=\'active\' FOR UPDATE', [characterId]);
  return rows.map(row => Number(row.id));
};

/** 通缉者在对应城镇留下最后一次可追踪的行踪。 */
export const recordWarrantSighting = async (connection: PoolConnection, characterId: number, regionId: number, x: number, y: number) => {
  await connection.execute(`UPDATE player_warrants SET last_seen_at=NOW(),last_seen_x=?,last_seen_y=?
    WHERE wanted_character_id=? AND city_region_id=? AND status='active'`, [x, y, characterId, regionId]);
};

/** 同一通缉者每攻击一名新受害者，通缉星级便提升一次进度。 */
const recordWarrantVictim = async (connection: PoolConnection, warrantId: number, targetCharacterId: number) => {
  if (warrantId) await connection.execute('INSERT IGNORE INTO player_warrant_victims (warrant_id,target_character_id) VALUES (?,?)', [warrantId, targetCharacterId]);
};

const actionFor = async (connection: PoolConnection, character: PvpCharacter, manual = false): Promise<PvpAction> => {
  const [settings] = await connection.execute<(RowDataPacket & { enabled: number; auto_potion_enabled: number; hp_threshold: number; hp_item_id: number | null; mp_threshold: number; mp_item_id: number | null; action_cursor: number })[]>('SELECT * FROM player_pvp_auto_battle_settings WHERE character_id=? FOR UPDATE', [character.id]);
  const setting = settings[0];
  if (setting?.enabled) {
    const lowHp = Number(character.current_hp) * 100 <= Number(character.hp_max) * Number(setting.hp_threshold);
    const lowMp = Number(character.current_mp) * 100 <= Number(character.mp_max) * Number(setting.mp_threshold);
    const potionId = Number(setting.auto_potion_enabled) ? (lowHp ? setting.hp_item_id : lowMp ? setting.mp_item_id : null) : null;
    if (potionId) {
      const [items] = await connection.execute<(RowDataPacket & { id: number; name: string; effect_json: unknown })[]>('SELECT i.id,i.name,i.effect_json FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND pi.quantity>0 AND i.item_type=\'consumable\' LIMIT 1 FOR UPDATE', [character.id, potionId]);
      if (items[0]) return { type: 'item', id: Number(items[0].id), name: items[0].name, effect: record(items[0].effect_json) };
    }
    const [actions] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; mana_cost: number; power: number; cooldown_turns: number })[]>('SELECT s.id,s.code,s.name,s.category,s.mana_cost,s.power,s.cooldown_turns FROM player_pvp_auto_battle_actions a JOIN player_skills ps ON ps.character_id=a.character_id AND ps.skill_id=a.skill_id JOIN skill_definitions s ON s.id=a.skill_id WHERE a.character_id=? ORDER BY a.sequence_no', [character.id]);
    if (actions.length) {
      const picked = actions[(Math.max(1, Number(setting.action_cursor)) - 1) % actions.length];
      await connection.execute('UPDATE player_pvp_auto_battle_settings SET action_cursor=action_cursor+1 WHERE character_id=?', [character.id]);
      return { type: 'skill', id: Number(picked.id), code: picked.code, name: picked.name, category: picked.category, manaCost: Number(picked.mana_cost), power: Number(picked.power), cooldown: Number(picked.cooldown_turns) };
    }
  }
  if (manual) return { type: 'attack' };
  const [quick] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; mana_cost: number; power: number; cooldown_turns: number })[]>('SELECT s.id,s.code,s.name,s.category,s.mana_cost,s.power,s.cooldown_turns FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot IS NOT NULL AND s.category IN (\'physical\',\'magic\',\'utility\') ORDER BY ps.quick_slot', [character.id]);
  if (!quick.length) return { type: 'attack' };
  const picked = random(quick);
  return { type: 'skill', id: Number(picked.id), code: picked.code, name: picked.name, category: picked.category, manaCost: Number(picked.mana_cost), power: Number(picked.power), cooldown: Number(picked.cooldown_turns) };
};

const creditItem = async (connection: PoolConnection, characterId: number, itemId: number, quantity: number) => {
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=NOW()', [characterId, itemId, quantity]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, itemId]);
};

type RestitutionDetail = { id: string; itemCount: number; copper: number; debt: number };
type StolenLootRow = RowDataPacket & {
  id: number; original_owner_character_id: number; holder_character_id: number; item_id: number | null;
  quantity: number; held_quantity: number; sold_quantity: number; copper_amount: number; sale_copper_amount: number;
};

/** 记录赃物被商店收购的去向。售出收益会在通缉者被终结时优先追回。 */
export const recordPvpLootSale = async (connection: PoolConnection, holderId: number, itemId: number, quantity: number, saleCopper: number) => {
  let remaining = Math.max(0, Math.floor(quantity));
  let unallocatedValue = Math.max(0, Math.floor(saleCopper));
  const [rows] = await connection.execute<StolenLootRow[]>(`SELECT * FROM pvp_stolen_loot
    WHERE holder_character_id=? AND item_id=? AND returned_at IS NULL AND held_quantity>0 ORDER BY acquired_at,id FOR UPDATE`, [holderId, itemId]);
  for (const row of rows) {
    if (!remaining) break;
    const moved = Math.min(remaining, Number(row.held_quantity));
    const value = moved === remaining ? unallocatedValue : Math.floor(Math.max(0, saleCopper) * moved / Math.max(1, quantity));
    await connection.execute('UPDATE pvp_stolen_loot SET held_quantity=held_quantity-?,sold_quantity=sold_quantity+?,sale_copper_amount=sale_copper_amount+? WHERE id=?', [moved, moved, value, row.id]);
    remaining -= moved; unallocatedValue -= value;
  }
};

/** 赃物再次被掠夺时保留最初失主，避免赃物链被洗白。 */
const transferStolenItem = async (connection: PoolConnection, fromId: number, toId: number, itemId: number, quantity: number) => {
  let remaining = quantity;
  const [rows] = await connection.execute<StolenLootRow[]>(`SELECT * FROM pvp_stolen_loot
    WHERE holder_character_id=? AND item_id=? AND returned_at IS NULL AND held_quantity>0 ORDER BY acquired_at,id FOR UPDATE`, [fromId, itemId]);
  for (const row of rows) {
    if (!remaining) break;
    const moved = Math.min(remaining, Number(row.held_quantity));
    if (moved === Number(row.held_quantity) && !Number(row.sold_quantity) && moved === Number(row.quantity)) {
      await connection.execute('UPDATE pvp_stolen_loot SET holder_character_id=? WHERE id=?', [toId, row.id]);
    } else {
      await connection.execute('UPDATE pvp_stolen_loot SET quantity=quantity-?,held_quantity=held_quantity-? WHERE id=?', [moved, moved, row.id]);
      await connection.execute('INSERT INTO pvp_stolen_loot (original_owner_character_id,holder_character_id,item_id,quantity,held_quantity) VALUES (?,?,?,?,?)', [row.original_owner_character_id, toId, itemId, moved, moved]);
    }
    remaining -= moved;
  }
  if (remaining) await connection.execute('INSERT INTO pvp_stolen_loot (original_owner_character_id,holder_character_id,item_id,quantity,held_quantity) VALUES (?,?,?,?,?)', [fromId, toId, itemId, remaining, remaining]);
};

const transferStolenCopper = async (connection: PoolConnection, fromId: number, toId: number, copper: number) => {
  let remaining = copper;
  const [rows] = await connection.execute<StolenLootRow[]>('SELECT * FROM pvp_stolen_loot WHERE holder_character_id=? AND item_id IS NULL AND returned_at IS NULL AND copper_amount>0 ORDER BY acquired_at,id FOR UPDATE', [fromId]);
  for (const row of rows) {
    if (!remaining) break;
    const moved = Math.min(remaining, Number(row.copper_amount));
    if (moved === Number(row.copper_amount)) await connection.execute('UPDATE pvp_stolen_loot SET holder_character_id=? WHERE id=?', [toId, row.id]);
    else {
      await connection.execute('UPDATE pvp_stolen_loot SET copper_amount=copper_amount-? WHERE id=?', [moved, row.id]);
      await connection.execute('INSERT INTO pvp_stolen_loot (original_owner_character_id,holder_character_id,copper_amount) VALUES (?,?,?)', [row.original_owner_character_id, toId, moved]);
    }
    remaining -= moved;
  }
  if (remaining) await connection.execute('INSERT INTO pvp_stolen_loot (original_owner_character_id,holder_character_id,copper_amount) VALUES (?,?,?)', [fromId, toId, remaining]);
};

/** 百纳镇会强制执行尚未缴清的赃款债务。 */
export const collectCityDebts = async (connection: PoolConnection, characterId: number, cityRegionId: number) => {
  const [characterRows] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [characterId]);
  let available = Number(characterRows[0]?.copper_coins ?? 0); if (!characterRows[0]) return { collected: 0, remaining: 0 };
  const [debts] = await connection.execute<(RowDataPacket & { id: number; original_owner_character_id: number; amount_copper: number; paid_copper: number })[]>(`SELECT * FROM player_city_debts
    WHERE debtor_character_id=? AND city_region_id=? AND status='active' ORDER BY created_at,id FOR UPDATE`, [characterId, cityRegionId]);
  let collected = 0; let remaining = 0;
  for (const debt of debts) {
    const owed = Math.max(0, Number(debt.amount_copper) - Number(debt.paid_copper));
    const paid = Math.min(available, owed);
    if (paid) {
      await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [paid, characterId]);
      await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [paid, debt.original_owner_character_id]);
      await connection.execute(`UPDATE player_city_debts SET paid_copper=paid_copper+?,status=IF(paid_copper+?>=amount_copper,'settled','active'),settled_at=IF(paid_copper+?>=amount_copper,NOW(),NULL) WHERE id=?`, [paid, paid, paid, debt.id]);
      available -= paid; collected += paid;
    }
    remaining += owed - paid;
  }
  return { collected, remaining };
};

/** PvP 战败：普通战败昏迷；城镇红名战败则被逮捕、返还赃物，并发放悬赏。 */
export const settlePvpDefeat = async (connection: PoolConnection, winnerId: number, loserId: number) => {
  const [loserRows] = await connection.execute<(PvpCharacter & { region_name: string; region_code: string })[]>('SELECT c.*,r.name AS region_name,r.code AS region_code FROM characters c JOIN map_regions r ON r.id=c.current_region_id WHERE c.id=? FOR UPDATE', [loserId]);
  const loser = loserRows[0]; if (!loser) return { captured: false, restitution: undefined as RestitutionDetail | undefined, text: '' };
  const warrants = await activeWarrants(connection, loserId);
  const captured = Boolean(warrants.length && loser.region_code === 'baina_town');
  if (!captured) {
    await connection.execute('UPDATE characters SET current_hp=1,activity_status=\'unconscious\',rest_started_at=NOW() WHERE id=?', [loserId]);
  } else {
    await connection.execute('UPDATE player_warrants SET status=\'captured\',captured_by_character_id=?,captured_at=NOW() WHERE wanted_character_id=? AND status=\'active\'', [winnerId, loserId]);
    await connection.execute('UPDATE characters SET current_hp=1,activity_status=\'detained\',rest_started_at=NULL,detained_until=DATE_ADD(NOW(),INTERVAL 12 HOUR) WHERE id=?', [loserId]);
  }
  const debtTown = await townRegion(connection);

  const [stolen] = await connection.execute<StolenLootRow[]>('SELECT * FROM pvp_stolen_loot WHERE holder_character_id=? AND returned_at IS NULL FOR UPDATE', [loserId]);
  const restitutionId = stolen.length ? randomUUID() : null;
  let returnedItems = 0; let returnedCopper = 0; let debtCopper = 0;
  const [balanceRows] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [loserId]);
  let availableCopper = Number(balanceRows[0]?.copper_coins ?? 0);
  for (const loot of stolen) {
    const heldQuantity = Math.min(Number(loot.quantity), Number(loot.held_quantity));
    if (loot.item_id && Number(loot.quantity) > 0) {
      await creditItem(connection, Number(loot.original_owner_character_id), Number(loot.item_id), Number(loot.quantity));
      if (heldQuantity) await connection.execute('UPDATE player_inventory SET quantity=GREATEST(0,quantity-?) WHERE character_id=? AND item_id=?', [heldQuantity, loserId, loot.item_id]);
      await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [loserId, loot.item_id]);
      returnedItems += Number(loot.quantity);
    }
    const owedCopper = Number(loot.copper_amount) + Number(loot.sale_copper_amount);
    let chargedCopper = 0; let rowDebt = 0;
    if (owedCopper > 0) {
      chargedCopper = Math.min(availableCopper, owedCopper); rowDebt = owedCopper - chargedCopper;
      if (chargedCopper) {
        await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [chargedCopper, loserId]);
        await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [chargedCopper, loot.original_owner_character_id]);
        availableCopper -= chargedCopper;
      }
      if (rowDebt && restitutionId) await connection.execute('INSERT INTO player_city_debts (debtor_character_id,original_owner_character_id,city_region_id,restitution_id,amount_copper) VALUES (?,?,?,?,?)', [loserId, loot.original_owner_character_id, debtTown.id, restitutionId, rowDebt]);
      returnedCopper += chargedCopper; debtCopper += rowDebt;
    }
    await connection.execute('UPDATE pvp_stolen_loot SET returned_at=NOW(),restitution_id=?,restitution_charged_copper=?,restitution_debt_copper=? WHERE id=?', [restitutionId, chargedCopper, rowDebt, loot.id]);
  }
  const rewards = warrants.length
    ? (await connection.execute<(RowDataPacket & { id: number; reward_item_id: number | null; quantity: number; copper_amount: number })[]>('SELECT * FROM player_warrant_rewards WHERE warrant_id IN (' + warrants.map(() => '?').join(',') + ') AND claimed_at IS NULL FOR UPDATE', warrants))[0]
    : [];
  let bountyItems = 0; let bountyCopper = 0;
  for (const reward of rewards) {
    if (reward.reward_item_id && Number(reward.quantity) > 0) { await creditItem(connection, winnerId, Number(reward.reward_item_id), Number(reward.quantity)); bountyItems += Number(reward.quantity); }
    if (Number(reward.copper_amount) > 0) { await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [reward.copper_amount, winnerId]); bountyCopper += Number(reward.copper_amount); }
    await connection.execute('UPDATE player_warrant_rewards SET claimed_at=NOW(),claimed_by_character_id=? WHERE id=?', [winnerId, reward.id]);
  }
  const restitution: RestitutionDetail | undefined = restitutionId ? { id: restitutionId, itemCount: returnedItems, copper: returnedCopper, debt: debtCopper } : undefined;
  const resultText = `${captured ? `【${loser.name}】被逮捕，关押 12 小时。` : '对方倒下并陷入昏迷。'}${restitution ? `返还失物${returnedItems ? `×${returnedItems}` : ''}${returnedCopper ? `、扣回铜币×${returnedCopper}` : ''}${debtCopper ? `；欠缴铜币×${debtCopper}` : ''}。` : ''}${bountyItems || bountyCopper ? `获得通缉赏金${bountyItems ? `与物品×${bountyItems}` : ''}${bountyCopper ? `、铜币×${bountyCopper}` : ''}。` : ''}`;
  return { captured, restitution, text: resultText };
};

/** 城镇执法 NPC 击败通缉者时，按缉捕规则关押、返还赃物并追缴赃款。 */
export const settleCityPursuitDefeat = async (connection: PoolConnection, loserId: number, cityRegionId: number) => {
  const [loserRows] = await connection.execute<(PvpCharacter & { name: string })[]>('SELECT * FROM characters WHERE id=? FOR UPDATE', [loserId]);
  const loser = loserRows[0]; if (!loser) return { text: '' };
  const warrants = await activeWarrants(connection, loserId);
  if (warrants.length) await connection.execute('UPDATE player_warrants SET status=\'captured\',captured_by_character_id=NULL,captured_at=NOW() WHERE wanted_character_id=? AND status=\'active\'', [loserId]);
  await connection.execute('UPDATE characters SET current_hp=1,activity_status=\'detained\',rest_started_at=NULL,detained_until=DATE_ADD(NOW(),INTERVAL 12 HOUR) WHERE id=?', [loserId]);

  const [stolen] = await connection.execute<StolenLootRow[]>('SELECT * FROM pvp_stolen_loot WHERE holder_character_id=? AND returned_at IS NULL FOR UPDATE', [loserId]);
  const restitutionId = stolen.length ? randomUUID() : null;
  let returnedItems = 0; let returnedCopper = 0; let debtCopper = 0;
  const [balanceRows] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [loserId]);
  let availableCopper = Number(balanceRows[0]?.copper_coins ?? 0);
  for (const loot of stolen) {
    const heldQuantity = Math.min(Number(loot.quantity), Number(loot.held_quantity));
    if (loot.item_id && Number(loot.quantity) > 0) {
      await creditItem(connection, Number(loot.original_owner_character_id), Number(loot.item_id), Number(loot.quantity));
      if (heldQuantity) await connection.execute('UPDATE player_inventory SET quantity=GREATEST(0,quantity-?) WHERE character_id=? AND item_id=?', [heldQuantity, loserId, loot.item_id]);
      await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [loserId, loot.item_id]);
      returnedItems += Number(loot.quantity);
    }
    const owedCopper = Number(loot.copper_amount) + Number(loot.sale_copper_amount);
    const chargedCopper = Math.min(availableCopper, owedCopper); const rowDebt = owedCopper - chargedCopper;
    if (chargedCopper) {
      await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [chargedCopper, loserId]);
      await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [chargedCopper, loot.original_owner_character_id]);
      availableCopper -= chargedCopper;
    }
    if (rowDebt && restitutionId) await connection.execute('INSERT INTO player_city_debts (debtor_character_id,original_owner_character_id,city_region_id,restitution_id,amount_copper) VALUES (?,?,?,?,?)', [loserId, loot.original_owner_character_id, cityRegionId, restitutionId, rowDebt]);
    returnedCopper += chargedCopper; debtCopper += rowDebt;
    await connection.execute('UPDATE pvp_stolen_loot SET returned_at=NOW(),restitution_id=?,restitution_charged_copper=?,restitution_debt_copper=? WHERE id=?', [restitutionId, chargedCopper, rowDebt, loot.id]);
  }
  const recovered = returnedItems || returnedCopper || debtCopper;
  return { text: `【${loser.name}】被城镇守卫关押 12 小时。${recovered ? `返还失物${returnedItems ? `×${returnedItems}` : ''}${returnedCopper ? `、扣回铜币×${returnedCopper}` : ''}${debtCopper ? `；欠缴铜币×${debtCopper}` : ''}。` : ''}` };
};

const stealFromLoser = async (connection: PoolConnection, winner: PvpCharacter, loser: PvpCharacter, extra = false) => {
  const [items] = await connection.execute<(RowDataPacket & { item_id: number; name: string; quantity: number; trade_price: number })[]>('SELECT pi.item_id,i.name,pi.quantity,i.trade_price FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.is_tradeable=1 AND i.trade_price>0 AND i.item_category NOT IN (\'特殊\',\'地图\',\'货币\') FOR UPDATE', [loser.id]);
  const weighted = items.flatMap(item => Array.from({ length: Math.max(1, Math.min(100, Number(item.trade_price) * Number(item.quantity))) }, () => item));
  const taken: string[] = [];
  for (let count = 0; count < (extra ? 2 : 1) && weighted.length; count += 1) {
    const item = random(weighted); const quantity = Math.max(1, Math.min(Number(item.quantity), extra ? 2 : 1));
    await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, loser.id, item.item_id]);
    await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [loser.id, item.item_id]);
    await creditItem(connection, winner.id, Number(item.item_id), quantity);
    await transferStolenItem(connection, Number(loser.id), Number(winner.id), Number(item.item_id), quantity);
    taken.push(`【${item.name}】×${quantity}`);
  }
  const [coins] = await connection.execute<(RowDataPacket & { copper_coins: number })[]>('SELECT copper_coins FROM characters WHERE id=? FOR UPDATE', [loser.id]);
  const copper = Math.min(Number(coins[0]?.copper_coins ?? 0), Math.max(0, Math.floor(Number(coins[0]?.copper_coins ?? 0) * (extra ? .15 : .05))));
  if (copper) {
    await connection.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=?', [copper, loser.id]);
    await connection.execute('UPDATE characters SET copper_coins=copper_coins+? WHERE id=?', [copper, winner.id]);
    await transferStolenCopper(connection, Number(loser.id), Number(winner.id), copper);
    taken.push(`铜币×${copper}`);
  }
  return taken;
};

/** 所有 PvP 击倒共用的战利品结算；城镇红名会额外触发关押与失物返还。 */
export const resolvePvpVictory = async (connection: PoolConnection, winnerId: number, loserId: number) => {
  const [winners] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id=? FOR UPDATE', [winnerId]);
  const [losers] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id=? FOR UPDATE', [loserId]);
  const winner = winners[0]; const loser = losers[0]; if (!winner || !loser) return { text: '' };
  const settlement = await settlePvpDefeat(connection, winnerId, loserId);
  // 缉捕红名时优先没收并返还赃物，不再从被关押者身上制造新的掠夺记录。
  const loot = settlement.captured ? [] : await stealFromLoser(connection, winner, loser);
  return { text: `${settlement.text}${loot.length ? ` 获得${loot.join('、')}。` : ''}`, restitution: settlement.restitution };
};

const resolveAction = async (connection: PoolConnection, actor: PvpCharacter, target: PvpCharacter, action: PvpAction) => {
  if (action.type === 'item') {
    const oldHp = Number(actor.current_hp); const oldMp = Number(actor.current_mp);
    const hp = Math.min(Number(actor.hp_max), oldHp + Number(action.effect.heal ?? 0)); const mp = Math.min(Number(actor.mp_max), oldMp + Number(action.effect.restoreMp ?? 0));
    await connection.execute('UPDATE player_inventory SET quantity=quantity-1 WHERE character_id=? AND item_id=? AND quantity>0', [actor.id, action.id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [actor.id, action.id]);
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [hp, mp, actor.id]); actor.current_hp = hp; actor.current_mp = mp;
    return { text: `【${actor.name}】使用【${action.name}】，HP ${oldHp}→${hp}｜MP ${oldMp}→${mp}。`, defeated: false };
  }
  const skill = action.type === 'skill' && Number(actor.current_mp) >= action.manaCost ? action : null;
  if (action.type === 'skill' && !skill) return resolveAction(connection, actor, target, { type: 'attack' });
  if (skill) { actor.current_mp = Number(actor.current_mp) - skill.manaCost; await connection.execute('UPDATE characters SET current_mp=? WHERE id=?', [actor.current_mp, actor.id]); }
  if (skill?.category === 'utility') return { text: `【${actor.name}】释放技能「${skill.name}」，但该辅助技能尚未在 PvP 对抗中形成直接伤害。`, defeated: false };
  const magic = skill?.category === 'magic'; const attack = magic ? Number(actor.magic_attack) : Number(actor.physical_attack); const defense = magic ? Number(target.magic_defense) : Number(target.physical_defense); const label = skill ? `释放技能「${skill.name}」` : '普通攻击';
  if (Math.random() >= Number(actor.accuracy) / Math.max(1, Number(actor.accuracy) + Number(target.evasion))) return { text: `【${actor.name}】${label}，但【${target.name}】闪避了攻击。`, defeated: false };
  const damage = Math.max(1, Math.floor(attack * attack / Math.max(1, attack + defense) * (skill ? skill.power / 100 : 1))); const hp = Math.max(0, Number(target.current_hp) - damage); const defeated = hp <= 0;
  if (!defeated) { await connection.execute('UPDATE characters SET current_hp=? WHERE id=?', [hp, target.id]); target.current_hp = hp; return { text: `【${actor.name}】${label}，对【${target.name}】造成 ${damage} 点${magic ? '魔法' : '物理'}伤害（HP ${hp}）。`, defeated: false }; }
  const settlement = await resolvePvpVictory(connection, actor.id, target.id);
  // 战斗过程只记录本次攻击；掠夺、逮捕等结果由独立结算消息展示。
  return { text: `【${actor.name}】${label}，对【${target.name}】造成 ${damage} 点${magic ? '魔法' : '物理'}伤害。`, defeated: true, settlement: settlement.text, restitution: settlement.restitution };
};

export const cityPvp = async (qqUserId: string, targetGameId: number, confirmed = false) => withTransaction(async connection => {
  const attacker = await characterFor(connection, qqUserId); const town = await townRegion(connection);
  if (Number(attacker.current_region_id) !== Number(town.id)) throw new Error('只有在百纳镇内才能发起城镇 PvP。');
  if (attacker.activity_status === 'detained') throw new Error(detentionMessage(attacker.detained_until));
  const [targets] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]); const target = targets[0];
  if (!target || Number(target.id) === Number(attacker.id) || Number(target.current_region_id) !== Number(town.id) || Number(target.pos_z) !== Number(attacker.pos_z) || Math.abs(Number(target.pos_x) - Number(attacker.pos_x)) + Math.abs(Number(target.pos_y) - Number(attacker.pos_y)) > 1) throw new Error('目标不在你相邻的城镇格子中。');
  if (target.activity_status === 'detained') throw new Error('目标已被守卫关押。');
  const attackerWarrant = await wanted(connection, attacker.id, Number(town.id)); const targetWarrant = await wanted(connection, target.id, Number(town.id));
  // 已被本城通缉的目标可被任何玩家合法缉捕；缉捕者不会因此获得红名。
  const unlawfulAttack = !attackerWarrant && !targetWarrant;
  if (unlawfulAttack && !confirmed) {
    await connection.execute('INSERT INTO player_pvp_attack_confirmations (attacker_character_id,target_character_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 MINUTE)) ON DUPLICATE KEY UPDATE target_character_id=VALUES(target_character_id),expires_at=VALUES(expires_at)', [attacker.id, target.id]);
    return { needsConfirmation: true, target: target.name, text: '小镇内贸然攻击玩家会被通缉。' };
  }
  if (unlawfulAttack && confirmed) {
    const [confirmations] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_pvp_attack_confirmations WHERE attacker_character_id=? AND target_character_id=? AND expires_at>NOW() FOR UPDATE', [attacker.id, target.id]);
    if (!confirmations[0]) throw new Error('攻击确认已失效，请重新选择攻击目标。');
    await connection.execute('DELETE FROM player_pvp_attack_confirmations WHERE attacker_character_id=?', [attacker.id]);
  }
  if (unlawfulAttack) { await connection.execute('INSERT INTO player_warrants (wanted_character_id,city_region_id,status) VALUES (?,?,\'active\')', [attacker.id, town.id]); await recordWarrantSighting(connection, Number(attacker.id), Number(town.id), Number(attacker.pos_x), Number(attacker.pos_y)); }
  if (!targetWarrant) await recordWarrantVictim(connection, await wanted(connection, Number(attacker.id), Number(town.id)), Number(target.id));
  const opening = await resolveAction(connection, attacker, target, await actionFor(connection, attacker, true));
  const response = !opening.defeated && Number(target.current_hp) > 1 ? await resolveAction(connection, target, attacker, await actionFor(connection, target)) : null;
  return { needsConfirmation: false, target: target.name, text: [opening.text, response?.text].filter(Boolean).join('\n') };
});

/** 城镇外的同地图 PvP；野外没有通缉确认，仍要求目标处于感知范围内。 */
export const fieldPvp = async (qqUserId: string, targetGameId: number) => withTransaction(async connection => {
  const attacker = await characterFor(connection, qqUserId);
  if (attacker.activity_status === 'detained') throw new Error(detentionMessage(attacker.detained_until));
  const [targets] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]);
  const target = targets[0];
  const distance = target ? Math.abs(Number(target.pos_x) - Number(attacker.pos_x)) + Math.abs(Number(target.pos_y) - Number(attacker.pos_y)) : Infinity;
  if (!target || Number(target.id) === Number(attacker.id) || Number(target.current_region_id) !== Number(attacker.current_region_id) || Number(target.pos_z) !== Number(attacker.pos_z) || distance > perceptionRange(attacker)) throw new Error('目标已经离开你的感知范围。');
  if (target.activity_status === 'detained') throw new Error('目标已被守卫关押。');
  const opening = await resolveAction(connection, attacker, target, await actionFor(connection, attacker, true));
  const response = !opening.defeated && Number(target.current_hp) > 1 ? await resolveAction(connection, target, attacker, await actionFor(connection, target)) : null;
  return { text: [opening.text, response?.text].filter(Boolean).join('\n') };
});

const activePvpBattle = async (connection: PoolConnection, characterId: number, lock = false) => {
  const [rows] = await connection.execute<PvpBattleRow[]>(`SELECT * FROM player_pvp_battle_sessions
    WHERE state='active' AND (attacker_character_id=? OR defender_character_id=?) LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [characterId, characterId]);
  return rows[0];
};
const battleActionFromSlot = async (connection: PoolConnection, character: PvpCharacter, type: 'attack' | 'skill' | 'item' | 'escape' | 'auto', slot?: number): Promise<PvpAction | null> => {
  if (type === 'attack') return { type: 'attack' };
  if (type === 'escape') return null;
  if (type === 'auto') return actionFor(connection, character);
  if (type === 'skill') {
    const [rows] = await connection.execute<(RowDataPacket & { id: number; code: string; name: string; category: 'physical' | 'magic' | 'utility'; mana_cost: number; power: number; cooldown_turns: number })[]>(`SELECT s.id,s.code,s.name,s.category,s.mana_cost,s.power,s.cooldown_turns
      FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot=? LIMIT 1`, [character.id, slot ?? 0]);
    if (!rows[0]) throw new Error(`技能${'①②③④'.charAt(Math.max(0, (slot ?? 1) - 1)) || slot}未配置。`);
    const skill = rows[0]; return { type: 'skill', id: Number(skill.id), code: skill.code, name: skill.name, category: skill.category, manaCost: Number(skill.mana_cost), power: Number(skill.power), cooldown: Number(skill.cooldown_turns) };
  }
  const [rows] = await connection.execute<(RowDataPacket & { id: number; name: string; effect_json: unknown })[]>(`SELECT i.id,i.name,i.effect_json FROM player_quick_items qi
    JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id AND pi.quantity>0
    JOIN item_definitions i ON i.id=qi.item_id WHERE qi.character_id=? AND qi.quick_slot=? LIMIT 1`, [character.id, slot ?? 0]);
  if (!rows[0]) throw new Error(`道具${'①②③④'.charAt(Math.max(0, (slot ?? 1) - 1)) || slot}未配置。`);
  return { type: 'item', id: Number(rows[0].id), name: rows[0].name, effect: record(rows[0].effect_json) };
};
const tickCooldowns = (value: unknown) => Object.fromEntries(Object.entries(record(value)).map(([code, turns]) => [code, Math.max(0, Number(turns) - 1)]));
const actionLog = (text: string) => {
  const separator = text.indexOf('，');
  return separator < 0 ? `➤${text}` : `➤${text.slice(0, separator)}\n　➥${text.slice(separator + 1)}`;
};
const sessionView = async (connection: PoolConnection, battle: PvpBattleRow, character: PvpCharacter) => {
  const attackerId = Number(battle.attacker_character_id); const ownAttacker = Number(character.id) === attackerId;
  const ownHp = ownAttacker ? Number(battle.attacker_hp) : Number(battle.defender_hp); const ownMp = ownAttacker ? Number(battle.attacker_mp) : Number(battle.defender_mp);
  const enemyId = ownAttacker ? Number(battle.defender_character_id) : attackerId;
  const [others] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id=? LIMIT 1', [enemyId]); const enemy = others[0];
  const enemyHp = ownAttacker ? Number(battle.defender_hp) : Number(battle.attacker_hp); const enemyMp = ownAttacker ? Number(battle.defender_mp) : Number(battle.attacker_mp);
  const cooldowns = ownAttacker ? record(battle.attacker_cooldowns) : record(battle.defender_cooldowns);
  const [skills] = await connection.execute<(RowDataPacket & { quick_slot: number; code: string })[]>('SELECT ps.quick_slot,s.code FROM player_skills ps JOIN skill_definitions s ON s.id=ps.skill_id WHERE ps.character_id=? AND ps.quick_slot IS NOT NULL', [character.id]);
  const [items] = await connection.execute<(RowDataPacket & { quick_slot: number })[]>('SELECT qi.quick_slot FROM player_quick_items qi JOIN player_inventory pi ON pi.character_id=qi.character_id AND pi.item_id=qi.item_id AND pi.quantity>0 WHERE qi.character_id=?', [character.id]);
  return { sessionId: battle.id, characterId: Number(character.id), turn: Number(battle.turn_no), playerHp: ownHp, playerHpMax: Number(character.hp_max), playerMp: ownMp, playerMpMax: Number(character.mp_max), selectedTargetId: enemyId,
    canAct: ownAttacker && ownHp > 0, skillSlots: skills.map(row => Number(row.quick_slot)), readySkillSlots: skills.filter(row => Number(cooldowns[row.code] ?? 0) <= 0).map(row => Number(row.quick_slot)), itemSlots: items.map(row => Number(row.quick_slot)), appraisal: { learned: false, rangeLevel: 0, informationLevel: 0 },
    members: [{ id: Number(character.id), name: character.name, hp: ownHp, hpMax: Number(character.hp_max), mp: ownMp, mpMax: Number(character.mp_max), defeated: ownHp <= 0, pending: false }],
    targets: enemy ? [{ id: enemyId, name: enemy.name, level: Number(enemy.level), hp: enemyHp, hpMax: Number(enemy.hp_max), mp: enemyMp, mpMax: Number(enemy.mp_max), defeated: enemyHp <= 0, identified: true }] : []
  };
};

/** 开始玩家回合制战斗；城镇内的首次攻击仍需确认并会产生通缉。 */
export const startPvpBattle = async (qqUserId: string, targetGameId: number, confirmed = false) => withTransaction(async connection => {
  const attacker = await characterFor(connection, qqUserId); const [regions] = await connection.execute<(RowDataPacket & { code: string })[]>('SELECT code FROM map_regions WHERE id=? LIMIT 1', [attacker.current_region_id]); const regionCode = regions[0]?.code ?? '';
  const [targets] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE game_id=? AND npc_code IS NULL FOR UPDATE', [targetGameId]); const defender = targets[0];
  const distance = defender ? Math.abs(Number(defender.pos_x) - Number(attacker.pos_x)) + Math.abs(Number(defender.pos_y) - Number(attacker.pos_y)) : Infinity;
  const range = regionCode === 'dark_forest_dungeon' ? 1 : perceptionRange(attacker);
  if (!defender || Number(defender.id) === Number(attacker.id) || Number(defender.current_region_id) !== Number(attacker.current_region_id) || Number(defender.pos_z) !== Number(attacker.pos_z) || distance > range) throw new Error('目标已经离开你的感知范围。');
  if (attacker.activity_status === 'detained') throw new Error(detentionMessage(attacker.detained_until));
  if (defender.activity_status === 'detained') throw new Error('目标已被守卫关押。');
  if (regionCode === 'baina_town') {
    const attackerWarrant = await wanted(connection, Number(attacker.id), Number(attacker.current_region_id)); const defenderWarrant = await wanted(connection, Number(defender.id), Number(attacker.current_region_id));
    // 仅攻击普通市民才会触发红名；攻击当前城市的通缉者属于合法缉捕。
    const unlawfulAttack = !attackerWarrant && !defenderWarrant;
    if (unlawfulAttack && !confirmed) { await connection.execute('INSERT INTO player_pvp_attack_confirmations (attacker_character_id,target_character_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 MINUTE)) ON DUPLICATE KEY UPDATE target_character_id=VALUES(target_character_id),expires_at=VALUES(expires_at)', [attacker.id, defender.id]); return { needsConfirmation: true, target: defender.name }; }
    if (unlawfulAttack) {
      const [confirmedRows] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM player_pvp_attack_confirmations WHERE attacker_character_id=? AND target_character_id=? AND expires_at>NOW() FOR UPDATE', [attacker.id, defender.id]);
      if (!confirmedRows[0]) throw new Error('攻击确认已失效，请重新选择攻击目标。');
      await connection.execute('DELETE FROM player_pvp_attack_confirmations WHERE attacker_character_id=?', [attacker.id]);
      await connection.execute('INSERT INTO player_warrants (wanted_character_id,city_region_id,status) VALUES (?,?,\'active\')', [attacker.id, attacker.current_region_id]);
      await recordWarrantSighting(connection, Number(attacker.id), Number(attacker.current_region_id), Number(attacker.pos_x), Number(attacker.pos_y));
    }
    if (!defenderWarrant) await recordWarrantVictim(connection, await wanted(connection, Number(attacker.id), Number(attacker.current_region_id)), Number(defender.id));
  }
  const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_pvp_battle_sessions WHERE state='active' AND (attacker_character_id IN (?,?) OR defender_character_id IN (?,?)) LIMIT 1 FOR UPDATE`, [attacker.id, defender.id, attacker.id, defender.id]);
  if (occupied[0]) throw new Error('其中一方正在进行玩家对战。');
  const id = randomUUID(); await connection.execute('INSERT INTO player_pvp_battle_sessions (id,attacker_character_id,defender_character_id,attacker_hp,attacker_mp,defender_hp,defender_mp,attacker_cooldowns,defender_cooldowns) VALUES (?,?,?,?,?,?,?,JSON_OBJECT(),JSON_OBJECT())', [id, attacker.id, defender.id, attacker.current_hp, attacker.current_mp, defender.current_hp, defender.current_mp]);
  return { needsConfirmation: false, target: defender.name };
});

/** BOSS 伏击的战后接管：不走城镇红名确认，也不受通常感知距离限制。 */
export const startAmbushPvpBattle = async (attackerCharacterId: number, defenderCharacterId: number, spawnId: number, delivery: PvpAmbushDelivery) => withTransaction(async connection => {
  const [fighters] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id IN (?,?) AND npc_code IS NULL FOR UPDATE', [attackerCharacterId, defenderCharacterId]);
  const attacker = fighters.find(row => Number(row.id) === Number(attackerCharacterId));
  const defender = fighters.find(row => Number(row.id) === Number(defenderCharacterId));
  if (!attacker || !defender || Number(attacker.id) === Number(defender.id)) throw new Error('伏击目标已经离开战场。');
  if (attacker.activity_status !== 'active' || defender.activity_status !== 'active') throw new Error('伏击条件已失效，战场中的一方无法继续战斗。');
  const [occupied] = await connection.execute<RowDataPacket[]>(`SELECT 1 FROM player_pvp_battle_sessions
    WHERE state='active' AND (attacker_character_id IN (?,?) OR defender_character_id IN (?,?)) LIMIT 1 FOR UPDATE`, [attacker.id, defender.id, attacker.id, defender.id]);
  if (occupied[0]) throw new Error('伏击目标已进入另一场玩家对战。');
  const id = randomUUID();
  await connection.execute(`INSERT INTO player_pvp_battle_sessions
    (id,attacker_character_id,defender_character_id,attacker_hp,attacker_mp,defender_hp,defender_mp,attacker_cooldowns,defender_cooldowns,ambush_spawn_id,ambush_delivery_scope,ambush_delivery_target_id,ambush_delivery_bot_id)
    VALUES (?,?,?,?,?,?,?,JSON_OBJECT(),JSON_OBJECT(),?,?,?,?)`, [id, attacker.id, defender.id, attacker.current_hp, attacker.current_mp, defender.current_hp, defender.current_mp, spawnId, delivery.scope, delivery.targetId, delivery.botId ?? null]);
  return { target: defender.name };
});

export const pvpBattleStatus = async (qqUserId: string) => withTransaction(async connection => {
  const character = await characterFor(connection, qqUserId); const battle = await activePvpBattle(connection, Number(character.id), true); if (!battle) throw new Error('当前不在玩家对战中。'); return sessionView(connection, battle, character);
});

export const pvpCombatAction = async (qqUserId: string, type: 'attack' | 'skill' | 'item' | 'escape' | 'auto', slot?: number) => withTransaction(async connection => {
  const requester = await characterFor(connection, qqUserId); const battle = await activePvpBattle(connection, Number(requester.id), true); if (!battle) throw new Error('当前不在玩家对战中。');
  if (Number(requester.id) !== Number(battle.attacker_character_id)) throw new Error('对方正在发起攻击，你会按 PVP 自动战斗配置进行反击。');
  if (type === 'escape') { await connection.execute("UPDATE player_pvp_battle_sessions SET state='escaped' WHERE id=?", [battle.id]); return { ended: true, log: `战斗<${battle.turn_no}>回合\n➤【${requester.name}】撤离了战斗。`, settlement: '你脱离了玩家对战。', requesterId: Number(requester.id), winnerId: null, winnerName: null }; }
  const [fighters] = await connection.execute<PvpCharacter[]>('SELECT * FROM characters WHERE id IN (?,?) ORDER BY id FOR UPDATE', [battle.attacker_character_id, battle.defender_character_id]);
  const attacker = fighters.find(row => Number(row.id) === Number(battle.attacker_character_id)); const defender = fighters.find(row => Number(row.id) === Number(battle.defender_character_id)); if (!attacker || !defender) throw new Error('对战对象已失效。');
  attacker.current_hp = Number(battle.attacker_hp); attacker.current_mp = Number(battle.attacker_mp); defender.current_hp = Number(battle.defender_hp); defender.current_mp = Number(battle.defender_mp);
  const cooldowns = record(battle.attacker_cooldowns); let action = await battleActionFromSlot(connection, attacker, type, slot);
  if (action?.type === 'skill') { if (Number(attacker.current_mp) < action.manaCost) { if (type === 'auto') action = { type: 'attack' }; else throw new Error('魔力不足，无法释放该技能。'); } else if (Number(cooldowns[action.code] ?? 0) > 0) { if (type === 'auto') action = { type: 'attack' }; else throw new Error(`「${action.name}」冷却中。`); } }
  const first = await resolveAction(connection, attacker, defender, action ?? { type: 'attack' }); if (action?.type === 'skill') cooldowns[action.code] = action.cooldown + 1;
  const log = [actionLog(first.text)]; let ended = first.defeated; let winnerId: number | null = first.defeated ? Number(attacker.id) : null; let winnerName: string | null = first.defeated ? attacker.name : null; let restitutionId = first.restitution?.id; let settlement = first.defeated ? `【${attacker.name}】获得了胜利。${first.settlement ? `\n${first.settlement}` : ''}` : '';
  const defenderCooldowns = record(battle.defender_cooldowns);
  if (!ended) {
    let counter = await actionFor(connection, defender); if (counter.type === 'skill' && (Number(defender.current_mp) < counter.manaCost || Number(defenderCooldowns[counter.code] ?? 0) > 0)) counter = { type: 'attack' };
    const second = await resolveAction(connection, defender, attacker, counter); if (counter.type === 'skill') defenderCooldowns[counter.code] = counter.cooldown + 1;
    log.push(actionLog(second.text)); ended = second.defeated; if (ended) { winnerId = Number(defender.id); winnerName = defender.name; restitutionId = second.restitution?.id; settlement = `【${defender.name}】获得了胜利。${second.settlement ? `\n${second.settlement}` : ''}`; }
  }
  const nextAttackerCooldowns = tickCooldowns(cooldowns); const nextDefenderCooldowns = tickCooldowns(defenderCooldowns);
  await connection.execute(`UPDATE player_pvp_battle_sessions SET attacker_hp=?,attacker_mp=?,defender_hp=?,defender_mp=?,attacker_cooldowns=?,defender_cooldowns=?,turn_no=turn_no+1,state=? WHERE id=?`, [Math.max(0, Number(attacker.current_hp)), Math.max(0, Number(attacker.current_mp)), Math.max(0, Number(defender.current_hp)), Math.max(0, Number(defender.current_mp)), JSON.stringify(nextAttackerCooldowns), JSON.stringify(nextDefenderCooldowns), ended ? (first.defeated ? 'attacker_win' : 'defender_win') : 'active', battle.id]);
  if (!ended) {
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [Math.max(0, Number(attacker.current_hp)), Math.max(0, Number(attacker.current_mp)), attacker.id]);
    await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [Math.max(0, Number(defender.current_hp)), Math.max(0, Number(defender.current_mp)), defender.id]);
  }
  else if (winnerId === Number(attacker.id)) await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [Math.max(1, Number(attacker.current_hp)), Math.max(0, Number(attacker.current_mp)), attacker.id]);
  else if (winnerId === Number(defender.id)) await connection.execute('UPDATE characters SET current_hp=?,current_mp=? WHERE id=?', [Math.max(1, Number(defender.current_hp)), Math.max(0, Number(defender.current_mp)), defender.id]);
  const ambushDelivery = battle.ambush_spawn_id ? { scope: battle.ambush_delivery_scope === 'group' ? 'group' as const : 'c2c' as const, targetId: battle.ambush_delivery_target_id || '', botId: battle.ambush_delivery_bot_id || undefined } : undefined;
  return { ended, log: `战斗<${battle.turn_no}>回合\n${log.join('\n————————\n')}`, settlement, restitutionId, requesterId: Number(requester.id), winnerId, winnerName, ambushSpawnId: battle.ambush_spawn_id ? Number(battle.ambush_spawn_id) : undefined, ambushDelivery };
});

export const restitutionDetail = async (qqUserId: string, restitutionId: string) => {
  const pool = await getPool();
  const [characterRows] = await pool.execute<(RowDataPacket & { id: number })[]>('SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1', [qqUserId]);
  const character = characterRows[0]; if (!character) throw new Error('请先注册角色。');
  const [rows] = await pool.execute<(RowDataPacket & { original_owner_character_id: number; owner_name: string; item_name: string | null; quantity: number; held_quantity: number; sold_quantity: number; copper_amount: number; sale_copper_amount: number; restitution_charged_copper: number; restitution_debt_copper: number })[]>(`SELECT sl.*,o.name AS owner_name,i.name AS item_name FROM pvp_stolen_loot sl
    JOIN characters o ON o.id=sl.original_owner_character_id LEFT JOIN item_definitions i ON i.id=sl.item_id
    WHERE sl.restitution_id=? AND (sl.holder_character_id=? OR sl.original_owner_character_id=? OR EXISTS (SELECT 1 FROM player_warrants w WHERE w.captured_by_character_id=? AND w.wanted_character_id=sl.holder_character_id))
    ORDER BY sl.id`, [restitutionId, character.id, character.id, character.id]);
  if (!rows.length) throw new Error('未找到这份失物返还记录。');
  return rows.map(row => ({ owner: row.owner_name, name: row.item_name, quantity: Number(row.quantity), held: Number(row.held_quantity), sold: Number(row.sold_quantity), coins: Number(row.copper_amount), sale: Number(row.sale_copper_amount), charged: Number(row.restitution_charged_copper), debt: Number(row.restitution_debt_copper) }));
};

export const cityWantedAlert = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; game_id: number; pos_x: number; pos_y: number; region_name: string })[]>(`SELECT w.id,c.name,c.game_id,c.pos_x,c.pos_y,r.name AS region_name FROM characters c
    JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id
    JOIN player_warrants w ON w.wanted_character_id=c.id AND w.city_region_id=c.current_region_id AND w.status='active'
    WHERE p.qq_user_id=? AND r.code='baina_town' LIMIT 1`, [qqUserId]);
  return rows[0] ? { warrantId: Number(rows[0].id), name: rows[0].name, gameId: Number(rows[0].game_id), x: Number(rows[0].pos_x), y: Number(rows[0].pos_y), regionName: rows[0].region_name } : null;
};

/** 百纳镇居民发言时可被动获知的、正暴露行踪的其他通缉者。 */
export const townPassiveWantedAlert = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; game_id: number; pos_x: number; pos_y: number; region_name: string })[]>(`SELECT w.id,c.name,c.game_id,c.pos_x,c.pos_y,r.name AS region_name
    FROM players viewer_player JOIN characters viewer ON viewer.player_id=viewer_player.id
    JOIN player_warrants w ON w.status='active' AND w.city_region_id=viewer.current_region_id
    JOIN characters c ON c.id=w.wanted_character_id AND c.current_region_id=w.city_region_id
    JOIN map_regions r ON r.id=w.city_region_id
    WHERE viewer_player.qq_user_id=? AND r.code='baina_town' AND c.id<>viewer.id
    ORDER BY w.created_at DESC LIMIT 1`, [qqUserId]);
  return rows[0] ? { warrantId: Number(rows[0].id), name: rows[0].name, gameId: Number(rows[0].game_id), x: Number(rows[0].pos_x), y: Number(rows[0].pos_y), regionName: rows[0].region_name } : null;
};

const futureCooldown = (value: unknown) => value ? new Date(String(value)).getTime() > Date.now() : false;

/** 入城主动通报：每张通缉令在每个群内独立冷却十分钟。 */
export const reserveWarrantEntryNotice = async (warrantId: number, groupOpenId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { available_at: Date | string; updated_at: Date | string })[]>('SELECT available_at,updated_at FROM player_warrant_notice_cooldowns WHERE notice_type=\'entry\' AND warrant_id=? AND group_openid=? AND recipient_qq_user_id=\'\' FOR UPDATE', [warrantId, groupOpenId]);
  // 早期版本曾将入城广播写成一小时冷却；以最近广播时间计算，旧记录也立即遵从十分钟规则。
  if (rows[0] && new Date(rows[0].updated_at).getTime() + 10 * 60 * 1000 > Date.now()) return false;
  await connection.execute(`INSERT INTO player_warrant_notice_cooldowns (notice_type,warrant_id,group_openid,recipient_qq_user_id,available_at)
    VALUES ('entry',?,?,'',DATE_ADD(NOW(),INTERVAL 10 MINUTE))
    ON DUPLICATE KEY UPDATE available_at=VALUES(available_at)`, [warrantId, groupOpenId]);
  return true;
});

/** 被动提示：同一玩家一小时一次，同群不同玩家合计一分钟一次。 */
export const reservePassiveWarrantNotice = async (warrantId: number, groupOpenId: string, recipientQqUserId: string) => withTransaction(async connection => {
  const [rows] = await connection.execute<(RowDataPacket & { notice_type: 'passive_player' | 'passive_group'; available_at: Date | string })[]>(`SELECT notice_type,available_at FROM player_warrant_notice_cooldowns
    WHERE warrant_id=? AND ((notice_type='passive_player' AND group_openid='' AND recipient_qq_user_id=?) OR (notice_type='passive_group' AND group_openid=? AND recipient_qq_user_id='')) FOR UPDATE`, [warrantId, recipientQqUserId, groupOpenId]);
  if (rows.some(row => futureCooldown(row.available_at))) return false;
  await connection.execute(`INSERT INTO player_warrant_notice_cooldowns (notice_type,warrant_id,group_openid,recipient_qq_user_id,available_at) VALUES
    ('passive_player',?,'',?,DATE_ADD(NOW(),INTERVAL 1 HOUR)),
    ('passive_group',?,?,'',DATE_ADD(NOW(),INTERVAL 1 MINUTE))
    ON DUPLICATE KEY UPDATE available_at=VALUES(available_at)`, [warrantId, recipientQqUserId, warrantId, groupOpenId]);
  return true;
});

export const playerPvpStatus = async (qqUserId: string) => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { wanted: number; detained_until: Date | null })[]>(`SELECT c.detained_until,
    EXISTS(SELECT 1 FROM player_warrants w WHERE w.wanted_character_id=c.id AND w.status='active') AS wanted
    FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  const row = rows[0];
  return { wanted: Boolean(row?.wanted), detainedUntil: row?.detained_until ?? null };
};

export const warrantsFor = async () => {
  const pool = await getPool();
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; game_id: number; region_name: string; pos_x: number; pos_y: number; exposed: number; reward_copper: number; reward_items: number })[]>(`SELECT w.id,c.name,c.game_id,r.name AS region_name,c.pos_x,c.pos_y,
    (c.current_region_id=w.city_region_id) AS exposed,
    COALESCE(SUM(CASE WHEN wr.claimed_at IS NULL THEN wr.copper_amount ELSE 0 END),0) AS reward_copper,
    COALESCE(SUM(CASE WHEN wr.claimed_at IS NULL THEN wr.quantity ELSE 0 END),0) AS reward_items
    FROM player_warrants w JOIN characters c ON c.id=w.wanted_character_id JOIN map_regions r ON r.id=w.city_region_id
    LEFT JOIN player_warrant_rewards wr ON wr.warrant_id=w.id
    WHERE w.status='active' GROUP BY w.id,c.id,r.id ORDER BY w.created_at DESC`);
  return rows.map(row => ({ id: Number(row.id), name: row.name, gameId: Number(row.game_id), regionName: row.region_name, x: Number(row.pos_x), y: Number(row.pos_y), exposed: Boolean(row.exposed), copper: Number(row.reward_copper), items: Number(row.reward_items) }));
};

export const townWarrantsFor = async (qqUserId: string, filter: '已暴露' | '近期露面' | '无行踪' | '全部' = '全部') => {
  const pool = await getPool();
  const [viewerRows] = await pool.execute<(RowDataPacket & { region_id: number; region_name: string; region_code: string })[]>(`SELECT c.current_region_id AS region_id,r.name AS region_name,r.code AS region_code
    FROM characters c JOIN players p ON p.id=c.player_id JOIN map_regions r ON r.id=c.current_region_id WHERE p.qq_user_id=? LIMIT 1`, [qqUserId]);
  const viewer = viewerRows[0]; if (!viewer) throw new Error('请先注册角色。');
  if (viewer.region_code !== 'baina_town') throw new Error('请先前往城镇，再查看当地的通缉令。');
  const [rows] = await pool.execute<(RowDataPacket & { id: number; name: string; region_name: string; current_region_id: number; pos_x: number; pos_y: number; last_seen_at: Date | null; last_seen_x: number | null; last_seen_y: number | null; victim_count: number; reward_copper: number; reward_items: string | null })[]>(`SELECT w.id,c.name,r.name AS region_name,c.current_region_id,c.pos_x,c.pos_y,w.last_seen_at,w.last_seen_x,w.last_seen_y,
    COALESCE(v.victim_count,0) AS victim_count,COALESCE(rw.reward_copper,0) AS reward_copper,rw.reward_items
    FROM player_warrants w JOIN characters c ON c.id=w.wanted_character_id JOIN map_regions r ON r.id=w.city_region_id
    LEFT JOIN (SELECT warrant_id,COUNT(*) AS victim_count FROM player_warrant_victims GROUP BY warrant_id) v ON v.warrant_id=w.id
    LEFT JOIN (SELECT wr.warrant_id,SUM(CASE WHEN wr.claimed_at IS NULL THEN wr.copper_amount ELSE 0 END) AS reward_copper,
      GROUP_CONCAT(DISTINCT CASE WHEN wr.claimed_at IS NULL AND wi.name IS NOT NULL THEN CONCAT(wi.name,'×',wr.quantity) END ORDER BY wi.id SEPARATOR '｜') AS reward_items
      FROM player_warrant_rewards wr LEFT JOIN item_definitions wi ON wi.id=wr.reward_item_id GROUP BY wr.warrant_id) rw ON rw.warrant_id=w.id
    WHERE w.status='active' AND w.city_region_id=?
    ORDER BY (c.current_region_id=w.city_region_id) DESC,(w.last_seen_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) DESC,w.last_seen_at DESC,w.created_at DESC`, [viewer.region_id]);
  const mapped = rows.map(row => {
    const exposed = Number(row.current_region_id) === Number(viewer.region_id);
    const recent = !exposed && row.last_seen_at !== null && new Date(row.last_seen_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000;
    const victims = Math.max(1, Number(row.victim_count));
    const stars = victims >= 15 ? 5 : victims >= 10 ? 4 : victims >= 6 ? 3 : victims >= 3 ? 2 : 1;
    return { id: Number(row.id), name: row.name, regionName: row.region_name, x: exposed ? Number(row.pos_x) : Number(row.last_seen_x ?? 0), y: exposed ? Number(row.pos_y) : Number(row.last_seen_y ?? 0), exposed, recent, stars, copper: Number(row.reward_copper), items: row.reward_items ?? '' };
  });
  return { regionName: viewer.region_name, warrants: filter === '全部' ? mapped : mapped.filter(warrant => filter === '已暴露' ? warrant.exposed : filter === '近期露面' ? warrant.recent : !warrant.exposed && !warrant.recent) };
};

/** 仅返回正身处其被通缉城镇、可被公开追踪的目标。 */
export const exposedWarrantsFor = async () => (await warrantsFor()).filter(warrant => warrant.exposed);

export const addWarrantReward = async (qqUserId: string, warrantId: number, itemId: number | null, quantity: number, copper: number) => withTransaction(async connection => {
  const issuer = await characterFor(connection, qqUserId); const [warrants] = await connection.execute<(RowDataPacket & { wanted_character_id: number })[]>('SELECT wanted_character_id FROM player_warrants WHERE id=? AND status=\'active\' FOR UPDATE', [warrantId]); const warrant = warrants[0]; if (!warrant) throw new Error('该通缉令已失效。');
  const [eligible] = await connection.execute<RowDataPacket[]>('SELECT 1 FROM pvp_stolen_loot WHERE original_owner_character_id=? AND holder_character_id=? AND returned_at IS NULL LIMIT 1 FOR UPDATE', [issuer.id, warrant.wanted_character_id]);
  if (!eligible[0]) throw new Error('只有被该通缉者夺走失物的玩家可以追加赏金。');
  if (copper > 0) { const [spent] = await connection.execute<any>('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [copper, issuer.id, copper]); if (!Number(spent.affectedRows)) throw new Error('铜币不足。'); }
  if (itemId) { const [items] = await connection.execute<(RowDataPacket & { quantity: number; name: string })[]>('SELECT pi.quantity,i.name FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.item_id=? AND i.is_tradeable=1 FOR UPDATE', [issuer.id, itemId]); if (!items[0] || Number(items[0].quantity) < quantity) throw new Error('用于悬赏的物品数量不足或不可交易。'); await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, issuer.id, itemId]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [issuer.id, itemId]); }
  await connection.execute('INSERT INTO player_warrant_rewards (warrant_id,issuer_character_id,reward_item_id,quantity,copper_amount) VALUES (?,?,?,?,?)', [warrantId, issuer.id, itemId, quantity, copper]);
  return { copper, quantity };
});
