import { Format, useEvent, useRoute } from 'alemonjs';
import { talentByCode } from '../game/talent.config';
import { useTalentDetailMessage } from '../game/talent-detail-message';
import { useGameMessage as useMessage } from '../game/use-game-message';
import { learnSkill, skillDetail, skillList, togglePassiveLink, toggleSkillShortcut, upgradeAppraisal, upgradeSkill, upgradeSkillSpecialization } from '../game/adventure.service';
import { messageFormat } from '../game/message';
import { specializationPerLevelLines, specializationNumberText, passiveSpecializationPerLevelLine, passiveSpecializationTotalLine } from '../game/skill-specialization-presentation';
import { balancedSkillDescription } from '../game/combat-skill-balance.config';
import { craftsmanshipEffect } from '../game/blacksmith.service';
import { advancedResourceForProfession, advancedSkillDescriptions, advancedResourceRequirementForSkill } from '../game/advanced-resource.config';
import { advancedBoundSkillDefinitions, advancedProfessionPassiveCodes, hasBattleOnlyAdvancedPassiveEffect, isAdvancedProfessionSkillCode, worldTreeAdvancedProfessions } from '../game/advanced-profession.config';

const categoryNames: Record<string, string> = { physical: '物理', magic: '魔法', utility: '辅助', passive: '被动', bound: '绑定', special: '特殊' };
type SkillEffectDetail = { code: string; name: string; effect_type: string; value: number; duration: number; target_scope: 'enemy' | 'ally' | 'self'; trigger_timing: 'on_hit' | 'on_cast' };
const effectValueText = (value: number) => Number(value) % 1 === 0 ? String(Number(value)) : Number(value).toFixed(1);
const effectDescription = (effect: SkillEffectDetail) => {
  const value = effectValueText(effect.value); const duration = Number(effect.duration) ? `，持续${effect.duration}回合` : '';
  switch (effect.code) {
    case 'stun': return `命中时，${value}%基础概率使对面进入“眩晕”状态，持续${effect.duration}回合。实际效果受等级差与韧性影响。\n\\#眩晕\\#当前回合无法行动`;
    case 'ice_bind': return `命中时，造成${value}%基础概率束缚1回合。实际效果受等级差与韧性影响。`;
    case 'vulnerability': case 'armor_shatter': case 'sword_break': return `命中时，使目标物理防御降低${value}%${duration}。`;
    case 'magic_shatter': return `命中时，使目标魔法防御降低${value}%${duration}。`;
    case 'exposed': return `“眩晕”施加成功时，附带“易伤”状态，持续${effect.duration}回合。\n\\#易伤\\#受到的直击伤害提高${value}%`;
    case 'burn': return `命中时，使目标进入灼烧状态；每回合损失${value}%最大生命${duration}。`;
    case 'poison': return `命中时，使目标进入中毒状态；每回合损失${value}%最大生命${duration}，可叠加。`;
    case 'lost_health_poison': return `命中时，使目标进入中毒状态；每回合损失已损失生命的${value}%${duration}。`;
    case 'bleeding': return `命中时，使目标进入流血状态；每回合损失${value}%最大生命${duration}。`;
    case 'rending': return `命中时，使目标进入撕裂状态；每回合损失${value}%最大生命${duration}。`;
    case 'slow': return `命中时，使目标速度降低${value}%${duration}。`;
    case 'bind': return `命中时，使目标速度、闪避降低${value}%${duration}。`;
    case 'evasion_down': return `命中时，使目标闪避降低${value}%${duration}。`;
    case 'sprint': return `释放后，使自身速度提高${value}%${duration}。`;
    case 'precision': return `释放后，使自身命中提高${value}%${duration}。`;
    case 'critical_focus': return `释放后，使自身暴击提高${value}%${duration}。`;
    case 'mist_veil': return `释放后，使自身下一次攻击伤害提高${value}%。`;
    case 'shadow_pierce': return '释放后，使自身下一次攻击必定暴击。';
    case 'battle_cry': return `释放后，使全队物攻、魔攻提高${value}%${duration}。`;
    case 'barrier': return `释放后，使目标获得${value}%伤害减免${duration}。`;
    case 'regeneration': return `释放后，使目标每回合恢复${value}%最大生命${duration}。`;
    case 'mana_regeneration': return `释放后，使目标每回合恢复${value}%最大魔力${duration}。`;
    case 'purify': return '释放后，祛除目标全部异常状态。';
    case 'imbalance': return `命中时，使目标命中、闪避降低${value}%${duration}。`;
    case 'shield_guard': return `释放后，使自身下次出手前受到的伤害降低${value}%。`;
    case 'shield_counter': return '释放后进入“盾反”状态，持续到自身下次行动前。\n\\#盾反\\#受到直伤降低60%，近战反射原始伤害50%；反射不触发专精或连锁。';
    case 'shield_counter_cooldown': return '每个全局回合最多一次：格挡成功使盾反冷却缩短1回合。';
    case 'demon_surge': return `释放后，使自身伤害提高${value}%${duration}，可叠加。`;
    default: return effect.trigger_timing === 'on_hit' ? `命中时，触发「${effect.name}」效果${duration}。` : `释放后，触发「${effect.name}」效果${duration}。`;
  }
};

