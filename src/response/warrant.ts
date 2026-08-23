import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { addWarrantReward, townWarrantsFor } from '../game/pvp.service';
import { messageFormat } from '../game/message';

const sequence = '①②③④⑤⑥⑦⑧⑨⑩';
type WarrantFilter = '已暴露' | '近期露面' | '无行踪' | '全部';

const warrantFormat = async (qqUserId: string, filter: WarrantFilter = '全部') => {
  const data = await townWarrantsFor(qqUserId, filter);
  const markdown = Format.createMarkdown().addTitle(`通缉·${data.regionName}`).addNewline().addNewline();
  if (!data.warrants.length) markdown.addBlockquote(filter === '全部' ? '这座城镇目前没有生效中的通缉。' : `当前没有「${filter}」的通缉者。`);
  for (const [index, warrant] of data.warrants.entries()) {
    const bounty = [warrant.copper ? `铜币×${warrant.copper}` : '', warrant.items].filter(Boolean).join('|') || '暂无赏金';
    const trace = warrant.exposed ? `已暴露|${warrant.regionName}（${warrant.x}，${warrant.y}）` : warrant.recent ? `近期露面|${warrant.regionName}（${warrant.x}，${warrant.y}）` : '无行踪|最后行踪已消失';
    markdown.addText(`${sequence.charAt(index) || `${index + 1}.`}【${warrant.name}】`).addNewline()
      .addBlockquote(`星级：${'★'.repeat(warrant.stars)}${'☆'.repeat(5 - warrant.stars)}`).addNewline()
      .addBlockquote(`赏金：${bounty}`).addNewline()
      .addBlockquote(trace).addNewline();
    if (warrant.exposed || warrant.recent) markdown.addButton('[前往]', { data: `/前往 ${warrant.x} ${warrant.y}`, autoEnter: false }).addText(' ');
    markdown.addButton('[追加赏金]', { data: `/通缉上赏 ${warrant.id} 铜币 `, autoEnter: false }).addNewline().addNewline();
  }
  const buttons = Format.createButtonGroup().addRow()
    .addButton('已暴露', '/通缉筛选 已暴露', { type: 'command', autoEnter: true, style: filter === '已暴露' ? 'blue' : undefined })
    .addButton('近期露面', '/通缉筛选 近期露面', { type: 'command', autoEnter: true, style: filter === '近期露面' ? 'blue' : undefined })
    .addButton('无行踪', '/通缉筛选 无行踪', { type: 'command', autoEnter: true, style: filter === '无行踪' ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await warrantFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('通缉令不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const activeWarrantHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await warrantFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('通缉面板不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const filterWarrantHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await message.send({ format: await warrantFormat(event.current.UserId, String(route.param('filter')) as WarrantFilter) }); }
  catch (error) { await message.send({ format: messageFormat('通缉筛选不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const addRewardHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const kind = String(route.param('kind')); const id = Number(route.param('warrant')); const itemOrAmount = Number(route.param('itemOrAmount')); const quantity = Number(route.param('quantity') ?? 1);
    if (kind === '铜币') {
      if (!Number.isInteger(itemOrAmount) || itemOrAmount < 1) throw new Error('赏金金额必须是正整数。');
      await addWarrantReward(event.current.UserId, id, null, 0, itemOrAmount);
    } else {
      if (!Number.isInteger(itemOrAmount) || itemOrAmount < 1 || !Number.isInteger(quantity) || quantity < 1) throw new Error('物品编号与数量必须是正整数。');
      await addWarrantReward(event.current.UserId, id, itemOrAmount, quantity, 0);
    }
    await message.send({ format: messageFormat('追加赏金成功', '赏金已存入通缉令。逮捕目标的玩家将获得这份报酬。') });
  } catch (error) { await message.send({ format: messageFormat('追加赏金失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
