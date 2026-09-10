import { Format, useEvent, useRoute } from 'alemonjs';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { equip, equipment, equipmentCandidates, unequip } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { equipmentSetSummary } from '../game/equipment-set-summary';

const slotNames: Record<string, string> = {
  weapon: '武器', offhand: '副手', shoulder: '头肩', upper: '上装', waist: '腰部',
  lower: '下装', feet: '脚部', necklace: '项链', bracelet: '手镯', ring: '戒指'
};
const slotOrder = ['weapon', 'offhand', 'shoulder', 'upper', 'waist', 'lower', 'feet', 'necklace', 'bracelet', 'ring'];

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const items = await equipment(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('我的装备').addText(' ').addButton('[异械]', { data: '/异械', autoEnter: false }).addNewline();
    const equippedBySlot = new Map(items.map(item => [item.slot, item]));
    for (const slot of slotOrder) {
      const item = equippedBySlot.get(slot);
      if(item?.appearanceName)markdown.addBlockquote(`外观投影：${item.appearanceName}`).addNewline();
      markdown.addText(`\n【${slotNames[slot]}】`);
      if (item) {
        if (item.instance_id) markdown.addButton(item.name, { data: `/装备详情 ${item.instance_id}`, autoEnter: false });
        else markdown.addText(item.name);
        markdown.addText(' ').addButton('[卸下]', { data: `/卸下装备 ${slot}`, autoEnter: false }).addText(' ').addButton('[切换]', { data: `/选择装备 ${slot}`, autoEnter: false });
      } else markdown.addText('无 ').addButton('[装备]', { data: `/选择装备 ${slot}`, autoEnter: false });
    }
    const sets = equipmentSetSummary(items);
    markdown.addNewline().addNewline().addBold('已生效套装效果').addNewline();
    if (!sets.length) markdown.addBlockquote('暂无已生效套装效果。');
    for (const set of sets) markdown.addBlockquote(`**${set.title}**\n> ${set.effects.join('\n> ')}`).addNewline();
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow()
      .addButton('装备详情', '/已装备详情', { type: 'command', autoEnter: true, style: 'blue' })
      .addButton('操作面板', '/面板', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('装备不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const unequipHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const slot = String(route.param('slot'));
    const item = await unequip(event.current.UserId, slot);
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('卸下装备').addNewline().addNewline().addText(`已卸下【${slotNames[slot]}】${item.name}，已放回背包。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('我的装备', '/装备', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('卸下失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const chooseEquipmentHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const slot = String(route.param('slot')); const items = await equipmentCandidates(event.current.UserId, slot);
    const markdown = Format.createMarkdown().addTitle(`装备·${slotNames[slot] ?? slot}`).addNewline();
    if (!items.length) markdown.addText('\n背包中没有可装备的该部位装备。');
    for (const item of items) markdown.addText(`\n${item.name} #${item.id}｜Lv.${item.required_level} `)
      .addButton('[详情]', { data: `/装备详情 ${item.id}`, autoEnter: false })
      .addText(' ').addButton('[装备]', { data: `/穿戴装备 ${slot} ${item.id}`, autoEnter: false });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('我的装备', '/装备', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('装备不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const equipHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const slot = String(route.param('slot')); const item = await equip(event.current.UserId, slot, Number(route.param('id')));
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('装备成功').addNewline().addNewline().addText(`已装备【${slotNames[slot]}】${item.name} #${item.id}。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('我的装备', '/装备', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) {
    if (error instanceof Error && error.message === 'eternal_artifact_limit') {
      await message.send({ format: messageFormat('警告', '你的能力暂不支持装备更多的永恒神器。') });
      return;
    }
    await message.send({ format: messageFormat('装备失败', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
