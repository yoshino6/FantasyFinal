import { Format, useEvent, useMessage, useRoute } from 'alemonjs';
import { learnSkill, skillDetail, skillList, togglePassiveLink, toggleSkillShortcut, upgradeAppraisal, upgradeSkill, upgradeSkillSpecialization } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { craftsmanshipEffect } from '../game/blacksmith.service';

const categoryNames: Record<string, string> = { physical: '物理', magic: '魔法', utility: '辅助', passive: '被动', bound: '绑定', special: '特殊' };
type SkillEffectDetail = { code: string; name: string; effect_type: string; value: number; duration: number; target_scope: 'enemy' | 'ally' | 'self'; trigger_timing: 'on_hit' | 'on_cast' };
const effectValueText = (value: number) => Number(value) % 1 === 0 ? String(Number(value)) : Number(value).toFixed(1);
const effectDescription = (effect: SkillEffectDetail) => {
  const value = effectValueText(effect.value); const duration = Number(effect.duration) ? `，持续${effect.duration}回合` : '';
  switch (effect.code) {
    case 'stun': return `命中时，造成${value}%基础概率眩晕1回合。实际效果受等级差与韧性影响。`;
    case 'vulnerability': case 'armor_shatter': case 'sword_break': return `命中时，使目标物理防御降低${value}%${duration}。`;
    case 'burn': return `命中时，使目标进入灼烧状态；每回合损失${value}%最大生命${duration}。`;
    case 'poison': return `命中时，使目标进入中毒状态；每回合损失${value}%最大生命${duration}，可叠加。`;
    case 'bleeding': return `命中时，使目标进入流血状态；每回合损失${value}%最大生命${duration}。`;
    case 'rending': return `命中时，使目标进入撕裂状态；每回合损失${value}%最大生命${duration}。`;
    case 'slow': return `命中时，使目标速度降低${value}%${duration}。`;
    case 'bind': return `命中时，使目标速度、闪避降低${value}%${duration}。`;
    case 'sprint': return `释放后，使自身速度提高${value}%${duration}。`;
    case 'mist_veil': return `释放后，使自身下一次攻击伤害提高${value}%。`;
    case 'shadow_pierce': return '释放后，使自身下一次攻击必定暴击。';
    case 'battle_cry': return `释放后，使全队物攻、魔攻提高${value}%${duration}。`;
    case 'barrier': return `释放后，使目标获得${value}%伤害减免${duration}。`;
    case 'regeneration': return `释放后，使目标每回合恢复${value}%最大生命${duration}。`;
    case 'mana_regeneration': return `释放后，使目标每回合恢复${value}%最大魔力${duration}。`;
    case 'purify': return '释放后，祛除目标全部异常状态。';
    case 'imbalance': return `命中时，使目标命中、闪避降低${value}%${duration}。`;
    case 'shield_guard': return `释放后，使自身下次出手前受到的伤害降低${value}%。`;
    case 'demon_surge': return `释放后，使自身伤害提高${value}%${duration}，可叠加。`;
    default: return effect.trigger_timing === 'on_hit' ? `命中时，触发「${effect.name}」效果${duration}。` : `释放后，触发「${effect.name}」效果${duration}。`;
  }
};

