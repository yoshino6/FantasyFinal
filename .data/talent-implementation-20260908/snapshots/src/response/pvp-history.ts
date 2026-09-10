import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { pvpBattleHistory } from '../game/pvp.service';
import { messageFormat } from '../game/message';

type BattleFilter = '全部' | '进攻方' | '防守方';
const outcomeText: Record<string, string> = { ongoing: '进行中', attacker_win: '进攻方胜利', defender_win: '防守方胜利', draw: '未分胜负', escaped: '撤离战斗' };
const timeText = (value: Date | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '进行中';

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const filter = String(route.param('filter') ?? '全部') as BattleFilter;
    const normalizedFilter: BattleFilter = ['全部', '进攻方', '防守方'].includes(filter) ? filter : '全部';
    const keyword = String(route.param('keyword') ?? '');
    const data = await pvpBattleHistory(event.current.UserId, Number(route.param('page') ?? 1), normalizedFilter, keyword);
    const markdown = Format.createMarkdown().addTitle('PvP 战斗记录').addNewline().addNewline();
    if (!data.entries.length) markdown.addBlockquote('暂无符合条件的 PvP 战斗记录。').addNewline();
    for (const [index, entry] of data.entries.entries()) {
      markdown.addText(`${'①②③④⑤'.charAt(index) || `${index + 1}.`}【${entry.attacker}】 VS 【${entry.defender}】`).addNewline()
        .addBlockquote(`地点：${entry.type}｜结果：${outcomeText[entry.outcome] ?? entry.outcome}${entry.winner ? `｜胜者：${entry.winner}` : ''}`).addNewline()
        .addBlockquote(`开始：${timeText(entry.startedAt)}｜结束：${timeText(entry.endedAt)}`).addNewline();
      if (entry.loot) markdown.addBlockquote(`物品得失：${entry.loot}`).addNewline();
      markdown.addNewline();
    }
    const previous = Math.max(1, data.page - 1); const next = Math.min(data.totalPages, data.page + 1);
    const buttons = Format.createButtonGroup().addRow()
      .addButton('上一页', `/PvP记录页 ${normalizedFilter} ${previous}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: data.page > 1 ? 'blue' : undefined })
      .addButton('搜索', '/PvP记录搜索 ', { type: 'command', autoEnter: false, style: 'blue' })
      .addButton('下一页', `/PvP记录页 ${normalizedFilter} ${next}${keyword ? ` ${keyword}` : ''}`, { type: 'command', autoEnter: true, style: data.page < data.totalPages ? 'blue' : undefined })
      .addRow().addButton('全部', '/PvP记录筛选 全部', { type: 'command', autoEnter: true, style: normalizedFilter === '全部' ? 'blue' : undefined })
      .addButton('进攻方', '/PvP记录筛选 进攻方', { type: 'command', autoEnter: true, style: normalizedFilter === '进攻方' ? 'blue' : undefined })
      .addButton('防守方', '/PvP记录筛选 防守方', { type: 'command', autoEnter: true, style: normalizedFilter === '防守方' ? 'blue' : undefined });
    markdown.addText(`第 ${data.page}/${data.totalPages} 页｜共 ${data.total} 条`);
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
  } catch (error) {
    await message.send({ format: messageFormat('PvP 攻击记录不可用', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
