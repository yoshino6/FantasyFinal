import { Format } from 'alemonjs';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';
import { talentDefinitions } from './opening-content';
import { openingStatus } from './opening.service';
import { openingFormat } from './opening-message';

export const giftSelectionFormat = (character: { giftName: string | null; regionName: string }) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('天赋已觉醒').addNewline().addNewline()
    .addBlockquote([
      `你的天赋【${character.giftName}】觉醒了，已作为绑定技能加入【技能】。`,
      `光柱将你笼罩，陌生的风从裂口另一端吹来。光芒散去时，你已降临【${character.regionName}】。`,
      '草药、短杖与旅衣仍在身边。你摸到口袋里最后一份干粮，远处的风声里似乎藏着尚未揭开的相遇。'
    ].join('\n>\n> ')).addNewline().addNewline()
    .addText('【主线更新·初行之路】').addNewline().addNewline()
    .addText('请先打开操作面板，确认降临地点与周边环境。首次移动或寻怪时，初行故事才会展开。女神赠予的【鉴识】已随你降临，之后仍可自行提升。'))
  .addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('打开面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('角色', '/角色', { type: 'command', autoEnter: true })
    .addButton('背包', '/背包', { type: 'command', autoEnter: true }));

/** Restore the committed result without invoking registration, random rolls, or reward settlement. */
export const completedRegistrationFormat = async (user: string) => {
  const story = await openingStatus(user);
  if (story && story.state !== 'armed') return openingFormat(story);
  const pool = await getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT ev.payload,r.name AS current_region_name FROM player_events ev
    JOIN players p ON p.id=ev.player_id JOIN characters c ON c.player_id=p.id
    JOIN map_regions r ON r.id=c.current_region_id
    WHERE p.qq_user_id=? AND ev.event_type='character.created' ORDER BY ev.id DESC LIMIT 1`, [user]);
  const record = typeof rows[0]?.payload === 'string' ? JSON.parse(rows[0].payload) : rows[0]?.payload;
  const gift = talentDefinitions.find(s => s.code === record?.giftCode);
  if (story && gift && rows[0]?.current_region_name) return giftSelectionFormat({ giftName: gift.name, regionName: String(rows[0].current_region_name) });
  return Format.create().addMarkdown(Format.createMarkdown().addTitle('旅者已归来').addText('\n\n你的角色和恩赐已经保存，可以继续当前旅程。'))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('当前任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' })
      .addButton('角色', '/角色', { type: 'command', autoEnter: true }));
};
