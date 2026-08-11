import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { learnSkill, skillDetail, skillList, toggleSkillShortcut, upgradeAppraisal, upgradeSkill } from '../game/adventure.service';
import { messageFormat } from '../game/message';

const categoryNames: Record<string, string> = { physical: '物理', magic: '魔法', utility: '辅助', passive: '被动' };

const skillListFormat = async (qqUserId: string, view: '已学习' | '未学习') => {
  const data = await skillList(qqUserId); const markdown = Format.createMarkdown().addTitle('技能列表').addNewline().addNewline().addText(`剩余技能点：${data.skillPoints}\n`);
  if (view === '已学习') {
    if (!data.skills.length) markdown.addText('\n尚未学习技能。\n');
    for (const skill of data.skills) {
      markdown.addText(`\n【${skill.name}】Lv.${skill.level} `).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false });
      if (skill.category === 'passive') markdown.addText(' [被动]');
      else markdown.addText(' ').addButton(skill.quick_slot ? '[取消快捷]' : '[快捷]', { data: `/技能快捷 ${skill.id}`, autoEnter: false });
      markdown.addText('\n');
    }
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
    if (skill.code === 'appraisal' && skill.learned && skill.appraisal) {
      const eyeCost = skill.appraisal.rangeLevel; const pearlCost = skill.appraisal.informationLevel + 1;
      const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline()
        .addText(`【鉴识】Lv.${skill.level}\n`).addBlockquote('类别：被动').addNewline().addBlockquote('效果：鉴识未知的敌对生物，查看其各种信息。').addNewline().addNewline()
        .addText('专精：\n①慧眼 Lv.' + skill.appraisal.rangeLevel + '/10 ');
      if (skill.appraisal.rangeLevel < 10) markdown.addButton(`[升级(SP${eyeCost})]`, { data: '/升级鉴识 慧眼', autoEnter: false });
      markdown.addNewline().addBlockquote('每一级允许查看比自身等级高3级以内的信息。').addNewline().addBlockquote(`当前可查看 Lv.${skill.characterLevel + skill.appraisal.rangeLevel * 3} 及以下敌对生物的信息。`).addNewline().addNewline()
        .addText(`②识珠 Lv.${skill.appraisal.informationLevel}/4 `);
      if (skill.appraisal.informationLevel < 4) markdown.addButton(`[升级(SP${pearlCost})]`, { data: '/升级鉴识 识珠', autoEnter: false });
      markdown.addNewline().addBlockquote('根据当前等级，可查看不同深度的信息：').addNewline().addBlockquote('1级：名称、生命、魔力、技能').addNewline().addBlockquote('2级：词条、详细属性').addNewline().addBlockquote('3级：当前增益、目标仇恨').addNewline().addBlockquote('4级：弱点、抗性等全部信息').addNewline().addNewline().addText(`当前技能点：${skill.skillPoints}`);
      const buttons = Format.createButtonGroup().addRow().addButton('技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true, style: 'blue' });
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
      return;
    }
    const levelText = skill.learned ? `Lv.${skill.level}/${skill.max_level}` : `未学习｜SP:${skill.learn_cost}`;
    const costText = !skill.learned
      ? `学习消耗：${skill.learn_cost} 技能点`
      : skill.nextUpgradeCost === null
        ? '已达最高等级。'
        : `升级消耗：${skill.nextUpgradeCost} 技能点`;
    const appraisalText = skill.code === 'appraisal' && skill.appraisal
      ? `\n鉴识进度：\n等级差 Lv.${skill.appraisal.rangeLevel}（可鉴识至自身等级 +${skill.appraisal.rangeLevel * 3}）\n信息深化 Lv.${skill.appraisal.informationLevel}/4\n深化 Lv.1：名称、生命、魔力、技能名\nLv.2：词条、攻防、命中、闪避\nLv.3：战斗状态\nLv.4：种族、弱点、抗性与六维`
      : '';
    const combatText = skill.category === 'passive'
      ? `类别：${categoryNames.passive}\n被动效果：${skill.description}`
      : `类别：${categoryNames[skill.category] ?? '辅助'}｜属性：${skill.damage_type}\n威力：${skill.actualPower}\n魔力消耗：${skill.mana_cost}\n冷却：${skill.actualCooldown} 回合\n特殊效果：${skill.effects ?? '无'}`;
    const text = `【${skill.name}】${levelText}\n${skill.description}\n\n${combatText}${appraisalText}\n\n${costText}`;
    const buttons = Format.createButtonGroup().addRow().addButton('返回技能列表', skill.learned ? '/技能列表 已学习' : '/技能列表 未学习', { type: 'command', autoEnter: true });
    if (!skill.learned) buttons.addButton('学习', `/学习技能 ${skill.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    else if (skill.code === 'appraisal' && skill.appraisal) {
      if (skill.appraisal.rangeLevel < 10) buttons.addButton('升级慧眼', '/升级鉴识 慧眼', { type: 'command', autoEnter: true, style: 'blue' });
      if (skill.appraisal.informationLevel < 4) buttons.addButton('升级识珠', '/升级鉴识 识珠', { type: 'command', autoEnter: true, style: 'blue' });
    } else if (skill.nextUpgradeCost !== null) buttons.addButton('升级', `/升级技能 ${skill.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('技能详情').addNewline().addNewline().addText(text)).addButtonGroup(buttons) });
  } catch (error) { await message.send({ format: messageFormat('无法查看技能', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const learnSkillHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { const result = await learnSkill(event.current.UserId, Number(route.param('id'))); await message.send({ format: Format.create().addMarkdown(Format.createMarkdown().addTitle('学习技能').addNewline().addNewline().addText(`已学习「${result.name}」，消耗 ${result.cost} 技能点。`)).addButtonGroup(Format.createButtonGroup().addRow().addButton('技能列表', '/技能列表', { type: 'command', autoEnter: true, style: 'blue' })) }); }
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

export const upgradeAppraisalHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  const direction = String(route.param('direction')) === '慧眼' ? 'range' : 'information';
  try {
    const result = await upgradeAppraisal(event.current.UserId, direction);
    await message.send({ format: messageFormat('鉴识升级', `「鉴识」已提升至 Lv.${result.level}，${result.direction === 'range' ? `慧眼提升至 Lv.${result.rangeLevel}（可鉴识至自身等级 +${result.rangeLevel * 3}）` : `识珠提升至 Lv.${result.informationLevel}` }，消耗 ${result.cost} 技能点。`) });
  } catch (error) { await message.send({ format: messageFormat('鉴识升级失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};
