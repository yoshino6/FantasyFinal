import { Format, logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { equipmentDetail } from '../game/adventure.service';
import { messageFormat } from '../game/message';

const equipmentSections = (effectJson: unknown) => {
  const effect = (typeof effectJson === 'string' ? JSON.parse(effectJson) : effectJson ?? {}) as Record<string, unknown>;
  if (effect.artifact === 'holy_sword') return {
    attributes: ['物理攻击 +16%', '暴击属性 +33%', '暴击伤害 +33%'],
    effects: ['普攻与斩击技能恒为物理伤害。', '普攻或斩击技能暴击时，给予目标1层[破甲剑痕]。', '$破甲剑痕$目标物理防御降低16%，持续3回合，可叠加。']
  };
  if (effect.artifact === 'demon_sword') return {
    attributes: ['魔法攻击 +16%', '魔力 +33%', '命中属性 +33%'],
    effects: ['普攻与斩击技能恒为魔法伤害。', '普攻或斩击技能命中时，给予自身1层[魔剑激涌]。', '#魔剑激涌#自身伤害提高16%，持续3回合，可叠加。']
  };
  const labels: Record<string, string> = {
    physicalAttack: '物理攻击', magicAttack: '魔法攻击', critRateBp: '暴击属性', physicalAttackPct: '物理攻击',
    magicAttackPct: '魔法攻击', critRatePct: '暴击属性', critDamagePct: '暴击伤害', accuracyPct: '命中属性', mpPct: '魔力'
  };
  const attributes = Object.entries(effect)
    .filter(([key, value]) => labels[key] && Number(value))
    .map(([key, value]) => `${labels[key]} +${key.endsWith('Pct') ? `${value}%` : value}`);
  const effectLabels: Record<string, string> = {
    ignoreDefensePct: '无视目标物理防御', lifestealPct: '造成伤害后恢复生命', magicDamagePct: '魔法伤害提高', manaCostReduction: '技能魔力消耗降低'
  };
  const effects = Object.entries(effect)
    .filter(([key, value]) => effectLabels[key] && Number(value))
    .map(([key, value]) => `${effectLabels[key]} ${key === 'manaCostReduction' ? value : `${value}%`}`);
  return { attributes, effects };
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const item = await equipmentDetail(event.current.UserId, Number(route.param('id')));
    const sections = equipmentSections(item.effect_json);
    const markdown = Format.createMarkdown()
      .addTitle('装备详情')
      .addNewline()
      .addNewline()
      .addText(`[${item.item_category}]${item.name}\n品质：${Number(item.quality).toFixed(2)}%\n耐久：${item.durability}/${item.durability_max}\n\n装备属性：`)
      .addNewline();

    for (const attribute of sections.attributes.length ? sections.attributes : ['无']) {
      markdown.addBlockquote(attribute).addNewline();
    }
    markdown.addNewline().addText('装备效果：').addNewline();
    for (const effect of sections.effects.length ? sections.effects : ['无']) {
      markdown.addBlockquote(effect.replaceAll('$', '\\$').replaceAll('#', '\\#')).addNewline();
    }
    markdown.addNewline().addText('简介：').addNewline().addBlockquote(item.description);
    await message.send({ format: Format.create().addMarkdown(markdown) });
  } catch (error) {
    logger.warn({ err: error, userId: event.current.UserId }, 'load equipment detail failed');
    await message.send({ format: messageFormat('装备详情', error instanceof Error ? error.message : '请稍后重试。') });
  }
};
