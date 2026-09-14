import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { requireNpcAtCurrentPosition } from '../game/adventure.service';
import { acceptFinanceMission, bankSummary, bankTransfer, financeCatalog, financeMissionList, financeTrade, openBankDeposit, settleBankDeposit, type DepositProduct } from '../game/finance.service';
import { copperText, parseFinanceCopper } from '../game/finance-money';
import { financeNewsBoard, refreshFinanceMissions, settleFinancePeriod } from '../game/finance-settlement';
import { financeFaction } from '../game/finance-content';
import { messageFormat } from '../game/message';

const fail = async (message: any, title: string, error: unknown) => message.send({ format: messageFormat(title, error instanceof Error ? error.message : '请稍后重试。') });
const button = (label: string, data: string) => ({ label, data });
const actions = (...entries: Array<{ label: string; data: string }>) => {
  const group = Format.createButtonGroup();
  entries.forEach((entry, index) => { if (index % 5 === 0) group.addRow(); group.addButton(entry.label, entry.data, { type: 'command', autoEnter: false, style: 'blue' }); });
  return group;
};
const bankPanel = async (qqUserId: string) => {
  const state = await bankSummary(qqUserId);
  const md = Format.createMarkdown().addTitle('银铃钱庄·全图通存通取').addNewline().addNewline()
    .addText(`随身：${copperText(state.pocket)}｜活期：${copperText(state.demand)}`).addNewline()
    .addBlockquote(`各安全区分所共用同一账户；证券买卖使用活期余额。定存最多同时开立 3 张（现有 ${state.openCount} 张）；存取与定存请输入整数铜币，100 铜币 = 1 银币。`).addNewline().addNewline();
  if (!state.deposits.length) md.addText('暂无存单。').addNewline();
  for (const deposit of state.deposits) {
    const due = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(new Date(deposit.due));
    md.addText(`#${deposit.id} ${deposit.product}｜本金 ${copperText(deposit.principal)}｜已预留利息 ${copperText(deposit.interest)}｜${deposit.status === 'open' ? `到期 ${due}` : deposit.status === 'matured' ? '已兑付' : '提前支取'}`).addNewline();
    if (deposit.status === 'open') {
      md.addButton('[到期兑付]', { data: `/钱庄兑付 ${deposit.id}`, autoEnter: false });
      if (deposit.product !== '百日定存') md.addText(' ').addButton('[提前支取]', { data: `/钱庄提前支取 ${deposit.id}`, autoEnter: false });
      md.addNewline();
    }
  }
  md.addNewline().addBlockquote('定存利息只从钱庄现有利息池预留；不足时开单利息可能为 0，实际利息以开单回执为准。');
  return Format.create().addMarkdown(md).addButtonGroup(actions(button('存入铜币', '/钱庄存入 '), button('取出铜币', '/钱庄取出 '), button('七日定存', '/钱庄定存 七日 '), button('三十日定存', '/钱庄定存 三十日 '), button('百日定存', '/钱庄定存 百日 '), button('本所每日委托', '/每日势力委托 silverbell')));
};
const exchangePanel = async (qqUserId: string) => {
  const state = await financeCatalog(qqUserId);
  const md = Format.createMarkdown().addTitle('万叶联市·势力份额').addNewline().addNewline()
    .addText(`钱庄活期：${copperText(state.demand)}`).addNewline()
    .addBlockquote(`以银铃钱庄活期结算。真实经营业务、地图行为与新闻每四小时影响行情；单轮最多涨跌 5%，上海营业日累计最多涨跌 20%。域民投资团和交易所合计流动资金 ${copperText(state.liquidity)}，玩家持仓现价合计 ${copperText(state.obligations)}；不作无限兑付承诺。`).addNewline().addNewline();
  for (const item of state.instruments) {
    md.addText(`【${item.name}】${item.share}｜${item.status === 'open' ? `每份 ${copperText(item.price)}` : '观察中'}`).addNewline();
    if (item.status === 'open') md.addText(`持有 ${item.owned} 份｜可买 ${item.treasury + item.npcShares} 份（域民投资团持有 ${item.npcShares}） `).addButton('[买入]', { data: `/份额买入 ${item.code} 1 ${item.price}`, autoEnter: false }).addText(' ').addButton('[卖出]', { data: `/份额卖出 ${item.code} 1 ${item.price}`, autoEnter: false }).addNewline();
  }
  md.addNewline().addText('单次交易最多 100 份；输入的末尾单价用于防止旧页面按新价格成交。');
  return Format.create().addMarkdown(md).addButtonGroup(actions(button('交易所闲聊', '/交易所闲聊'), button('每日委托索引', '/势力委托索引'), button('返回万叶联市', '/万叶联市')));
};

