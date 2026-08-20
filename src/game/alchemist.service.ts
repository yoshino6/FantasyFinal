import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/pool';

const questCode = 'alchemist_apprentice';

const characterIdFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, qqUserId: string, lock = false) => {
  const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT c.id FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [qqUserId]);
  if (!rows[0]) throw new Error('请先注册角色。');
  return Number(rows[0].id);
};

export const alchemistQuest = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { status: string | null; secondary_profession_code: string | null })[]>(`SELECT q.status,c.secondary_profession_code FROM characters c LEFT JOIN player_side_quests q ON q.character_id=c.id AND q.quest_code=? WHERE c.id=?`, [questCode, characterId]);
  const [items] = await pool.execute<(RowDataPacket & { quantity: number })[]>(`SELECT pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='healing_herb'`, [characterId]);
  const herbs = Number(items[0]?.quantity ?? 0); const row = rows[0];
  const completed = row?.status === 'accepted' && herbs >= 3;
  if (completed) await pool.execute('UPDATE player_side_quests SET status=\'completed\',completed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
  return { status: completed ? 'completed' : row?.secondary_profession_code === 'alchemist' ? 'claimed' : row?.status ?? 'none', herbs } as const;
};

export const acceptAlchemistQuest = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [rows] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null; level: number })[]>('SELECT secondary_profession_code,level FROM characters WHERE id=? FOR UPDATE', [characterId]);
  if (Number(rows[0]?.level ?? 0) < 10) throw new Error('secondary_profession_level_required');
  if (rows[0]?.secondary_profession_code && rows[0].secondary_profession_code !== 'alchemist') throw new Error('你已经拥有其他副职业，无法再选择炼金师。');
  await connection.execute('INSERT INTO player_side_quests (character_id,quest_code) VALUES (?,?) ON DUPLICATE KEY UPDATE status=IF(status=\'claimed\',status,\'accepted\')', [characterId, questCode]);
});

export const claimAlchemistQuest = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true);
  const [questRows] = await connection.execute<(RowDataPacket & { status: string })[]>('SELECT status FROM player_side_quests WHERE character_id=? AND quest_code=? FOR UPDATE', [characterId, questCode]);
  if (questRows[0]?.status !== 'completed') throw new Error('任务尚未完成。');
  const [herbs] = await connection.execute<(RowDataPacket & { item_id: number; quantity: number })[]>(`SELECT pi.item_id,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.code='healing_herb' FOR UPDATE`, [characterId]);
  if (!herbs[0] || Number(herbs[0].quantity) < 3) throw new Error('微光草药不足，无法完成提纯。');
  const [gifts] = await connection.execute<(RowDataPacket & { id: number })[]>('SELECT id FROM item_definitions WHERE code=\'qinger_gift\' LIMIT 1', []);
  if (!gifts[0]) throw new Error('晴儿的赠礼尚未配置，请重启机器人以初始化物品数据。');
  const [characters] = await connection.execute<(RowDataPacket & { name: string })[]>('SELECT name FROM characters WHERE id=?', [characterId]);
  await connection.execute('UPDATE player_inventory SET quantity=quantity-3 WHERE character_id=? AND item_id=?', [characterId, herbs[0].item_id]);
  await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, herbs[0].item_id]);
  await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, gifts[0].id]);
  await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, gifts[0].id]);
  await connection.execute('UPDATE player_side_quests SET status=\'claimed\',claimed_at=NOW() WHERE character_id=? AND quest_code=?', [characterId, questCode]);
  await connection.execute('UPDATE characters SET secondary_profession_code=\'alchemist\' WHERE id=?', [characterId]);
  await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'alchemist\',1,0)', [characterId]);
  return { name: '炼金师', characterName: characters[0]?.name ?? '冒险者', giftName: '晴儿的赠礼' };
});

export const secondaryProfessionCode = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId);
  const [rows] = await pool.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>('SELECT secondary_profession_code FROM characters WHERE id=?', [characterId]);
  return rows[0]?.secondary_profession_code ?? null;
};

