import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { learnSkill, skillDetail, skillList, toggleSkillShortcut, upgradeSkill } from '../game/adventure.service';
import { messageFormat } from '../game/message';

const skillListFormat = async (qqUserId: string, view: '已学习' | '未学习') => {
  const data = await skillList(qqUserId); const markdown = Format.createMarkdown().addTitle('技能列表').addText(`\n剩余技能点：${data.skillPoints}\n`);
  if (view === '已学习') {
    if (!data.skills.length) markdown.addText('\n尚未学习技能。\n');
    for (const skill of data.skills) markdown.addText(`\n【${skill.name}】Lv.${skill.level} `).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText(' ').addButton(skill.quick_slot ? '[取消快捷]' : '[快捷]', { data: `/技能快捷 ${skill.id}`, autoEnter: false }).addText('\n');
    markdown.addText('\n快捷技能：\n');
    const shortcuts = data.skills.filter(skill => skill.quick_slot).sort((a, b) => Number(a.quick_slot) - Number(b.quick_slot));
    if (!shortcuts.length) markdown.addText('暂无\n');
    else for (const skill of shortcuts) markdown.addText(`技能${'①②③④'.charAt(Number(skill.quick_slot) - 1)} ${skill.name}\n`);
  } else {
    if (!data.discoveries.length) markdown.addText('\n尚无可学习的技能。\n');
    for (const skill of data.discoveries) markdown.addText(`\n【${skill.name}】SP:${skill.learn_cost} `).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText(' ').addButton('[学习]', { data: `/学习技能 ${skill.id}`, autoEnter: false }).addText('\n');
  }
  const tabs = Format.createButtonGroup().addRow().addButton('已学习', '/技能列表 已学习', { type: 'command', autoEnter: true, style: view === '已学习' ? 'blue' : undefined }).addButton('未学习', '/技能列表 未学习', { type: 'command', autoEnter: true, style: view === '未学习' ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(tabs);
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); const view = String(route.param('view') ?? '已学习') === '未学习' ? '未学习' : '已学习';
  try { await message.send({ format: await skillListFormat(event.current.UserId, view) }); }
  catch (error) { await message.send({ format: messageFormat('技能不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const skillDetailHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const skill = await skillDetail(event.current.UserId, Number(route.param('id')));
    const levelText = skill.learned ? `Lv.${skill.level}/${skill.max_level}` : `未学习｜SP:${skill.learn_cost}`;
    const costText = !skill.learned
      ? `学习消耗：${skill.learn_cost} 技能点`
      : skill.nextUpgradeCost === null
        ? '已达最高等级。'
        : `升级消耗：${skill.nextUpgradeCost} 技能点`;
    const text = `【${skill.name}】${levelText}\n${skill.description}\n\n类别：${skill.category}｜属性：${skill.damage_type}\n威力：${skill.actualPower}\n魔力消耗：${skill.mana_cost}\n冷却：${skill.actualCooldown} 回合\n特殊效果：${skill.effects ?? '无'}\n\n${costText}`;
    const buttons = Format.createButtonGroup().addRow().addButton('返回技能列表', skill.learned ? '/技能列表 已学习' : '/技能列表 未学习', { type: 'command', autoEnter: true });
    if (!skill.learned) buttons.addButton('学习', `/学习技能 ${skill.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    else if (skill.nextUpgradeCost !== null) buttons.addButton('升级', `/升级技能 ${skill.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('技能详情').addText(text)).addButtonGroup(buttons) });
  } catch (error) { await message.send({ format: messageFormat('无法查看技能', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const learnSkillHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await learnSkill(event.current.UserId, Number(route.param('id'))); await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('学习技能').addText(`已学习「${result.name}」，消耗 ${result.cost} 技能点。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('技能列表', '/技能列表', { type: 'command', autoEnter: true, style: 'blue' })) }); }
  catch (error) { await message.send({ format: messageFormat('学习失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const skillShortcutHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await toggleSkillShortcut(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('技能快捷', result.slot ? `「${result.name}」已设为技能${'①②③④'.charAt(result.slot - 1)}。` : `已取消「${result.name}」的快捷设置。`) }); }
  catch (error) { await message.send({ format: messageFormat('设置失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const upgradeSkillHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await upgradeSkill(event.current.UserId, Number(route.param('id'))); await message.send({ format: messageFormat('技能升级', `「${result.name}」已提升至 Lv.${result.level}，消耗 ${result.cost} 技能点。`) }); }
  catch (error) { await message.send({ format: messageFormat('升级失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
