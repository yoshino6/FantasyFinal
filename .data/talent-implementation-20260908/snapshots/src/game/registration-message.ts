import { Format } from 'alemonjs';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/pool';
import { divineSkillDefinitions } from './opening-content';
import { openingStatus } from './opening.service';
import { openingFormat } from './opening-message';

export const giftSelectionFormat = (character: { giftName: string | null; regionName: string }) => Format.create()
  .addMarkdown(Format.createMarkdown().addTitle('选择完成')
    .addText(`\n\n你获得了【${character.giftName}】！\n光柱将你笼罩，陌生的风从裂口另一端吹来。光芒散去时，你已降临【${character.regionName}】。\n\n草药、短杖与旅衣仍在身边，你摸到口袋里最后一份干粮。先看看眼前的动静，或许就能找到最初的路。\n\n【主线更新·初行之路】\n首次移动或寻怪将展开你的故事。女神赠予的【鉴识】已随你降临，之后可以自行提升。`))
  .addButtonGroup(Format.createButtonGroup().addRow()
    .addButton('继续剧情', '/继续剧情', { type: 'command', autoEnter: true, style: 'blue' })
    .addButton('角色', '/角色', { type: 'command', autoEnter: true })
    .addButton('背包', '/背包', { type: 'command', autoEnter: true }));

/** Restore the committed result without invoking registration, random rolls, or reward settlement. */
export const completedRegistrationFormat = async (user: string) => {
  const story = await openingStatus(user);
  if (story && story.state !== 'armed') return openingFormat(story);
  const pool = await getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT ev.payload FROM player_events ev
    JOIN players p ON p.id=ev.player_id JOIN characters c ON c.player_id=p.id
    WHERE p.qq_user_id=? AND ev.event_type='character.created' ORDER BY ev.id DESC LIMIT 1`, [user]);
  const record = typeof rows[0]?.payload === 'string' ? JSON.parse(rows[0].payload) : rows[0]?.payload;
  const gift = divineSkillDefinitions.find(s => s.code === record?.giftCode);
  if (story && gift && record?.region) return giftSelectionFormat({ giftName: gift.name, regionName: record.region });
  return Format.create().addMarkdown(Format.createMarkdown().addTitle('旅者已归来').addText('\n\n你的角色和恩赐已经保存，可以继续当前旅程。'))
    .addButtonGroup(Format.createButtonGroup().addRow().addButton('当前任务', '/任务', { type: 'command', autoEnter: true, style: 'blue' })
      .addButton('角色', '/角色', { type: 'command', autoEnter: true }));
};
