import { logger, useEvent, useMessage, useRoute } from 'alemonjs';
import { equipmentDetail } from '../game/adventure.service';
import { messageFormat } from '../game/message';

const effectText = (effectJson: unknown) => {
  if (!effectJson) return '无额外属性。';
  const effect = (typeof effectJson === 'string' ? JSON.parse(effectJson) : effectJson) as Record<string, number>;
  const labels: Record<string, string> = { physicalAttack: '物理攻击', magicAttack: '魔法攻击', critRateBp: '暴击率', ignoreDefensePct: '无视防御', lifestealPct: '生命偷取', magicDamagePct: '魔法伤害', manaCostReduction: '魔力消耗降低' };
  const entries = Object.entries(effect).filter(([, value]) => Number(value));
  return entries.length ? entries.map(([key, value]) => `${labels[key] ?? key}：${key === 'critRateBp' ? `${Number(value) / 100}%` : Number(value) > 0 ? `+${value}` : value}`).join('\n') : '无额外属性。';
};

export default async () => {
  const [event] = useEvent(); const [route] = useRoute(); const [message] = useMessage();
  try {
    const item = await equipmentDetail(event.current.UserId, Number(route.param('id')));
    await message.send({ format: messageFormat('装备详情', `[${item.item_category}]${item.name}\n品质：${Number(item.quality).toFixed(2)}%\n耐久：${item.durability}/${item.durability_max}\n\n当前属性：\n${effectText(item.effect_json)}\n\n${item.description}`) });
  } catch (error) { logger.warn({ err: error, userId: event.current.UserId }, 'load equipment detail failed'); await message.send({ format: messageFormat('装备详情', error instanceof Error ? error.message : '请稍后重试。') }); }
};
