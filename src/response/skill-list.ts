import { useEvent, useMessage } from 'alemonjs';
import { skillList } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try {
    const skills = await skillList(event.current.UserId);
    await message.send({ format: messageFormat('技能', skills.length ? skills.map(skill => `[技能${skill.quick_slot ?? '-'}] ${skill.name}｜MP ${skill.mana_cost}\n${skill.description}${skill.effects ? `\n特殊效果：${skill.effects}` : ''}`).join('\n\n') : '当前没有技能。') });
  } catch (error) { await message.send({ format: messageFormat('技能不可用', error instanceof Error ? error.message : '请稍后重试。') }); }
};