const appendSkillEffectDetails = (markdown: ReturnType<typeof Format.createMarkdown>, skill: Awaited<ReturnType<typeof skillDetail>>) => {
  const description = balancedSkillDescription(skill.code, advancedSkillDescriptions[skill.code] ?? skill.description ?? '').trim();
  const effects = skill.effectDetails as SkillEffectDetail[];
  markdown.addBlockquote(`效果：${description || (effects.length ? '' : '无')}`).addNewline();
  effects.forEach((effect, index) => markdown.addText(`${'①②③④⑤'.charAt(index) || `${index + 1}.`}${effect.name}\n`).addBlockquote(effectDescription(effect)).addNewline());
  return markdown;
};

const skillListFormat = async (qqUserId: string, view: '已学习' | '未学习', page = 1, keyword = '') => {
  const data = await skillList(qqUserId); const markdown = Format.createMarkdown().addTitle('技能列表');
  if (data.isOmniscient) markdown.addText(' ').addButton('[贯注]', { data: '/技能贯注', autoEnter: false });
  markdown.addNewline().addNewline(); const normalizedKeyword = keyword.trim();
  const entries = (view === '已学习'
    ? data.skills
      .filter(skill => !normalizedKeyword || skill.name.includes(normalizedKeyword))
      .sort((left, right) => {
        const order = { bound: 0, passive: 1 } as Record<string, number>;
        return (order[left.category] ?? 2) - (order[right.category] ?? 2);
      })
    : data.discoveries.filter(skill => !normalizedKeyword || skill.name.includes(normalizedKeyword)));
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
    else for (const skill of linkedPassives) markdown.addBlockquote(`【${skill.name}】${isAdvancedProfessionSkillCode(skill.code) ? '' : `Lv.${skill.level} `}`).addButton('[卸下]', { data: `/链接被动 ${skill.id}`, autoEnter: false }).addNewline();
    markdown.addNewline().addText('已学技能：').addNewline();
    const boundSkills = displayed.filter(skill => skill.category === 'bound');
    const passiveSkills = displayed.filter(skill => skill.category === 'passive');
    const activeSkills = displayed.filter(skill => skill.category !== 'passive' && skill.category !== 'bound');
    if (!displayed.length) markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的已学技能。' : '暂无').addNewline();
    if (boundSkills.length) {
      markdown.addText('> ').addBold('绑定').addNewline();
      for (const skill of boundSkills) {
        const bound = advancedBoundSkillDefinitions.find(entry => entry.code === skill.code);
        markdown.addBlockquote(`【${skill.name}】${isAdvancedProfessionSkillCode(skill.code) || talentByCode.has(skill.code) ? '' : `Lv.${skill.level} `}`).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText(talentByCode.has(skill.code) ? ' [天赋·绑定]' : bound ? ` [绑定·${bound.kind}]` : ' [绑定]').addNewline();
      }
    }
    if (passiveSkills.length) {
      markdown.addText('> ').addBold('被动').addNewline();
      for (const skill of passiveSkills) {
        markdown.addBlockquote(`【${skill.name}】${isAdvancedProfessionSkillCode(skill.code) ? '' : `Lv.${skill.level} `}`).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText(' [被动] ')
          .addButton(skill.passive_linked ? '[卸下]' : '[链接]', { data: `/链接被动 ${skill.id}`, autoEnter: false }).addNewline();
      }
    }
    if (activeSkills.length) {
      markdown.addText('> ').addBold('主动').addNewline();
      for (const skill of activeSkills) {
        markdown.addBlockquote(`【${skill.name}】${isAdvancedProfessionSkillCode(skill.code) ? '' : `Lv.${skill.level} `}`).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false });
        markdown.addText(' ').addButton(skill.quick_slot ? '[取消快捷]' : '[快捷]', { data: `/技能快捷 ${skill.id}`, autoEnter: false });
        markdown.addNewline();
      }
    }
  } else {
    markdown.addText(`剩余技能点：${data.skillPoints}`).addNewline().addNewline().addText('未学技能：').addNewline();
    if (!displayed.length) markdown.addBlockquote(normalizedKeyword ? '没有找到符合条件的技能。' : '尚无可学习的技能。').addNewline();
    for (const skill of displayed) markdown.addBlockquote(`【${skill.name}】${skill.tier}｜SP:${skill.learn_cost} `).addButton('[详情]', { data: `/技能详情 ${skill.id}`, autoEnter: false }).addText(' ').addButton('[学习]', { data: `/学习技能 ${skill.id}`, autoEnter: false }).addNewline();
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
  const detailMessage = useTalentDetailMessage();
  try {
    const skill = await skillDetail(event.current.UserId, Number(route.param('id')));
    const talent = talentByCode.get(skill.code);
    if (talent) {
      const markdown = Format.createMarkdown().addTitle(`天赋·${talent.name}`).addNewline().addNewline()
        .addBlockquote(`${talent.group}｜人物绑定`).addNewline().addText(talent.description);
      if (skill.learned) markdown.addNewline().addButton('[天赋操作]', { data: '/天赋', autoEnter: false });
      await detailMessage.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true })) });
      return;
    }
    if (skill.code === 'appraisal' && skill.learned && skill.appraisal) {
      const eyeCost = skill.appraisal.rangeLevel; const pearlCost = skill.appraisal.informationLevel + 1;
      const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline()
        .addText(`【鉴识】Lv.${skill.level}\n`).addBlockquote('类别：绑定').addNewline().addBlockquote('女神在降临时授予的通用能力，基础 Lv.1 无需学习；后续慧眼与识珠仍需自行消耗技能点升级。').addNewline().addBlockquote('效果：鉴识未知的敌对生物，查看其各种信息。').addNewline().addNewline()
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
        longsword_mastery: { weapon: '长剑', stat: '暴击', base: 40, step: 10 }, shield_mastery: { weapon: '盾牌', stat: '暴免、暴抗', base: 20, step: 5 },
        staff_mastery: { weapon: '法杖', stat: '暴伤', base: 40, step: 10 }, spellbook_mastery: { weapon: '法书', stat: '吟唱速度', base: 40, step: 10 },
        orb_mastery: { weapon: '法球', stat: '魔力上限', base: 40, step: 10 }, dagger_mastery: { weapon: '匕首', stat: '命中', base: 40, step: 10 },
        fistblade_mastery: { weapon: '拳刃', stat: '暴击、暴伤', base: 20, step: 5 }
      } as const)[skill.code] ?? { weapon: '对应', stat: '属性', base: 0, step: 0 };
      const offhandText = focus >= 6 ? '主、副词条发挥100%。' : `主、副词条发挥${50 + (focus - 1) * 10}%。`;
      const effectValue = masteryText.base + masteryText.step * (proficiency - 1);
      const effectText = `装备${masteryText.weapon}类武器时，${masteryText.stat}+${effectValue}%。副手装备时，${offhandText}`;
      const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline().addText(`【${skill.name}】Lv.${skill.level}\n`)
        .addBlockquote('类别：绑定').addNewline().addBlockquote(`效果：${effectText}`).addNewline().addNewline().addText(`专精：\n①娴熟 Lv.${proficiency}/5 `);
      if (skill.masteryProficiencyCost !== null) markdown.addButton(`[升级(SP${skill.masteryProficiencyCost})]`, { data: `/升级专精 ${skill.id} 娴熟`, autoEnter: false });
      markdown.addNewline().addBlockquote(`${masteryText.stat}+${effectValue}%。每提升一级 +${masteryText.step}%，Lv.5 为 +${masteryText.base + masteryText.step * 4}%。`).addNewline().addNewline().addText(`②随心 Lv.${focus}/6 `);
      if (skill.masteryFocusCost !== null) markdown.addButton(`[升级(SP${skill.masteryFocusCost})]`, { data: `/升级专精 ${skill.id} 随心`, autoEnter: false });
      markdown.addNewline().addBlockquote('每提升一级，对应武器类型的副手主、副词条发挥提高10个百分点，最高100%；装备特殊效果不衰减。').addNewline().addNewline().addText(`当前技能点：${skill.skillPoints}`);
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
      const names = { overcharge: '过充', potent: '强效', instant: '瞬息', efficient: '节能' } as const;
      const perLevel = specializationPerLevelLines(skill.tier, skill.specializations, skill.code);
      const category = categoryNames[skill.category] ?? '特殊';
      const resourceRequirement = advancedResourceRequirementForSkill(skill.code); const resource = advancedResourceForProfession(resourceRequirement?.professionCode);
      const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline().addText(`【${skill.name}】${`Lv.${skill.level}`}\n`)
        .addBlockquote(`等阶：${skill.tier}`).addNewline().addBlockquote(`类别：${category}`).addNewline().addBlockquote(`种类：${skill.skill_kind}`).addNewline().addBlockquote(`属性：${skill.element}`).addNewline().addBlockquote(`距离：${skill.range_type}`).addNewline().addBlockquote(`目标范围：${skill.target_scope}`).addNewline().addBlockquote(`武器限制：${skill.required_weapon_type ? `主手或副手装备${skill.required_weapon_type}` : '无（任意武器可用）'}`).addNewline().addBlockquote(`威力：${specializationNumberText(skill.specializationResult.power)}`).addNewline().addBlockquote(`蓝耗：${skill.actualManaCost}`).addNewline().addBlockquote(`冷却：${skill.actualCooldown}`).addNewline().addBlockquote(`吟唱：${skill.actualChant}`).addNewline();
      if (resourceRequirement && resource) markdown.addBlockquote(`专属资源：消耗${resourceRequirement.amount}${resource.name}。${resource.summary}`).addNewline();
      appendSkillEffectDetails(markdown, skill);
      {
        markdown.addNewline().addText('专精 · 下一级变化\n');
        (Object.keys(names) as Array<keyof typeof names>).forEach((key, index) => {
          if (!skill.specializationChoices.includes(key)) return;
          const level = Number(skill.specializations[key] ?? 1); markdown.addText(`${'①②③④'.charAt(index)}${names[key]} Lv.${level}/${skill.specializationMaxLevel} `);
          const cost = skill.specializationUpgradeCosts[key];
          if (cost != null) markdown.addButton(`[升级(SP${cost})]`, { data: `/升级专精 ${skill.id} ${names[key]}`, autoEnter: false });
          markdown.addNewline();
          for (const line of perLevel[key]) markdown.addBlockquote(line).addNewline();
          markdown.addNewline();
        });
      }
      markdown.addNewline().addText(`当前技能点：${skill.skillPoints}`);
      const buttons = Format.createButtonGroup().addRow().addButton('返回技能列表', '/技能列表 已学习', { type: 'command', autoEnter: true, style: 'blue' });
      await message.send({ format: Format.create().addMarkdown(markdown).addButtonGroup(buttons) });
      return;
    }
    const fixedAdvancedSkill = isAdvancedProfessionSkillCode(skill.code);
    const levelText = skill.learned ? (fixedAdvancedSkill ? '（二转固定技能）' : `Lv.${skill.level}/${skill.max_level}`) : `未学习｜SP:${skill.learn_cost}`;
    const costText = !skill.learned
      ? `学习消耗：${skill.learn_cost} 技能点`
      : fixedAdvancedSkill
        ? ''
        : skill.nextUpgradeCost === null
        ? '已达最高等级。'
        : `升级消耗：${skill.nextUpgradeCost} 技能点`;
    const appraisalText = skill.code === 'appraisal' && skill.appraisal
      ? `\n鉴识进度：\n等级差 Lv.${skill.appraisal.rangeLevel}（可鉴识至自身等级 +${skill.appraisal.rangeLevel * 3}）\n信息深化 Lv.${skill.appraisal.informationLevel}/4\n深化 Lv.1：名称、生命、魔力、技能名\nLv.2：词条、攻防、命中、闪避\nLv.3：战斗状态\nLv.4：种族、弱点、抗性与六维`
      : '';
    const resourceRequirement = advancedResourceRequirementForSkill(skill.code); const resource = advancedResourceForProfession(resourceRequirement?.professionCode);
    const markdown = Format.createMarkdown().addTitle('技能详情').addNewline().addNewline().addText(`【${skill.name}】${levelText}\n`);
    if(skill.code.startsWith('talent_'))markdown.addNewline().addButton('[天赋操作]',{data:'/天赋',autoEnter:false});
    if (skill.category === 'passive' || skill.category === 'bound') {
      markdown.addBlockquote(`等阶：${skill.tier}`).addNewline().addBlockquote(`类别：${categoryNames[skill.category]}`).addNewline().addBlockquote(`效果：${skill.description}`);
      if (skill.passiveSpecializable) {
        const level = Number(skill.specializations.potent ?? 1);
        markdown.addNewline().addNewline().addText(`强效 Lv.${level}/${skill.specializationMaxLevel}\n`).addBlockquote(passiveSpecializationPerLevelLine(skill.tier, level)).addNewline();
        if (skill.learned && level < skill.specializationMaxLevel && skill.specializationUpgradeCost !== null) markdown.addButton(`[升级强效(SP${skill.specializationUpgradeCost})]`, { data: `/升级专精 ${skill.id} 强效`, autoEnter: false }).addNewline();
        markdown.addNewline().addText('总体变化（仅专精）\n').addBlockquote(passiveSpecializationTotalLine(skill.passiveFactor));
      } else markdown.addNewline().addBlockquote('专精：固定机制被动不放大权限、次数或资源返还；装备精通和鉴识保留专用成长。');
      const bound = advancedBoundSkillDefinitions.find(entry => entry.code === skill.code);
      if (bound) markdown.addNewline().addBlockquote(`本职${bound.kind}：常驻生效，不占普通被动槽；切换二转时随职业更换。`);
      if (bound?.kind === '传承') markdown.addNewline().addBlockquote('传承按本职规则触发，不会因列入技能列表而重复结算。');
      else if (advancedProfessionPassiveCodes.has(skill.code)) {
        const profession = worldTreeAdvancedProfessions.find(entry => entry.passive.code === skill.code);
        if (!profession || hasBattleOnlyAdvancedPassiveEffect(profession.code)) markdown.addNewline().addBlockquote('战斗规则：此效果仅在战斗结算时生效，不会增加角色详情中的基础属性。');
        else markdown.addNewline().addBlockquote('属性规则：此效果已在角色属性重算时写入角色详情，不会在战斗中重复叠加。');
      }
    }
    else {
      markdown.addBlockquote(`等阶：${skill.tier}`).addNewline().addBlockquote(`类别：${categoryNames[skill.category] ?? '辅助'}`).addNewline().addBlockquote(`种类：${skill.skill_kind}`).addNewline().addBlockquote(`属性：${skill.element}`).addNewline().addBlockquote(`距离：${skill.range_type}`).addNewline().addBlockquote(`目标范围：${skill.target_scope}`).addNewline().addBlockquote(`武器限制：${skill.required_weapon_type ? `主手或副手装备${skill.required_weapon_type}` : '无（任意武器可用）'}`).addNewline().addBlockquote(`威力：${specializationNumberText(skill.specializationResult.power)}`).addNewline().addBlockquote(`蓝耗：${skill.actualManaCost}`).addNewline().addBlockquote(`冷却：${skill.actualCooldown}`).addNewline().addBlockquote(`吟唱：${skill.actualChant}`).addNewline();
      if (resourceRequirement && resource) markdown.addBlockquote(`专属资源：消耗${resourceRequirement.amount}${resource.name}。${resource.summary}`).addNewline();
      appendSkillEffectDetails(markdown, skill);
    }
    if (appraisalText) markdown.addNewline().addText(appraisalText.trim());
    if (costText) markdown.addNewline().addNewline().addText(costText);
    const buttons = Format.createButtonGroup().addRow().addButton('返回技能列表', skill.learned ? '/技能列表 已学习' : '/技能列表 未学习', { type: 'command', autoEnter: true });
    if (!skill.learned) buttons.addButton('学习', `/学习技能 ${skill.id}`, { type: 'command', autoEnter: true, style: 'blue' });
    else if (skill.code === 'appraisal' && skill.appraisal) {
      if (skill.appraisal.rangeLevel < 10) buttons.addButton('升级慧眼', '/升级鉴识 慧眼', { type: 'command', autoEnter: true, style: 'blue' });
      if (skill.appraisal.informationLevel < 4) buttons.addButton('升级识珠', '/升级鉴识 识珠', { type: 'command', autoEnter: true, style: 'blue' });
    } else if (!fixedAdvancedSkill && skill.nextUpgradeCost !== null) buttons.addButton('升级', `/升级技能 ${skill.id}`, { type: 'command', autoEnter: true, style: 'blue' });
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
