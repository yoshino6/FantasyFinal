import { useEvent, useMessage } from 'alemonjs';
import { battleStatus } from '../game/adventure.service';
import { messageFormat } from '../game/message';

export default async () => {
  const [event] = useEvent(); const [message] = useMessage();
  try { const battle = await battleStatus(event.current.UserId); await message.send({ format: messageFormat('战斗信息', `第 ${battle.turn} 回合\n${battle.members.map(member => `${member.id === battle.characterId ? '你' : '队友'}·${member.name} HP ${member.hp}/${member.hpMax}｜MP ${member.mp}/${member.mpMax}`).join('\n')}\n${battle.targets.map(target => `敌方 #${target.id} ${target.name}｜HP ${target.hp}/${target.hpMax}`).join('\n')}\n\n发送 /切换目标 编号 切换你的攻击目标。`) }); }
  catch (error) { await message.send({ format: messageFormat('当前无战斗', '你不在战斗中。发送 /面板 返回冒险操作。') }); }
};
