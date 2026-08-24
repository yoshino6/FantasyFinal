import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter, type CharacterView } from '../game/character.service';
import { experienceRequiredForLevel, realmNameForStage } from '../game/constants';
import { messageFormat } from '../game/message';
import { playerPvpStatus } from '../game/pvp.service';
import { durationText } from '../game/time-format';

const elementOrder = ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗'];
const numberText = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const appendQuotedAttributes = (markdown: ReturnType<typeof Format.createMarkdown>, entries: Array<[string, string]>) => {
  markdown.addText('> ');
  entries.forEach(([name, value], index) => {
    if (index) markdown.addText('｜');
    markdown.addBold(name).addText(` ${value}`);
  });
  return markdown.addNewline();
};
const elementEntries = (character: CharacterView, key: 'elementMastery' | 'elementResistance', start: number, end: number): Array<[string, string]> => elementOrder.slice(start, end).map(element => {
  const value = Number(character[key][element] ?? 0);
  return [element, `${value >= 0 ? '+' : ''}${value}`];
});
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
  markdown.addNewline().addText('额外属性').addNewline();
  appendQuotedAttributes(markdown, [['伤害增加', `${numberText(character.extraAttributes.damageBonusPct)}%`]]);
  markdown.addNewline().addText('元素精通').addNewline();
  appendQuotedAttributes(markdown, elementEntries(character, 'elementMastery', 0, 5));
  appendQuotedAttributes(markdown, elementEntries(character, 'elementMastery', 5, 9));
  markdown.addNewline().addText('元素抗性').addNewline();
  appendQuotedAttributes(markdown, elementEntries(character, 'elementResistance', 0, 5));
  appendQuotedAttributes(markdown, elementEntries(character, 'elementResistance', 5, 9));
  return markdown.addNewline().addText('当前位置').addNewline().addBlockquote(`${character.regionName} (${character.x}, ${character.y}, ${character.z})`);
};

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    if (!character) { await message.send({ format: messageFormat('尚未注册', '发送“注册”开始异世界之旅。') }); return; }
    const gender = character.gender === '男' ? '♂' : character.gender === '女' ? '♀' : '?'; const pvp = await playerPvpStatus(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('角色信息').addText(`\n\n昵称：${character.name} `)
      .addButton('[改名]', { data: '/改名 ', autoEnter: false }).addText(` \n性别：${gender}`)
      .addButton('[改性]', { data: '/改性 ', autoEnter: false }).addText(`\n境界：${realmNameForStage(character.realmStage)}\n等级：Lv.${character.level}\n经验：${character.experience}/${experienceRequiredForLevel(character.level)}\n体力：${character.stamina}/${character.staminaMax}${pvp.detainedUntil ? `\n状态：关押中（剩余${durationText((new Date(pvp.detainedUntil).getTime() - Date.now()) / 1000)}）` : pvp.wanted ? '\n状态：通缉中（红名）' : ''}\n\n`);
    if (!character.adventurerRegistered) markdown.addText('属性暂时隐藏');
    else appendDetails(markdown, character);
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load character failed');
    await message.send({ format: messageFormat('读取失败', '角色数据暂时无法读取，请稍后重试。') });
  }
};
