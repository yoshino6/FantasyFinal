import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter, type CharacterView } from '../game/character.service';
import { experienceRequiredForLevel } from '../game/constants';
import { messageFormat } from '../game/message';
import { durationText } from '../game/time-format';

const elementOrder = ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗'];
const numberText = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const extraLabels: Record<string, { name: string; unit: string; inverse?: boolean }> = {
  damageBonusPct: { name: '伤害', unit: '%' }, magicDamagePct: { name: '魔伤', unit: '%' }, physicalSkillDamagePct: { name: '物技', unit: '%' }, magicSkillDamagePct: { name: '魔技', unit: '%' },
  lightSkillBonusPct: { name: '光技', unit: '%' }, criticalDamageBonusPct: { name: '暴伤加', unit: '%' }, physicalCriticalFinalDamagePct: { name: '物暴伤', unit: '%' },
  physicalDamageReductionPct: { name: '物减', unit: '%' }, magicDamageReductionPct: { name: '魔减', unit: '%' }, ignoreDefensePct: { name: '破防', unit: '%' }, lifestealPct: { name: '吸血', unit: '%' },
  hpRegenPct: { name: '回生', unit: '%' }, mpRegenPct: { name: '回魔', unit: '%' }, minimumHitRatePct: { name: '最低命中', unit: '%' }, actualHitRatePct: { name: '实命', unit: '%' }, physicalActualHitRatePct: { name: '物实命', unit: '%' },
  chantSpeedPct: { name: '吟速', unit: '%' }, chantReduction: { name: '吟唱', unit: '回', inverse: true }, magicChantBonus: { name: '魔吟', unit: '回' }, manaCostReduction: { name: '耗蓝', unit: '', inverse: true }
};
const progressBar = (current: number, maximum: number, width = 10) => {
  const filled = Math.max(0, Math.min(width, Math.floor(Math.max(0, current) / Math.max(1, maximum) * width)));
  return `${'▓'.repeat(filled)}${'░'.repeat(width - filled)}`;
};
const appendQuotedAttributes = (markdown: ReturnType<typeof Format.createMarkdown>, entries: Array<[string, string]>) => {
  markdown.addText('> ');
  entries.forEach(([name, value], index) => {
    if (index) markdown.addText('｜');
    markdown.addBold(name).addText(` ${value}`);
  });
  return markdown.addNewline();
};
const elementEntries = (character: CharacterView, key: 'elementMastery' | 'elementResistance', start: number, end: number): Array<[string, string]> => elementOrder.slice(start, end).map(element => [element, String(Number(character[key][element] ?? 0))]);

const appendDetails = (markdown: ReturnType<typeof Format.createMarkdown>, character: CharacterView) => {
  markdown.addText('六维').addNewline();
  appendQuotedAttributes(markdown, [['体质', numberText(character.constitution)], ['精神', numberText(character.spirit)]]);
  appendQuotedAttributes(markdown, [['力量', numberText(character.strength)], ['智力', numberText(character.intelligence)]]);
  appendQuotedAttributes(markdown, [['敏捷', numberText(character.agility)], ['感知', numberText(character.perception)]]);

  markdown.addNewline().addText('属性').addNewline();
  appendQuotedAttributes(markdown, [['生命', `${Math.round(character.currentHp)}/${Math.round(character.hpMax)}`]]);
  appendQuotedAttributes(markdown, [['魔力', `${Math.round(character.currentMp)}/${Math.round(character.mpMax)}`]]);
  appendQuotedAttributes(markdown, [['物攻', String(Math.round(character.physicalAttack))], ['魔攻', String(Math.round(character.magicAttack))]]);
  appendQuotedAttributes(markdown, [['物防', String(Math.round(character.physicalDefense))], ['魔防', String(Math.round(character.magicDefense))]]);
  appendQuotedAttributes(markdown, [['命中', String(Math.round(character.accuracy))], ['闪避', String(Math.round(character.evasion))]]);
  appendQuotedAttributes(markdown, [['暴击', String(Math.round(character.critRateBp))], ['暴伤', String(Math.round(character.critDamageBp))]]);
  appendQuotedAttributes(markdown, [['暴免', String(Math.round(character.critDamageReductionBp))], ['暴抗', String(Math.round(character.critResistBp))]]);
  appendQuotedAttributes(markdown, [['韧性', String(Math.round(character.tenacity))], ['速度', String(Math.round(character.speed))]]);

  const extraAttributes: Array<[string, string]> = Object.entries(character.extraAttributes).flatMap(([key, raw]) => {
    const label = extraLabels[key]; const value = Number(raw);
    if (!label || !value) return [];
    const actual = label.inverse ? -value : value;
    return [[label.name, `${actual > 0 ? '+' : ''}${numberText(actual)}${label.unit}`] as [string, string]];
  });
  if (extraAttributes.length) {
    markdown.addNewline().addText('额外').addNewline();
    for (let index = 0; index < extraAttributes.length; index += 3) appendQuotedAttributes(markdown, extraAttributes.slice(index, index + 3));
  }

  markdown.addNewline().addText('元素精通').addNewline();
  appendQuotedAttributes(markdown, elementEntries(character, 'elementMastery', 0, 5));
  appendQuotedAttributes(markdown, elementEntries(character, 'elementMastery', 5, 9));
  markdown.addNewline().addText('元素抗性').addNewline();
  appendQuotedAttributes(markdown, elementEntries(character, 'elementResistance', 0, 5));
  appendQuotedAttributes(markdown, elementEntries(character, 'elementResistance', 5, 9));
  return markdown;
};

