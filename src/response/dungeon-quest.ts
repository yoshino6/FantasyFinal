import { secondaryShopFormat } from './secondary-shop';
import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { buyOddWorkshopItem, consultDungeonAtGuild, consultDungeonAtWorkshop, dungeonSecretProgress, entranceStory } from '../game/dungeon-quest.service';
import { messageFormat } from '../game/message';

const chapterFormat = (stage: number, text: string, buttons: ReturnType<typeof Format.createButtonGroup>) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle(`地下的秘密（${stage}/6）`).addNewline().addNewline().addBlockquote(text))
  .addButtonGroup(buttons);

export const dungeonSecretGuildHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const text = await consultDungeonAtGuild(event.current.UserId);
    await message.send({ format: chapterFormat(2, text, Format.createButtonGroup().addRow().addButton('前往 异工坊', '/前往 6 -189', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法询问地下迷宫', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const dungeonSecretWorkshopHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const text = await consultDungeonAtWorkshop(event.current.UserId);
    await message.send({ format: chapterFormat(3, text, Format.createButtonGroup().addRow().addButton('查看个人副职业', '/副职业', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
  } catch (error) { await message.send({ format: messageFormat('无法询问破魔传送器', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const dungeonSecretEntranceHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const dungeonId = Number(route.param('id')); const result = await entranceStory(event.current.UserId, dungeonId);
    const buttons = Format.createButtonGroup().addRow();
    if (result.stage >= 5) buttons.addButton('进入', `/下迷宫 ${dungeonId}`, { type: 'command', autoEnter: true, style: 'blue' });
    else if (result.stage < 2) buttons.addButton('前往 冒险者公会', '/前往 -2 -181', { type: 'command', autoEnter: true, style: 'blue' });
    else if (result.stage < 4) buttons.addButton('前往 异工坊', '/前往 6 -189', { type: 'command', autoEnter: true, style: 'blue' });
    else if (result.stage === 4) buttons.addButton('再次查看石门', `/地下的秘密 ${dungeonId}`, { type: 'command', autoEnter: true, style: 'blue' });
    buttons.addButton('任务', '/任务', { type: 'command', autoEnter: true });
    await message.send({ format: chapterFormat(Math.min(6, Math.max(1, result.stage)), result.text, buttons) });
  } catch (error) { await message.send({ format: messageFormat('地下的秘密', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const oddWorkshopBuyFormat = async (qqUserId: string) => secondaryShopFormat(qqUserId, 'oddworkshop');

export const oddWorkshopBuyHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { await message.send({ format: await oddWorkshopBuyFormat(event.current.UserId) }); }
  catch (error) { await message.send({ format: messageFormat('无法购买', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const oddWorkshopPurchaseHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const code = String(route.param('code'));
    if (!code) throw new Error('未找到这件异工坊商品。');
    const result = await buyOddWorkshopItem(event.current.UserId, code);
    const detail = code === 'demon_breaker_teleporter' ? '你将它收进背包，圆盘边缘的符文轻轻亮起。现在可以回到地下大门。' : result.rewardName ? `获得【${result.rewardName}】。图纸的前置构造会在打开「/构造」时自动补齐。` : '图纸上的回路复杂得令人眼花，却也确实记录着完整的构造方法。';
    if (code === 'demon_breaker_teleporter') {
      await message.send({ format: chapterFormat(4, `获得【${result.name}】。\n\n${detail}\n\n结界另一侧的黑暗仿佛也在等待你的脚步。`, Format.createButtonGroup().addRow().addButton('地图', '/地图', { type: 'command', autoEnter: true, style: 'blue' }).addButton('任务', '/任务', { type: 'command', autoEnter: true })) });
      return;
    }
    await message.send({ format: messageFormat('购买成功', `${result.rewardName ? `购入【${result.name}】\n` : `获得【${result.name}】\n`}${detail}`) });
  } catch (error) { await message.send({ format: messageFormat('购买失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const dungeonSecretStatusHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const progress = await dungeonSecretProgress(event.current.UserId);
    const detail = progress.stage === 6 ? '穿过入口，在当前一层寻找并击败小头目。' : progress.stage >= 7 ? '你已经击败了第一层的小头目，地下的秘密暂告一段落。' : '前往已标记的地下大门，继续追查它的来历。';
    await message.send({ format: messageFormat('地下的秘密', detail) });
  } catch (error) { await message.send({ format: messageFormat('地下的秘密', error instanceof Error ? error.message : '请稍后重试。') }); }
};
