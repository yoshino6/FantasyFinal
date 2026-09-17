import { withTransaction, getPool } from '../database/pool.js';
import { folioSkillByCode, folioSkills } from './active-folio-skills.config.js';
import { grantInventory } from './inventory-binding.js';
import { assertOpeningFree } from './opening-state.js';

const folioShopNames = { bookshop: '百味书屋', worldtree_skill_shop: '翠庭秘藏', leaf_skill_shop: '云海星咏' };
const owner = async (db, user, lock = false) => {
    const [rows] = await db.execute(`SELECT c.* FROM characters c JOIN players p ON p.id=c.player_id WHERE p.qq_user_id=?${lock ? ' FOR UPDATE' : ''}`, [user]);
    if (!rows[0])
        throw new Error('请先注册角色。');
    return rows[0];
};
const ownedSkillBook = async (db, characterId, code) => {
    const [rows] = await db.execute(`SELECT 1 FROM player_inventory pi JOIN item_definitions i ON i.id=pi.item_id WHERE pi.character_id=? AND pi.quantity>0 AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.skillBook'))=?
    UNION ALL SELECT 1 FROM player_home_storage_items si JOIN player_homes h ON h.id=si.home_id JOIN item_definitions i ON i.id=si.item_id WHERE h.character_id=? AND si.quantity>0 AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_json,'$.skillBook'))=? LIMIT 1`, [characterId, code, characterId, code]);
    return Boolean(rows.length);
};
const discovered = async (db, id, code) => { const [rows] = await db.execute(`SELECT 1 FROM skill_definitions s LEFT JOIN player_skill_discoveries d ON d.skill_id=s.id AND d.character_id=? LEFT JOIN player_skills ps ON ps.skill_id=s.id AND ps.character_id=? WHERE s.code=? AND (d.skill_id IS NOT NULL OR ps.skill_id IS NOT NULL) LIMIT 1`, [id, id, code]); return Boolean(rows.length); };
const folioShopCatalog = async (user, shop, page = 1, filter = '全部', tier = '全部') => {
    if (!folioShopNames[shop])
        throw new Error('未知战技商店。');
    const db = await getPool(), character = await owner(db, user);
    const list = folioSkills.filter(s => s.shop === shop && (tier === '全部' || s.tier === tier) && (filter === '全部' || filter === '物理' && s.category === 'physical' || filter === '魔法' && s.category === 'magic' || filter === '净化' && /^folio_s0[1-6]$/.test(s.code) || filter === '增益' && s.category === 'utility' && !/^folio_s0[1-6]$/.test(s.code)));
    const pages = Math.max(1, Math.ceil(list.length / 5));
    const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
    const items = await Promise.all(list.slice((current - 1) * 5, current * 5).map(async (s) => ({ ...s, known: await discovered(db, Number(character.id), s.code), owned: await ownedSkillBook(db, Number(character.id), s.code) })));
    return { shop, name: folioShopNames[shop], items, page: current, pages, filter, tier, level: Number(character.level), copper: Number(character.copper_coins) };
};
const buyFolioBook = async (user, code, confirmed = false, useVoucher = false) => withTransaction(async (db) => {
    const skill = folioSkillByCode(code);
    if (!skill)
        throw new Error('未知战技。');
    const character = await owner(db, user, true);
    await assertOpeningFree(db, Number(character.id));
    await (await import('./lamplight.service.js')).assertLamplightIdle(db, Number(character.id));
    if (character.activity_status !== 'active')
        throw new Error('请先结束当前行动。');
    const [place] = await db.execute('SELECT n.* FROM map_npcs n JOIN map_regions r ON r.id=n.region_id WHERE n.code=? AND r.is_enabled=1 AND r.is_owner_only=0', [skill.shop]);
    const npc = place[0];
    if (!npc || Number(npc.region_id) !== Number(character.current_region_id) || Number(npc.pos_x) !== Number(character.pos_x) || Number(npc.pos_y) !== Number(character.pos_y) || Number(npc.pos_z) !== Number(character.pos_z))
        throw new Error('请先到对应战技商店，不能远程购买。');
    if (skill.shop === 'leaf_skill_shop')
        await (await import('./leaf-route.service.js')).assertLeafPermit(db, Number(character.id));
    if (await discovered(db, Number(character.id), code))
        throw new Error('已领悟或已学会，无需重复购买。');
    if (await ownedSkillBook(db, Number(character.id), code))
        throw new Error('背包或仓库已有未读技能书，请先研读。');
    if (Number(character.level) < skill.learnLevel && !confirmed)
        throw new Error(`本书需要Lv.${skill.learnLevel}才能学习；当前仅可领悟，请在详情中确认提前购买。`);
    const [offers] = await db.execute('SELECT item_id,price FROM skill_shop_offers WHERE skill_code=? AND shop_code=? AND is_active=1 FOR UPDATE', [code, skill.shop]);
    if (!offers[0])
        throw new Error('商品已下架。');
    let discount = 0;
    if (useVoucher) {
        const [vouchers] = await db.execute('SELECT granted,used FROM player_folio_vouchers WHERE character_id=? FOR UPDATE', [character.id]);
        if (!vouchers[0]?.granted || vouchers[0]?.used)
            throw new Error('没有可用的战技抵用券。');
        discount = Math.min(150, Number(offers[0].price));
        await db.execute('UPDATE player_folio_vouchers SET used=1 WHERE character_id=? AND used=0', [character.id]);
    }
    const price = Number(offers[0].price) - discount;
    const [spent] = await db.execute('UPDATE characters SET copper_coins=copper_coins-? WHERE id=? AND copper_coins>=?', [price, character.id, price]);
    if (!spent.affectedRows)
        throw new Error('铜币不足，购买未完成。');
    await grantInventory(db, Number(character.id), Number(offers[0].item_id), { trade: 0, personal: 1, unbound: 0 });
    await db.execute('INSERT IGNORE INTO player_item_codex(character_id,item_id) VALUES (?,?)', [character.id, offers[0].item_id]);
    return { name: skill.name, itemId: Number(offers[0].item_id), price, discount };
});

export { buyFolioBook, folioShopCatalog, folioShopNames, ownedSkillBook };
