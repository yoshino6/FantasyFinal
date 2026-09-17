import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export const contractSpiritBaseMana = (count: number) => count <= 0 ? 0 : 60 + 60 * Math.min(3, Math.floor(count));
export const advancedDynamicMana = async (c: PoolConnection, session: string, id: number, code: string, pricedMana: number) => {
    if (code !== 'summoner_contract_spirit')
        return pricedMana;
    const [rows] = await c.execute<RowDataPacket[]>('SELECT COUNT(*) AS count FROM combat_spirits WHERE session_id=? AND owner_character_id=? AND current_hp>0', [session, id]);
    const cost = contractSpiritBaseMana(Number(rows[0]?.count));
    if (!cost)
        throw Error('场上没有存活契灵，不消耗资源。');
    return Math.max(1, Math.ceil(pricedMana * cost / 240));
};