export const bankHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireNpcAtCurrentPosition(event.current.UserId, 'silver_bell_bank'); await message.send({ format: await bankPanel(event.current.UserId) }); }
  catch (error) { await fail(message, '钱庄暂不可用', error); }
};
export const bankTransferHandler = async (direction: 'in' | 'out') => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await bankTransfer(event.current.UserId, parseFinanceCopper(String(route.param('copper'))), direction); await message.send({ format: messageFormat(direction === 'in' ? '存入成功' : '取出成功', `已${direction === 'in' ? '存入' : '取出'} ${copperText(result.copper)}。`) }); await message.send({ format: await bankPanel(event.current.UserId) }); }
  catch (error) { await fail(message, direction === 'in' ? '存入失败' : '取出失败', error); }
};
export const depositHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const map: Record<string, DepositProduct> = { 七日: 'seven', 三十日: 'thirty', 百日: 'hundred' };
    const code = map[String(route.param('term'))]; if (!code) throw new Error('请选择七日、三十日或百日。');
    const result = await openBankDeposit(event.current.UserId, code, parseFinanceCopper(String(route.param('copper'))));
    await message.send({ format: messageFormat('定存已开立', `${result.name} #${result.id}｜本金 ${copperText(result.copper)}｜到期预留利息 ${copperText(result.interest)}。`) });
    await message.send({ format: await bankPanel(event.current.UserId) });
  } catch (error) { await fail(message, '定存失败', error); }
};
export const depositSettleHandler = async (early: boolean) => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await settleBankDeposit(event.current.UserId, Number(route.param('id')), early); await message.send({ format: messageFormat('存单已结算', `转入活期 ${copperText(result.credit)}｜实得利息 ${copperText(result.interest)}${result.penalty ? `｜提前支取费用 ${copperText(result.penalty)}` : ''}。`) }); await message.send({ format: await bankPanel(event.current.UserId) }); }
  catch (error) { await fail(message, '存单结算失败', error); }
};
export const exchangeHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await requireNpcAtCurrentPosition(event.current.UserId, 'canopy_exchange'); await settleFinancePeriod(); await message.send({ format: await exchangePanel(event.current.UserId) }); }
  catch (error) { await fail(message, '势力份额暂不可用', error); }
};
export const shareTradeHandler = async (side: 'buy' | 'sell') => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await financeTrade(event.current.UserId, String(route.param('code')), Number(route.param('shares')), side, Number(route.param('price'))); await message.send({ format: messageFormat(side === 'buy' ? '买入成功' : '卖出成功', `【${result.name}】${result.shares} 份，每份 ${copperText(result.price)}；${side === 'buy' ? '共扣' : '实得'} ${copperText(result.net)}（${side === 'buy' ? '含' : '已扣'}手续费 ${copperText(result.fee)}）。`) }); await message.send({ format: await exchangePanel(event.current.UserId) }); }
  catch (error) { await fail(message, side === 'buy' ? '买入失败' : '卖出失败', error); }
};
export const missionIndexHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    await requireNpcAtCurrentPosition(event.current.UserId, 'canopy_exchange'); await refreshFinanceMissions();
    const locations: Record<string, string> = { silver_bell_bank: '各安全区·银铃钱庄分所', guild_counter: '百纳镇·冒险者公会', canopy_exchange: '世界树·万叶联市', blacksmith: '百纳镇·铁匠铺', alchemy_sweetshop: '百纳镇·糖水屋', oddworkshop: '百纳镇·异工坊', bookshop: '百纳镇·书店', worldtree_council: '世界树·议会办事处', rediron_office: '百纳镇·驿路联络处', ferry_office: '百纳镇·摆渡联络处' };
    const state = await financeCatalog(event.current.UserId); const md = Format.createMarkdown().addTitle('每日势力委托·建筑索引').addNewline().addNewline();
    for (const item of state.instruments) { const faction = financeFaction(item.code)!; md.addText(`${faction.name}：${faction.mission}｜${faction.building ? locations[faction.building] ?? faction.building : '尚无对应建筑'}`).addNewline(); }
    md.addNewline().addBlockquote('请到该势力对应建筑接取当日委托；交易所不代办。'); await message.send({ format: Format.create().addMarkdown(md) });
  }
  catch (error) { await fail(message, '委托索引暂不可用', error); }
};
export const missionHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const state = await financeMissionList(event.current.UserId, String(route.param('code'))); const md = Format.createMarkdown().addTitle(`${state.faction.name}·每日委托`).addNewline().addNewline().addText(state.title).addNewline().addText(`状态：${state.status === 'unavailable' ? '当前玩法尚无可验证结算点，待开放' : state.completed ? '今日已完成' : state.accepted ? '已接取，等待完成' : '尚未接取'}`).addNewline().addText(`全域今日已完成：${state.count} 人次`).addNewline().addBlockquote('须在本建筑接取后完成对应的正式业务，才算本委托完成。真实业务即使未接委托也可能影响行情；同一角色同一势力每日正向经营分只计一次。'); if (state.status === 'available' && !state.accepted) md.addNewline().addButton('[接取今日委托]', { data: `/接取势力委托 ${state.faction.code}`, autoEnter: false }); await message.send({ format: Format.create().addMarkdown(md) }); }
  catch (error) { await fail(message, '无法查看每日委托', error); }
};
export const missionAcceptHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await acceptFinanceMission(event.current.UserId, String(route.param('code'))); await message.send({ format: messageFormat(result.acceptedNow ? '委托已接取' : '委托已在册', `${result.faction.name}：${result.faction.mission}。请在今日完成真实业务记录。`) }); }
  catch (error) { await fail(message, '委托接取失败', error); }
};
export const newsHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await settleFinancePeriod(); const board = await financeNewsBoard(event.current.UserId); const md = Format.createMarkdown().addTitle('万叶联市·闲聊区').addNewline().addNewline().addText('上一时段已公开的部分消息：').addNewline(); if (!board.history.length) md.addText('上一段没有可公开的传闻摘录。').addNewline(); for (const item of board.history) md.addBlockquote(`${item.faction}｜${item.outcome === 'fulfilled' ? '传闻应验' : '事出反常'}：${item.text} ${item.priceNote}`).addNewline(); md.addNewline().addText('本轮主要行情与业务：').addNewline(); if (!board.moves.length) md.addBlockquote('本轮没有整铜币报价变化。').addNewline(); for (const move of board.moves) md.addBlockquote(`${move.faction}｜${move.before}→${move.after} 铜币；${move.factors || '多方相对强弱共同作用'}`).addNewline(); if (board.warnings.length) md.addBlockquote(`风险提示：${board.warnings.join('、')}本轮因资本覆盖不足暂缓调价。`).addNewline(); md.addNewline().addText('听到的域民闲谈：').addNewline().addBlockquote(board.prophecy ? `${board.prophecy.faction}｜${board.prophecy.text}` : '茶桌上尽是旧事，暂时没有可信的新动静。').addNewline().addNewline().addText('每段传闻有涨有跌，闲聊区仅披露部分；可行时按整铜币方向定价，受限幅或资本阻断会公示，交易仍可能亏损。'); await message.send({ format: Format.create().addMarkdown(md).addButtonGroup(actions(button('查看势力份额', '/势力份额'))) }); }
  catch (error) { await fail(message, '闲聊区暂不可用', error); }
};
