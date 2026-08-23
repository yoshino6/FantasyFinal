import { Format, logger, useEvent, useMessage } from 'alemonjs';
import { getCharacter, type CharacterView } from '../game/character.service';
import { experienceRequiredForLevel, realmNameForStage } from '../game/constants';
import { messageFormat } from '../game/message';
import { playerPvpStatus } from '../game/pvp.service';

const elementOrder = ['水', '火', '木', '土', '风', '冰', '雷', '光', '暗'];
const numberText = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const elementText = (character: CharacterView, key: 'elementMastery' | 'elementResistance', start: number, end: number) => elementOrder.slice(start, end).map(element => {
  const value = Number(character[key][element] ?? 0);
  return `${element}${value >= 0 ? '+' : ''}${value}`;
}).join('｜');
const appendDetails = (markdown: ReturnType<typeof Format.createMarkdown>, character: CharacterView) => markdown
  .addText('六维').addNewline()
  .addBlockquote(`体质 ${numberText(character.constitution)}｜精神 ${numberText(character.spirit)}`).addNewline()
  .addBlockquote(`力量 ${numberText(character.strength)}｜智力 ${numberText(character.intelligence)}`).addNewline()
  .addBlockquote(`敏捷 ${numberText(character.agility)}｜感知 ${numberText(character.perception)}`).addNewline().addNewline()
  .addText('属性').addNewline()
  .addBlockquote(`生命 ${Math.round(character.hpMax)}｜魔力 ${Math.round(character.mpMax)}`).addNewline()
  .addBlockquote(`物攻 ${Math.round(character.physicalAttack)}｜魔攻 ${Math.round(character.magicAttack)}`).addNewline()
  .addBlockquote(`物防 ${Math.round(character.physicalDefense)}｜魔防 ${Math.round(character.magicDefense)}`).addNewline()
  .addBlockquote(`命中 ${Math.round(character.accuracy)}｜闪避 ${Math.round(character.evasion)}`).addNewline()
  .addBlockquote(`暴击 ${Math.round(character.critRateBp)}｜暴伤 ${Math.round(character.critDamageBp)}`).addNewline()
  .addBlockquote(`暴免 ${Math.round(character.critDamageReductionBp)}｜暴抗 ${Math.round(character.critResistBp)}`).addNewline()
  .addBlockquote(`韧性 ${Math.round(character.tenacity)}｜速度 ${Math.round(character.speed)}`).addNewline().addNewline()
  .addText('额外属性').addNewline()
  .addBlockquote(`伤害增加 ${numberText(character.extraAttributes.damageBonusPct)}%`).addNewline().addNewline()
  .addText('元素精通').addNewline()
  .addBlockquote(elementText(character, 'elementMastery', 0, 5)).addNewline()
  .addBlockquote(elementText(character, 'elementMastery', 5, 9)).addNewline().addNewline()
  .addText('元素抗性').addNewline()
  .addBlockquote(elementText(character, 'elementResistance', 0, 5)).addNewline()
  .addBlockquote(elementText(character, 'elementResistance', 5, 9)).addNewline().addNewline()
  .addText('当前位置').addNewline()
  .addBlockquote(`${character.regionName} (${character.x}, ${character.y}, ${character.z})`);

export default async () => {
  const [event] = useEvent();
  const [message] = useMessage();
  try {
    const character = await getCharacter(event.current.UserId);
    if (!character) { await message.send({ format: messageFormat('尚未注册', '发送“注册”开始异世界之旅。') }); return; }
    const gender = character.gender === '男' ? '♂' : character.gender === '女' ? '♀' : '?'; const pvp = await playerPvpStatus(event.current.UserId);
    const markdown = Format.createMarkdown().addTitle('角色信息').addText(`\n\n昵称：${character.name} `)
      .addButton('[改名]', { data: '/改名 ', autoEnter: false }).addText(` \n性别：${gender}`)
      .addButton('[改性]', { data: '/改性 ', autoEnter: false }).addText(`\n境界：${realmNameForStage(character.realmStage)}\n等级：Lv.${character.level}\n经验：${character.experience}/${experienceRequiredForLevel(character.level)}${pvp.detainedUntil ? '\n状态：收押中' : pvp.wanted ? '\n状态：通缉中（红名）' : ''}\n\n`);
    if (!character.adventurerRegistered) markdown.addText('属性暂时隐藏');
    else appendDetails(markdown, character);
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.error({ err: error, userId: event.current.UserId }, 'load character failed');
    await message.send({ format: messageFormat('读取失败', '角色数据暂时无法读取，请稍后重试。') });
  }
};
