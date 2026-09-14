import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { guildContributionSalePrice, guildSkillBookContributionPrice } from '../src/game/skill-access.config';
import { guildMapContributionPrice } from '../src/game/guild-map.service';

// 使用真实业务函数与查询替身核对币种；不连接玩家数据库。
const source = ts.createSourceFile('guild-shop.service.ts', readFileSync(new URL('../src/game/guild-shop.service.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['pageInfo', 'validQuantity', 'purchasableMaps', 'skillBookPrice', 'shopCatalog', 'buyShopItem', 'sellShopItem'];
const declarations = source.statements.filter(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(source))));
assert.equal(declarations.length, names.length);
const compiled = ts.transpileModule(declarations.map(declaration => declaration.getText(source).replace(/^export\s+/, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

const fixture = (stolen = false) => {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  const grants: Array<{ itemId: number; binding: unknown }> = [];
  let owned = false, balance = 10000, debitSucceeded = true;
  const maps = [
    { id: 11, code: 'map_low', name: '地图·低危', description: '', codexId: '11', risk: '低危' },
    { id: 12, code: 'map_mid', name: '地图·中危', description: '', codexId: '12', risk: '中危' },
    { id: 13, code: 'map_high', name: '地图·高危', description: '', codexId: '13', risk: '高危' },
    { id: 14, code: 'map_unknown', name: '地图·待勘测', description: '', codexId: '14', risk: '待勘测' }
  ];
  const connection = { execute: async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT item_category FROM item_definitions')) return [[{ item_category: Number(args[0]) >= 11 ? '地图' : '技能书' }]];
    if (sql.startsWith('SELECT COUNT(*) AS total FROM guild_shop_items')) return [[{ total: String(args[0]).includes('中危') ? 0 : 1 }]];
    if (sql.includes('FROM guild_shop_items si JOIN item_definitions i')) return [String(args[1] ?? '').includes('中危') ? [] : [{ id: 8, name: '技能书·风切回环', item_type: 'consumable', item_category: '技能书', trade_price: 0, rarity: '普通', buy_price: 400, stock_quantity: 99, skill_code: 'resident_a03', skill_tier: '下位' }]];
    if (sql.startsWith('SELECT item_id,SUM(quantity)')) return [[]];
    if (sql.startsWith('SELECT 1 FROM player_inventory')) return [owned ? [{ found: 1 }] : []];
    if (sql.includes('FROM skill_definitions s LEFT JOIN player_skills')) return [[]];
    if (sql.includes('FROM player_inventory pi JOIN item_definitions i')) return [[{ id: 9, name: '魔兽皮', item_type: 'material', item_category: '材料', quantity: 3, personal_bound_quantity: 0, trade_bound_quantity: 0, sell_price: 30 }]];
    if (sql.startsWith('SELECT 1 FROM pvp_stolen_loot')) return [stolen ? [{ 1: 1 }] : []];
    writes.push({ sql, args });
    if (sql.startsWith('UPDATE characters SET guild_contribution=guild_contribution-')) return [{ affectedRows: debitSucceeded ? 1 : 0 }];
    return [{ affectedRows: 1 }];
  } };
  const deps = {
    PAGE_SIZE: 5,
    getPool: async () => connection,
    withTransaction: async (run: (connection: typeof connection) => unknown) => run(connection),
    characterFor: async () => ({ id: 5, guild_contribution: balance }),
    guildMapCatalog: async () => maps,
    guildMapContributionPrice,
    guildSkillBookContributionPrice,
    openingShopQuote: async (_connection: unknown, _id: number, item: { buy_price: number }, amount: number) => ({ base: item.buy_price * amount, price: item.buy_price * amount, credit: 0, discount: 0 }),
    payOpeningShopDiscount: async () => {},
    grantInventory: async (_connection: unknown, _id: number, itemId: number, binding: unknown) => { grants.push({ itemId, binding }); },
    achievementItem: async () => {},
    guildContributionSalePrice
  };
  const service = new Function(...Object.keys(deps), `${compiled}\nreturn { shopCatalog, buyShopItem, sellShopItem };`)(...Object.values(deps));
  return { service, writes, grants, maps, setOwned: (value: boolean) => { owned = value; }, setBalance: (value: number) => { balance = value; }, setDebitSucceeded: (value: boolean) => { debitSucceeded = value; } };
};

test('公会购买只扣贡献度，技能书限购一本且个人绑定', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.buyShopItem('qq', 8), { name: '技能书·风切回环', quantity: 1, price: 500 });
  assert.deepEqual(f.writes.find(write => write.sql.startsWith('UPDATE characters'))?.args, [500, 5, 500]);
  assert.ok(f.writes.some(write => write.sql.startsWith('UPDATE characters SET guild_contribution=')));
  assert.ok(!f.writes.some(write => write.sql.includes('copper_coins')));
  assert.deepEqual(f.grants, [{ itemId: 8, binding: { trade: 0, personal: 1, unbound: 0 } }]);
  await assert.rejects(f.service.buyShopItem('qq', 8, 2), /只能兑换一本/);
});

test('公会回售发贡献度，赃物拒绝兑换', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.sellShopItem('qq', 9, 2), { name: '魔兽皮', quantity: 2, price: 6 });
  assert.deepEqual(f.writes.find(write => write.sql.startsWith('UPDATE characters'))?.args, [6, 5]);
  assert.ok(!f.writes.some(write => write.sql.includes('copper_coins')));
  const stolen = fixture(true);
  await assert.rejects(stolen.service.sellShopItem('qq', 9), /赃物/);
  assert.ok(!stolen.writes.some(write => write.sql.startsWith('UPDATE characters')));
});