const overviewFormat = (character: CharacterView) => {
  const gender = character.gender === '男' ? '♂' : character.gender === '女' ? '♀' : '未设定';
  const experienceNeed = experienceRequiredForLevel(character.level);
  const markdown = Format.createMarkdown()
    .addTitle('我').addNewline().addNewline()
    .addText(`昵称：${character.name}`).addButton('[改名]', { data: '/角色改名 ', autoEnter: false }).addNewline().addNewline()
    .addText(`性别：${gender}`).addButton('[改性]', { data: '/改性 ', autoEnter: false }).addNewline().addNewline()
    .addText(`等级：Lv${character.level}`).addNewline().addNewline()
    .addText(`经验：${character.experience}/${experienceNeed}`).addNewline().addNewline()
    .addText(progressBar(character.experience, experienceNeed)).addNewline().addNewline()
    .addText('——————————').addNewline().addNewline()
    .addText(`生命：${Math.round(character.currentHp)}/${Math.round(character.hpMax)}`).addNewline().addNewline()
    .addText(progressBar(character.currentHp, character.hpMax)).addNewline().addNewline()
    .addText(`魔力：${Math.round(character.currentMp)}/${Math.round(character.mpMax)}`).addNewline().addNewline()
    .addText(progressBar(character.currentMp, character.mpMax)).addNewline().addNewline()
    .addText('增益效果：').addNewline().addNewline();
  if (character.activeBuffs.length) character.activeBuffs.forEach((buff, index) => markdown.addBlockquote(`${index + 1}. ${buff.replace(/剩余(\d+)秒/, (_all, seconds) => `剩余${durationText(Number(seconds))}`)}`).addNewline());
  else markdown.addBlockquote('暂无').addNewline();
  markdown.addNewline().addText('当前位置').addNewline().addNewline().addBlockquote(`${character.regionName} (${character.x}, ${character.y}, ${character.z})`);
  return Format.create().addMarkdown(markdown).addButtonGroup(Format.createButtonGroup().addRow().addButton('详情', '/角色详情', { type: 'command', autoEnter: true, style: 'blue' }));
};

const detailFormat = (character: CharacterView) => {
  const markdown = Format.createMarkdown().addTitle('角色详情').addNewline().addNewline();
  appendDetails(markdown, character);
  return Format.create().addMarkdown(markdown);
};

const loadCharacter = async (message: any, qqUserId: string, detail: boolean) => {
  try {
    const character = await getCharacter(qqUserId);
    if (!character) { await message.send({ format: messageFormat('尚未注册', '发送“注册”开始异世界之旅。') }); return; }
    await message.send({ format: detail ? detailFormat(character) : overviewFormat(character) });
  } catch (error) {
    logger.error({ err: error, userId: qqUserId }, 'load character failed');
    await message.send({ format: messageFormat('读取失败', '角色数据暂时无法读取，请稍后重试。') });
  }
};

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  await loadCharacter(message, event.current.UserId, false);
};

export const characterDetailHandler = async () => {
  const [event] = useEvent(); const [message] = useMessage();
  await loadCharacter(message, event.current.UserId, true);
};
