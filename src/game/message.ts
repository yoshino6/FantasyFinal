import { Format } from 'alemonjs';
import { attributeNames, INITIAL_ATTRIBUTE_POINTS } from './constants';
import { attributes, type Allocation, type DerivedStats } from './types';

const percent = (bp: number) => `${(bp / 100).toFixed(2)}%`;

export const storyFormat = () => Format.create()
  .addText('【异界序章】\n\n当最后一缕现实的光从眼前散去，你在世界树的低语中醒来。远方的幽暗密林正等待第一位旅者。\n\n命运尚未落笔。点击下方“继续”；若按钮不可用，请发送 /注册 继续。')
  .addButtonGroup(Format.createButtonGroup().addRow().addButton('继续', '/注册 继续', { type: 'command', autoEnter: true }));

export const allocationFormat = (allocation: Allocation) => {
  const used = attributes.reduce((sum, key) => sum + allocation[key], 0);
  const lines = attributes.map(key => `${attributeNames[key]}：${allocation[key]}`).join('  ');
  return Format.create()
    .addText(`【属性分配】\n可用点数：${INITIAL_ATTRIBUTE_POINTS - used}/${INITIAL_ATTRIBUTE_POINTS}\n${lines}\n\n发送 /加点 属性 点数，例如 /加点 体质 3。分完后发送 /确认属性。`)
    .addButtonGroup(Format.createButtonGroup()
      .addRow().addButton('体质 +1', '/加点 体质 1', { type: 'command', autoEnter: true }).addButton('精神 +1', '/加点 精神 1', { type: 'command', autoEnter: true }).addButton('力量 +1', '/加点 力量 1', { type: 'command', autoEnter: true })
      .addRow().addButton('智力 +1', '/加点 智力 1', { type: 'command', autoEnter: true }).addButton('敏捷 +1', '/加点 敏捷 1', { type: 'command', autoEnter: true }).addButton('感知 +1', '/加点 感知 1', { type: 'command', autoEnter: true })
      .addRow().addButton('重置', '/重置加点', { type: 'command', autoEnter: true }).addButton('确认属性', '/确认属性', { type: 'command', autoEnter: true }));
};

export const characterText = (name: string, allocation: Allocation, stats: DerivedStats, region: string, x: number, y: number, z: number) =>
  `【${name}】\n基础：${attributes.map(key => `${attributeNames[key]} ${allocation[key]}`).join('｜')}\n生命 ${stats.hpMax}｜魔力 ${stats.mpMax}\n物攻 ${stats.physicalAttack}｜魔攻 ${stats.magicAttack}\n物防 ${stats.physicalDefense}｜魔防 ${stats.magicDefense}\n命中 ${percent(stats.accuracy)}｜闪避 ${percent(stats.evasion)}｜暴击 ${percent(stats.critRateBp)}\n爆伤 ${percent(stats.critDamageBp)}｜爆免 ${percent(stats.critDamageReductionBp)}｜爆抗 ${percent(stats.critResistBp)}\n韧性 ${stats.tenacity}｜速度 ${stats.speed}\n位置：${region} (${x}, ${y}, ${z})`;