test('技能书按位阶基价和已评定强度定价，浮动不超过五成', () => {
  assert.equal(guildSkillBookContributionPrice('基础', 'future_skill'), 100);
  assert.equal(guildSkillBookContributionPrice('下位', 'resident_a03'), 500);
  assert.equal(guildSkillBookContributionPrice('下位', 'resident_b05'), 700);
  assert.equal(guildSkillBookContributionPrice('下位', 'resident_h08'), 250);
  assert.equal(guildSkillBookContributionPrice('中位', 'future_skill'), 2000);
  assert.equal(guildSkillBookContributionPrice('上位', 'future_skill'), null);
});

test('公会商店列出所有已开放且已定价地图，技能书显示新价格', async () => {
  const f = fixture();
  const catalog = await f.service.shopCatalog('qq');
  assert.deepEqual(catalog.items.map((item: { id: number; price: number }) => [item.id, item.price]), [[11, 200], [12, 1000], [13, 10000], [8, 500]]);
  assert.equal(catalog.items[0].stockQuantity, null);
  assert.equal(catalog.totalPages, 1);
  const filtered = await f.service.shopCatalog('qq', 1, '中危');
  assert.deepEqual(filtered.items.map((item: { id: number }) => item.id), [12]);
  f.maps.push(...[16, 17, 18].map(id => ({ id, code: `map_${id}`, name: `地图·${id}`, description: '', codexId: String(id), risk: '低危' })));
  const first = await f.service.shopCatalog('qq', 1);
  const second = await f.service.shopCatalog('qq', 2);
  assert.deepEqual(first.items.map((item: { id: number }) => item.id), [11, 12, 13, 16, 17]);
  assert.deepEqual(second.items.map((item: { id: number }) => item.id), [18, 8]);
  assert.equal(second.totalPages, 2);
});

test('地图购买按风险扣贡献度，旧货架价无效，重复与停用地图不扣费', async () => {
  const f = fixture();
  await assert.rejects(f.service.buyShopItem('qq', 11, 2), /地图一次只能购买一张/);
  await assert.rejects(f.service.buyShopItem('qq', 14), /危险等级尚未勘定/);
  await assert.rejects(f.service.buyShopItem('qq', 15), /尚未开放/);
  assert.equal(f.writes.some(write => write.sql.startsWith('UPDATE characters')), false);
  f.setOwned(true);
  await assert.rejects(f.service.buyShopItem('qq', 11), /已经拥有/);
  f.setOwned(false);
  f.setBalance(199);
  await assert.rejects(f.service.buyShopItem('qq', 11), /贡献度不足，需要 200 点/);
  f.setBalance(10000);
  f.setDebitSucceeded(false);
  await assert.rejects(f.service.buyShopItem('qq', 11), /贡献度已变化/);
  assert.deepEqual(f.grants, []);
  f.setDebitSucceeded(true);
  for (const [id, price] of [[11, 200], [12, 1000], [13, 10000]]) {
    const before = f.writes.length;
    assert.equal((await f.service.buyShopItem('qq', id)).price, price);
    assert.deepEqual(f.writes.slice(before).find(write => write.sql.startsWith('UPDATE characters SET guild_contribution='))?.args, [price, 5, price]);
  }
  assert.deepEqual(f.grants.map(grant => grant.binding), Array(3).fill(null).map(() => ({ personal: 1, trade: 0, unbound: 0 })));
  assert.equal(f.writes.some(write => write.sql.startsWith('UPDATE guild_shop_items')), false);
});
