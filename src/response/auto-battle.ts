import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { autoBattleConfig, autoBattleSkills, autoPotionItems, beginAutoBattleQuickSetup, deleteAutoBattleAction, finishAutoBattleQuickSetup, saveAutoBattleAction, saveQuickAutoBattleAction, setAutoBattleEnabled, setAutoPotionEnabled, setAutoPotionItem, setAutoPotionThreshold } from '../game/auto-battle.service';
import { messageFormat } from '../game/message';

const fail = (message: any, error: unknown) => message.send({ format: messageFormat('自动战斗配置失败', error instanceof Error ? error.message : '请稍后重试。') });
const actionName = (name: string) => name === '普通攻击' ? '普通攻击' : `【${name}】`;

const configFormat = async (qqUserId: string) => {
  const data = await autoBattleConfig(qqUserId); const settings = data.settings;
  const markdown = Format.createMarkdown().addTitle('自动战斗配置').addNewline().addNewline()
    .addText('出招顺序：').addButton('[快速配置]', { data: '/自动战斗 快速配置', autoEnter: false }).addButton('[新增]', { data: `/自动战斗 出招选择 ${data.actions.length + 1}`, autoEnter: false }).addNewline();
  if (!data.actions.length) markdown.addBlockquote('尚未配置，自动战斗将使用普通攻击。').addNewline();
  else for (const action of data.actions) markdown.addBlockquote(`${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(action.sequence - 1) || `${action.sequence}.`}${actionName(action.name)}`).addButton('[更换]', { data: `/自动战斗 出招选择 ${action.sequence}`, autoEnter: false }).addButton('[删除]', { data: `/自动战斗 删除 ${action.sequence}`, autoEnter: false }).addNewline();
  markdown.addNewline().addText('————————————').addNewline().addText('自动嗑药：').addNewline()
    .addBlockquote(`生命低于(${settings.hp_threshold}%)时，${settings.hp_item_name ? `自动使用【${settings.hp_item_name}】。` : '不使用任何道具。'}`).addNewline()
    .addButton('[设置门槛]', { data: '/自动战斗 设置门槛 生命 ', autoEnter: false }).addButton('[更换药剂]', { data: '/自动战斗 药剂选择 生命', autoEnter: false }).addNewline()
    .addBlockquote(`魔力低于(${settings.mp_threshold}%)时，${settings.mp_item_name ? `自动使用【${settings.mp_item_name}】。` : '不使用任何道具。'}`).addNewline()
    .addButton('[设置门槛]', { data: '/自动战斗 设置门槛 魔力 ', autoEnter: false }).addButton('[更换药剂]', { data: '/自动战斗 药剂选择 魔力', autoEnter: false });
  const buttons = Format.createButtonGroup().addRow().addButton(settings.auto_potion_enabled ? '关闭自动嗑药' : '开启自动嗑药', `/自动战斗 嗑药 ${settings.auto_potion_enabled ? '关闭' : '开启'}`, { type: 'command', autoEnter: true })
    .addButton(settings.enabled ? '关闭自动战斗' : '开启自动战斗', `/自动战斗 ${settings.enabled ? '关闭' : '开启'}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const choiceFormat = async (qqUserId: string, sequence: number, page: number, keyword: string, quick = false) => {
  const data = await autoBattleSkills(qqUserId, page, keyword); const markdown = Format.createMarkdown().addTitle(quick ? '出招快速配置' : '出招选择').addNewline().addNewline();
  if (quick) markdown.addText(`当前出招${'①②③④⑤⑥⑦⑧⑨⑩'.charAt(sequence - 1) || sequence}：\n`);
  data.choices.forEach((choice, index) => markdown.addText(`${quick ? '' : `${index + 1}. `}`).addButton(actionName(choice.name), { data: quick ? `/自动战斗 快速选择 ${choice.id ?? 0}` : `/自动战斗 选择出招 ${sequence} ${choice.id ?? 0}`, autoEnter: false }).addNewline());
  const search = quick ? '/自动战斗 快速搜索 ' : `/自动战斗 出招搜索 ${sequence} `;
  const pageCommand = (target: number) => quick ? `/自动战斗 快速选择页 ${target}` : `/自动战斗 出招选择 ${sequence} ${target}`;
  const buttons = Format.createButtonGroup().addRow().addButton('上一页', pageCommand(Math.max(1, data.page - 1)), { type: 'command', autoEnter: true }).addButton('搜索', search, { type: 'command', autoEnter: false }).addButton('下一页', pageCommand(Math.min(data.total, data.page + 1)), { type: 'command', autoEnter: true });
  if (quick) buttons.addRow().addButton('完成配置', '/自动战斗 完成配置', { type: 'command', autoEnter: true, style: 'blue' });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

const thresholdFormat = (kind: 'hp' | 'mp') => {
  const label = kind === 'hp' ? '生命' : '魔力'; const row = Format.createButtonGroup().addRow();
  [10, 30, 50, 70, 90].forEach(value => row.addButton(`${value}%`, `/自动战斗 设置门槛 ${label} ${value}`, { type: 'command', autoEnter: true }));
  return Format.create().addMarkdown(Format.createMarkdown().addTitle('设置自动嗑药门槛').addNewline().addNewline().addText(`请选择${label}百分比门槛：`)).addButtonGroup(row);
};

const potionFormat = async (qqUserId: string, kind: 'hp' | 'mp', page: number, keyword: string) => {
  const data = await autoPotionItems(qqUserId, page, keyword); const label = kind === 'hp' ? '生命' : '魔力'; const markdown = Format.createMarkdown().addTitle('选择自动嗑药道具').addNewline().addNewline();
  if (!data.items.length) markdown.addText('背包中没有可使用道具。');
  data.items.forEach((item, index) => markdown.addText(`${index + 1}. `).addButton(`【${item.name}】`, { data: `/自动战斗 选择药剂 ${label} ${item.id}`, autoEnter: false }).addNewline());
  const buttons = Format.createButtonGroup().addRow().addButton('上一页', `/自动战斗 药剂选择 ${label} ${Math.max(1, data.page - 1)}`, { type: 'command', autoEnter: true }).addButton('搜索', `/自动战斗 药剂搜索 ${label} `, { type: 'command', autoEnter: false }).addButton('下一页', `/自动战斗 药剂选择 ${label} ${Math.min(data.total, data.page + 1)}`, { type: 'command', autoEnter: true });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export default async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); const action = String(route.param('action') ?? '配置'); try {
  if (action === '开启') {
    await setAutoBattleEnabled(event.current.UserId, true);
    await message.send({ format: await configFormat(event.current.UserId) });
    await message.send({ format: messageFormat('自动战斗', '你已开启自动战斗。') });
    return;
  }
  if (action === '关闭') {
    await setAutoBattleEnabled(event.current.UserId, false);
    await message.send({ format: messageFormat('自动战斗', '你已关闭自动战斗。') });
    return;
  }
  await message.send({ format: await configFormat(event.current.UserId) });
} catch (error) { await fail(message, error); } };
export const selectActionHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await choiceFormat(event.current.UserId, Number(route.param('sequence')), Number(route.param('page') ?? 1), '') }); } catch (error) { await fail(message, error); } };
export const chooseActionHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await saveAutoBattleAction(event.current.UserId, Number(route.param('sequence')), Number(route.param('skill')) || null); await message.send({ format: await configFormat(event.current.UserId) }); } catch (error) { await fail(message, error); } };
export const deleteActionHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await deleteAutoBattleAction(event.current.UserId, Number(route.param('sequence'))); await message.send({ format: await configFormat(event.current.UserId) }); } catch (error) { await fail(message, error); } };
export const quickSetupHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { const sequence = await beginAutoBattleQuickSetup(event.current.UserId); await message.send({ format: await choiceFormat(event.current.UserId, sequence, 1, '', true) }); } catch (error) { await fail(message, error); } };
export const quickChoiceHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const sequence = await saveQuickAutoBattleAction(event.current.UserId, Number(route.param('skill')) || null); await message.send({ format: await choiceFormat(event.current.UserId, sequence, 1, '', true) }); } catch (error) { await fail(message, error); } };
export const quickPageHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await choiceFormat(event.current.UserId, 1, Number(route.param('page') ?? 1), '', true) }); } catch (error) { await fail(message, error); } };
export const quickFinishHandler = async () => { const [event] = useEvent(); const [message] = useMessage(); try { await finishAutoBattleQuickSetup(event.current.UserId); await message.send({ format: await configFormat(event.current.UserId) }); } catch (error) { await fail(message, error); } };
export const potionToggleHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await setAutoPotionEnabled(event.current.UserId, String(route.param('state')) === '开启'); await message.send({ format: await configFormat(event.current.UserId) }); } catch (error) { await fail(message, error); } };
export const thresholdHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); const kind = String(route.param('kind')) === '生命' ? 'hp' : 'mp'; const raw = route.param('value'); try { if (raw === undefined || raw === '') { await message.send({ format: thresholdFormat(kind) }); return; } await setAutoPotionThreshold(event.current.UserId, kind, Number(raw)); await message.send({ format: await configFormat(event.current.UserId) }); } catch (error) { await fail(message, error); } };
export const potionListHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const kind = String(route.param('kind')) === '生命' ? 'hp' : 'mp'; await message.send({ format: await potionFormat(event.current.UserId, kind, Number(route.param('page') ?? 1), '') }); } catch (error) { await fail(message, error); } };
export const potionChoiceHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await setAutoPotionItem(event.current.UserId, String(route.param('kind')) === '生命' ? 'hp' : 'mp', Number(route.param('item')) || null); await message.send({ format: await configFormat(event.current.UserId) }); } catch (error) { await fail(message, error); } };
export const actionSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await choiceFormat(event.current.UserId, Number(route.param('sequence')), 1, String(route.param('keyword') ?? '')) }); } catch (error) { await fail(message, error); } };
export const quickSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { await message.send({ format: await choiceFormat(event.current.UserId, 1, 1, String(route.param('keyword') ?? ''), true) }); } catch (error) { await fail(message, error); } };
export const potionSearchHandler = async () => { const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); try { const kind = String(route.param('kind')) === '生命' ? 'hp' : 'mp'; await message.send({ format: await potionFormat(event.current.UserId, kind, 1, String(route.param('keyword') ?? '')) }); } catch (error) { await fail(message, error); } };