type AlchemistProgressRow = RowDataPacket & { level: number; proficiency: number };
type AlchemyItemRow = RowDataPacket & { id: number; code: string; name: string; item_category: string; quantity: number };
const purificationRecipes: Record<string, string> = {
  beast_bone: 'refined_beast_bone', beast_hide: 'refined_beast_hide', beast_tendon: 'refined_beast_tendon', beast_core: 'refined_beast_core',
  magic_wool: 'refined_magic_wool', magic_tusk: 'refined_magic_tusk', magic_scale: 'refined_magic_scale', magic_claw: 'refined_magic_claw', magic_heartcore: 'refined_magic_heartcore'
};
const alchemyRecipes: Record<string, string> = { beast_meat: 'blood_residue', healing_herb: 'herbal_extract', beast_core: 'mana_dust' };
const proficiencyRequired = (level: number) => level === 1 ? 10 : level === 2 ? 50 : level === 3 ? 200 : level === 4 ? 1000 : 1000 * Math.pow(5, level - 4);
const alchemistProgressFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number, lock = false) => {
  const [characters] = await connection.execute<(RowDataPacket & { secondary_profession_code: string | null })[]>(`SELECT secondary_profession_code FROM characters WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  if (characters[0]?.secondary_profession_code !== 'alchemist') throw new Error('只有炼金师可以进行提纯或炼金。');
  await connection.execute('INSERT IGNORE INTO player_secondary_professions (character_id,profession_code,level,proficiency) VALUES (?,\'alchemist\',1,0)', [characterId]);
  const [rows] = await connection.execute<AlchemistProgressRow[]>(`SELECT level,proficiency FROM player_secondary_professions WHERE character_id=?${lock ? ' FOR UPDATE' : ''}`, [characterId]);
  const level = Number(rows[0]?.level ?? 1); const proficiency = Number(rows[0]?.proficiency ?? 0);
  return { level, proficiency, required: proficiencyRequired(level), bonus: Math.max(0, (level - 1) * 5) };
};
const addAlchemistProficiency = async (connection: PoolConnection, characterId: number) => {
  const current = await alchemistProgressFor(connection, characterId, true); let level = current.level; let proficiency = current.proficiency + 1;
  while (proficiency >= proficiencyRequired(level)) { proficiency -= proficiencyRequired(level); level += 1; }
  await connection.execute('UPDATE player_secondary_professions SET level=?,proficiency=? WHERE character_id=?', [level, proficiency, characterId]);
  return { level, proficiency, required: proficiencyRequired(level), bonus: Math.max(0, (level - 1) * 5) };
};
export const alchemistProgress = async (qqUserId: string) => { const pool = await getPool(); return alchemistProgressFor(pool, await characterIdFor(pool, qqUserId)); };

export const purificationMaterials = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); await alchemistProgressFor(pool, characterId);
  const [rows] = await pool.execute<AlchemyItemRow[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.code IN (${Object.keys(purificationRecipes).map(() => '?').join(',')}) ORDER BY i.id`, [characterId, ...Object.keys(purificationRecipes)]);
  return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, category: row.item_category, quantity: Number(row.quantity), outputCode: purificationRecipes[row.code] }));
};
export const purificationState = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); const progress = await alchemistProgressFor(pool, characterId);
  const [rows] = await pool.execute<(RowDataPacket & { item_id: number | null; quantity: number; code: string | null; name: string | null; available: number | null })[]>(`SELECT s.purification_item_id AS item_id,s.purification_quantity AS quantity,i.code,i.name,pi.quantity AS available FROM player_alchemy_sessions s LEFT JOIN item_definitions i ON i.id=s.purification_item_id LEFT JOIN player_inventory pi ON pi.character_id=s.character_id AND pi.item_id=s.purification_item_id WHERE s.character_id=?`, [characterId]);
  const row = rows[0]; const amount = Number(row?.quantity ?? 0); const outputCode = row?.code ? purificationRecipes[row.code] : undefined;
  const [outputs] = outputCode ? await pool.execute<(RowDataPacket & { name: string })[]>('SELECT name FROM item_definitions WHERE code=? LIMIT 1', [outputCode]) : [[] as any];
  const success = Math.min(95, 18 + progress.bonus);
  return { progress, itemId: row?.item_id ? Number(row.item_id) : null, name: row?.name ?? null, quantity: amount, available: Number(row?.available ?? 0), outputCode, outputName: outputs[0]?.name ?? null, expectedOutput: amount * success / 100, success };
};
export const selectPurificationMaterial = async (qqUserId: string, itemId: number, quantity = 10) => withTransaction(async connection => {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('提纯数量至少为 1。');
  const characterId = await characterIdFor(connection, qqUserId, true); await alchemistProgressFor(connection, characterId, true);
  const [items] = await connection.execute<AlchemyItemRow[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id=? FOR UPDATE`, [characterId, itemId]);
  const item = items[0]; if (!item || !purificationRecipes[item.code]) throw new Error('该材料暂时无法提纯。'); if (quantity > Number(item.quantity)) throw new Error(`材料不足，最多可放入 ${item.quantity} 份。`);
  await connection.execute('INSERT INTO player_alchemy_sessions (character_id,purification_item_id,purification_quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE purification_item_id=VALUES(purification_item_id),purification_quantity=VALUES(purification_quantity)', [characterId, itemId, quantity]);
});
export const clearPurificationMaterial = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); await alchemistProgressFor(connection, characterId, true);
  await connection.execute('UPDATE player_alchemy_sessions SET purification_item_id=NULL,purification_quantity=0 WHERE character_id=?', [characterId]);
});
export const executePurification = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); const progress = await alchemistProgressFor(connection, characterId, true);
  const [rows] = await connection.execute<(AlchemyItemRow & { selected: number })[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity,s.purification_quantity AS selected FROM player_alchemy_sessions s JOIN player_inventory pi ON pi.character_id=s.character_id AND pi.item_id=s.purification_item_id JOIN item_definitions i ON i.id=s.purification_item_id WHERE s.character_id=? FOR UPDATE`, [characterId]);
  const item = rows[0]; const selected = Number(item?.selected ?? 0); const outputCode = item ? purificationRecipes[item.code] : undefined;
  if (!item || !outputCode || selected < 1 || Number(item.quantity) < selected) throw new Error('请先放入足够的可提纯材料。');
  const success = Math.min(95, 18 + progress.bonus);
  const outputQuantity = Array.from({ length: selected }, () => Math.random() * 100 < success).filter(Boolean).length;
  const succeeded = outputQuantity > 0;
  await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [selected, characterId, item.id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND item_id=? AND quantity<=0', [characterId, item.id]);
  const [outputs] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=? LIMIT 1 FOR UPDATE', [outputCode]); if (!outputs[0]) throw new Error('精材料配方尚未初始化，请重启机器人。');
  if (succeeded) { await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)', [characterId, outputs[0].id, outputQuantity]); await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, outputs[0].id]); }
  await connection.execute('UPDATE player_alchemy_sessions SET purification_item_id=NULL,purification_quantity=0 WHERE character_id=?', [characterId]); const next = await addAlchemistProficiency(connection, characterId);
  return { succeeded, inputName: item.name, inputQuantity: selected, outputName: outputs[0].name, outputQuantity, success, progress: next };
});

const alchemyStateFor = async (connection: PoolConnection | Awaited<ReturnType<typeof getPool>>, characterId: number) => {
  const [rows] = await connection.execute<(RowDataPacket & { main_id: number | null; auxiliary_id: number | null; reagent_id: number | null; main_name: string | null; auxiliary_name: string | null; reagent_name: string | null; main_code: string | null })[]>(`SELECT s.main_item_id AS main_id,s.auxiliary_item_id AS auxiliary_id,s.reagent_item_id AS reagent_id,m.name AS main_name,a.name AS auxiliary_name,r.name AS reagent_name,m.code AS main_code FROM player_alchemy_sessions s LEFT JOIN item_definitions m ON m.id=s.main_item_id LEFT JOIN item_definitions a ON a.id=s.auxiliary_item_id LEFT JOIN item_definitions r ON r.id=s.reagent_item_id WHERE s.character_id=?`, [characterId]); return rows[0] ?? { main_id: null, auxiliary_id: null, reagent_id: null, main_name: null, auxiliary_name: null, reagent_name: null, main_code: null };
};
export const alchemyState = async (qqUserId: string) => { const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); const progress = await alchemistProgressFor(pool, characterId); const state = await alchemyStateFor(pool, characterId); return { progress, mainId: state.main_id, mainName: state.main_name, auxiliaryId: state.auxiliary_id, auxiliaryName: state.auxiliary_name, reagentId: state.reagent_id, reagentName: state.reagent_name, outputName: state.main_code ? ({ beast_meat: '血肉残渣', healing_herb: '草木萃取液', beast_core: '魔力粉尘' }[state.main_code] ?? '未知炼金产物') : null }; };
export const selectAlchemyMaterial = async (qqUserId: string, role: 'main' | 'auxiliary' | 'reagent', itemKey: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); await alchemistProgressFor(connection, characterId, true); const itemId = Number(itemKey);
  const [items] = await connection.execute<AlchemyItemRow[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type='material' AND ${Number.isInteger(itemId) && itemId > 0 ? 'i.id=?' : 'i.name=?'} LIMIT 1 FOR UPDATE`, [characterId, Number.isInteger(itemId) && itemId > 0 ? itemId : itemKey]);
  const item = items[0]; if (!item) throw new Error('背包中没有该材料。'); const column = role === 'main' ? 'main_item_id' : role === 'auxiliary' ? 'auxiliary_item_id' : 'reagent_item_id';
  await connection.execute(`INSERT INTO player_alchemy_sessions (character_id,${column}) VALUES (?,?) ON DUPLICATE KEY UPDATE ${column}=VALUES(${column})`, [characterId, item.id]); return item.name;
});
export const clearAlchemyMaterial = async (qqUserId: string, role: 'main' | 'auxiliary' | 'reagent') => withTransaction(async connection => { const characterId = await characterIdFor(connection, qqUserId, true); await alchemistProgressFor(connection, characterId, true); const column = role === 'main' ? 'main_item_id' : role === 'auxiliary' ? 'auxiliary_item_id' : 'reagent_item_id'; await connection.execute(`UPDATE player_alchemy_sessions SET ${column}=NULL WHERE character_id=?`, [characterId]); });

export const alchemyMaterials = async (qqUserId: string) => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); await alchemistProgressFor(pool, characterId);
  const [rows] = await pool.execute<AlchemyItemRow[]>('SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND i.item_type=\'material\' ORDER BY i.item_category,i.name,i.id', [characterId]);
  return rows.map(row => ({ id: Number(row.id), code: row.code, name: row.name, category: row.item_category, quantity: Number(row.quantity) }));
};

type AlchemyFormulaRow = RowDataPacket & { id: number; name: string; main_item_id: number; auxiliary_item_id: number | null; reagent_item_id: number | null; main_name: string; auxiliary_name: string | null; reagent_name: string | null };
const formulaAdjectives = ['晨露', '星辉', '月影', '琥珀', '雾语', '绯红', '晴空', '秘仪'];
const formulaName = (mainName: string) => `${formulaAdjectives[Math.floor(Math.random() * formulaAdjectives.length)]}·${mainName}试作配方`;

export const saveAlchemyFormula = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); const progress = await alchemistProgressFor(connection, characterId, true); const state = await alchemyStateFor(connection, characterId);
  if (!state.main_id || !state.main_name) throw new Error('请先选择主材后再保存配方。');
  const [counts] = await connection.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM player_alchemy_formulas WHERE character_id=? FOR UPDATE', [characterId]);
  const capacity = Math.max(1, Number(progress.level)) * 3;
  if (Number(counts[0]?.total ?? 0) >= capacity) throw new Error(`快捷配方已满（${counts[0]?.total ?? 0}/${capacity}）。提升炼金师等级可增加上限。`);
  const name = formulaName(state.main_name);
  const [result] = await connection.execute<any>('INSERT INTO player_alchemy_formulas (character_id,name,main_item_id,auxiliary_item_id,reagent_item_id) VALUES (?,?,?,?,?)', [characterId, name, state.main_id, state.auxiliary_id, state.reagent_id]);
  return { id: Number(result.insertId), name, capacity };
});

export const alchemyFormulaList = async (qqUserId: string, page = 1, keyword = '') => {
  const pool = await getPool(); const characterId = await characterIdFor(pool, qqUserId); const progress = await alchemistProgressFor(pool, characterId);
  const [countRows] = await pool.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM player_alchemy_formulas WHERE character_id=? AND name LIKE ?', [characterId, `%${keyword}%`]);
  const total = Number(countRows[0]?.total ?? 0); const totalPages = Math.max(1, Math.ceil(total / 5)); const currentPage = Math.min(Math.max(1, page), totalPages);
  const [rows] = await pool.execute<AlchemyFormulaRow[]>(`SELECT f.id,f.name,f.main_item_id,f.auxiliary_item_id,f.reagent_item_id,m.name AS main_name,a.name AS auxiliary_name,r.name AS reagent_name
    FROM player_alchemy_formulas f JOIN item_definitions m ON m.id=f.main_item_id LEFT JOIN item_definitions a ON a.id=f.auxiliary_item_id LEFT JOIN item_definitions r ON r.id=f.reagent_item_id
    WHERE f.character_id=? AND f.name LIKE ? ORDER BY f.created_at,f.id LIMIT ? OFFSET ?`, [characterId, `%${keyword}%`, 5, (currentPage - 1) * 5]);
  return { capacity: Math.max(1, Number(progress.level)) * 3, total, page: currentPage, totalPages, keyword, formulas: rows.map(row => ({ id: Number(row.id), name: row.name, mainName: row.main_name, auxiliaryName: row.auxiliary_name, reagentName: row.reagent_name })) };
};

export const renameAlchemyFormula = async (qqUserId: string, formulaId: number, name: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); await alchemistProgressFor(connection, characterId, true);
  const trimmed = name.trim(); if (!trimmed || trimmed.length > 32) throw new Error('配方名称需为 1～32 个字符。');
  const [result] = await connection.execute<any>('UPDATE player_alchemy_formulas SET name=? WHERE id=? AND character_id=?', [trimmed, formulaId, characterId]); if (!result.affectedRows) throw new Error('未找到该快捷配方。');
  return trimmed;
});

export const loadAlchemyFormula = async (qqUserId: string, formulaId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); await alchemistProgressFor(connection, characterId, true);
  const [rows] = await connection.execute<AlchemyFormulaRow[]>('SELECT f.id,f.name,f.main_item_id,f.auxiliary_item_id,f.reagent_item_id,m.name AS main_name,a.name AS auxiliary_name,r.name AS reagent_name FROM player_alchemy_formulas f JOIN item_definitions m ON m.id=f.main_item_id LEFT JOIN item_definitions a ON a.id=f.auxiliary_item_id LEFT JOIN item_definitions r ON r.id=f.reagent_item_id WHERE f.id=? AND f.character_id=? FOR UPDATE', [formulaId, characterId]);
  const formula = rows[0]; if (!formula) throw new Error('未找到该快捷配方。');
  await connection.execute('INSERT INTO player_alchemy_sessions (character_id,main_item_id,auxiliary_item_id,reagent_item_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE main_item_id=VALUES(main_item_id),auxiliary_item_id=VALUES(auxiliary_item_id),reagent_item_id=VALUES(reagent_item_id)', [characterId, formula.main_item_id, formula.auxiliary_item_id, formula.reagent_item_id]);
  return formula.name;
});

export const deleteAlchemyFormula = async (qqUserId: string, formulaId: number) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); await alchemistProgressFor(connection, characterId, true);
  const [result] = await connection.execute<any>('DELETE FROM player_alchemy_formulas WHERE id=? AND character_id=?', [formulaId, characterId]); if (!result.affectedRows) throw new Error('未找到该快捷配方。');
});
export const executeAlchemy = async (qqUserId: string) => withTransaction(async connection => {
  const characterId = await characterIdFor(connection, qqUserId, true); const progress = await alchemistProgressFor(connection, characterId, true); const state = await alchemyStateFor(connection, characterId); if (!state.main_id || !state.main_code || !alchemyRecipes[state.main_code]) throw new Error('请选择可用的主材。');
  const ids = [state.main_id, state.auxiliary_id, state.reagent_id].filter((id): id is number => id !== null); const demands = new Map<number, number>(); ids.forEach(id => demands.set(id, (demands.get(id) ?? 0) + 1)); const marks = [...demands.keys()].map(() => '?').join(',');
  const [items] = await connection.execute<AlchemyItemRow[]>(`SELECT i.id,i.code,i.name,i.item_category,pi.quantity FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND i.id IN (${marks}) FOR UPDATE`, [characterId, ...demands.keys()]);
  if ([...demands.entries()].some(([id, quantity]) => Number(items.find(item => Number(item.id) === id)?.quantity ?? 0) < quantity)) throw new Error('放入的材料数量不足。');
  const outputCode = alchemyRecipes[state.main_code]; const [outputs] = await connection.execute<(RowDataPacket & { id: number; name: string })[]>('SELECT id,name FROM item_definitions WHERE code=? LIMIT 1 FOR UPDATE', [outputCode]); if (!outputs[0]) throw new Error('炼金产物尚未初始化，请重启机器人。');
  const reagentBonus = state.reagent_id ? 10 : 0; const success = Math.min(95, 70 + progress.bonus + reagentBonus); const succeeded = Math.random() * 100 < success;
  for (const [id, quantity] of demands) await connection.execute('UPDATE player_inventory SET quantity=quantity-? WHERE character_id=? AND item_id=?', [quantity, characterId, id]); await connection.execute('DELETE FROM player_inventory WHERE character_id=? AND quantity<=0', [characterId]);
  if (succeeded) { await connection.execute('INSERT INTO player_inventory (character_id,item_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1', [characterId, outputs[0].id]); await connection.execute('INSERT IGNORE INTO player_item_codex (character_id,item_id) VALUES (?,?)', [characterId, outputs[0].id]); }
  await connection.execute('UPDATE player_alchemy_sessions SET main_item_id=NULL,auxiliary_item_id=NULL,reagent_item_id=NULL WHERE character_id=?', [characterId]); const next = await addAlchemistProficiency(connection, characterId);
  return { succeeded, outputName: outputs[0].name, success, progress: next };
});