const skillListFormat = async (qqUserId: string, view: '已学习' | '未学习', page = 1, keyword = '') => {
  const data = await skillList(qqUserId); const markdown = Format.createMarkdown().addTitle('技能列表');
  if (data.isOmniscient) markdown.addText(' ').addButton('[贯注]', { data: '/技能贯注', autoEnter: false });
  markdown.addNewline().addNewline(); const normalizedKeyword = keyword.trim();
  const entries = (view === '已学习' ? data.skills : data.discoveries).filter(skill => !normalizedKeyword || skill.name.includes(normalizedKeyword));
  const totalPages = Math.max(1, Math.ceil(entries.length / 10)); const currentPage = Math.min(Math.max(1, page), totalPages); const displayed = entries.slice((currentPage - 1) * 10, currentPage * 10);
  if (view === '已学习') {
    markdown.addText(`剩余技能点：${data.skillPoints}`).addNewline().addNewline().addText('快捷技能：').addNewline();
    const shortcuts = data.skills.filter(skill => skill.quick_slot).sort((a, b) => Number(a.quick_slot) - Number(b.quick_slot));
    if (!shortcuts.length) markdown.addBlockquote('暂无').addNewline();
  else for (const skill of shortcuts) markdown.addBlockquote(`技能${'①②③④'.charAt(Number(skill.quick_slot) - 1)} ${skill.name} `).addButton('[取消快捷]', { data: `/技能快捷 ${skill.id}`, autoEnter: false }).addNewline();
    const linkedPassives = data.skills.filter(skill => skill.category === 'passive' && Boolean(skill.passive_linked));
    markdown.addNewline().addText('生效被动：').addNewline()
      .addText('> ').addBold(`当前可链接${data.passiveLinkLimit}个被动技能`).addNewline()
      .addText('> ').addBold('未链接的被动不会生效').addNewline();
    if (!linkedPassives.length) markdown.addBlockquote('暂无').addNewline();
    else for (const skill of linkedPassives) markdown.addBlockquote(`【${skill.name}】Lv.${skill.level} `).addButton('[卸下]', { data: `/链接被动 ${skill.id}`, autoEnter: false }).addNewline();
  markdown.addNewline().addText('已学技能：').addNewline();
    const boundSkills = displayed.filter(skill => skill.category === 'bound');
    const passiveSkills = displayed.filter(skill => skill.category === 'passive');
    const activeSkills = displayed.filter(skill => skill.category !== 'passive' && skill.category !== 'bound');
    markdown.addText('> ').addBold('绑定').addNewline();
    if (!boundSkills.length) {
      markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的绑定技能。' : '暂无').addNewline();
    } else for (const skill of boundSkills) {
      markdown.addBlockquote(`【${skill.name}】Lv.${skill.level} `).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText(' [绑定]').addNewline();
    }
    markdown.addText('> ').addBold('被动').addNewline();
    if (!passiveSkills.length) {
      markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的被动技能。' : '暂无').addNewline();
    } else for (const skill of passiveSkills) {
      markdown.addBlockquote(`【${skill.name}】Lv.${skill.level} `).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText(' [被动] ')
        .addButton(skill.passive_linked ? '[卸下]' : '[链接]', { data: `/链接被动 ${skill.id}`, autoEnter: false }).addNewline();
    }
    markdown.addText('> ').addBold('主动').addNewline();
    if (!activeSkills.length) {
      markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的主动技能。' : '暂无').addNewline();
    } else for (const skill of activeSkills) {
      markdown.addBlockquote(`【${skill.name}】Lv.${skill.level} `).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false });
      markdown.addText(' ').addButton(skill.quick_slot ? '[取消快捷]' : '[快捷]', { data: `/技能快捷 ${skill.id}`, autoEnter: false });
      markdown.addNewline();
    }
  } else {
    markdown.addText(`剩余技能点：${data.skillPoints}`).addNewline().addNewline().addText('未学技能：').addNewline();
    if (!displayed.length) markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的技能。' : '尚无可学习的技能。').addNewline();
    for (const skill of displayed) markdown.addBlockquote(`【${skill.name}】SP:${skill.learn_cost} `).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText(' ').addButton('[学习]', { data: `/学习技能 ${skill.id}`, autoEnter: false }).addNewline();
  }
  markdown.addNewline().addNewline().addText(`当前第（${currentPage}/${totalPages}）页`);
  const command = (target: number) => `/技能分页 ${view} ${target}${normalizedKeyword ? ` ${normalizedKeyword}` : ''}`;
  const buttons = Format.createButtonGroup().addRow()
    .addButton('上一页', command(Math.max(1, currentPage - 1)), { type: 'command', autoEnter: true, style: currentPage > 1 ? 'blue' : undefined })
    .addButton('搜索', `/技能搜索 ${view} `, { type: 'command', autoEnter: false, style: 'blue' })
    .addButton('下一页', command(Math.min(totalPages, currentPage + 1)), { type: 'command', autoEnter: true, style: currentPage < totalPages ? 'blue' : undefined })
    .addRow()
    .addButton('已学习', '/技能列表 已学习', { type: 'command', autoEnter: true, style: view === '已学习' ? 'blue' : undefined })
    .addButton('未学习', '/技能列表 未学习', { type: 'command', autoEnter: true, style: view === '未学习' ? 'blue' : undefined });
  return Format.create().addMarkdown(markdown).addButtonGroup(buttons);
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); const view = String(route.param('view') ?? '已学习') === '未学习' ? '未学习' : '已学习';
  try { await message.send({ format: await skillListFormat(event.current.UserId, view) }); }
  catch (error) { await message.send({ format: messageFormat('技能不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const skillPageHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); const view = String(route.param('view')) === '未学习' ? '未学习' : '已学习';
  try { await message.send({ format: await skillListFormat(event.current.UserId, view, Number(route.param('page')), String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('技能不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const skillSearchHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage(); const view = String(route.param('view')) === '未学习' ? '未学习' : '已学习';
  try { await message.send({ format: await skillListFormat(event.current.UserId, view, 1, String(route.param('keyword') ?? '')) }); }
  catch (error) { await message.send({ format: messageFormat('技能搜索失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const passiveLinkHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try { await togglePassiveLink(event.current.UserId, Number(route.param('id'))); await message.send({ format: await skillListFormat(event.current.UserId, '已学习') }); }
  catch (error) { await message.send({ format: messageFormat('链接失败', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const skillInfusionHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const data = await skillList(event.current.UserId);
    if (!data.isOmniscient) throw new Error('只有副职业「全知者」能够贯注技能。');
    const markdown = Format.createMarkdown().addTitle('技能·贯注').addNewline().addNewline()
      .addBlockquote('你可以将已领悟的技能贯注入技能石。贯注规则与技能石功能将在后续开放。');
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('返回技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true, style: 'blue' })) });
  } catch (error) { await message.send({ format: messageFormat('无法贯注', error instanceof Error ? error.message : '请稍后重试。') }); }
};

export const skillDetailHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const skill = await skillDetail(event.current.UserId, Number(route.param('id')));
    if (skill.code === 'appraisal' && skill.learned && skill.appraisal) {
      const eyeCost = skill.appraisal.rangeLevel; const pearlCost = skill.appraisal.informationLevel + 1;
      const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline()
        .addText(`【鉴识】Lv.${skill.level}\n`).addBlockquote('类别：绑定').addNewline().addBlockquote('效果：鉴识未知的敌对生物，查看其各种信息。').addNewline().addNewline()
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
    if (skill.weaponMastery && skill.learned) {
      const proficiency = Number(skill.specializations.overcharge ?? 1); const focus = Number(skill.specializations.instant ?? 1);
      const masteryText = ({
        longsword_mastery: { weapon: '长剑', stat: '物攻', perLevel: 5 }, shield_mastery: { weapon: '盾牌', stat: '物防、魔防', perLevel: 5 },
        staff_mastery: { weapon: '法杖', stat: '魔攻', perLevel: 5 }, spellbook_mastery: { weapon: '法书', stat: '吟唱速度', perLevel: 14 },
        orb_mastery: { weapon: '法球', stat: '魔力上限', perLevel: 14 }, dagger_mastery: { weapon: '匕首', stat: '物攻、魔攻', perLevel: 4 },
        fistblade_mastery: { weapon: '拳刃', stat: '暴击、暴伤', perLevel: 5 }
      } as const)[skill.code] ?? { weapon: '对应', stat: '属性', perLevel: 0 };
      const offhandText = focus >= 6 ? '效果无衰减。' : `仅有${50 + (focus - 1) * 10}%效果。`;
      const effectText = `装备${masteryText.weapon}类武器时，${masteryText.stat}+${masteryText.perLevel * proficiency}%。副手装备时，${offhandText}`;
      const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline().addText(`【${skill.name}】Lv.${skill.level}\n`)
        .addBlockquote('类别：绑定').addNewline().addBlockquote(`效果：${effectText}`).addNewline().addNewline().addText(`专精：\n①娴熟 Lv.${proficiency}/5 `);
      if (skill.masteryProficiencyCost !== null) markdown.addButton(`[升级(SP${skill.masteryProficiencyCost})]`, { data: `/升级专精 ${skill.id} 娴熟`, autoEnter: false });
      markdown.addNewline().addBlockquote(`每提升一级，${masteryText.stat}+${masteryText.perLevel}%。`).addNewline().addNewline().addText(`②随心 Lv.${focus}/6 `);
      if (skill.masteryFocusCost !== null) markdown.addButton(`[升级(SP${skill.masteryFocusCost})]`, { data: `/升级专精 ${skill.id} 随心`, autoEnter: false });
      markdown.addNewline().addBlockquote('每提升一级，副手装备效果+10%。').addNewline().addNewline().addText(`当前技能点：${skill.skillPoints}`);
      const buttons = Format.createButtonGroup().addRow().addButton('返回技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true, style: 'blue' });
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
      return;
    }
    if (skill.code === 'craftsmanship' && skill.learned) {
      const effect = await craftsmanshipEffect(event.current.UserId);
      const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline()
        .addText(`【${skill.name}】Lv.${skill.level}\n`).addBlockquote('类别：绑定').addNewline().addBlockquote(`效果：${effect?.text ?? '尚未生效。'}`).addNewline().addNewline()
        .addText(`当前技能点：${skill.skillPoints}`);
      const buttons = Format.createButtonGroup().addRow().addButton('返回技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true, style: 'blue' });
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
      return;
    }
    if (skill.learned && skill.category !== 'passive' && skill.category !== 'bound') {
      const names = { overcharge: '过充', instant: '瞬息', efficient: '节能', potent: '强效' } as const;
      const descriptions = {
        overcharge: '每提升一级，威力提升8%，蓝耗提升16%，冷却减缓8%，吟咏减缓8%。',
        instant: '每提升一级，冷却加速8%，吟咏加速8%，威力降低4%。',
        efficient: '每提升一级，蓝耗降低8%。',
        potent: '每提升一级，技能效果提升8%，效果时间提升8%，威力降低16%。'
      } as const;
      const category = categoryNames[skill.category] ?? '特殊';
      const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline().addText(`【${skill.name}】Lv.${skill.level}\n`)
        .addBlockquote(`类别：${category}`).addNewline().addBlockquote(`种类：${skill.skill_kind}`).addNewline().addBlockquote(`属性：${skill.element}`).addNewline().addBlockquote(`距离：${skill.range_type}`).addNewline().addBlockquote(`适配武器：${skill.required_weapon_type ?? '无'}`).addNewline().addBlockquote(`威力：${skill.actualPower}`).addNewline().addBlockquote(`冷却：${skill.actualCooldown}`).addNewline().addBlockquote(`蓝耗：${skill.actualManaCost}`).addNewline().addBlockquote(`吟咏：${skill.actualChant}`).addNewline().addBlockquote('效果：').addNewline();
      const effects = skill.effectDetails as SkillEffectDetail[];
      if (!effects.length) markdown.addBlockquote('无').addNewline();
      else effects.forEach((effect, index) => markdown.addText(`${'①②③④⑤'.charAt(index)}${effect.name}\n`).addBlockquote(effectDescription(effect)).addNewline());
      markdown.addNewline().addText('专精：\n');
      (Object.keys(names) as Array<keyof typeof names>).forEach((key, index) => {
        const level = Number(skill.specializations[key] ?? 1); markdown.addText(`${'①②③④'.charAt(index)}${names[key]} Lv.${level}/100 `);
        if (level < 100 && skill.specializationUpgradeCost !== null) markdown.addButton(`[升级(SP${skill.specializationUpgradeCost})]`, { data: `/升级专精 ${skill.id} ${names[key]}`, autoEnter: false });
        markdown.addNewline().addBlockquote(descriptions[key]).addNewline().addNewline();
      });
      markdown.addNewline().addText(`当前技能点：${skill.skillPoints}`);
      const buttons = Format.createButtonGroup().addRow().addButton('返回技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true, style: 'blue' });
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
    const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline().addText(`【${skill.name}】${levelText}\n${skill.description}\n\n`);
    if (skill.category === 'passive' || skill.category === 'bound') markdown.addBlockquote(`类别：${categoryNames[skill.category]}`).addNewline().addBlockquote(`${skill.category === 'bound' ? '绑定' : '被动'}效果：${skill.description}`);
    else {
      markdown.addBlockquote(`类别：${categoryNames[skill.category] ?? '辅助'}`).addNewline().addBlockquote(`种类：${skill.skill_kind}`).addNewline().addBlockquote(`属性：${skill.element}`).addNewline().addBlockquote(`距离：${skill.range_type}`).addNewline().addBlockquote(`适配武器：${skill.required_weapon_type ?? '无'}`).addNewline().addBlockquote(`威力：${skill.actualPower}`).addNewline().addBlockquote(`蓝耗：${skill.actualManaCost}`).addNewline().addBlockquote(`冷却：${skill.actualCooldown}`).addNewline().addText('效果：\n');
      const effects = skill.effectDetails as SkillEffectDetail[];
      if (!effects.length) markdown.addBlockquote('无');
      else effects.forEach((effect, index) => markdown.addText(`${'①②③④⑤'.charAt(index)}${effect.name}\n`).addBlockquote(effectDescription(effect)).addNewline());
    }
    if (appraisalText) markdown.addNewline().addText(appraisalText.trim());
    markdown.addNewline().addNewline().addText(costText);
    const buttons = Format.createButtonGroup().addRow().addButton('返回技能列表', skill.learned ? '/技能列表 已学习' : '/技能列表 未学习', { type: 'command', autoEnter: true });
    if (!skill.learned) buttons.addButton('学习', `/学习技能 ${skill.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    else if (skill.code === 'appraisal' && skill.appraisal) {
      if (skill.appraisal.rangeLevel < 10) buttons.addButton('升级慧眼', '/升级鉴识 慧眼', { type: 'command', autoEnter: true, style: 'blue' });
      if (skill.appraisal.informationLevel < 4) buttons.addButton('升级识珠', '/升级鉴识 识珠', { type: 'command', autoEnter: true, style: 'blue' });
    } else if (skill.nextUpgradeCost !== null) buttons.addButton('升级', `/升级技能 ${skill.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
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

export const upgradeSpecializationHandler = async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  const specialization = ({ 过充: 'overcharge', 瞬息: 'instant', 节能: 'efficient', 强效: 'potent', 娴熟: 'overcharge', 随心: 'instant' } as const)[String(route.param('specialization')) as '过充' | '瞬息' | '节能' | '强效' | '娴熟' | '随心'];
  try { const result = await upgradeSkillSpecialization(event.current.UserId, Number(route.param('id')), specialization); await message.send({ format: messageFormat('技能升级', `「${result.name}」已提升至 Lv.${result.skillLevel}\n消耗 ${result.cost} 技能点。`) }); }
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
